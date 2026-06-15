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
        const chars = State.activeCharacters;
        if (chars.length === 0) {
            showToast('场景中还没有角色，请在左侧添加');
            return;
        }

        State.isStreaming = true;
        ChatUI.sendBtn.style.display = 'none';
        ChatUI.stopBtn.style.display = 'block';

        // 选择回复角色：优先当前选中角色，否则第一个
        let replyChar = chars.find(c => c.id === State.currentCharacterId);
        if (!replyChar) {
            replyChar = chars[0];
            State.setCurrentCharacter(replyChar.id);
        }

        await this.replyAs(replyChar);

        // 多角色场景：自动轮换到下一个角色
        if (chars.length > 1) {
            const currentIdx = chars.indexOf(replyChar);
            const nextChar = chars[(currentIdx + 1) % chars.length];
            State.setCurrentCharacter(nextChar.id);
        }

        State.isStreaming = false;
        ChatUI.sendBtn.style.display = 'block';
        ChatUI.stopBtn.style.display = 'none';

        // 教学钩子：玩家发消息后检测是否完成当前教学步骤（仅教学世界生效）
        if (TutorialWorld.isCurrentScene()) {
            try { await Tutorial.afterPlayerMessage(); }
            catch (e) { console.warn('[Tutorial] afterPlayerMessage 失败:', e); }
        }
    },

    /**
     * 让指定角色回复消息
     */
    async replyAs(char) {
        const scene = State.scene;
        const allChars = State.activeCharacters;
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
                timestamp: Date.now()
            };
            scene.messages.push(msg);
            ChatUI._renderedCount = scene.messages.length;
            await State.saveCurrentSceneDebounced();

            ChatUI.finalizeStreamingMessage(cleanedContent, emotion);

            // 处理非检定标记（检定标记在检查后统一处理）
            const nonCheckMarkers = markers.filter(m => m.type !== 'check');
            const checkMarkers = markers.filter(m => m.type === 'check');
            this._processMarkers(nonCheckMarkers);

            // 处理检定标记：自动投骰 + 结果插入
            for (const cm of checkMarkers) {
                this._handleCheckMarker(cm.raw);
            }

            // 更新关系
            Relationship.ruleBasedUpdate(char.id, cleanedContent);
            Relationship.analyzeAndUpdate(char.id, scene.messages).catch(err => {
                console.warn('关系分析失败（非致命）:', err.message || err);
            });

            // AI 要求检定 → DM 叙述检定结果（防止无限循环）
            if (checkMarkers.length > 0 && !this._isCheckContinuation) {
                this._isCheckContinuation = true;
                try {
                    await this._dmNarrate({ trigger: 'check_outcome', focus: '检定结果已出，请叙述其后果' });
                } finally {
                    this._isCheckContinuation = false;
                }
                // 教学钩子：检定已叙述完成（step3）
                if (TutorialWorld.isCurrentScene()) {
                    Tutorial.afterCheckResolved();
                }
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

        } catch (err) {
            ChatUI.removeStreamingMessage();
            if (err.name !== 'AbortError') {
                const info = API.getErrorInfo(err);
                showToast(info.message);
                console.error('回复失败:', err);
            }
        }
    },

    /**
     * 从 AI 回复中提取隐藏的 <state_update> 状态补丁
     * 返回 { content: 清理后的文本, update: 解析后的 JSON 或 null }
     */
    _extractStateUpdate(content) {
        if (!content) return { content, update: null };
        const match = content.match(/<state_update>([\s\S]*?)<\/state_update>/i);
        if (!match) return { content, update: null };

        const rawJson = match[1].trim();
        let update = null;
        try {
            update = JSON.parse(rawJson);
        } catch (err) {
            console.warn('AI 状态补丁 JSON 解析失败（非致命）:', err.message || err);
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
    _processMarkers(markers) {
        for (const marker of markers) {
            switch (marker.type) {
                case 'new_char':
                    setTimeout(() => NewCharacterHandler.show(marker.raw), 500);
                    break;
                case 'char_exit':
                    NewCharacterHandler.handleExit(marker.raw);
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
                    this._handleMoveMarker(marker.raw);
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
            timestamp: Date.now()
        };
        scene.messages.push(msg);
        ChatUI.onMessageAdded(msg);
        State.saveCurrentSceneDebounced();
    },

    /**
     * 处理 [check:属性名|DC]
     * 自动投 D20 + 属性调整值，插入检定结果卡片
     */
    _handleCheckMarker(raw) {
        const scene = State.scene;
        if (!scene) return;

        const parts = raw.split('|');
        const statName = (parts[0] || '').trim();
        const dc = parseInt(parts[1]) || 15;

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

        const roll = Math.floor(Math.random() * 20) + 1;
        const total = roll + mod;
        let success, crit = null;
        if (roll === 20) { success = true; crit = 'success'; }
        else if (roll === 1) { success = false; crit = 'fail'; }
        else { success = total >= dc; }

        const sign = mod >= 0 ? '+' + mod : String(mod);
        const critText = crit === 'success' ? ' — 大成功！' : crit === 'fail' ? ' — 大失败！' : '';
        // AI 收到的文本结果（保持兼容）
        const resultText = success
            ? `【${statName}检定：D20=${roll} ${sign} = ${total} vs DC${dc} → 成功！${critText}】`
            : `【${statName}检定：D20=${roll} ${sign} = ${total} vs DC${dc} → 失败${critText}】`;

        const msg = {
            id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            role: 'user',
            content: resultText,
            type: 'check',
            checkData: { statName, key, roll, mod, total, dc, success, crit },
            timestamp: Date.now()
        };
        scene.messages.push(msg);
        ChatUI.onMessageAdded(msg);
        State.saveCurrentSceneDebounced();
    },

    /**
     * 处理 [move:地点名]
     */
    _handleMoveMarker(raw) {
        const scene = State.scene;
        if (!scene) return;
        const locName = raw.trim();
        const loc = scene.locations.find(l => l.name === locName || l.name.includes(locName));
        if (loc && loc.id !== scene.currentLocation) {
            MapView.moveTo(loc.id);
            SidebarRight.markTabNew('map');
        }
    },

    _handleItemAdd(raw) {
        const scene = State.scene;
        if (!scene) return;
        if (!scene.inventory) scene.inventory = [];
        if (!scene.equipment) scene.equipment = { weapon: null, armor: null, accessory: null };
        const parts = raw.split('|');
        const name = (parts[0] || '未知物品').trim();
        const description = (parts[1] || '').trim();
        const type = (parts[2] || 'misc').trim();
        const quantity = parseInt(parts[3]) || 1;

        const existing = scene.inventory.find(item => item.name === name);
        if (existing) {
            existing.quantity += quantity;
        } else {
            scene.inventory.push({
                id: 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                name, description, type, quantity, equipped: false
            });
        }
        showToast(`获得物品：${name}${quantity > 1 ? ' x' + quantity : ''}`);
        State.saveCurrentSceneDebounced();
        SidebarRight.renderInventory();
        SidebarRight.markTabNew('inventory');
    },

    _handleItemRemove(raw) {
        const scene = State.scene;
        if (!scene || !scene.inventory) return;
        const name = raw.split('|')[0].trim();
        const idx = scene.inventory.findIndex(item => item.name === name);
        if (idx === -1) return;
        const item = scene.inventory[idx];
        if (item.quantity > 1) {
            item.quantity--;
        } else {
            // 如果装备了，先卸下
            if (item.equipped) {
                item.equipped = false;
                const slotMap = { weapon: 'weapon', armor: 'armor' };
                for (const [type, slot] of Object.entries(slotMap)) {
                    if (item.type === type && scene.equipment[slot] === item.name) {
                        scene.equipment[slot] = null;
                    }
                }
                if (scene.equipment.accessory === item.name) scene.equipment.accessory = null;
            }
            scene.inventory.splice(idx, 1);
        }
        showToast(`失去物品：${name}`);
        State.saveCurrentSceneDebounced();
        SidebarRight.renderInventory();
    },

    _handleItemEquip(raw) {
        const scene = State.scene;
        if (!scene || !scene.inventory) return;
        if (!scene.equipment) scene.equipment = { weapon: null, armor: null, accessory: null };
        const name = raw.split('|')[0].trim();
        const item = scene.inventory.find(item => item.name === name);
        if (!item) return;

        // 先卸下同槽位已有装备
        const slotMap = { weapon: 'weapon', armor: 'armor' };
        const slot = slotMap[item.type] || 'accessory';
        const currentEquipped = scene.inventory.find(i => i.equipped && i !== item &&
            ((slot === 'accessory' && (i.type !== 'weapon' && i.type !== 'armor' || i.type === item.type)) ||
             (slot !== 'accessory' && (slotMap[i.type] || 'accessory') === slot)));
        if (currentEquipped) {
            currentEquipped.equipped = false;
            if (scene.equipment[slot] === currentEquipped.name) scene.equipment[slot] = null;
        }

        item.equipped = true;
        scene.equipment[slot] = item.name;
        showToast(`装备了：${name}`);
        State.saveCurrentSceneDebounced();
        SidebarRight.renderInventory();
    },

    _handleItemUnequip(raw) {
        const scene = State.scene;
        if (!scene || !scene.inventory) return;
        const name = raw.split('|')[0].trim();
        const item = scene.inventory.find(item => item.name === name);
        if (!item) return;

        item.equipped = false;
        const slotMap = { weapon: 'weapon', armor: 'armor' };
        const slot = slotMap[item.type] || 'accessory';
        if (scene.equipment[slot] === item.name) scene.equipment[slot] = null;
        showToast(`卸下了：${name}`);
        State.saveCurrentSceneDebounced();
        SidebarRight.renderInventory();
    },

    /** 处理 [damage:N|原因] 玩家受伤害 */
    _handleDamageMarker(raw) {
        const scene = State.scene;
        if (!scene) return;
        const parts = raw.split('|');
        const amount = Math.max(1, parseInt(parts[0]) || 1);
        const reason = (parts[1] || '').trim();
        scene.playerHp = Math.max(0, (scene.playerHp || 0) - amount);
        const msg = {
            id: 'msg_' + Date.now() + '_dmg',
            role: 'assistant',
            content: `受到 ${amount} 点伤害${reason ? '（' + reason + '）' : ''}，剩余生命 ${scene.playerHp}/${scene.playerMaxHp}`,
            type: 'system',
            timestamp: Date.now()
        };
        scene.messages.push(msg);
        ChatUI.onMessageAdded(msg);
        State.saveCurrentSceneDebounced();
        if (typeof ActionBar !== 'undefined' && ActionBar.renderStatsDisplay) ActionBar.renderStatsDisplay();
        if (typeof SidebarRight !== 'undefined' && SidebarRight.renderDetail) SidebarRight.renderDetail();
        // 死亡判定
        if (scene.playerHp <= 0) this._triggerGameOver();
    },

    /** 处理 [heal:N] 玩家回血 */
    _handleHealMarker(raw) {
        const scene = State.scene;
        if (!scene) return;
        const amount = Math.max(1, parseInt(raw.split('|')[0]) || 1);
        scene.playerHp = Math.min(scene.playerMaxHp || 20, (scene.playerHp || 0) + amount);
        const msg = {
            id: 'msg_' + Date.now() + '_heal',
            role: 'assistant',
            content: `恢复 ${amount} 点生命，当前 ${scene.playerHp}/${scene.playerMaxHp}`,
            type: 'system',
            timestamp: Date.now()
        };
        scene.messages.push(msg);
        ChatUI.onMessageAdded(msg);
        State.saveCurrentSceneDebounced();
        if (typeof ActionBar !== 'undefined' && ActionBar.renderStatsDisplay) ActionBar.renderStatsDisplay();
        if (typeof SidebarRight !== 'undefined' && SidebarRight.renderDetail) SidebarRight.renderDetail();
    },

    /** 处理 [gold:N] 金钱变动（正获得/负花费） */
    _handleGoldMarker(raw) {
        const scene = State.scene;
        if (!scene) return;
        const amount = parseInt(raw.split('|')[0]) || 0;
        scene.gold = Math.max(0, (scene.gold || 0) + amount);
        const msg = {
            id: 'msg_' + Date.now() + '_gold',
            role: 'assistant',
            content: `${amount >= 0 ? '获得' : '花费'} ${Math.abs(amount)} 金币，持有 ${scene.gold}`,
            type: 'system',
            timestamp: Date.now()
        };
        scene.messages.push(msg);
        ChatUI.onMessageAdded(msg);
        State.saveCurrentSceneDebounced();
        if (typeof ActionBar !== 'undefined' && ActionBar.renderStatsDisplay) ActionBar.renderStatsDisplay();
        if (typeof SidebarRight !== 'undefined' && SidebarRight.renderDetail) SidebarRight.renderDetail();
    },

    /** 处理 [exp:N] 经验获得 */
    _handleExpMarker(raw) {
        const scene = State.scene;
        if (!scene) return;
        const amount = Math.max(1, parseInt(raw.split('|')[0]) || 1);
        if (typeof QuestTracker !== 'undefined' && QuestTracker._addExp) {
            QuestTracker._addExp(amount);
        } else {
            scene.exp = (scene.exp || 0) + amount;
        }
        State.saveCurrentSceneDebounced();
        if (typeof ActionBar !== 'undefined' && ActionBar.renderStatsDisplay) ActionBar.renderStatsDisplay();
        if (typeof SidebarRight !== 'undefined' && SidebarRight.renderDetail) SidebarRight.renderDetail();
    },

    /** 触发死亡结局 */
    _triggerGameOver() {
        const scene = State.scene;
        if (!scene || scene.gameState !== 'playing') return;
        scene.gameState = 'defeated';
        const msg = {
            id: 'msg_' + Date.now() + '_gameover',
            role: 'assistant',
            content: `你的生命值归零，倒在了${scene.locations?.find(l => l.id === scene.currentLocation)?.name || '这片土地'}上。冒险就此终结……但或许还有未读的存档能让你重来。`,
            type: 'gameover',
            timestamp: Date.now()
        };
        scene.messages.push(msg);
        ChatUI.onMessageAdded(msg);
        State.saveCurrentSceneDebounced();
        showToast('你倒下了…可读取存档重来');
    },

    /** 触发胜利结局（主线全完成） */
    _checkVictory() {
        const scene = State.scene;
        if (!scene || scene.gameState !== 'playing') return;
        const mainQuests = (scene.quests || []).filter(q => q.type === 'main');
        if (mainQuests.length === 0) return;
        const allDone = mainQuests.every(q => q.status === 'completed');
        if (!allDone) return;
        scene.gameState = 'victorious';
        const msg = {
            id: 'msg_' + Date.now() + '_victory',
            role: 'assistant',
            content: `所有主线任务已完成！${scene.name} 的故事迎来了它的结局。恭喜你，冒险者。`,
            type: 'victory',
            timestamp: Date.now()
        };
        scene.messages.push(msg);
        ChatUI.onMessageAdded(msg);
        State.saveCurrentSceneDebounced();
        showToast('🏆 冒险完成！');
    },

    /**
     * 玩家通过地图移动后，DM 描述新地点
     */
    async handleLocationMove(loc) {
        const scene = State.scene;
        if (!scene) return;

        const dm = scene.dmPersona;
        ChatUI.appendStreamingMessage(dm ? '__dm__' : null);
        let description = '';

        try {
            const tempMsg = {
                id: 'msg_' + Date.now(),
                role: 'user',
                content: `【玩家到达了 ${loc.name}】`,
                type: 'action',
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
            ChatUI.updateStreamingContent(description);

            // 提取并应用 DM 回复中的状态补丁
            const { content: cleanedDescription, update: dmUpdate } = this._extractStateUpdate(description);
            if (dmUpdate) {
                try { StrategyManager.applyStateUpdate(dmUpdate); }
                catch (err) { console.warn('DM 状态补丁应用失败（非致命）:', err.message || err); }
            }

            scene.messages.pop();
            const msg = {
                id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                role: 'assistant',
                content: cleanedDescription,
                type: 'narrate',
                timestamp: Date.now()
            };
            scene.messages.push(msg);
            ChatUI._renderedCount = scene.messages.length;
            ChatUI.finalizeStreamingMessage(description, null);
            await State.saveCurrentSceneDebounced();

        } catch (err) {
            ChatUI.removeStreamingMessage();
            scene.messages.pop();
            if (err.name !== 'AbortError') {
                console.error('地点描述生成失败:', err);
            }
        }
    },

    /**
     * DM 叙事：用于检定结果描述、事件旁白等
     */
    async _dmNarrate(context = {}) {
        const scene = State.scene;
        if (!scene) return;

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
            ChatUI.updateStreamingContent(content);

            // 提取并应用 DM 回复中的状态补丁
            const { content: cleanedContent, update: dmUpdate2 } = this._extractStateUpdate(content);
            if (dmUpdate2) {
                try { StrategyManager.applyStateUpdate(dmUpdate2); }
                catch (err) { console.warn('DM 状态补丁应用失败（非致命）:', err.message || err); }
            }

            const msg = {
                id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                role: 'assistant',
                content: cleanedContent,
                type: 'narrate',
                timestamp: Date.now()
            };
            scene.messages.push(msg);
            ChatUI._renderedCount = scene.messages.length;
            ChatUI.finalizeStreamingMessage(content, null);
            await State.saveCurrentSceneDebounced();

        } catch (err) {
            ChatUI.removeStreamingMessage();
            if (err.name !== 'AbortError') {
                console.error('DM叙事失败:', err);
            }
        }
    },

    /**
     * 自动摘要：将最早的消息压缩为叙事摘要，存入 scene.summary
     */
    async _triggerSummarization() {
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
    }
};
