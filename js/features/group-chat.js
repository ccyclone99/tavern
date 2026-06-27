/**
 * 群聊调度器
 * 管理多角色轮流发言 + AI 动态事件解析
 */
const GroupChat = {
    _isCheckContinuation: false, // 防止检定续写无限循环
    _summarizing: false,        // 防止并发摘要
    _lastSummarizedCount: 0,   // 上次摘要时的消息数，防止锯齿触发

    async handleUserMessage() {
        if (State.isStreaming) return;
        const scene = State.scene;
        if (!scene) return;
        if (!this._isScenePlaying(scene)) {
            this._showEndedSceneNotice(scene);
            return { ok: false, blocked: true, reason: 'scene_ended' };
        }
        const chars = State.activeCharacters;
        if (chars.length === 0) {
            showToast('场景中还没有角色，请在左侧添加');
            return;
        }

        ChatUI.setStreaming();

        // 选择回复角色：优先当前选中角色，否则第一个
        let replyChar = chars.find(c => c.id === State.currentCharacterId);
        if (!replyChar) {
            replyChar = chars[0];
            State.setCurrentCharacter(replyChar.id);
        }

        const replyResult = await this.replyAs(replyChar);

        // 多角色场景：自动轮换到下一个角色
        if (chars.length > 1) {
            const currentIdx = chars.indexOf(replyChar);
            const nextChar = chars[(currentIdx + 1) % chars.length];
            State.setCurrentCharacter(nextChar.id);
        }

        ChatUI.clearStreaming();

        if (replyResult?.ok && !replyResult.pendingCheck && this._isScenePlaying(scene) && typeof WorldEngine !== 'undefined') {
            const reason = this._inferTurnReason(scene);
            await WorldEngine.tickAfterPlayerTurn(reason);
        }

        // 教学钩子：玩家发消息后检测是否完成当前教学步骤（仅教学世界生效）
        if (this._isScenePlaying(scene) && TutorialWorld.isCurrentScene()) {
            try { await Tutorial.afterPlayerMessage(); }
            catch (e) { console.warn('[Tutorial] afterPlayerMessage 失败:', e); }
        }
        return replyResult;
    },

    /**
     * 让指定角色回复消息
     */
    async replyAs(char) {
        const scene = State.scene;
        const allChars = State.activeCharacters;
        if (!this._isScenePlaying(scene)) {
            return { ok: false, pendingCheck: false, blocked: true, reason: 'scene_ended' };
        }
        ChatUI.appendStreamingMessage(char.id);

        let fullContent = '';
        let rafPending = false;

        try {
            const body = allChars.length > 1
                ? PromptBuilder.buildGroup(char, scene, scene.messages, allChars)
                : PromptBuilder.build(char, scene, scene.messages);

            const result = await API.stream(body,
                (content) => {
                    fullContent = content;
                    if (!rafPending) {
                        rafPending = true;
                        requestAnimationFrame(() => {
                            ChatUI.updateStreamingContent(fullContent);
                            ChatUI.scrollToBottom();
                            rafPending = false;
                        });
                    }
                },
                null
            );

            fullContent = result.content || fullContent;

            // 确保最终内容已渲染
            ChatUI.updateStreamingContent(fullContent);

            // 提取并应用隐藏状态补丁（来自 <state_update>）
            const { content: contentForUpdate, update } = this._extractStateUpdate(fullContent);
            if (update) {
                try {
                    StrategyManager.applyStateUpdate(update);
                } catch (err) {
                    console.warn('AI 状态补丁应用失败（非致命）:', err.message || err);
                }
            }

            // 解析所有 AI 动态事件标记
            const { cleanedContent, markers } = this._parseMarkers(contentForUpdate);
            const safeMarkers = typeof PromptGuard !== 'undefined' && PromptGuard.sanitizeMarkers
                ? PromptGuard.sanitizeMarkers(markers, scene)
                : markers;

            // 提取情绪标签
            const parsed = Renderer.parseMessageType(cleanedContent);
            const emotion = parsed.emotion;

            // 保存消息。流式消息已在 DOM 中，只更新计数
            const msg = {
                id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                role: 'assistant',
                characterId: char.id,
                content: cleanedContent,
                type: parsed.type,
                emotion,
                visibility: typeof WorldEngine !== 'undefined'
                    ? WorldEngine.createVisibility({ public: allChars.length > 1, participants: [char.id] })
                    : undefined,
                timestamp: Date.now()
            };
            scene.messages.push(msg);
            ChatUI._renderedCount = scene.messages.length;
            await State.saveCurrentSceneDebounced();

            ChatUI.finalizeStreamingMessage(cleanedContent, emotion);

            // 处理非检定标记（检定标记在检查后统一处理）
            const nonCheckMarkers = safeMarkers.filter(m => m.type !== 'check');
            const checkMarkers = safeMarkers.filter(m => m.type === 'check');
            await this._processMarkers(nonCheckMarkers);
            if (this._isScenePlaying(scene)) this._reconcileQuestProgressFromNarrative(msg);

            // 处理检定标记：生成交互式检定卡，等待玩家点击或输入“掷骰”
            let createdCheck = false;
            if (this._isScenePlaying(scene)) {
                for (const cm of checkMarkers) {
                    if (!this._isScenePlaying(scene)) break;
                    if (this._createPendingCheck(cm.raw, msg.id)) createdCheck = true;
                }
            }

            // 兜底：真实模型有时会按本地行动裁决叙事，但漏掉 [check:auto]。
            // 对已确认的风险行动，系统仍应自动生成检定，而不是让玩家主动要求。
            if (this._isScenePlaying(scene) && !createdCheck && this._shouldCreateLocalCheckFromLatestAction(scene, msg)) {
                createdCheck = !!this._createPendingCheck('auto', msg.id);
            }

            this._updateRelationshipAfterReply(char, cleanedContent, scene);

            const waitingForCheck = this._isScenePlaying(scene) && (createdCheck || checkMarkers.length > 0 || !!scene.pendingCheck);
            if (waitingForCheck) {
                ActionBar.renderPendingCheck();
                ChatUI._syncInputMode?.();
                showToast('需要检定：点击或输入“掷骰”继续');
            }

            // 自动摘要：消息超 80 条时压缩最早 30 条（含冷却：距上次压缩不足 30 条时不触发）
            if (scene.messages.length > 80 && !this._summarizing) {
                const since = this._lastSummarizedCount || 0;
                if (scene.messages.length - since >= 30) {
                    this._summarizing = true;
                    this._triggerSummarization().finally(() => {
                        this._summarizing = false;
                    });
                }
            }

            return {
                ok: true,
                pendingCheck: waitingForCheck
            };

        } catch (err) {
            ChatUI.removeStreamingMessage();
            if (err.name !== 'AbortError') {
                const info = API.getErrorInfo(err);
                showToast(info.message);
                console.error('回复失败:', err);
            }
            return { ok: false, pendingCheck: false };
        }
    },

    /**
     * 从 AI 回复中提取隐藏的 <state_update> 状态补丁
     * 返回 { content: 清理后的文本, update: 解析后的 JSON 或 null }
     */
    _extractStateUpdate(content) {
        if (!content) return { content, update: null };
        const match = content.match(/<state_update>([\s\S]*?)<\/state_update>/i);

        let update = null;
        if (match) {
            const rawJson = match[1].trim();
            try {
                update = JSON.parse(rawJson);
                if (typeof PromptGuard !== 'undefined' && PromptGuard.sanitizeStateUpdate) {
                    update = PromptGuard.sanitizeStateUpdate(update);
                }
            } catch (err) {
                console.warn('AI 状态补丁 JSON 解析失败（非致命）:', err.message || err);
            }
        }

        const cleaned = Renderer.stripStateUpdate(content);
        return { content: cleaned, update };
    },

    /**
     * 解析 AI 回复中的所有动态事件标记
     * 返回清理后的内容和标记数组
     */
    _parseMarkers(content) {
        // 收集所有匹配的标记及其位置
        const found = [];

        const patterns = [
            { re: /\[new_char:([^\]]+)\]/g, type: 'new_char' },
            { re: /\[char_exit:([^\]]+)\]/g, type: 'char_exit' },
            { re: /\[quest:([^\]]+)\]/g, type: 'quest' },
            { re: /\[quest_update:([^\]]+)\]/g, type: 'quest_update' },
            { re: /\[event:([^\]]+)\]/g, type: 'event' },
            { re: /\[move:([^\]]+)\]/g, type: 'move' },
            { re: /\[check:([^\]]+)\]/g, type: 'check' },
            { re: /\[item_add:([^\]]+)\]/g, type: 'item_add' },
            { re: /\[item_remove:([^\]]+)\]/g, type: 'item_remove' },
            { re: /\[item_equip:([^\]]+)\]/g, type: 'item_equip' },
            { re: /\[item_unequip:([^\]]+)\]/g, type: 'item_unequip' },
            { re: /\[damage:([^\]]+)\]/g, type: 'damage' },
            { re: /\[heal:([^\]]+)\]/g, type: 'heal' },
            { re: /\[gold:([^\]]+)\]/g, type: 'gold' },
            { re: /\[exp:([^\]]+)\]/g, type: 'exp' }
        ];

        for (const { re, type } of patterns) {
            let m;
            while ((m = re.exec(content)) !== null) {
                found.push({ type, raw: m[1], full: m[0], index: m.index });
            }
        }

        // 按位置从后往前排序，确保删除时索引不会偏移
        found.sort((a, b) => b.index - a.index);

        // 从后往前删除标记文本
        let cleaned = content;
        for (const f of found) {
            cleaned = cleaned.slice(0, f.index) + cleaned.slice(f.index + f.full.length);
        }

        // 清理标记删除后留下的多余空行
        cleaned = cleaned.replace(/\n{3,}/g, '\n\n').trim();

        // markers 数组保持原始出现顺序
        found.reverse();
        return { cleanedContent: cleaned, markers: found };
    },

    /**
     * 处理所有解析出的标记事件
     */
    async _processMarkers(markers) {
        const safeMarkers = typeof PromptGuard !== 'undefined' && PromptGuard.sanitizeMarkers
            ? PromptGuard.sanitizeMarkers(markers, State.scene)
            : markers;
        for (const marker of safeMarkers) {
            if (!this._isScenePlaying(State.scene)) {
                console.warn('[GroupChat] 场景已结束，跳过后续 AI 标记');
                break;
            }
            switch (marker.type) {
                case 'new_char':
                    setTimeout(() => {
                        try { NewCharacterHandler.show(marker.raw); }
                        catch (e) { console.warn('新角色登场处理失败:', e); }
                    }, 500);
                    break;
                case 'char_exit':
                    await NewCharacterHandler.handleExit(marker.raw);
                    break;
                case 'quest':
                    this._handleQuestMarker(marker.raw);
                    break;
                case 'quest_update':
                    this._handleQuestUpdateMarker(marker.raw);
                    break;
                case 'event':
                    this._handleEventMarker(marker.raw);
                    break;
                case 'move':
                    await this._handleMoveMarker(marker.raw);
                    break;
                case 'item_add':
                    this._handleItemAdd(marker.raw);
                    break;
                case 'item_remove':
                    this._handleItemRemove(marker.raw);
                    break;
                case 'item_equip':
                    this._handleItemEquip(marker.raw);
                    break;
                case 'item_unequip':
                    this._handleItemUnequip(marker.raw);
                    break;
                case 'damage':
                    this._handleDamageMarker(marker.raw);
                    break;
                case 'heal':
                    this._handleHealMarker(marker.raw);
                    break;
                case 'gold':
                    this._handleGoldMarker(marker.raw);
                    break;
                case 'exp':
                    this._handleExpMarker(marker.raw);
                    break;
            }
        }
    },

    _isScenePlaying(scene = State.scene) {
        if (typeof WorldEngine !== 'undefined' && WorldEngine.isScenePlaying) return WorldEngine.isScenePlaying(scene);
        return !!scene && (!scene.gameState || scene.gameState === 'playing');
    },

    _showEndedSceneNotice(scene = State.scene) {
        const message = typeof WorldEngine !== 'undefined' && WorldEngine.endedSceneMessage
            ? WorldEngine.endedSceneMessage(scene)
            : '当前冒险已经结束，不能继续改变游戏状态。';
        if (typeof showToast !== 'undefined') showToast(message);
    },

    /**
     * 处理 [quest:任务名|main或side|描述|目标1,目标2|奖励]
     */
    _handleQuestMarker(raw) {
        const parts = raw.split('|');
        const name = (parts[0] || '未知任务').trim();
        const type = (parts[1] || 'side').trim();
        const description = (parts[2] || '').trim();
        const objectives = (parts[3] || '').split(',').map(s => s.trim()).filter(Boolean);
        const reward = (parts[4] || '').trim();

        QuestTracker.addQuest({
            name,
            type: type === 'main' ? 'main' : 'side',
            description,
            objectives,
            reward,
            giver: '剧情'
        });
    },

    /**
     * 处理 [quest_update:任务名|目标序号]
     */
    _handleQuestUpdateMarker(raw) {
        const parts = raw.split('|');
        const questName = (parts[0] || '').trim();
        const objIdx = (parts[1] || '1').trim();
        QuestTracker.updateObjective(questName, objIdx);
    },

    /**
     * 处理 [event:事件描述]
     */
    _handleEventMarker(raw) {
        const scene = State.scene;
        if (!scene) return;
        const msg = {
            id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            role: 'user',
            content: `【剧情事件：${raw.trim()}】`,
            type: 'action',
            visibility: typeof WorldEngine !== 'undefined'
                ? WorldEngine.createVisibility({ public: true })
                : undefined,
            timestamp: Date.now()
        };
        scene.messages.push(msg);
        ChatUI.onMessageAdded(msg);
        State.saveCurrentSceneDebounced();
    },

    /**
     * 解析 [check:属性名|DC]
     */
    _parseCheckRaw(raw) {
        const scene = State.scene;
        if (!scene) return null;

        if (String(raw || '').trim().toLowerCase() === 'auto') return null;
        const parts = raw.split('|');
        const statName = (parts[0] || '').trim();
        const dc = this._parseDc(parts[1], 15);
        return this._buildParsedCheck(statName || '属性', dc);
    },

    _parseDc(value, fallback = 15) {
        const match = String(value ?? '').match(/\d+/);
        const dc = match ? parseInt(match[0], 10) : fallback;
        return Math.max(5, Math.min(30, dc));
    },

    _buildParsedCheck(statName, dc) {
        const scene = State.scene;
        if (!scene) return null;
        // 中文属性名 → 英文 key
        const statMap = {
            '力量': 'strength', '敏捷': 'dexterity', '体质': 'constitution',
            '智力': 'intelligence', '感知': 'wisdom', '魅力': 'charisma',
            'strength': 'strength', 'dexterity': 'dexterity', 'constitution': 'constitution',
            'intelligence': 'intelligence', 'wisdom': 'wisdom', 'charisma': 'charisma'
        };
        const key = statMap[statName] || statName;
        const val = (scene.playerStats && scene.playerStats[key]) ? scene.playerStats[key] : 10;
        const mod = Math.floor((val - 10) / 2);
        return { statName: statName || '属性', key, val, mod, dc };
    },

    _shouldCreateLocalCheckFromLatestAction(scene, replyMessage) {
        if (!this._isScenePlaying(scene) || scene.pendingCheck) return false;
        const latestAction = [...(scene.messages || [])]
            .reverse()
            .find(m => m.type === 'action_intent' && m.actionData);
        if (!latestAction?.actionData?.suggestedCheck) return false;
        const latestUserMessage = [...(scene.messages || [])].reverse().find(m => m.role === 'user');
        if (!latestUserMessage || latestUserMessage.id !== latestAction.id) return false;
        if (replyMessage?.timestamp && latestAction.timestamp > replyMessage.timestamp) return false;
        return !(scene.messages || []).some(m =>
            m.type === 'check' &&
            m.timestamp >= latestAction.timestamp
        );
    },

    _parseActionAdjudication(actionData) {
        if (!actionData) return null;
        const adj = actionData.adjudication || actionData.suggestedCheck;
        if (!adj) return null;
        const statName = adj.statName || adj.stat || '属性';
        const dc = this._parseDc(adj.dc, 15);
        const parsed = this._buildParsedCheck(statName, dc);
        if (!parsed) return null;
        parsed.adjudicationSource = adj.source || 'local';
        parsed.adjudicationReason = adj.reason || '';
        parsed.risk = Number(adj.risk ?? actionData.risk ?? 0);
        return parsed;
    },

    _latestPlayerCheckSource(scene) {
        return [...(scene?.messages || [])].reverse().find(msg => {
            if (!msg || msg.role !== 'user') return false;
            const type = String(msg.type || '');
            if (type === 'action_intent' || type === 'talk' || !type) return true;
            return false;
        }) || null;
    },

    _inferCheckContext(scene, sourceMessage, parsed) {
        const actionData = sourceMessage?.type === 'action_intent' ? sourceMessage.actionData : null;
        if (actionData) {
            return {
                actionType: actionData.type || '',
                intent: actionData.intent || '',
                stakes: actionData.stakes || '',
                challengeContext: actionData.challengeContext || null
            };
        }

        const intent = String(sourceMessage?.content || '').trim().slice(0, 800);
        let planned = null;
        if (intent && typeof ActionPlanner !== 'undefined' && ActionPlanner.create) {
            try {
                planned = ActionPlanner.create(scene, intent);
            } catch (err) {
                console.warn('[GroupChat] 检定上下文推断失败（非致命）:', err.message || err);
            }
        }
        return {
            actionType: planned?.type || '',
            intent,
            stakes: planned?.stakes || '',
            challengeContext: planned?.challengeContext || null,
            inferredStat: planned?.suggestedCheck?.stat || parsed?.key || ''
        };
    },

    /**
     * 处理 [check:属性名|DC]：创建待掷骰检定卡
     */
    _createPendingCheck(raw, sourceMessageId = '') {
        const scene = State.scene;
        if (!scene) return null;
        if (!this._isScenePlaying(scene)) return null;
        if (scene.pendingCheck) {
            console.warn('[GroupChat] 已存在待处理检定，忽略新的 check 标记');
            return scene.pendingCheck;
        }

        const checkSource = this._latestPlayerCheckSource(scene);
        const latestAction = checkSource?.type === 'action_intent' ? checkSource : null;
        const actionParsed = this._parseActionAdjudication(latestAction?.actionData);
        const aiParsed = this._parseCheckRaw(raw);
        const parsed = actionParsed || aiParsed;
        if (!parsed) return null;
        if (actionParsed && aiParsed && (actionParsed.key !== aiParsed.key || actionParsed.dc !== aiParsed.dc)) {
            console.warn('[GroupChat] AI 检定与本地裁决冲突，已使用本地裁决', {
                ai: { stat: aiParsed.key, dc: aiParsed.dc },
                local: { stat: actionParsed.key, dc: actionParsed.dc }
            });
        }
        const checkContext = this._inferCheckContext(scene, checkSource, parsed);
        const checkContextPayload = {
            key: parsed.key,
            stat: parsed.key,
            actionType: checkContext.actionType || '',
            intent: checkContext.intent || '',
            stakes: checkContext.stakes || ''
        };
        const itemBonus = typeof WorldEngine !== 'undefined'
            ? WorldEngine.getCheckItemBonus(scene, checkContextPayload)
            : { bonus: 0, modifiers: [] };
        const availableItems = typeof WorldEngine !== 'undefined'
            ? WorldEngine.getAvailableCheckItems(scene, checkContextPayload)
            : [];
        const availableCompanions = typeof WorldEngine !== 'undefined' && WorldEngine.getAvailableCompanionResources
            ? WorldEngine.getAvailableCompanionResources(scene, checkContextPayload)
            : [];
        const totalMod = parsed.mod + Number(itemBonus.bonus || 0);
        scene.pendingCheck = {
            id: 'check_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            status: 'pending',
            statName: parsed.statName,
            key: parsed.key,
            statValue: parsed.val,
            statMod: parsed.mod,
            itemBonus: Number(itemBonus.bonus || 0),
            mod: totalMod,
            dc: parsed.dc,
            source: actionParsed ? '本地行动裁决' : 'AI 要求检定',
            sourceMessageId,
            actionType: checkContext.actionType || '',
            intent: checkContext.intent || '',
            challengeContext: checkContext.challengeContext
                ? JSON.parse(JSON.stringify(checkContext.challengeContext))
                : null,
            adjudicationReason: parsed.adjudicationReason || '',
            adjudicationSource: parsed.adjudicationSource || (actionParsed ? 'local' : 'ai'),
            itemModifiers: itemBonus.modifiers || [],
            availableItemModifiers: availableItems,
            availableCompanionModifiers: availableCompanions,
            selectedItemModifierIds: [],
            selectedCompanionResourceIds: [],
            stakes: checkContext.stakes || '',
            risks: latestAction?.actionData?.risks || [],
            createdAt: Date.now()
        };
        State.saveCurrentSceneDebounced();
        return scene.pendingCheck;
    },

    /**
     * 玩家点击检定卡或输入“掷骰”后结算，插入检定结果，再交给 DM 叙述后果。
     */
    async rollPendingCheck() {
        const scene = State.scene;
        const check = scene?.pendingCheck;
        if (!scene || !check || State.isStreaming) return;
        if (!this._isScenePlaying(scene)) {
            this._showEndedSceneNotice(scene);
            ActionBar.renderPendingCheck();
            ChatUI._syncInputMode?.();
            return;
        }

        const roll = Math.floor(Math.random() * 20) + 1;
        const totals = typeof WorldEngine !== 'undefined' && WorldEngine.getCheckTotals
            ? WorldEngine.getCheckTotals(scene, check)
            : {
                mod: Number.isFinite(Number(check.mod)) ? Number(check.mod) : 0,
                dc: Number.isFinite(Number(check.dc)) ? Number(check.dc) : 15,
                baseDc: Number.isFinite(Number(check.dc)) ? Number(check.dc) : 15,
                statMod: Number.isFinite(Number(check.statMod)) ? Number(check.statMod) : 0,
                itemBonus: Number(check.itemBonus || 0),
                itemModifiers: [],
                companionModifiers: [],
                modifiers: [],
                bonus: 0,
                dcDelta: 0
            };
        const mod = totals.mod;
        const dc = totals.dc;
        const total = roll + mod;
        const outcomeInfo = this._classifyCheckOutcome(roll, total, dc);
        const consequenceOptions = this._buildCheckConsequences(outcomeInfo.outcome, check);
        const success = outcomeInfo.success;
        const crit = outcomeInfo.crit;
        if (['partial', 'fail', 'critical_fail'].includes(outcomeInfo.outcome)) {
            if (!scene.currentSituation) scene.currentSituation = { recentRisks: [], recommendedActions: [] };
            if (!Array.isArray(scene.currentSituation.recentRisks)) scene.currentSituation.recentRisks = [];
            scene.currentSituation.recentRisks.push(consequenceOptions[0] || outcomeInfo.hint);
        }

        const sign = mod >= 0 ? '+' + mod : String(mod);
        const consequenceText = consequenceOptions.length > 0
            ? `\n【后果提示：${consequenceOptions.join('；')}】`
            : '';
        const resourceText = (totals.modifiers || []).length > 0
            ? `\n【投入资源：${totals.modifiers.map(m => `${m.source}（${m.label}）`).join('；')}】`
            : '';
        // AI 收到的文本结果（保持兼容）
        const resultText = `【${check.statName}检定：D20=${roll} ${sign} = ${total} vs DC${dc} → ${outcomeInfo.label}】${resourceText}${consequenceText}`;

        const msg = {
            id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            role: 'user',
            content: resultText,
            type: 'check',
            checkData: {
                statName: check.statName,
                key: check.key,
                roll,
                mod,
                total,
                dc,
                success,
                crit,
                outcome: outcomeInfo.outcome,
                resultLabel: outcomeInfo.label,
                consequenceHint: outcomeInfo.hint,
                consequenceOptions,
                stakes: check.stakes || '',
                risks: check.risks || [],
                source: check.source || '',
                sourceMessageId: check.sourceMessageId || '',
                actionType: check.actionType || '',
                intent: check.intent || '',
                challengeContext: check.challengeContext
                    ? JSON.parse(JSON.stringify(check.challengeContext))
                    : null,
                statMod: totals.statMod,
                itemBonus: Number(totals.itemBonus || 0),
                selectedBonus: Number(totals.bonus || 0),
                dcDelta: Number(totals.dcDelta || 0),
                riskDelta: Number(totals.riskDelta || 0),
                riskDcDelta: Number(totals.riskDcDelta || 0),
                explicitDcDelta: Number(totals.explicitDcDelta || 0),
                baseDc: totals.baseDc,
                itemModifiers: [
                    ...(Array.isArray(check.itemModifiers) ? check.itemModifiers : []),
                    ...(Array.isArray(totals.itemModifiers) ? totals.itemModifiers : [])
                ],
                availableItemModifiers: Array.isArray(check.availableItemModifiers) ? check.availableItemModifiers : [],
                companionModifiers: Array.isArray(totals.companionModifiers) ? totals.companionModifiers : [],
                resourceModifiers: Array.isArray(totals.modifiers) ? totals.modifiers : []
            },
            visibility: typeof WorldEngine !== 'undefined'
                ? WorldEngine.createVisibility({ public: true })
                : undefined,
            timestamp: Date.now()
        };
        scene.pendingCheck = null;
        scene.messages.push(msg);
        ChatUI.onMessageAdded(msg);
        if (typeof WorldEngine !== 'undefined') {
            if (WorldEngine.recordEvent) WorldEngine.recordEvent(scene, {
                category: 'check',
                title: `${check.statName || '属性'}检定：${outcomeInfo.label}`,
                text: resultText,
                messageId: msg.id,
                timestamp: msg.timestamp
            });
            if (WorldEngine.recordConsequence && ['partial', 'fail', 'critical_fail'].includes(outcomeInfo.outcome)) {
                const severity = outcomeInfo.outcome === 'critical_fail'
                    ? 'critical'
                    : (outcomeInfo.outcome === 'fail' ? 'high' : 'medium');
                WorldEngine.recordConsequence(scene, {
                    title: `${check.statName || '属性'}检定${outcomeInfo.label}`,
                    cause: check.intent || check.source || `${check.statName || '属性'}检定`,
                    effect: consequenceOptions[0] || outcomeInfo.hint,
                    severity,
                    category: check.actionType || 'check',
                    tags: [check.actionType, check.key, check.challengeContext?.challengeTitle].filter(Boolean),
                    turn: scene.turnCount || 0,
                    createdAt: msg.timestamp
                });
            }
            const inventoryCountBeforeCheckItems = Array.isArray(scene.inventory) ? scene.inventory.length : null;
            WorldEngine.consumeCheckItems(scene, totals.itemModifiers || [], { retryPendingRewards: false });
            const shouldRetryPendingRewards = inventoryCountBeforeCheckItems !== null
                && Array.isArray(scene.inventory)
                && scene.inventory.length < inventoryCountBeforeCheckItems;
            if (scene.gameState === 'playing') {
                WorldEngine.consumeCompanionResources?.(scene, totals.companionModifiers || []);
            }
            if (scene.gameState === 'playing') {
                const challengeResult = WorldEngine.resolveChallengeCheck?.(scene, check, outcomeInfo);
                if (challengeResult?.secondaryResults?.length > 0) {
                    msg.checkData.secondaryResults = challengeResult.secondaryResults.map(item => ({
                        approachId: item.approachId || '',
                        label: item.label || '',
                        outcome: item.outcome || '',
                        progressDelta: Number(item.progressDelta || 0),
                        strainDelta: Number(item.strainDelta || 0),
                        appliedEffects: item.appliedEffects === true,
                        consequenceId: item.consequenceId || ''
                    }));
                }
            }
            if (scene.gameState === 'playing' && WorldEngine.resolveCounterStrategies) {
                const counterplayResults = WorldEngine.resolveCounterStrategies(scene, {
                    outcome: outcomeInfo.outcome,
                    actionType: check.actionType || '',
                    stat: check.key || '',
                    intent: check.intent || check.stakes || '',
                    challengeId: check.challengeContext?.challengeId || '',
                    challengeTitle: check.challengeContext?.challengeTitle || '',
                    source: 'check',
                    messageId: msg.id,
                    reason: `${check.statName || '属性'}检定${outcomeInfo.label || ''}影响了敌方反制`
                });
                if (counterplayResults.length > 0) {
                    msg.checkData.counterplayResults = counterplayResults.map(item => ({
                        id: item.id,
                        title: item.title,
                        status: item.status,
                        visibility: item.visibility,
                        progressDelta: item.progressDelta,
                        exposureDelta: item.exposureDelta,
                        resolved: item.resolved,
                        revealed: item.revealed
                    }));
                }
            }
            if (scene.gameState === 'playing' && WorldEngine.resolveRelevantConsequences) {
                const resolvedConsequences = WorldEngine.resolveRelevantConsequences(scene, {
                    outcome: outcomeInfo.outcome,
                    actionType: check.actionType || '',
                    stat: check.key || '',
                    intent: check.intent || check.stakes || '',
                    challengeId: check.challengeContext?.challengeId || '',
                    challengeTitle: check.challengeContext?.challengeTitle || '',
                    source: 'check',
                    messageId: msg.id,
                    reason: `${check.statName || '属性'}检定${outcomeInfo.label || ''}处理了相关后果`
                });
                if (resolvedConsequences.length > 0) {
                    msg.checkData.resolvedConsequences = resolvedConsequences.map(item => ({
                        id: item.id,
                        title: item.title,
                        severity: item.severity
                    }));
                }
            }
            if (shouldRetryPendingRewards && scene.gameState === 'playing') {
                WorldEngine._retryPendingQuestRewardsAfterInventoryChange?.(scene);
                WorldEngine._retryPendingExplorationRewardsAfterInventoryChange?.(scene);
            }
        }
        ActionBar.renderPendingCheck();
        ChatUI._syncInputMode?.();
        await State.saveCurrentSceneDebounced();

        if (scene.gameState === 'playing' && !this._isCheckContinuation) {
            this._isCheckContinuation = true;
            try {
                await this._dmNarrate({
                    trigger: 'check_outcome',
                    focus: this._buildCheckNarrationFocus(msg.checkData)
                });
            } finally {
                this._isCheckContinuation = false;
            }
            if (TutorialWorld.isCurrentScene()) {
                Tutorial.afterCheckResolved().catch(e => console.warn('[Tutorial] afterCheckResolved 失败:', e));
            }
            if (typeof WorldEngine !== 'undefined') {
                const reason = outcomeInfo.outcome === 'partial'
                    ? 'check_partial'
                    : (success ? 'check_success' : 'check_fail');
                if (scene.gameState === 'playing') await WorldEngine.tickAfterPlayerTurn(reason);
            }
        }
    },

    _classifyCheckOutcome(roll, total, dc) {
        if (roll === 20) {
            return {
                outcome: 'critical_success',
                label: '大成功！',
                hint: '目标达成，并给出额外收益、优势、机会或更深线索。',
                success: true,
                crit: 'success'
            };
        }
        if (roll === 1) {
            return {
                outcome: 'critical_fail',
                label: '大失败！',
                hint: '失败必须造成严重但有剧情价值的后果，并打开新的局势。',
                success: false,
                crit: 'fail'
            };
        }
        if (total >= dc) {
            return {
                outcome: 'success',
                label: '成功',
                hint: '目标按预期达成，后果与代价保持合理。',
                success: true,
                crit: null
            };
        }
        if (total >= dc - 3) {
            return {
                outcome: 'partial',
                label: '部分成功',
                hint: '目标达成一部分，或达成目标但必须付出代价、暴露风险、欠下人情或引入新问题。',
                success: true,
                crit: null
            };
        }
        return {
            outcome: 'fail',
            label: '失败推进',
            hint: '目标未完全达成，但剧情必须推进：给出新线索、新阻碍、新场景、资源损失、关系变化或反制。',
            success: false,
            crit: null
        };
    },

    _buildCheckConsequences(outcome, check) {
        const risks = Array.isArray(check?.risks) ? check.risks.filter(Boolean).map(String) : [];
        if (outcome === 'critical_success') {
            return ['额外收益或更深线索', '后续相关行动获得优势'];
        }
        if (outcome === 'success') {
            return ['目标按预期推进'];
        }
        if (outcome === 'partial') {
            return risks.length > 0
                ? risks.slice(0, 2).map(r => `达成部分目标，但${r}`)
                : ['达成部分目标，但付出代价或引入新问题'];
        }
        if (outcome === 'critical_fail') {
            return risks.length > 0
                ? risks.slice(0, 2).map(r => `严重后果：${r}`)
                : ['严重暴露、资源损失或敌方反制'];
        }
        return risks.length > 0
            ? risks.slice(0, 2)
            : ['暴露风险、时间推进、资源损失或得到不完整线索'];
    },

    _buildCheckNarrationFocus(data) {
        const consequences = (data.consequenceOptions || []).join('；') || data.consequenceHint || '';
        const resources = Array.isArray(data.resourceModifiers) && data.resourceModifiers.length > 0
            ? ` 玩家投入资源：${data.resourceModifiers.map(m => `${m.source}（${m.label}）`).join('；')}。`
            : '';
        const counters = Array.isArray(data.counterplayResults) && data.counterplayResults.length > 0
            ? ` 反制变化：${data.counterplayResults.map(item => `${item.title}${item.resolved ? '已解决' : (item.revealed ? '被揭示' : '被削弱')}`).join('；')}。`
            : '';
        const secondary = Array.isArray(data.secondaryResults) && data.secondaryResults.length > 0
            ? ` 复合行动结算：${data.secondaryResults.map(item => {
                const delta = item.progressDelta ? `进展+${item.progressDelta}` : (item.strainDelta ? `压力+${item.strainDelta}` : (item.appliedEffects ? '次级方法完整生效' : '形成后续影响'));
                return `${item.label}（${delta}）`;
            }).join('；')}。`
            : '';
        return `检定结果：${data.resultLabel || '未知'}。${resources}${counters}${secondary}${data.consequenceHint || ''}${consequences ? ` 建议后果：${consequences}。` : ''}请把结果写成具体剧情变化；如果是部分成功、失败推进或大失败，不要只写阻断，必须让局势继续向前。`;
    },

    async cancelPendingCheck() {
        const scene = State.scene;
        if (!scene || !scene.pendingCheck || State.isStreaming) return;
        if (!this._isScenePlaying(scene)) {
            this._showEndedSceneNotice(scene);
            ActionBar.renderPendingCheck();
            ChatUI._syncInputMode?.();
            return;
        }
        scene.pendingCheck = null;
        await State.saveCurrentSceneDebounced();
        ActionBar.renderPendingCheck();
        ChatUI._syncInputMode?.();
        showToast('已取消检定');
    },

    /**
     * 处理 [move:地点名]
     */
    async _handleMoveMarker(raw) {
        const scene = State.scene;
        if (!scene) return;
        const locName = raw.trim();
        const loc = scene.locations.find(l => l.name === locName || l.name.includes(locName));
        if (loc && loc.id !== scene.currentLocation) {
            await MapView.moveTo(loc.id);
            SidebarRight.markTabNew('map');
        }
    },

    _warnMissingRuleLayer(actionLabel) {
        const message = `${actionLabel} 需要 WorldEngine 规则层，已跳过。`;
        console.warn(`[GroupChat] ${message}`);
        if (typeof showToast !== 'undefined') showToast(message);
    },

    _handleItemAdd(raw) {
        const scene = State.scene;
        if (!scene) return;
        const parts = raw.split('|');
        const name = (parts[0] || '未知物品').trim();
        const description = (parts[1] || '').trim().slice(0, 160);
        const validTypes = ['weapon', 'armor', 'consumable', 'quest', 'misc'];
        const type = validTypes.includes((parts[2] || '').trim()) ? parts[2].trim() : 'misc';
        const quantity = Math.max(1, Math.min(20, parseInt(parts[3]) || 1));

        if (typeof WorldEngine !== 'undefined' &&
            WorldEngine.createInventoryItemFromReward &&
            WorldEngine.grantInventoryItem) {
            const item = WorldEngine.createInventoryItemFromReward(name, quantity, { description, type });
            const result = WorldEngine.grantInventoryItem(scene, item, { source: '剧情标记' });
            if (!result.ok) {
                console.warn(`[GroupChat] ${result.message || '无法新增物品'}`);
                return;
            }
            showToast(`获得物品：${name}${quantity > 1 ? ' x' + quantity : ''}`);
            State.saveCurrentSceneDebounced();
            return;
        }

        this._warnMissingRuleLayer('[item_add]');
    },

    _handleItemRemove(raw) {
        const scene = State.scene;
        if (!scene || !scene.inventory) return;
        const parts = raw.split('|');
        const name = parts[0].trim();
        const quantity = Math.max(1, Math.min(20, parseInt(parts[1]) || 1));
        if (typeof WorldEngine !== 'undefined' && WorldEngine.removeInventoryItem) {
            const result = WorldEngine.removeInventoryItem(scene, name, quantity, { source: '剧情标记' });
            if (!result.ok) {
                showToast(result.message || '没有找到这个物品');
                return;
            }
            showToast(`失去物品：${result.itemName}${result.quantity > 1 ? ' x' + result.quantity : ''}`);
            State.saveCurrentSceneDebounced();
            return;
        }
        this._warnMissingRuleLayer('[item_remove]');
    },

    _handleItemEquip(raw) {
        const scene = State.scene;
        if (!scene || !scene.inventory) return;
        const name = raw.split('|')[0].trim();
        if (typeof WorldEngine !== 'undefined' && WorldEngine.equipInventoryItem) {
            const result = WorldEngine.equipInventoryItem(scene, name);
            if (!result.ok) {
                showToast(result.message || '无法装备这个物品');
                return;
            }
            showToast(`装备了：${result.itemName}`);
            State.saveCurrentSceneDebounced();
            SidebarRight.renderInventory();
            return;
        }
        this._warnMissingRuleLayer('[item_equip]');
    },

    _handleItemUnequip(raw) {
        const scene = State.scene;
        if (!scene || !scene.inventory) return;
        const name = raw.split('|')[0].trim();
        if (typeof WorldEngine !== 'undefined' && WorldEngine.unequipInventoryItem) {
            const result = WorldEngine.unequipInventoryItem(scene, name);
            if (!result.ok) {
                showToast(result.message || '无法卸下这个物品');
                return;
            }
            showToast(`卸下了：${result.itemName}`);
            State.saveCurrentSceneDebounced();
            SidebarRight.renderInventory();
            return;
        }
        this._warnMissingRuleLayer('[item_unequip]');
    },

    /** 处理 [damage:N|原因] 玩家受伤害 */
    _handleDamageMarker(raw) {
        const scene = State.scene;
        if (!scene) return;
        const parts = raw.split('|');
        const amount = Math.max(1, Math.min(scene.playerMaxHp || 30, parseInt(parts[0]) || 1));
        const reason = (parts[1] || '').trim();
        if (typeof WorldEngine !== 'undefined' && WorldEngine.applyPlayerDamage) {
            WorldEngine.applyPlayerDamage(scene, amount, { reason });
            State.saveCurrentSceneDebounced();
            return;
        }
        this._warnMissingRuleLayer('[damage]');
    },

    /** 处理 [heal:N] 玩家回血 */
    _handleHealMarker(raw) {
        const scene = State.scene;
        if (!scene) return;
        const amount = Math.max(1, Math.min(scene.playerMaxHp || 30, parseInt(raw.split('|')[0]) || 1));
        const reason = (raw.split('|')[1] || '').trim();
        if (typeof WorldEngine !== 'undefined' && WorldEngine.applyPlayerHealing) {
            WorldEngine.applyPlayerHealing(scene, amount, { reason });
            State.saveCurrentSceneDebounced();
            return;
        }
        this._warnMissingRuleLayer('[heal]');
    },

    /** 处理 [gold:N] 金钱变动（正获得/负花费） */
    _handleGoldMarker(raw) {
        const scene = State.scene;
        if (!scene) return;
        const amount = Math.max(-500, Math.min(500, parseInt(raw.split('|')[0]) || 0));
        if (typeof WorldEngine !== 'undefined' && WorldEngine.addGold) {
            WorldEngine.addGold(scene, amount, { source: '剧情标记' });
            State.saveCurrentSceneDebounced();
            return;
        }
        this._warnMissingRuleLayer('[gold]');
    },

    /** 处理 [exp:N] 经验获得 */
    _handleExpMarker(raw) {
        const scene = State.scene;
        if (!scene) return;
        const amount = Math.max(1, Math.min(200, parseInt(raw.split('|')[0]) || 1));
        if (typeof WorldEngine !== 'undefined' && WorldEngine.addExperience) {
            WorldEngine.addExperience(scene, amount, { source: '剧情奖励' });
            State.saveCurrentSceneDebounced();
            if (typeof ActionBar !== 'undefined' && ActionBar.renderStatsDisplay) ActionBar.renderStatsDisplay();
            if (typeof SidebarRight !== 'undefined' && SidebarRight.renderDetail) SidebarRight.renderDetail();
            return;
        }
        this._warnMissingRuleLayer('[exp]');
    },

    /** 触发死亡结局 */
    _triggerGameOver() {
        const scene = State.scene;
        if (!scene || scene.gameState !== 'playing') return;
        if (typeof WorldEngine !== 'undefined' && WorldEngine.triggerHpGameOver) {
            return WorldEngine.triggerHpGameOver(scene);
        }
        this._warnMissingRuleLayer('HP 归零结局');
    },

    /** 触发胜利结局（主线全完成） */
    _checkVictory() {
        const scene = State.scene;
        if (!scene || scene.gameState !== 'playing') return;
        if (typeof WorldEngine !== 'undefined' && WorldEngine.checkVictory) {
            return WorldEngine.checkVictory(scene);
        }
        this._warnMissingRuleLayer('胜利结局');
    },

    /**
     * 玩家通过地图移动后，DM 描述新地点
     */
    async handleLocationMove(loc) {
        if (State.isStreaming) return;
        const scene = State.scene;
        if (!scene) return;

        ChatUI.setStreaming();
        const dm = scene.dmPersona;
        ChatUI.appendStreamingMessage(dm ? '__dm__' : null);
        let description = '';
        let tempMsg = null;

        try {
            tempMsg = {
                id: 'msg_' + Date.now(),
                role: 'user',
                content: `【玩家到达了 ${loc.name}】`,
                type: 'action',
                visibility: typeof WorldEngine !== 'undefined'
                    ? WorldEngine.createVisibility({ public: true })
                    : undefined,
                timestamp: Date.now()
            };
            scene.messages.push(tempMsg);

            const body = PromptBuilder.buildDMNarration(scene, scene.messages, {
                trigger: 'location_arrival',
                focus: `玩家刚刚到达了「${loc.name}」。请详细描写此地的景象与氛围。`
            });

            const result = await API.stream(body,
                (content) => {
                    description = content;
                    ChatUI.updateStreamingContent(description);
                    ChatUI.scrollToBottom();
                },
                null
            );

            description = result.content || description;

            // 提取并应用 DM 回复中的状态补丁
            const { content: cleanedDescription, update: dmUpdate } = this._extractStateUpdate(description);
            if (dmUpdate) {
                try { StrategyManager.applyStateUpdate(dmUpdate); }
                catch (err) { console.warn('DM 状态补丁应用失败（非致命）:', err.message || err); }
            }

            scene.messages.pop();
            if (!cleanedDescription.trim()) {
                ChatUI.removeStreamingMessage();
                await State.saveCurrentSceneDebounced();
                return;
            }
            ChatUI.updateStreamingContent(cleanedDescription);
            const msg = {
                id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                role: 'assistant',
                content: cleanedDescription,
                type: 'narrate',
                visibility: typeof WorldEngine !== 'undefined'
                    ? WorldEngine.createVisibility({ public: true })
                    : undefined,
                timestamp: Date.now()
            };
            scene.messages.push(msg);
            ChatUI._renderedCount = scene.messages.length;
            ChatUI.finalizeStreamingMessage(cleanedDescription, null);
            this._reconcileQuestProgressFromNarrative(msg);
            await State.saveCurrentSceneDebounced();

        } catch (err) {
            ChatUI.removeStreamingMessage();
            if (tempMsg && scene.messages.length > 0 && scene.messages[scene.messages.length - 1].id === tempMsg.id) {
                scene.messages.pop();
            }
            if (err.name !== 'AbortError') {
                console.error('地点描述生成失败:', err);
            }
        } finally {
            ChatUI.clearStreaming();
        }
    },

    /**
     * DM 叙事：用于检定结果描述、事件旁白等
     */
    async _dmNarrate(context = {}) {
        if (State.isStreaming) return;
        const scene = State.scene;
        if (!scene) return;

        ChatUI.setStreaming();
        const dm = scene.dmPersona;
        ChatUI.appendStreamingMessage(dm ? '__dm__' : null);

        let content = '';

        try {
            // 教学叙事走专用 prompt（强约束，不污染普通 DM 协议）
            let body;
            if (context.trigger === 'tutorial' && typeof context.tutorialStep === 'number') {
                body = PromptBuilder.buildTutorialNarration(scene, scene.messages, context.tutorialStep);
            } else {
                body = PromptBuilder.buildDMNarration(scene, scene.messages, context);
            }

            const result = await API.stream(body,
                (chunk) => {
                    content = chunk;
                    ChatUI.updateStreamingContent(content);
                    ChatUI.scrollToBottom();
                },
                null
            );

            content = result.content || content;

            // 提取并应用 DM 回复中的状态补丁与标记。检定续写不能再生成新的检定卡。
            const { content: contentForUpdate, update: dmUpdate2 } = this._extractStateUpdate(content);
            if (dmUpdate2) {
                try { StrategyManager.applyStateUpdate(dmUpdate2); }
                catch (err) { console.warn('DM 状态补丁应用失败（非致命）:', err.message || err); }
            }
            const { cleanedContent, markers } = this._parseMarkers(contentForUpdate);
            const safeMarkers = typeof PromptGuard !== 'undefined' && PromptGuard.sanitizeMarkers
                ? PromptGuard.sanitizeMarkers(markers, scene)
                : markers;
            const nonCheckMarkers = safeMarkers.filter(m => m.type !== 'check');
            const ignoredCheckMarkers = safeMarkers.filter(m => m.type === 'check');
            if (ignoredCheckMarkers.length > 0) {
                console.warn('[GroupChat] DM 续写中忽略 check 标记，避免同一次检定后再次要求掷骰', ignoredCheckMarkers.map(m => m.raw));
            }
            if (!cleanedContent.trim()) {
                ChatUI.removeStreamingMessage();
                if (this._isScenePlaying(scene)) {
                    await this._processMarkers(nonCheckMarkers);
                }
                await State.saveCurrentSceneDebounced();
                return;
            }
            ChatUI.updateStreamingContent(cleanedContent);
            const msg = {
                id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                role: 'assistant',
                content: cleanedContent,
                type: 'narrate',
                visibility: typeof WorldEngine !== 'undefined'
                    ? WorldEngine.createVisibility({ public: true })
                    : undefined,
                timestamp: Date.now()
            };
            scene.messages.push(msg);
            ChatUI._renderedCount = scene.messages.length;
            ChatUI.finalizeStreamingMessage(cleanedContent, null);
            if (this._isScenePlaying(scene)) {
                await this._processMarkers(nonCheckMarkers);
            }
            if (this._isScenePlaying(scene)) this._reconcileQuestProgressFromNarrative(msg);
            await State.saveCurrentSceneDebounced();

        } catch (err) {
            ChatUI.removeStreamingMessage();
            if (err.name !== 'AbortError') {
                console.error('DM叙事失败:', err);
            }
        } finally {
            ChatUI.clearStreaming();
        }
    },

    /**
     * 自动摘要：将最早的消息压缩为叙事摘要，存入 scene.summary
     */
    async _triggerSummarization() {
        if (State.isStreaming || this._summarizing) return;
        const scene = State.scene;
        if (!scene || scene.messages.length <= 80) return;

        const oldestMessages = scene.messages.slice(0, 30);
        const msgText = oldestMessages.map(m => {
            const speaker = m.role === 'user' ? (scene.userName || '玩家') :
                (m.characterId ? (State.characters.find(c => c.id === m.characterId)?.name || '角色') : '叙述者');
            return `${speaker}：${m.content}`;
        }).join('\n\n');

        try {
            const body = PromptBuilder.buildBody([
                { role: 'system', content: '你是一个中立的叙事记录者。请将以下角色扮演对话总结为一段连贯的叙事摘要，保留关键事件、角色互动、重要信息、剧情转折。用第三人称中文叙述，控制在200-300字。只输出摘要，不要其他文字。' },
                { role: 'user', content: `请总结以下对话：\n\n${msgText}` }
            ]);

            const result = await API.stream(body,
                (chunk) => {},
                null
            );

            const summary = result.content || '';
            if (summary) {
                if (typeof RunRecorder !== 'undefined' && RunRecorder.archiveMessages) {
                    RunRecorder.archiveMessages(scene, oldestMessages);
                }
                // 拼接后限制总长度，防止长期对话 summary 无限增长爆 token
                let combined = summary + '\n\n' + (scene.summary || '');
                if (combined.length > 1200) {
                    combined = combined.substring(0, 1200);
                    // 截断到最后一个完整段落，避免半句话
                    const lastBreak = combined.lastIndexOf('\n\n');
                    if (lastBreak > 600) combined = combined.substring(0, lastBreak);
                }
                scene.summary = combined;
                scene.messages = scene.messages.slice(30);
                this._lastSummarizedCount = scene.messages.length;
                ChatUI._renderedCount = 0;
                ChatUI.render();
                await State.saveCurrentSceneDebounced();
            }
        } catch (err) {
            console.warn('会话摘要失败:', err.message || err);
        }
    },

    _inferTurnReason(scene) {
        const latest = [...(scene?.messages || [])].reverse().find(m => m.role === 'user' && m.type !== 'check');
        if (latest?.actionData?.type === 'rest') return 'rest';
        return 'player_turn';
    },

    _reconcileQuestProgressFromNarrative(message) {
        const scene = State.scene;
        if (!scene || typeof WorldEngine === 'undefined' || !WorldEngine.reconcileQuestProgressFromNarrative) return null;
        try {
            return WorldEngine.reconcileQuestProgressFromNarrative(scene, message);
        } catch (err) {
            console.warn('任务进展推断失败（非致命）:', err.message || err);
            return null;
        }
    },

    _updateRelationshipAfterReply(char, cleanedContent, scene = State.scene) {
        if (!char || !this._isScenePlaying(scene)) return false;
        Relationship.ruleBasedUpdate(char.id, cleanedContent);
        Relationship.analyzeAndUpdate(char.id, scene.messages).catch(err => {
            console.warn('关系分析失败（非致命）:', err.message || err);
        });
        return true;
    }
};
