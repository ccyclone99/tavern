/**
 * 聊天区 UI 控制器
 */
const ChatUI = {
    _renderedCount: 0,

    /** 相对时间格式化（"刚刚"/"3分钟前"/"2小时前"/"昨天"/"MM-DD"） */
    _formatTime(ts) {
        if (!ts) return '';
        const now = Date.now();
        const diff = Math.max(0, now - ts);
        const min = 60 * 1000, hour = 60 * min, day = 24 * hour;
        if (diff < min) return '刚刚';
        if (diff < hour) return Math.floor(diff / min) + '分钟前';
        if (diff < day) return Math.floor(diff / hour) + '小时前';
        if (diff < 2 * day) return '昨天';
        if (diff < 7 * day) return Math.floor(diff / day) + '天前';
        const d = new Date(ts);
        return (d.getMonth() + 1) + '-' + d.getDate();
    },

    /** 绝对时间（用于 hover title） */
    _formatTimeFull(ts) {
        if (!ts) return '';
        const d = new Date(ts);
        const pad = n => String(n).padStart(2, '0');
        return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
    },

    /** 渲染检定结果卡片 */
    _renderCheckCard(d) {
        if (!d) return '';
        const statIcons = { strength: 'str', dexterity: 'dex', constitution: 'con', intelligence: 'int', wisdom: 'wis', charisma: 'cha' };
        const iconName = statIcons[d.key] || 'int';
        const iconHtml = Icons.get(iconName, { size: 16 });
        const sign = d.mod >= 0 ? '+' + d.mod : String(d.mod);
        const outcome = d.outcome || (d.crit === 'success' ? 'critical_success' : d.crit === 'fail' ? 'critical_fail' : (d.success ? 'success' : 'fail'));
        const clsMap = {
            critical_success: 'crit-success',
            success: 'check-success',
            partial: 'check-partial',
            fail: 'check-fail',
            critical_fail: 'crit-fail'
        };
        const labelMap = {
            critical_success: '大成功！',
            success: '成功',
            partial: '部分成功',
            fail: '失败推进',
            critical_fail: '大失败！'
        };
        const cls = clsMap[outcome] || (d.success ? 'check-success' : 'check-fail');
        const resultText = d.resultLabel || labelMap[outcome] || (d.success ? '成功' : '失败');
        const resourceMods = Array.isArray(d.resourceModifiers) ? d.resourceModifiers : [];
        const resourceKeys = new Set(resourceMods.map(m => `${m.source || ''}|${m.label || ''}`));
        const passiveItemMods = Array.isArray(d.itemModifiers)
            ? d.itemModifiers.filter(m => !resourceKeys.has(`${m.source || ''}|${m.label || ''}`))
            : [];
        const breakdownParts = [
            `属性 ${d.statMod >= 0 ? '+' + d.statMod : d.statMod}`
        ];
        if (d.itemBonus) breakdownParts.push(`常驻物品 ${d.itemBonus >= 0 ? '+' + d.itemBonus : d.itemBonus}`);
        if (d.selectedBonus) breakdownParts.push(`投入资源 ${d.selectedBonus >= 0 ? '+' + d.selectedBonus : d.selectedBonus}`);
        if (d.dcDelta) breakdownParts.push(`DC ${d.dcDelta >= 0 ? '+' + d.dcDelta : d.dcDelta}`);
        if (d.riskDelta) breakdownParts.push(`风险 ${d.riskDelta >= 0 ? '+' + d.riskDelta : d.riskDelta}`);
        if (d.baseDc && d.baseDc !== d.dc) breakdownParts.push(`基础DC ${d.baseDc}`);
        const breakdown = `<div class="check-breakdown">${breakdownParts.map(Renderer.escapeHtml).join(' · ')}</div>`;
        const itemMods = passiveItemMods.length > 0
            ? `<div class="check-modifiers">${passiveItemMods.slice(0, 4).map(m => `<span>${Renderer.escapeHtml(m.source)} ${Renderer.escapeHtml(m.label)}</span>`).join('')}</div>`
            : '';
        const resourceModsHtml = resourceMods.length > 0
            ? `<div class="check-modifiers check-used-modifiers">${resourceMods.slice(0, 4).map(m => `<span>${Renderer.escapeHtml(m.source)} ${Renderer.escapeHtml(m.label)}</span>`).join('')}</div>`
            : '';
        const resolvedConsequences = Array.isArray(d.resolvedConsequences) ? d.resolvedConsequences : [];
        const resolvedConsequencesHtml = resolvedConsequences.length > 0
            ? `<div class="check-modifiers check-resolved-consequences">${resolvedConsequences.slice(0, 3).map(item => `<span>解除后果：${Renderer.escapeHtml(item.title || item.id || '后果')}</span>`).join('')}</div>`
            : '';
        const note = d.consequenceHint
            ? `<div class="check-outcome-note">${Renderer.escapeHtml(d.consequenceHint)}</div>`
            : '';
        return `<div class="check-card ${cls}">
            <div class="check-stat">${iconHtml}<span>${Renderer.escapeHtml(d.statName)}</span></div>
            <div class="check-roll"><span class="check-d20" data-final="${d.roll}">${d.roll}</span></div>
            <div class="check-detail">
                <span class="check-mod">${sign}</span>
                <span class="check-eq">=</span>
                <span class="check-total">${d.total}</span>
                <span class="check-vs">vs DC${d.dc}</span>
            </div>
            ${breakdown}
            ${itemMods}
            ${resourceModsHtml}
            ${resolvedConsequencesHtml}
            <div class="check-outcome">
                <div class="check-result-badge">${Renderer.escapeHtml(resultText)}</div>
                ${note}
            </div>
        </div>`;
    },

    init() {
        this.messagesEl = document.getElementById('chatMessages');
        this.inputEl = document.getElementById('chatInput');
        this.sendBtn = document.getElementById('sendBtn');
        this.stopBtn = document.getElementById('stopBtn');
        this.playerNameInput = document.getElementById('playerNameInput');
        this.talkBtn = document.getElementById('talkBtn');
        this.oocBtn = document.getElementById('oocBtn');
        this.actionBtn = document.getElementById('actionBtn');
        this.strategyBtn = document.getElementById('strategyBtn');
        this.modeHintEl = document.getElementById('inputModeHint');
        this.suggestionHelpEl = document.getElementById('inputSuggestionHelp');
        this.suggestionChipsEl = document.getElementById('inputSuggestionChips');

        this.sendBtn.onclick = async () => {
            try { await this.onSend(); }
            catch (e) { console.error('onSend failed:', e); showToast('发送失败，请重试'); }
        };
        this.stopBtn.onclick = () => this.onStop();
        this.inputEl.addEventListener('keydown', e => {
            if (e.key === 'Enter' && !e.shiftKey && !e.ctrlKey && !e.metaKey) {
                e.preventDefault();
                this.onSend();
            }
            // Ctrl+Enter / Cmd+Enter 也发送（但不要和上面重复触发）
            if (e.key === 'Enter' && (e.ctrlKey || e.metaKey)) {
                e.preventDefault();
                this.onSend();
            }
        });
        this.inputEl.addEventListener('input', () => this.autoResize());
        if (this.suggestionChipsEl) {
            this.suggestionChipsEl.addEventListener('click', e => {
                const btn = e.target.closest('.input-chip');
                if (!btn) return;
                this._onSuggestionChipClick(btn).catch(err => {
                    console.error('suggestion chip failed:', err);
                    showToast('建议操作失败，请重试');
                });
            });
        }
        if (this.talkBtn) this.talkBtn.onclick = () => this.setInputMode('talk');
        this.oocBtn.onclick = () => this.setInputMode('ooc');
        if (this.actionBtn) this.actionBtn.onclick = () => this.toggleAction();
        if (this.strategyBtn) this.strategyBtn.onclick = () => this.toggleStrategy();
        this.playerNameInput.addEventListener('change', async () => {
            const scene = State.scene;
            if (scene) {
                scene.userName = this.playerNameInput.value.trim() || '旅人';
                await State.saveCurrentScene();
            }
        });

        State.on('sceneChanged', () => {
            if (State.isStreaming) return;
            this._renderedCount = 0;
            this.render();
            ActionBar.renderStatsDisplay();
            this._syncInputMode();
            const sceneNameEl = document.getElementById('sceneName');
            if (sceneNameEl) {
                sceneNameEl.textContent = State.scene ? State.scene.name : '酒馆大厅';
            }
        });
        this._syncInputMode();
    },

    autoResize() {
        this.inputEl.style.height = 'auto';
        this.inputEl.style.height = Math.min(this.inputEl.scrollHeight, 160) + 'px';
    },

    /** 进入流式状态：禁用发送、显示停止 */
    setStreaming() {
        State.isStreaming = true;
        if (this.sendBtn) this.sendBtn.style.display = 'none';
        if (this.stopBtn) this.stopBtn.style.display = 'block';
        this._syncInputMode();
    },

    /** 结束流式状态：恢复发送、隐藏停止 */
    clearStreaming() {
        State.isStreaming = false;
        if (this.sendBtn) this.sendBtn.style.display = 'block';
        if (this.stopBtn) this.stopBtn.style.display = 'none';
        this._syncInputMode();
    },

    _syncInputMode() {
        const scene = State.scene;
        const mode = State.isOOC ? 'ooc' : (State.inputMode || 'talk');
        const modes = {
            talk: {
                btn: this.talkBtn,
                placeholder: '你想说什么，或打算怎么做？',
                hint: '直接输入对话、观察、询问、行动或计划；有风险时会先让你确认。',
                send: '发送'
            },
            action: {
                btn: this.actionBtn,
                placeholder: '描述一个明确行动，例如：我想套出他隐瞒的事...',
                hint: '高风险行动会先生成风险预览；确认前不会推进剧情。',
                send: '预览'
            },
            strategy: {
                btn: this.strategyBtn,
                placeholder: '描述目标或计策意图，例如：我想挑拨商会和城卫...',
                hint: '计策适合多阶段计划、拉拢、离间和长期目标。',
                send: '提出'
            },
            ooc: {
                btn: this.oocBtn,
                placeholder: 'OOC 消息（不会进入角色扮演上下文）...',
                hint: 'OOC 用于说明偏好、修正设定或询问系统，不作为角色行动。',
                send: '发送'
            }
        };
        [this.talkBtn, this.actionBtn, this.strategyBtn, this.oocBtn].forEach(btn => {
            if (!btn) return;
            const active = btn.dataset.mode === mode;
            btn.classList.toggle('active', active);
            btn.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        let current = modes[mode] || modes.talk;
        if (!State.isOOC && scene?.pendingCheck) {
            current = {
                placeholder: '可输入“投入资源名”，再输入“掷骰”；或输入“取消”。',
                hint: '当前等待检定结果；可先投入物品/同伴协助，检定完成前不会推进其他行动。',
                send: '掷骰'
            };
        } else if (!State.isOOC && scene?.pendingAction) {
            current = {
                placeholder: '输入“执行”确认，输入“取消”放弃，或直接改写行动。',
                hint: '行动预览尚未进入剧情；确认后才会推进。',
                send: '执行'
            };
        }
        if (State.isStreaming) {
            current = {
                placeholder: '正在生成回复，可等待或点击“停止”。',
                hint: 'AI 回复中，暂不能发送新输入；需要中断可点击停止。',
                send: current.send
            };
        }
        if (this.inputEl) this.inputEl.placeholder = current.placeholder;
        if (this.modeHintEl) this.modeHintEl.textContent = current.hint;
        if (this.sendBtn && !State.isStreaming) {
            this.sendBtn.textContent = current.send;
            this.sendBtn.setAttribute('aria-label', current.send);
        }
        if (scene?.inputContext) {
            scene.inputContext.state = State.isStreaming ? 'blocked_streaming' : (scene.pendingCheck ? 'pending_check' : (scene.pendingAction ? 'pending_action' : 'idle'));
            scene.inputContext.prompt = current.placeholder;
        }
        this._renderSuggestionChips();
    },

    _renderSuggestionChips() {
        if (!this.suggestionChipsEl) return;
        const chips = this._buildSuggestionChips(State.scene);
        if (this.suggestionHelpEl) {
            if (chips.length === 0) {
                this.suggestionHelpEl.textContent = '';
            } else if (State.scene?.pendingCheck) {
                this.suggestionHelpEl.textContent = '输入建议：这些按钮会处理当前检定；你也可以直接输入“投入资源名”“掷骰”或“取消”。';
            } else if (State.scene?.pendingAction) {
                this.suggestionHelpEl.textContent = '输入建议：确认和取消会立即处理；改写会填入输入框。';
            } else {
                this.suggestionHelpEl.textContent = '输入建议：点击只是填入示例句，可以改完再发送。';
            }
        }
        this.suggestionChipsEl.innerHTML = chips.map(chip => {
            const cls = [
                'input-chip',
                chip.primary ? 'primary' : '',
                chip.behavior === 'send' ? 'command' : ''
            ].filter(Boolean).join(' ');
            const behavior = chip.behavior || 'fill';
            const title = behavior === 'send'
                ? `点击后立即处理：${chip.text}`
                : `点击填入输入框，可修改后发送：${chip.text}`;
            return `<button class="${cls}" type="button" data-chip-text="${Renderer.escapeAttr(chip.text)}" data-chip-behavior="${Renderer.escapeAttr(behavior)}" title="${Renderer.escapeAttr(title)}" aria-label="${Renderer.escapeAttr(title)}">${Renderer.escapeHtml(chip.label)}</button>`;
        }).join('');
    },

    _buildSuggestionChips(scene) {
        if (State.isStreaming) return [];
        if (scene?.pendingCheck) {
            const chips = [
                { label: '掷骰继续', text: '掷骰', behavior: 'send', primary: true },
                { label: '取消', text: '取消', behavior: 'send' }
            ];
            const check = scene.pendingCheck;
            const selectedItemIds = new Set(Array.isArray(check.selectedItemModifierIds) ? check.selectedItemModifierIds.map(String) : []);
            const selectedCompanionIds = new Set(Array.isArray(check.selectedCompanionResourceIds) ? check.selectedCompanionResourceIds.map(String) : []);
            const isSelected = (modifier, selectedIds) => {
                if (!modifier) return false;
                if (selectedIds.has(String(modifier.id))) return true;
                if (Array.isArray(modifier.legacyIds) && modifier.legacyIds.some(id => selectedIds.has(String(id)))) return true;
                if (modifier.kind !== 'item') return false;
                const legacyRefs = [modifier.itemId, modifier.source].map(String).filter(Boolean);
                return [...selectedIds].some(id => legacyRefs.some(ref => id === `item:${ref}` || id.startsWith(`item:${ref}:`)));
            };
            const availableItems = typeof WorldEngine !== 'undefined' && WorldEngine.getAvailableCheckItems
                ? WorldEngine.getAvailableCheckItems(scene, check)
                : (check.availableItemModifiers || []);
            const availableCompanions = typeof WorldEngine !== 'undefined' && WorldEngine.getAvailableCompanionResources
                ? WorldEngine.getAvailableCompanionResources(scene, check)
                : (check.availableCompanionModifiers || []);
            const item = availableItems.find(resource => !isSelected(resource, selectedItemIds));
            const companion = availableCompanions.find(resource => !isSelected(resource, selectedCompanionIds));
            if (item?.source) chips.splice(1, 0, {
                label: `投入${this._shortChipLabel(item.source)}`,
                text: `投入${item.source}`,
                behavior: 'send'
            });
            if (companion?.source) chips.splice(Math.min(2, chips.length), 0, {
                label: `请${this._shortChipLabel(companion.source)}`,
                text: `请${companion.source}帮忙`,
                behavior: 'send'
            });
            chips.push({ label: '解释', text: '这是什么检定？', behavior: 'send' });
            return chips.slice(0, 5);
        }
        if (scene?.pendingAction) {
            return [
                { label: '确认执行', text: '执行', behavior: 'send', primary: true },
                { label: '取消', text: '取消', behavior: 'send' },
                { label: '解释风险', text: '为什么这么高风险？', behavior: 'send' },
                { label: '改写', text: '改成', behavior: 'fill' }
            ];
        }

        const tutorialChips = this._buildTutorialSuggestionChips(scene);
        if (tutorialChips.length > 0) return tutorialChips;

        const chips = [];
        const add = chip => {
            if (!chip?.text) return;
            const key = chip.text.trim();
            if (!key || chips.some(c => c.text === key)) return;
            chips.push(chip);
        };
        this._buildPrepSuggestionChips(scene).forEach(add);
        const situation = scene && typeof WorldEngine !== 'undefined' && WorldEngine.getCurrentSituation
            ? WorldEngine.getCurrentSituation(scene)
            : null;
        const recommended = Array.isArray(situation?.recommendedActions)
            ? situation.recommendedActions
            : (Array.isArray(scene?.currentSituation?.recommendedActions) ? scene.currentSituation.recommendedActions : []);
        recommended.slice(0, 2).forEach(action => {
            const text = String(action || '').trim();
            if (text) add({ label: this._shortChipLabel(text), text, behavior: 'fill', primary: chips.length === 0 });
        });

        const currentChar = State.currentCharacterId
            ? State.characters.find(c => c.id === State.currentCharacterId)
            : null;
        add({ label: '观察', text: '我观察当前地点有什么异常。', behavior: 'fill' });
        add({
            label: currentChar ? `询问${currentChar.name}` : '询问建议',
            text: currentChar ? `@${currentChar.name} 我想问问现在该注意什么。` : '我询问在场的人最近发生了什么。',
            behavior: 'fill'
        });
        add({ label: '制定计划', text: '我想制定一个计划：', behavior: 'fill' });
        add({ label: '问下一步', text: '我现在该干什么？', behavior: 'fill' });
        return chips.slice(0, 5);
    },

    _buildPrepSuggestionChips(scene) {
        if (!scene || (typeof WorldEngine !== 'undefined' && WorldEngine.isScenePlaying && !WorldEngine.isScenePlaying(scene))) {
            return [];
        }
        if (typeof WorldEngine !== 'undefined' && WorldEngine.getPreparationHints) {
            return WorldEngine.getPreparationHints(scene, { limit: 3 })
                .filter(hint => hint.command)
                .map((hint, idx) => ({
                    label: this._shortChipLabel(hint.label || hint.command || hint.title),
                    text: hint.command,
                    behavior: 'fill',
                    primary: idx === 0 && ['attribute', 'healing', 'pending_reward'].includes(hint.kind)
                }));
        }
        const chips = [];
        const add = chip => {
            if (!chip?.text || chips.some(c => c.text === chip.text)) return;
            chips.push(chip);
        };
        const statSuggestion = this._suggestStatAllocation(scene);
        if (statSuggestion) {
            add({
                label: `${statSuggestion.label}+1`,
                text: `加一点${statSuggestion.label}`,
                behavior: 'fill',
                primary: true
            });
        }

        const hp = Number(scene.playerHp ?? scene.playerMaxHp ?? 10);
        const maxHp = Math.max(1, Number(scene.playerMaxHp || 10));
        const wounded = hp < maxHp;
        const healingItem = wounded ? this._findHealingItem(scene) : null;
        if (healingItem?.name) {
            add({ label: `使用${this._shortChipLabel(healingItem.name)}`, text: `使用${healingItem.name}`, behavior: 'fill' });
        } else if (wounded) {
            add({ label: '休息恢复', text: '休息一下', behavior: 'fill' });
        }

        const equipItem = this._findEquippableItem(scene);
        if (equipItem?.name) {
            add({ label: `装备${this._shortChipLabel(equipItem.name)}`, text: `装备${equipItem.name}`, behavior: 'fill' });
        }

        const usableItem = this._findDirectUsableItem(scene, healingItem);
        if (usableItem?.name) {
            add({ label: `使用${this._shortChipLabel(usableItem.name)}`, text: `使用${usableItem.name}`, behavior: 'fill' });
        }

        if (this._shouldSuggestSupplyPurchase(scene)) {
            add({ label: '购买补给', text: '购买补给', behavior: 'fill' });
        }
        const prepPurchase = this._suggestPrepPurchase(scene);
        if (prepPurchase) {
            add({ label: prepPurchase.label, text: prepPurchase.text, behavior: 'fill' });
        }
        return chips.slice(0, 3);
    },

    _suggestStatAllocation(scene) {
        if (Number(scene?.attrPoints || 0) <= 0) return null;
        const statLabels = {
            strength: '力量',
            dexterity: '敏捷',
            constitution: '体质',
            intelligence: '智力',
            wisdom: '感知',
            charisma: '魅力'
        };
        const stats = scene.playerStats || {};
        const eligible = key => statLabels[key] && Number(stats[key] || 10) < 20;
        const activeChallenge = typeof WorldEngine !== 'undefined' && WorldEngine.getActiveChallenge
            ? WorldEngine.getActiveChallenge(scene)
            : null;
        const approachStat = (activeChallenge?.approaches || [])
            .map(a => a?.stat)
            .find(eligible);
        if (approachStat) return { key: approachStat, label: statLabels[approachStat] };
        const priority = ['dexterity', 'intelligence', 'wisdom', 'charisma', 'constitution', 'strength'];
        const lowest = priority
            .filter(eligible)
            .sort((a, b) => Number(stats[a] || 10) - Number(stats[b] || 10))[0];
        return lowest ? { key: lowest, label: statLabels[lowest] } : null;
    },

    _findHealingItem(scene) {
        return (scene?.inventory || [])
            .filter(item => item?.name && this._isDirectUsableItem(item))
            .find(item => this._itemHasEffect(item, 'heal') || this._itemLooksLikeHealing(item));
    },

    _findDirectUsableItem(scene, excludedItem = null) {
        return (scene?.inventory || [])
            .filter(item => item?.name && item !== excludedItem && this._isDirectUsableItem(item))
            .find(item => !this._itemHasEffect(item, 'check_bonus'));
    },

    _findEquippableItem(scene) {
        return (scene?.inventory || [])
            .filter(item => item?.name && !item.equipped)
            .filter(item => typeof WorldEngine !== 'undefined' && WorldEngine.canEquipInventoryItem?.(item))
            .sort((a, b) => this._equipmentPriority(a) - this._equipmentPriority(b))[0];
    },

    _isDirectUsableItem(item) {
        if (!item) return false;
        if (item.uses !== undefined && Number(item.uses || 0) <= 0) return false;
        if (Number(item.quantity || 1) <= 0) return false;
        return typeof WorldEngine !== 'undefined' && WorldEngine.canUseInventoryItem?.(item);
    },

    _itemHasEffect(item, type) {
        return Array.isArray(item?.effects) && item.effects.some(effect => effect?.type === type);
    },

    _itemLooksLikeHealing(item) {
        return /药|医疗|治疗|绷带|急救|回复|恢复/.test(String(item?.name || '') + String(item?.description || ''));
    },

    _equipmentPriority(item) {
        const type = String(item?.type || '');
        if (type === 'weapon') return 0;
        if (type === 'armor') return 1;
        return 2;
    },

    _shouldSuggestSupplyPurchase(scene) {
        if (!scene || Number(scene.gold || 0) < 15) return false;
        const inventory = scene.inventory || [];
        if (inventory.length >= 200) return false;
        const readyConsumables = inventory.filter(item =>
            item?.type === 'consumable' &&
            Number(item.uses ?? item.quantity ?? 0) > 0 &&
            Array.isArray(item.effects) &&
            item.effects.some(effect => ['check_bonus', 'heal'].includes(effect?.type))
        );
        return readyConsumables.length < 2;
    },

    _suggestPrepPurchase(scene) {
        if (!scene || Number(scene.gold || 0) < 35) return null;
        const inventory = scene.inventory || [];
        if (inventory.length >= 200) return null;
        const has = name => inventory.some(item => item && item.name === name);
        const activeChallenge = typeof WorldEngine !== 'undefined' && WorldEngine.getActiveChallenge
            ? WorldEngine.getActiveChallenge(scene)
            : null;
        const approachTypes = new Set((activeChallenge?.approaches || []).map(a => a?.actionType || '').filter(Boolean));
        const approachStats = new Set((activeChallenge?.approaches || []).map(a => a?.stat || '').filter(Boolean));
        if ((approachTypes.has('combat') || approachStats.has('strength')) && Number(scene.gold || 0) >= 45 && !has('短剑')) {
            return { label: '购买短剑', text: '购买短剑' };
        }
        if ((approachTypes.has('force') || approachTypes.has('combat') || approachStats.has('constitution')) && Number(scene.gold || 0) >= 50 && !has('轻型护甲')) {
            return { label: '购买护甲', text: '购买护甲' };
        }
        if ((approachTypes.has('investigate') || approachTypes.has('sneak') || approachStats.has('intelligence')) && !has('通用工具包')) {
            return { label: '购买工具', text: '购买工具包' };
        }
        if ((approachTypes.has('observe') || approachStats.has('wisdom')) && Number(scene.gold || 0) >= 45 && !has('便携扫描仪')) {
            return { label: '购买扫描仪', text: '购买扫描仪' };
        }
        if (!has('通用工具包')) return { label: '购买工具', text: '购买工具包' };
        return null;
    },

    _buildTutorialSuggestionChips(scene) {
        if (!scene || typeof TutorialWorld === 'undefined' || typeof TutorialState === 'undefined') return [];
        if (!TutorialWorld.isCurrentScene()) return [];
        const step = TutorialState.getStep();
        const findChar = name => (scene.characters || [])
            .map(id => State.characters.find(c => c.id === id))
            .filter(Boolean)
            .find(c => c.name === name);
        const ally = findChar('艾莉');
        const target = ally ? `@${ally.name} ` : '@艾莉 ';
        const byStep = {
            0: [
                { label: '打招呼', text: '你好，莫里斯。', behavior: 'fill', primary: true },
                { label: '问怎么玩', text: '我第一次来，这个游戏怎么玩？', behavior: 'fill' }
            ],
            1: [
                { label: '问艾莉', text: `${target}你能教我怎么冒险吗？`, behavior: 'fill', primary: true },
                { label: '问莫里斯', text: '@莫里斯 我想知道接下来该做什么。', behavior: 'fill' }
            ],
            2: [
                { label: '偷苹果派', text: '我趁莫里斯转身时，悄悄把苹果派藏进袖子里。', behavior: 'fill', primary: true },
                { label: '先观察', text: '我先观察吧台上有什么能拿来练手。', behavior: 'fill' }
            ],
            3: [
                { label: '问检定', text: '这是什么检定？', behavior: 'fill' },
                { label: '我准备好了', text: '我准备好了，告诉我下一步。', behavior: 'fill' }
            ],
            4: [
                { label: '去后院', text: '我去后院。', behavior: 'fill', primary: true },
                { label: '看地图', text: '我想看看酒馆地图。', behavior: 'fill' }
            ]
        };
        return byStep[step] || [];
    },

    _shortChipLabel(text) {
        const clean = String(text || '').replace(/[。！？!?]+$/g, '').trim();
        return clean.length > 8 ? clean.slice(0, 8) + '...' : clean;
    },

    async _onSuggestionChipClick(btn) {
        const text = btn.dataset.chipText || '';
        if (!text) return;
        this.inputEl.value = text;
        this.autoResize();
        this.inputEl.focus();
        if (this.inputEl.setSelectionRange) {
            const len = this.inputEl.value.length;
            this.inputEl.setSelectionRange(len, len);
        }
        if (btn.dataset.chipBehavior === 'send') {
            await this.onSend();
        }
    },

    setInputMode(mode) {
        if (mode === 'ooc') {
            State.isOOC = true;
            State.inputMode = 'talk';
        } else {
            State.isOOC = false;
            State.inputMode = mode || 'talk';
        }
        this._syncInputMode();
    },

    toggleOOC() {
        this.setInputMode(State.isOOC ? 'talk' : 'ooc');
    },

    toggleAction() {
        if (State.inputMode === 'action' && !State.isOOC) {
            this.setInputMode('talk');
        } else {
            this.setInputMode('action');
        }
    },

    toggleStrategy() {
        if (State.inputMode === 'strategy' && !State.isOOC) {
            this.setInputMode('talk');
        } else {
            this.setInputMode('strategy');
        }
        // 教学兼容钩子：旧计策快捷入口（step2）
        if (TutorialWorld.isCurrentScene() && State.inputMode === 'strategy') {
            Tutorial.afterStrategyMode().catch(e => console.warn('[Tutorial] afterStrategyMode 失败:', e));
        }
    },

    /** 全量渲染，仅在场景切换时调用 */
    render() {
        const scene = State.scene;
        if (!scene || scene.messages.length === 0) {
            this._renderedCount = 0;
            this.messagesEl.innerHTML = `
                <div class="empty-state">
                    <div class="empty-icon">🍷</div>
                    <h2>${scene ? Renderer.escapeHtml(scene.name) : '欢迎来到酒馆'}</h2>
                    <p>${scene && (scene.characters || []).length > 0 ? '点击输入框开始对话' : '在左侧添加角色，开始你的故事'}</p>
                </div>`;
            if (scene) this.playerNameInput.value = scene.userName || '旅人';
            return;
        }

        this.messagesEl.innerHTML = '';
        scene.messages.forEach((msg, idx) => this.renderMessage(msg, idx));
        this._renderedCount = scene.messages.length;
        this.scrollToBottom();
        this.playerNameInput.value = scene.userName || '旅人';
    },

    /** 新消息增量追加（性能优化） */
    onMessageAdded(msg) {
        const scene = State.scene;
        if (!scene) return;
        // 场景消息数应大于已渲染数，追加新消息
        if (scene.messages.length > this._renderedCount) {
            const idx = this._renderedCount;
            this.renderMessage(msg, idx);
            this._renderedCount = scene.messages.length;
            this.scrollToBottom();
        }
    },

    renderMessage(msg, idx) {
        const isUser = msg.role === 'user';
        const char = !isUser && msg.characterId ? State.characters.find(c => c.id === msg.characterId) : null;
        const emoji = !isUser && char ? (char._emoji || '') : '';
        const safeAvatar = isUser ? Renderer.safeUrl(State.scene?.playerPersona?.avatar || '') : Renderer.safeUrl(char?.avatar || '');
        const name = isUser ? (State.scene?.userName || '旅人') : (char ? char.name : 'AI');

        // 仅当 msg.type 是明确特殊类型时才覆盖解析结果，避免默认 'talk' 破坏 narrate/ooc/strategy 检测
        const explicitType = msg.type && msg.type !== 'talk' ? msg.type : null;
        const parsed = explicitType
            ? { ...Renderer.parseMessageType(msg.content), type: explicitType }
            : Renderer.parseMessageType(msg.content);
        const emotionClass = parsed.emotion ? ` emotion-${parsed.emotion}` : '';

        const div = document.createElement('div');
        div.className = `rp-message ${msg.role}${parsed.emotion ? ' emotion-' + parsed.emotion : ''}`;
        div.dataset.index = idx;

        if (parsed.type === 'divider') {
            div.className = 'rp-message rp-divider';
            div.innerHTML = `<div class="story-divider"><span>${Renderer.escapeHtml(parsed.content)}</span></div>`;
            this.messagesEl.appendChild(div);
            return;
        }
        if (parsed.type === 'narrate') {
            div.className = `rp-message rp-narrate${parsed.emotion ? ' emotion-' + parsed.emotion : ''}`;
            const dm = State.scene?.dmPersona;
            const dmAvatarHtml = dm
                ? `<div style="font-size:18px;margin-bottom:4px;">${Renderer.escapeHtml(dm.emoji)}</div>`
                : '';
            div.innerHTML = dmAvatarHtml + Renderer.renderRP(parsed.content);
        } else if (parsed.type === 'ooc') {
            div.className = 'rp-message rp-ooc';
            div.textContent = parsed.content;
        } else if (parsed.type === 'strategy') {
            div.className = 'rp-message rp-strategy';
            div.innerHTML = `<div class="strategy-label">计策意图</div><div>${Renderer.renderRP(parsed.content)}</div>`;
        } else if (parsed.type === 'action_intent') {
            div.className = 'rp-message rp-strategy rp-action-intent';
            const displayIntent = msg.actionData?.intent || parsed.content;
            div.innerHTML = `<div class="strategy-label">行动意图</div><div>${Renderer.renderRP(displayIntent)}</div>`;
        } else if (parsed.type === 'system') {
            div.className = 'rp-message rp-system';
            div.innerHTML = `<div class="system-chip">${Renderer.renderRP(parsed.content)}</div>`;
        } else if (parsed.type === 'check') {
            // 检定结果卡片（数据存在 msg.checkData）
            div.className = 'rp-message rp-check';
            div.innerHTML = this._renderCheckCard(msg.checkData);
        } else if (parsed.type === 'gameover') {
            div.className = 'rp-message rp-ending rp-ending-defeat';
            div.innerHTML = `<div class="ending-icon">💀</div><div class="ending-title">失败结局</div><div class="ending-desc">${Renderer.renderRP(parsed.content)}</div>`;
        } else if (parsed.type === 'victory') {
            div.className = 'rp-message rp-ending rp-ending-victory';
            div.innerHTML = `<div class="ending-icon">🏆</div><div class="ending-title">冒险完成</div><div class="ending-desc">${Renderer.renderRP(parsed.content)}</div>`;
        } else {
            let avatarHtml;
            if (safeAvatar) {
                avatarHtml = `<img class="rp-avatar" src="${Renderer.escapeAttr(safeAvatar)}" alt="${Renderer.escapeHtml(name)}">`;
            } else if (emoji) {
                avatarHtml = `<div class="rp-avatar rp-avatar-emoji">${Renderer.escapeHtml(emoji)}</div>`;
            } else {
                avatarHtml = `<div class="rp-avatar rp-avatar-letter ${isUser ? 'user' : 'ai'}">${Renderer.escapeHtml(name[0])}</div>`;
            }
            const timeRel = this._formatTime(msg.timestamp);
            const timeFull = this._formatTimeFull(msg.timestamp);
            const timeHtml = timeRel ? `<div class="rp-time" title="${Renderer.escapeAttr(timeFull)}">${Renderer.escapeHtml(timeRel)}</div>` : '';
            div.innerHTML = `
                ${avatarHtml}
                <div class="rp-bubble-wrap">
                    <div class="rp-sender">${Renderer.escapeHtml(name)}${parsed.emotion ? ' · ' + Renderer.escapeHtml(parsed.emotion) : ''}</div>
                    <div class="rp-bubble">${Renderer.renderRP(parsed.content)}</div>
                    ${timeHtml}
                    <div class="rp-msg-actions">
                        <button class="msg-copy-btn" data-idx="${idx}">复制</button>
                        <button class="msg-regen-btn" data-idx="${idx}">重试</button>
                        <button class="msg-delete-btn" data-idx="${idx}">删除</button>
                    </div>
                </div>`;
            div.querySelector('.msg-copy-btn').onclick = () => ChatUI.copyMessage(idx);
            const regenBtn = div.querySelector('.msg-regen-btn');
            const deleteBtn = div.querySelector('.msg-delete-btn');
            regenBtn.onclick = async () => {
                regenBtn.disabled = true;
                try { await ChatUI.regenerate(idx); }
                finally { regenBtn.disabled = false; }
            };
            deleteBtn.onclick = async () => {
                deleteBtn.disabled = true;
                try { await ChatUI.deleteMessage(idx); }
                finally { deleteBtn.disabled = false; }
            };
        }

        this.messagesEl.appendChild(div);
    },

    appendStreamingMessage(characterId) {
        // 防御：先移除可能残留的旧流式消息
        this.removeStreamingMessage();

        const div = document.createElement('div');
        div.className = 'rp-message assistant streaming-msg';
        div.id = 'streamingMsg';

        // DM叙事者
        if (characterId === '__dm__') {
            const dm = State.scene?.dmPersona;
            const name = dm ? dm.name : '叙述者';
            const emoji = dm ? dm.emoji : '📖';
            div.innerHTML = `<div class="rp-avatar rp-avatar-emoji rp-avatar-dm">${Renderer.escapeHtml(emoji)}</div><div class="rp-bubble-wrap"><div class="rp-sender rp-sender-dm">${Renderer.escapeHtml(name)}</div><div class="rp-bubble" id="streamingContent"><div class="typing-indicator"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div></div></div>`;
        } else {
            const char = characterId ? State.characters.find(c => c.id === characterId) : null;
            const name = char ? char.name : 'AI';
            const emoji = char ? (char._emoji || '') : '';
            const safeAvatar = Renderer.safeUrl(char?.avatar || '');
            let avatarHtml;
            if (safeAvatar) {
                avatarHtml = `<img class="rp-avatar" src="${Renderer.escapeAttr(safeAvatar)}" alt="${Renderer.escapeHtml(name)}">`;
            } else if (emoji) {
                avatarHtml = `<div class="rp-avatar rp-avatar-emoji">${Renderer.escapeHtml(emoji)}</div>`;
            } else {
                avatarHtml = `<div class="rp-avatar rp-avatar-letter ai">${Renderer.escapeHtml(name[0])}</div>`;
            }
            div.innerHTML = `${avatarHtml}<div class="rp-bubble-wrap"><div class="rp-sender">${Renderer.escapeHtml(name)}</div><div class="rp-bubble" id="streamingContent"><div class="typing-indicator"><span class="dot"></span><span class="dot"></span><span class="dot"></span></div></div></div>`;
        }

        this.messagesEl.appendChild(div);
        this._streamingEl = div.querySelector('#streamingContent');
        this.scrollToBottom();
        return this._streamingEl;
    },

    updateStreamingContent(text) {
        if (this._streamingEl) {
            this._streamingEl.innerHTML = Renderer.renderRP(Renderer.stripHiddenControls(text));
            this._streamingEl.classList.add('is-streaming');
        }
    },

    finalizeStreamingMessage(content, emotion) {
        const msgEl = this._streamingEl ? this._streamingEl.closest('.streaming-msg') : null;
        if (this._streamingEl && content !== undefined) {
            this._streamingEl.innerHTML = Renderer.renderRP(content);
        }
        if (msgEl) {
            msgEl.classList.remove('streaming-msg');
            msgEl.removeAttribute('id');
            if (emotion) msgEl.classList.add(`emotion-${emotion}`);
        }
        if (this._streamingEl) this._streamingEl.classList.remove('is-streaming');
        this._streamingEl = null;
        this.scrollToBottom();
    },

    removeStreamingMessage() {
        const el = document.getElementById('streamingMsg');
        if (el) el.remove();
        this._streamingEl = null;
    },

    scrollToBottom() {
        requestAnimationFrame(() => {
            if (this.messagesEl) {
                this.messagesEl.scrollTop = this.messagesEl.scrollHeight;
            }
        });
    },

    async onSend() {
        let text = this.inputEl.value.trim();
        if (State.isStreaming) {
            showToast('AI 正在回复。请等待，或点击“停止”中断。');
            this._syncInputMode();
            return;
        }

        let scene = State.scene;
        const blankCheckSubmit = !text && !State.isOOC && !!scene?.pendingCheck;
        if (!text && !blankCheckSubmit) return;
        if (blankCheckSubmit) text = '掷骰';

        if (!scene) {
            await State.createScene('酒馆大厅');
            scene = State.scene;
        }

        const route = typeof IntentRouter !== 'undefined'
            ? IntentRouter.route(text, scene)
            : { kind: State.isOOC ? 'ooc' : 'talk', text };

        if (!State.isOOC && route.kind !== 'ooc' && typeof PromptGuard !== 'undefined' && PromptGuard.inspectUserInput) {
            const guard = PromptGuard.inspectUserInput(text);
            if (guard.blocked) {
                this._clearInput();
                this._appendLocalSystemMessage(PromptGuard.buildBlockedMessage(guard));
                this._syncInputMode();
                return;
            }
        }

        if (this._shouldBlockEndedSceneInput(route, scene)) {
            this._clearInput();
            const message = typeof WorldEngine !== 'undefined' && WorldEngine.endedSceneMessage
                ? WorldEngine.endedSceneMessage(scene)
                : '当前冒险已经结束，不能继续改变游戏状态。';
            this._appendLocalSystemMessage(`【冒险已结束】${message}`);
            this._syncInputMode();
            return;
        }

        if (!State.isOOC && await this._handleRoutedInput(route, text, scene)) return;

        const isActionIntent = State.inputMode === 'action' && !State.isOOC && route.kind === 'talk';
        if (isActionIntent) {
            await this.preparePendingAction(text);
            return;
        }

        const isStrategy = (State.inputMode === 'strategy' && !State.isOOC) || route.kind === 'strategy';
        const isOoc = State.isOOC || route.kind === 'ooc';
        const participantIds = this._resolveParticipants(text);
        const msg = {
            id: 'msg_' + Date.now(),
            role: 'user',
            content: isStrategy ? '/strategy ' + text : (isOoc ? '/ooc ' + (route.text || text) : text),
            type: isOoc ? 'ooc' : (isStrategy ? 'strategy' : 'talk'),
            intentMeta: route.meta ? {
                kind: route.kind || 'talk',
                actionType: route.meta.actionType || '',
                confidence: route.meta.confidence || 0,
                targetCharacterIds: participantIds,
                routerReason: route.reason || ''
            } : undefined,
            visibility: typeof WorldEngine !== 'undefined'
                ? WorldEngine.createVisibility({
                    public: !isOoc && !isStrategy && State.activeCharacters.length > 1,
                    participants: participantIds
                })
                : undefined,
            timestamp: Date.now()
        };

        scene.messages.push(msg);
        if (!isOoc && !isStrategy && typeof WorldEngine !== 'undefined' && WorldEngine.markFlowMoveCompleted) {
            WorldEngine.markFlowMoveCompleted(scene, text);
        }
        this.onMessageAdded(msg);
        await State.saveCurrentSceneDebounced();
        this.inputEl.value = '';
        this.inputEl.style.height = 'auto';

        if (!isOoc) {
            try {
                await GroupChat.handleUserMessage();
            } catch (err) {
                if (err.name !== 'AbortError') {
                    console.error('发送消息失败:', err);
                    showToast('回复失败，请重试');
                }
            }
        }
    },

    _shouldBlockEndedSceneInput(route, scene) {
        if (State.isOOC || route?.kind === 'ooc' || route?.kind === 'help' || route?.kind === 'review') return false;
        return this._isSceneEnded(scene);
    },

    _isSceneEnded(scene) {
        if (!scene) return false;
        if (typeof WorldEngine !== 'undefined' && WorldEngine.isScenePlaying) {
            return !WorldEngine.isScenePlaying(scene);
        }
        return !!scene.gameState && scene.gameState !== 'playing';
    },

    _showEndedSceneToast(scene) {
        const message = typeof WorldEngine !== 'undefined' && WorldEngine.endedSceneMessage
            ? WorldEngine.endedSceneMessage(scene)
            : '当前冒险已经结束，不能继续改变游戏状态。';
        if (typeof showToast !== 'undefined') showToast(message);
    },

    async _handleRoutedInput(route, originalText, scene) {
        switch (route.kind) {
            case 'roll_check':
                this._clearInput();
                await GroupChat.rollPendingCheck();
                return true;
            case 'cancel_check':
                this._clearInput();
                await GroupChat.cancelPendingCheck();
                this._syncInputMode();
                return true;
            case 'check_resource':
                this._clearInput();
                if (typeof ActionBar !== 'undefined' && ActionBar.setCheckResourceSelected) {
                    const result = ActionBar.setCheckResourceSelected(route.meta.resourceKind, route.meta.resourceId, route.meta.selected);
                    if (result.ok) {
                        await State.saveCurrentSceneDebounced();
                        showToast(`${result.selected ? '已投入' : '已取消投入'}：${result.source || route.meta.source}`);
                    } else {
                        showToast(result.message || '无法调整检定资源');
                    }
                }
                this._syncInputMode();
                return true;
            case 'blocked_by_check':
                showToast('请先投入资源、输入“掷骰”完成检定，或输入“取消”放弃');
                if (typeof ActionBar !== 'undefined') ActionBar.renderPendingCheck();
                this._syncInputMode();
                return true;
            case 'confirm_action':
                this._clearInput();
                await this.confirmPendingAction();
                this._syncInputMode();
                return true;
            case 'cancel_action':
                this._clearInput();
                await this.cancelPendingAction();
                this._syncInputMode();
                return true;
            case 'rewrite_action':
                await this.preparePendingAction(route.text || originalText, route.meta);
                return true;
            case 'explain_action':
                this._clearInput();
                this._appendLocalSystemMessage(this._buildPendingActionExplanation(scene.pendingAction));
                return true;
            case 'help':
                this._clearInput();
                this._appendLocalSystemMessage(IntentRouter.buildHelpText(originalText, scene));
                return true;
            case 'review':
                this._clearInput();
                this._openRunReview(scene);
                this._syncInputMode();
                return true;
            case 'move_location':
                this._clearInput();
                if (typeof MapView !== 'undefined' && MapView.moveTo) {
                    await MapView.moveTo(route.meta.locationId);
                }
                this._syncInputMode();
                return true;
            case 'use_inventory_item':
                this._clearInput();
                if (typeof WorldEngine !== 'undefined' && WorldEngine.useInventoryItem) {
                    const result = WorldEngine.useInventoryItem(scene, route.meta.itemId || route.meta.itemName);
                    if (!result.ok) showToast(result.message || '无法使用这个物品');
                    else await State.saveCurrentSceneDebounced();
                }
                this._syncInputMode();
                return true;
            case 'equip_inventory_item':
                this._clearInput();
                if (typeof WorldEngine !== 'undefined' && WorldEngine.equipInventoryItem) {
                    const result = WorldEngine.equipInventoryItem(scene, route.meta.itemId || route.meta.itemName);
                    if (!result.ok) showToast(result.message || '无法装备这个物品');
                    else await State.saveCurrentSceneDebounced();
                }
                this._syncInputMode();
                return true;
            case 'unequip_inventory_item':
                this._clearInput();
                if (typeof WorldEngine !== 'undefined' && WorldEngine.unequipInventoryItem) {
                    const result = WorldEngine.unequipInventoryItem(scene, route.meta.itemId || route.meta.itemName);
                    if (!result.ok) showToast(result.message || '无法卸下这个物品');
                    else await State.saveCurrentSceneDebounced();
                }
                this._syncInputMode();
                return true;
            case 'local_rest':
                this._clearInput();
                if (typeof WorldEngine !== 'undefined' && WorldEngine.restPlayer) {
                    await WorldEngine.restPlayer(scene);
                    await State.saveCurrentSceneDebounced();
                }
                this._syncInputMode();
                return true;
            case 'buy_supply':
                this._clearInput();
                if (typeof WorldEngine !== 'undefined' && WorldEngine.buyBasicSupply) {
                    const result = WorldEngine.buyBasicSupply(scene, route.meta.supplyType);
                    if (!result.ok) showToast(result.message || '交易未完成');
                    await State.saveCurrentSceneDebounced();
                }
                this._syncInputMode();
                return true;
            case 'shop_catalog':
                this._clearInput();
                if (typeof WorldEngine !== 'undefined' && WorldEngine.formatBasicSupplyCatalog) {
                    this._appendLocalSystemMessage(WorldEngine.formatBasicSupplyCatalog(scene));
                } else {
                    this._appendLocalSystemMessage('【基础商店】可以输入“购买补给”“购买医疗包”“购买零件包”“购买短剑”“购买护甲”“购买工具包”“购买扫描仪”。');
                }
                this._syncInputMode();
                return true;
            case 'inventory_cleanup':
                this._clearInput();
                if (typeof WorldEngine !== 'undefined' && WorldEngine.formatInventoryCleanupAdvice) {
                    this._appendLocalSystemMessage(WorldEngine.formatInventoryCleanupAdvice(scene));
                } else {
                    this._appendLocalSystemMessage('【整理背包】可以出售非任务、未装备物品，或使用可消耗物品来腾出空间。');
                }
                this._syncInputMode();
                return true;
            case 'sell_inventory_item':
                this._clearInput();
                if (typeof WorldEngine !== 'undefined' && WorldEngine.sellInventoryItem) {
                    const result = WorldEngine.sellInventoryItem(scene, route.meta.itemId || route.meta.itemName, route.meta.quantity, { all: route.meta.all });
                    if (!result.ok) {
                        showToast(result.message || '交易未完成');
                    } else {
                        await State.saveCurrentSceneDebounced();
                        showToast(`出售 ${result.itemName}，金币 +${result.gold}`);
                    }
                }
                this._syncInputMode();
                return true;
            case 'allocate_stat_point':
                this._clearInput();
                if (typeof WorldEngine !== 'undefined' && WorldEngine.allocateStatPoint) {
                    const result = WorldEngine.allocateStatPoint(scene, route.meta.stat);
                    if (!result.ok) {
                        showToast(result.message || '无法分配属性点');
                    } else {
                        await State.saveCurrentSceneDebounced();
                        showToast(`${result.label || route.meta.label} +1`);
                    }
                }
                this._syncInputMode();
                return true;
            case 'action_preview':
                await this.preparePendingAction(originalText, route.meta);
                return true;
            default:
                return false;
        }
    },

    _clearInput() {
        this.inputEl.value = '';
        this.inputEl.style.height = 'auto';
    },

    _openRunReview(scene) {
        if (!scene) return;
        const ended = typeof WorldEngine !== 'undefined' && WorldEngine.isScenePlaying
            ? !WorldEngine.isScenePlaying(scene)
            : !!scene.gameState && scene.gameState !== 'playing';
        if (ended && typeof RunRecorder !== 'undefined' && RunRecorder.complete) {
            RunRecorder.complete(scene, scene.gameState, scene.defeatReason || '玩家查看回顾');
        }
        if (typeof SidebarRight !== 'undefined') {
            SidebarRight.openTab?.('situation');
            SidebarRight.renderSituation?.();
        }
        const record = scene.runRecord;
        const label = record?.title
            ? `已打开右侧「局势」面板的冒险回顾：${record.title}。`
            : '已打开右侧「局势」面板。当前冒险尚未结束，可先查看目标、风险、线索和最近事件。';
        this._appendLocalSystemMessage(`【回顾】${label}`);
    },

    _appendLocalSystemMessage(content) {
        const scene = State.scene;
        if (!scene || !content) return;
        const msg = {
            id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            role: 'assistant',
            content,
            type: 'system',
            visibility: typeof WorldEngine !== 'undefined'
                ? WorldEngine.createVisibility({ public: true })
                : undefined,
            timestamp: Date.now()
        };
        scene.messages.push(msg);
        this.onMessageAdded(msg);
        State.saveCurrentSceneDebounced();
    },

    _buildPendingActionExplanation(action) {
        if (!action) return '当前没有待确认行动。';
        const check = action.suggestedCheck
            ? `${action.suggestedCheck.statName} DC${action.suggestedCheck.dc}`
            : '通常无需检定';
        const risks = (action.risks || []).slice(0, 2).join('；') || '局势发生变化';
        return `当前行动还没有进入剧情：${action.intent}。风险 ${action.risk}%（${action.riskLevel}），建议检定：${check}。失败可能导致：${risks}。输入“执行”确认，或直接输入新动作改写。`;
    },

    _resolveParticipants(text) {
        const names = [];
        const raw = String(text || '');
        State.activeCharacters.forEach(char => {
            const name = String(char.name || '').trim();
            if (name && raw.includes('@' + name)) names.push(char.id);
        });
        if (names.length > 0) {
            State.setCurrentCharacter(names[0]);
            return names;
        }
        return State.currentCharacterId ? [State.currentCharacterId] : [];
    },

    async preparePendingAction(text, intentMeta = null) {
        const scene = State.scene;
        if (!scene) return;
        if (this._isSceneEnded(scene)) {
            this._showEndedSceneToast(scene);
            this._syncInputMode();
            return;
        }
        scene.pendingAction = ActionPlanner.create(scene, text);
        if (intentMeta) scene.pendingAction.intentMeta = JSON.parse(JSON.stringify(intentMeta));
        await State.saveCurrentSceneDebounced();
        if (typeof ActionBar !== 'undefined') ActionBar.renderPendingAction();
        this._clearInput();
        this._syncInputMode();
        showToast('已生成行动预览');
        if (typeof TutorialWorld !== 'undefined' && TutorialWorld.isCurrentScene() &&
            typeof Tutorial !== 'undefined' && Tutorial.afterActionPreviewCreated) {
            Tutorial.afterActionPreviewCreated().catch(e => console.warn('[Tutorial] afterActionPreviewCreated 失败:', e));
        }
    },

    async confirmPendingAction() {
        if (State.isStreaming) return;
        const scene = State.scene;
        const action = scene?.pendingAction;
        if (!scene || !action) return;
        if (this._isSceneEnded(scene)) {
            this._showEndedSceneToast(scene);
            this._syncInputMode();
            return;
        }

        const msg = {
            id: 'msg_' + Date.now(),
            role: 'user',
            content: ActionPlanner.formatForPrompt(action),
            type: 'action_intent',
            actionData: JSON.parse(JSON.stringify(action)),
            visibility: typeof WorldEngine !== 'undefined'
                ? WorldEngine.createVisibility({
                    public: State.activeCharacters.length > 1,
                    participants: State.currentCharacterId ? [State.currentCharacterId] : []
                })
                : undefined,
            timestamp: Date.now()
        };
        scene.pendingAction = null;
        scene.messages.push(msg);
        if (typeof WorldEngine !== 'undefined' && WorldEngine.markFlowMoveCompleted) {
            WorldEngine.markFlowMoveCompleted(scene, action.intent || '');
        }
        this.onMessageAdded(msg);
        await State.saveCurrentSceneDebounced();
        if (typeof ActionBar !== 'undefined') ActionBar.renderPendingAction();
        this._syncInputMode();

        try {
            await GroupChat.handleUserMessage();
        } catch (err) {
            if (err.name !== 'AbortError') {
                console.error('行动发送失败:', err);
                showToast('行动发送失败，请重试');
            }
        }
    },

    async cancelPendingAction() {
        const scene = State.scene;
        if (!scene || !scene.pendingAction) return;
        if (this._isSceneEnded(scene)) {
            this._showEndedSceneToast(scene);
            this._syncInputMode();
            return;
        }
        scene.pendingAction = null;
        await State.saveCurrentSceneDebounced();
        if (typeof ActionBar !== 'undefined') ActionBar.renderPendingAction();
        this._syncInputMode();
        showToast('已取消行动预览');
    },

    onStop() {
        API.stop();
        this.removeStreamingMessage();
        this.clearStreaming();
    },

    copyMessage(idx) {
        const scene = State.scene;
        if (!scene || !scene.messages[idx]) return;
        const text = scene.messages[idx].content;
        navigator.clipboard.writeText(text).then(() => showToast('已复制'));
    },

    async deleteMessage(idx) {
        const scene = State.scene;
        if (!scene) return;
        if (this._isSceneEnded(scene)) {
            this._showEndedSceneToast(scene);
            return;
        }
        if (!confirm('确定删除这条消息吗？')) return;
        scene.messages.splice(idx, 1);
        this._renderedCount = 0;
        await State.saveCurrentScene();
        this.render();
    },

    async regenerate(idx) {
        if (State.isStreaming) return;
        const scene = State.scene;
        if (!scene) return;
        if (this._isSceneEnded(scene)) {
            this._showEndedSceneToast(scene);
            return;
        }
        // If clicking on a user message, truncate there; otherwise find the preceding user message
        const msg = scene.messages[idx];
        const userIdx = msg && msg.role === 'user' ? idx : (() => {
            for (let i = idx - 1; i >= 0; i--) {
                if (scene.messages[i].role === 'user') return i;
            }
            return -1;
        })();
        if (userIdx === -1) return;
        scene.messages = scene.messages.slice(0, userIdx + 1);
        this._renderedCount = 0;
        await State.saveCurrentScene();
        this.render();
        try {
            await GroupChat.handleUserMessage();
        } catch (err) {
            if (err.name !== 'AbortError') console.error('重新生成失败:', err);
        }
    }
};
