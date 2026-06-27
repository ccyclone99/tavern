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
        const canMutateQuest = this._canMutateGameplay(scene);

        if (active.length === 0) {
            this.el.innerHTML = canMutateQuest
                ? '<p class="placeholder">暂无活跃任务</p>'
                : '<p class="placeholder">暂无活跃任务<br>冒险已结束，任务仅供回顾</p>';
            return;
        }

        const mains = active.filter(q => q.type === 'main');
        const sides = active.filter(q => q.type === 'side');

        this.el.innerHTML = `
            ${mains.length > 0 ? `<div class="quest-section">
                <div class="quest-section-title">★ 主线</div>
                ${mains.map(q => this._renderQuest(q, canMutateQuest)).join('')}
            </div>` : ''}
            ${sides.length > 0 ? `<div class="quest-section">
                <div class="quest-section-title">支线</div>
                ${sides.map(q => this._renderQuest(q, canMutateQuest)).join('')}
            </div>` : ''}
        `;

        // 绑定点击目标事件
        this.el.querySelectorAll('.quest-obj[data-mutable="true"]').forEach(el => {
            el.addEventListener('click', () => {
                const questId = el.dataset.questId;
                const objIdx = parseInt(el.dataset.objIdx);
                this._toggleObjective(questId, objIdx);
            });
        });
    },

    _renderQuest(q, canMutateQuest = true) {
        const completedCount = q.objectives.filter(o => o.completed).length;
        const totalCount = q.objectives.length;
        return `
            <div class="quest-card ${q.type === 'main' ? 'quest-main' : 'quest-side'} ${canMutateQuest ? '' : 'quest-readonly'}">
                <div class="quest-name">${Renderer.escapeHtml(q.name)}</div>
                <div class="quest-desc">${Renderer.escapeHtml(q.description)}</div>
                <div class="quest-objectives">
                    ${q.objectives.map((o, i) => `
                        <div class="quest-obj ${o.completed ? 'completed' : ''} ${canMutateQuest ? '' : 'readonly'}"
                             data-mutable="${canMutateQuest ? 'true' : 'false'}"
                             aria-disabled="${canMutateQuest ? 'false' : 'true'}"
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

    _canMutateGameplay(scene) {
        if (!scene) return false;
        if (typeof WorldEngine !== 'undefined' && WorldEngine.isScenePlaying) {
            return WorldEngine.isScenePlaying(scene);
        }
        return !scene.gameState || scene.gameState === 'playing';
    },

    _toggleObjective(questId, objIdx) {
        const scene = State.scene;
        if (!scene) return;
        if (!this._canMutateGameplay(scene)) {
            const message = typeof WorldEngine !== 'undefined' && WorldEngine.endedSceneMessage
                ? WorldEngine.endedSceneMessage(scene)
                : '当前冒险已经结束，不能继续改变任务状态。';
            if (typeof showToast !== 'undefined') showToast(message);
            return;
        }
        const quest = scene.quests.find(q => q.id === questId);
        if (!quest) return;
        const objective = quest.objectives[objIdx];
        if (!objective) return;
        const nextCompleted = !objective.completed;
        if (nextCompleted && typeof WorldEngine !== 'undefined' && WorldEngine.completeQuestObjective) {
            const result = WorldEngine.completeQuestObjective(scene, quest, objIdx, {
                gateOptions: { manualToggle: true }
            });
            if (!result.ok) {
                if (typeof showToast !== 'undefined') showToast(result.blocked ? '任务目标还缺少规则依据' : (result.message || '任务目标未更新'));
                return;
            }
            if (result.questCompleted && typeof showToast !== 'undefined') showToast(`任务完成：${quest.name}`);
            State.saveCurrentScene().catch(e => console.warn('任务状态保存失败:', e));
            this.render();
            if (typeof WorldEngine !== 'undefined' && WorldEngine.checkVictory) WorldEngine.checkVictory(scene);
            return;
        }
        if (!nextCompleted && typeof WorldEngine !== 'undefined' && WorldEngine.reopenQuestObjective) {
            const result = WorldEngine.reopenQuestObjective(scene, quest, objIdx, {
                reason: '手动取消'
            });
            if (!result.ok) {
                if (typeof showToast !== 'undefined') showToast(result.message || '任务目标未更新');
                return;
            }
        } else {
            console.warn('[QuestTracker] 任务目标更新需要 WorldEngine.completeQuestObjective/reopenQuestObjective');
            if (typeof showToast !== 'undefined') showToast('任务系统不可用。');
            return;
        }

        State.saveCurrentScene().catch(e => console.warn('任务状态保存失败:', e));
        this.render();
        // 检查胜利条件（主线全完成）
        if (typeof WorldEngine !== 'undefined' && WorldEngine.checkVictory) WorldEngine.checkVictory(scene);
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
        if (typeof WorldEngine === 'undefined' || !WorldEngine.addQuest) {
            console.warn('[QuestTracker] WorldEngine.addQuest 不可用，跳过新增任务');
            return;
        }
        const result = WorldEngine.addQuest(scene, questData);
        if (!result.ok) {
            if (!result.duplicate && typeof showToast !== 'undefined') showToast(result.message || '新任务未加入。');
            return;
        }
        State.saveCurrentScene().catch(e => console.warn('新增任务保存失败:', e));
        this.render();
        if (typeof showToast !== 'undefined') showToast(`新任务：${result.quest.name}`);
        if (typeof SidebarRight !== 'undefined') SidebarRight.markTabNew?.('quests');
    },

    /** AI 标记任务目标完成 */
    updateObjective(questName, objIdx) {
        const scene = State.scene;
        if (!scene) return;
        if (typeof WorldEngine === 'undefined' || !WorldEngine.applyQuestUpdates) {
            console.warn('[QuestTracker] WorldEngine.applyQuestUpdates 不可用，跳过任务目标更新');
            return;
        }
        const objectiveNumber = parseInt(objIdx, 10) || 1;
        const result = WorldEngine.applyQuestUpdates(scene, [{
            questName,
            objectiveNumber,
            reason: '剧情标记'
        }], {
            explicitMarker: true,
            stateUpdate: false
        });
        if (!result.changed) {
            const blocked = result.blocked || (result.results || []).some(item => item.blocked);
            if (blocked && typeof showToast !== 'undefined') {
                showToast(result.message || '任务目标还缺少规则依据');
            }
            return;
        }
        const completedResult = (result.results || []).find(item => item.ok && item.questCompleted);
        if (completedResult && typeof showToast !== 'undefined') {
            const quest = scene.quests.find(q => q.id === completedResult.questId);
            if (quest) showToast(`任务完成：${quest.name}`);
        }
        State.saveCurrentScene().catch(e => console.warn('任务目标保存失败:', e));
        this.render();
        if (typeof WorldEngine !== 'undefined' && WorldEngine.checkVictory) WorldEngine.checkVictory(scene);
    }
};
