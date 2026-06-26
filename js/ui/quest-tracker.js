/**
 * 任务追踪面板
 */
const QuestTracker = {
    init() {
        this.el = document.getElementById('questList');
        if (!this.el) return;
        State.on('sceneChanged', () => this.render());
    },

    render() {
        if (!this.el) return;
        const scene = State.scene;
        const quests = scene ? scene.quests : [];
        const active = quests.filter(q => q.status === 'active');

        if (active.length === 0) {
            this.el.innerHTML = '<p class="placeholder">暂无活跃任务</p>';
            return;
        }

        const mains = active.filter(q => q.type === 'main');
        const sides = active.filter(q => q.type === 'side');

        this.el.innerHTML = `
            ${mains.length > 0 ? `<div class="quest-section">
                <div class="quest-section-title">★ 主线</div>
                ${mains.map(q => this._renderQuest(q)).join('')}
            </div>` : ''}
            ${sides.length > 0 ? `<div class="quest-section">
                <div class="quest-section-title">支线</div>
                ${sides.map(q => this._renderQuest(q)).join('')}
            </div>` : ''}
        `;

        // 绑定点击目标事件
        this.el.querySelectorAll('.quest-obj').forEach(el => {
            el.addEventListener('click', () => {
                const questId = el.dataset.questId;
                const objIdx = parseInt(el.dataset.objIdx);
                this._toggleObjective(questId, objIdx);
            });
        });
    },

    _renderQuest(q) {
        const completedCount = q.objectives.filter(o => o.completed).length;
        const totalCount = q.objectives.length;
        return `
            <div class="quest-card ${q.type === 'main' ? 'quest-main' : 'quest-side'}">
                <div class="quest-name">${Renderer.escapeHtml(q.name)}</div>
                <div class="quest-desc">${Renderer.escapeHtml(q.description)}</div>
                <div class="quest-objectives">
                    ${q.objectives.map((o, i) => `
                        <div class="quest-obj ${o.completed ? 'completed' : ''}"
                             data-quest-id="${Renderer.escapeAttr(q.id)}" data-obj-idx="${i}">
                            ${o.completed ? '☑' : '☐'} ${Renderer.escapeHtml(o.text)}
                        </div>
                    `).join('')}
                </div>
                <div class="quest-footer">
                    <span class="quest-progress">${completedCount}/${totalCount}</span>
                    ${q.giver ? `<span class="quest-giver">来自 ${Renderer.escapeHtml(q.giver)}</span>` : ''}
                    ${q.reward ? `<span class="quest-reward">🏆 ${Renderer.escapeHtml(q.reward)}</span>` : ''}
                </div>
            </div>
        `;
    },

    _toggleObjective(questId, objIdx) {
        const scene = State.scene;
        if (!scene) return;
        const quest = scene.quests.find(q => q.id === questId);
        if (!quest) return;
        const objective = quest.objectives[objIdx];
        if (!objective) return;
        const nextCompleted = !objective.completed;
        if (nextCompleted &&
            typeof WorldEngine !== 'undefined' &&
            WorldEngine._objectiveAllowedByProgressGates &&
            !WorldEngine._objectiveAllowedByProgressGates(scene, quest, objective, objIdx, '', { manualToggle: true })) {
            WorldEngine.addSystemMessage?.(scene, `【任务进展待确认：${quest.name}】${objective.text} 需要明确挑战结果、证据或结论支持。`, 'system');
            if (typeof showToast !== 'undefined') showToast('任务目标还缺少规则依据');
            if (typeof SidebarRight !== 'undefined') SidebarRight.renderSituation?.();
            return;
        }
        objective.completed = nextCompleted;

        // 检查是否所有目标都完成
        if (quest.objectives.every(o => o.completed)) {
            quest.status = 'completed';
            this._grantReward(quest);
            showToast(`任务完成：${quest.name}`);
            // 插入任务完成消息
            const msg = {
                id: 'msg_' + Date.now(),
                role: 'user',
                content: `【任务完成：${quest.name}】`,
                type: 'action',
                timestamp: Date.now()
            };
            scene.messages.push(msg);
            if (typeof WorldEngine !== 'undefined' && WorldEngine.recordEvent) {
                WorldEngine.recordEvent(scene, {
                    category: 'quest',
                    title: '任务完成',
                    text: `任务完成：${quest.name}`,
                    messageId: msg.id,
                    timestamp: msg.timestamp
                });
            }
            ChatUI.onMessageAdded(msg);
        }

        State.saveCurrentScene().catch(e => console.warn('任务状态保存失败:', e));
        this.render();
        // 检查胜利条件（主线全完成）
        if (typeof GroupChat !== 'undefined' && GroupChat._checkVictory) GroupChat._checkVictory();
    },

    /**
     * 解析并发放任务奖励
     * reward 格式："金币x100, 经验x50, 治疗药水, 短剑x1"（逗号分隔）
     */
    _grantReward(quest) {
        const scene = State.scene;
        if (!scene || !quest.reward) return;
        if (typeof WorldEngine !== 'undefined' && WorldEngine.grantQuestReward) {
            return WorldEngine.grantQuestReward(scene, quest);
        }
        console.warn('[QuestTracker] WorldEngine.grantQuestReward 不可用，跳过任务奖励发放');
        return { ok: false, rewards: [], message: '任务奖励系统不可用。' };
    },

    /** 加经验并检查升级（每 level×100 经验升 1 级，+2 属性点） */
    _addExp(amount) {
        const scene = State.scene;
        if (!scene) return;
        if (typeof WorldEngine !== 'undefined' && WorldEngine.addExperience) {
            return WorldEngine.addExperience(scene, amount, { source: '任务奖励', silent: true });
        }
        console.warn('[QuestTracker] WorldEngine.addExperience 不可用，跳过经验发放');
        return { ok: false, amount: 0, levelsGained: 0, message: '经验系统不可用。' };
    },

    /** 添加物品到背包 */
    _addItem(name, qty) {
        const scene = State.scene;
        if (!scene) return { ok: false, message: '没有可用场景。' };
        if (typeof WorldEngine !== 'undefined' &&
            WorldEngine.createInventoryItemFromReward &&
            WorldEngine.grantInventoryItem) {
            const item = WorldEngine.createInventoryItemFromReward(name, qty);
            return WorldEngine.grantInventoryItem(scene, item, { source: '任务奖励' });
        }
        console.warn('[QuestTracker] WorldEngine.grantInventoryItem 不可用，跳过物品发放');
        return { ok: false, message: '物品系统不可用。' };
    },

    /** AI 动态添加任务 */
    addQuest(questData) {
        const scene = State.scene;
        if (!scene) return;
        const quest = {
            id: 'q_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            name: questData.name || '未知任务',
            type: questData.type || 'side',
            description: questData.description || '',
            objectives: (questData.objectives || []).map(t => ({ text: t, completed: false })),
            status: 'active',
            giver: questData.giver || '命运',
            reward: questData.reward || ''
        };
        scene.quests.push(quest);
        State.saveCurrentScene().catch(e => console.warn('新增任务保存失败:', e));
        this.render();
        showToast(`新任务：${quest.name}`);
        SidebarRight.markTabNew('quests');
    },

    /** AI 标记任务目标完成 */
    updateObjective(questName, objIdx) {
        const scene = State.scene;
        if (!scene) return;
        const quest = scene.quests.find(q => q.name === questName && q.status === 'active');
        if (!quest) return;
        const idx = (parseInt(objIdx) || 1) - 1;
        if (idx >= 0 && idx < quest.objectives.length) {
            const objective = quest.objectives[idx];
            if (typeof WorldEngine !== 'undefined' &&
                WorldEngine._objectiveAllowedByProgressGates &&
                !WorldEngine._objectiveAllowedByProgressGates(scene, quest, objective, idx, '', { explicitMarker: true })) {
                WorldEngine.addSystemMessage?.(scene, `【任务进展待确认：${quest.name}】${objective.text} 需要明确挑战结果或证据支持。`, 'system');
                SidebarRight.renderSituation?.();
                return;
            }
            quest.objectives[idx].completed = true;
            if (quest.objectives.every(o => o.completed)) {
                quest.status = 'completed';
                this._grantReward(quest);
                showToast(`任务完成：${quest.name}`);
            }
            State.saveCurrentScene().catch(e => console.warn('任务目标保存失败:', e));
            this.render();
            // 检查胜利条件
            if (typeof GroupChat !== 'undefined' && GroupChat._checkVictory) GroupChat._checkVictory();
        }
    }
};
