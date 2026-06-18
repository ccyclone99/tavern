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
        quest.objectives[objIdx].completed = !quest.objectives[objIdx].completed;

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
        const rewards = [];
        // 解析奖励项
        quest.reward.split(/[,，、]/).forEach(raw => {
            const item = raw.trim();
            if (!item) return;
            const m = item.match(/^(.+?)\s*[x×]\s*(\d+)$/);
            if (m) {
                const name = m[1].trim();
                const qty = parseInt(m[2]);
                if (/金币|gold|铜币|银币|钱/i.test(name)) {
                    scene.gold = (scene.gold || 0) + qty;
                    rewards.push(`💰 金币 +${qty}`);
                } else if (/经验|exp|experience/i.test(name)) {
                    this._addExp(qty);
                    rewards.push(`✨ 经验 +${qty}`);
                } else {
                    this._addItem(name, qty);
                    rewards.push(`🎒 ${name} x${qty}`);
                }
            } else {
                // 无数量，默认 1 个物品
                if (/金币|gold/i.test(item)) { scene.gold = (scene.gold || 0) + 10; rewards.push('💰 金币 +10'); }
                else if (/经验|exp/i.test(item)) { this._addExp(20); rewards.push('✨ 经验 +20'); }
                else { this._addItem(item, 1); rewards.push(`🎒 ${item}`); }
            }
        });
        // 反馈消息
        if (rewards.length > 0) {
            const msg = {
                id: 'msg_' + Date.now() + '_rew',
                role: 'assistant',
                content: `获得奖励：${rewards.join('，')}`,
                type: 'system',
                timestamp: Date.now()
            };
            scene.messages.push(msg);
            ChatUI.onMessageAdded(msg);
            if (typeof SidebarRight !== 'undefined') {
                if (SidebarRight.renderInventory) SidebarRight.renderInventory();
                if (SidebarRight.renderDetail) SidebarRight.renderDetail();
                if (SidebarRight.markTabNew) SidebarRight.markTabNew('inventory');
            }
            if (typeof ActionBar !== 'undefined' && ActionBar.renderStatsDisplay) ActionBar.renderStatsDisplay();
        }
    },

    /** 加经验并检查升级（每 level×100 经验升 1 级，+2 属性点） */
    _addExp(amount) {
        const scene = State.scene;
        if (!scene) return;
        scene.exp = (scene.exp || 0) + amount;
        while (true) {
            const need = (scene.level || 1) * 100;
            if (scene.exp < need) break;
            scene.exp -= need;
            scene.level = (scene.level || 1) + 1;
            scene.attrPoints = (scene.attrPoints || 0) + 2;
            // 升级回满血
            const con = (scene.playerStats && scene.playerStats.constitution) || 10;
            scene.playerMaxHp = 10 + Math.floor((con - 10) / 2) * 4 + (scene.level - 1) * 4;
            scene.playerHp = scene.playerMaxHp;
            showToast(`🎉 升级！现在是 ${scene.level} 级，获得 2 属性点`);
            const msg = {
                id: 'msg_' + Date.now() + '_lvl',
                role: 'assistant',
                content: `升级到 ${scene.level} 级！生命值全满，获得 2 属性点可在详情面板分配`,
                type: 'system',
                timestamp: Date.now()
            };
            scene.messages.push(msg);
            ChatUI.onMessageAdded(msg);
        }
    },

    /** 添加物品到背包 */
    _addItem(name, qty) {
        const scene = State.scene;
        if (!scene.inventory) scene.inventory = [];
        const MAX_TOTAL_INVENTORY = 200;
        const existing = scene.inventory.find(i => i.name === name);
        if (existing) {
            existing.quantity = (existing.quantity || 1) + qty;
        } else if (scene.inventory.length < MAX_TOTAL_INVENTORY) {
            scene.inventory.push({
                id: 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                name, description: '', type: 'misc', quantity: qty
            });
        } else {
            console.warn(`[QuestTracker] 背包已达上限 ${MAX_TOTAL_INVENTORY}，停止新增物品`);
        }
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
