/**
 * 场景 / 存档点管理
 */
const SceneManager = {
    init() {
        document.getElementById('snapshotBtn').onclick = async () => {
            try { await this.saveSnapshot(); }
            catch (e) { console.error('保存存档失败:', e); showToast('存档失败，请重试'); }
        };
        document.getElementById('loadSnapshotBtn').onclick = async () => {
            try { await this.showSnapshots(); }
            catch (e) { console.error('读取存档列表失败:', e); showToast('读档失败，请重试'); }
        };
    },

    async saveSnapshot() {
        const scene = State.scene;
        if (!scene) { showToast('没有可存档的场景'); return; }

        const defaultName = scene.name + ' - ' + new Date().toLocaleString();

        // 小型输入弹窗替代 prompt()
        const modal = document.createElement('div');
        modal.className = 'modal-overlay show';
        modal.id = 'snapshotModal';
        modal.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h3>存档</h3>
                    <button class="icon-btn close-btn" id="closeSnapshotModal">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>存档名称</label>
                        <input type="text" id="snapshotNameInput" value="${Renderer.escapeAttr(defaultName)}">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="cancelSnapshot">取消</button>
                    <button class="btn btn-primary" id="confirmSnapshot">保存</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

        return new Promise((resolve) => {
            const input = modal.querySelector('#snapshotNameInput');
            const confirmBtn = modal.querySelector('#confirmSnapshot');
            const cancelBtn = modal.querySelector('#cancelSnapshot');
            const closeBtn = modal.querySelector('#closeSnapshotModal');

            const cleanup = () => { modal.remove(); resolve(); };

            closeBtn.onclick = cleanup;
            cancelBtn.onclick = cleanup;

            confirmBtn.onclick = async () => {
                const name = input.value.trim();
                if (!name) { showToast('请输入存档名称'); return; }
                modal.remove();

                // 存完整游戏状态（排除 snapshots 自身避免嵌套，保留 id/时间戳不变）
                const snapshot = {
                    id: 'snap_' + Date.now(),
                    name,
                    createdAt: Date.now(),
                    state: {
                        messages: JSON.parse(JSON.stringify(scene.messages)),
                        characters: JSON.parse(JSON.stringify(scene.characters || [])),
                        lorebookEntries: JSON.parse(JSON.stringify(scene.lorebookEntries || [])),
                        inventory: JSON.parse(JSON.stringify(scene.inventory || [])),
                        equipment: JSON.parse(JSON.stringify(scene.equipment || {})),
                        quests: JSON.parse(JSON.stringify(scene.quests || [])),
                        locations: JSON.parse(JSON.stringify(scene.locations || [])),
                        currentLocation: scene.currentLocation || '',
                        playerStats: JSON.parse(JSON.stringify(scene.playerStats || {})),
                        playerPersona: JSON.parse(JSON.stringify(scene.playerPersona || null)),
                        playerHp: scene.playerHp,
                        playerMaxHp: scene.playerMaxHp,
                        gold: scene.gold || 0,
                        exp: scene.exp || 0,
                        level: scene.level || 1,
                        attrPoints: scene.attrPoints || 0,
                        strategies: JSON.parse(JSON.stringify(scene.strategies || [])),
                        intel: JSON.parse(JSON.stringify(scene.intel || [])),
                        knowledge: JSON.parse(JSON.stringify(scene.knowledge || {})),
                        discoveries: JSON.parse(JSON.stringify(scene.discoveries || {})),
                        factions: JSON.parse(JSON.stringify(scene.factions || [])),
                        conflictSeeds: JSON.parse(JSON.stringify(scene.conflictSeeds || [])),
                        storyArcs: JSON.parse(JSON.stringify(scene.storyArcs || [])),
                        clocks: JSON.parse(JSON.stringify(scene.clocks || [])),
                        counterStrategies: JSON.parse(JSON.stringify(scene.counterStrategies || [])),
                        currentSituation: JSON.parse(JSON.stringify(scene.currentSituation || {})),
                        worldTension: scene.worldTension || 0,
                        turnCount: scene.turnCount || 0,
                        activeStrategyId: scene.activeStrategyId,
                        pendingAction: JSON.parse(JSON.stringify(scene.pendingAction || null)),
                        pendingCheck: JSON.parse(JSON.stringify(scene.pendingCheck || null)),
                        gameState: scene.gameState || 'playing',
                        summary: scene.summary || ''
                    }
                };

                if (!scene.snapshots) scene.snapshots = [];
                scene.snapshots.push(snapshot);
                await State.saveCurrentScene();
                showToast('已存档: ' + name);
                resolve();
            };

            input.focus();
            input.select();
            input.addEventListener('keydown', e => { if (e.key === 'Enter') confirmBtn.click(); });
        });
    },

    showSnapshots() {
        const scene = State.scene;
        if (!scene || !scene.snapshots || scene.snapshots.length === 0) {
            showToast('暂无存档');
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'modal-overlay show';
        modal.id = 'snapshotListModal';
        modal.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h3>读档</h3>
                    <button class="icon-btn close-btn" id="closeSnapshotListModal">${Icons.get('close')}</button>
                </div>
                <div class="modal-body">
                    <div class="snapshot-list">
                        ${scene.snapshots.map((s, i) => `
                            <div class="snapshot-item" data-snap-idx="${i}">
                                <div class="snapshot-info">
                                    <span class="snapshot-name">${Renderer.escapeHtml(s.name)}</span>
                                    <span class="snapshot-time">${new Date(s.createdAt).toLocaleString()}</span>
                                </div>
                                <div class="snapshot-actions">
                                    <button class="btn btn-primary snap-load-btn" data-idx="${i}">读取</button>
                                    <button class="icon-btn snap-delete-btn" data-idx="${i}" title="删除">${Icons.get('trash', { size: 16 })}</button>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });
        document.getElementById('closeSnapshotListModal').onclick = () => modal.remove();

        modal.querySelectorAll('.snap-load-btn').forEach(btn => {
            btn.onclick = () => this.loadSnapshot(parseInt(btn.dataset.idx));
        });
        modal.querySelectorAll('.snap-delete-btn').forEach(btn => {
            btn.onclick = (e) => {
                e.stopPropagation();
                this.deleteSnapshot(parseInt(btn.dataset.idx));
                modal.remove();
                this.showSnapshots();
            };
        });
    },

    async loadSnapshot(index) {
        const scene = State.scene;
        if (!scene || !scene.snapshots[index]) return;
        if (!confirm('读档将覆盖当前进度，确定吗？')) return;

        const snap = scene.snapshots[index];
        // 兼容旧快照（无 state 字段）和新快照（完整状态）
        const s = snap.state || {
            messages: snap.messages, characters: snap.characters, lorebookEntries: snap.lorebookEntries
        };
        if (s.messages) scene.messages = JSON.parse(JSON.stringify(s.messages));
        if (s.characters) scene.characters = JSON.parse(JSON.stringify(s.characters));
        if (s.lorebookEntries) scene.lorebookEntries = JSON.parse(JSON.stringify(s.lorebookEntries));
        // 完整字段恢复（新快照）
        ['inventory', 'equipment', 'quests', 'locations', 'playerStats', 'playerPersona',
         'strategies', 'intel', 'knowledge', 'discoveries', 'factions', 'conflictSeeds', 'storyArcs', 'clocks',
         'counterStrategies', 'currentSituation', 'pendingAction', 'pendingCheck', 'summary'].forEach(f => {
            if (s[f] !== undefined) scene[f] = JSON.parse(JSON.stringify(s[f]));
        });
        ['currentLocation', 'playerHp', 'playerMaxHp', 'gold', 'exp', 'level',
         'attrPoints', 'worldTension', 'turnCount', 'activeStrategyId', 'gameState'].forEach(f => {
            if (s[f] !== undefined) scene[f] = s[f];
        });

        State.normalizeScene(scene);
        await State.saveCurrentScene();
        ChatUI.render();
        SidebarLeft.render();
        SidebarRight.renderDetail();
        SidebarRight.renderSituation();
        SidebarRight.renderQuests();
        SidebarRight.renderInventory();
        SidebarRight.renderStrategies();
        ActionBar.renderStatsDisplay();
        showToast('已读档: ' + snap.name);

        document.querySelectorAll('.modal-overlay').forEach(m => {
            if (m.querySelector('.snapshot-list')) m.remove();
        });
    },

    async deleteSnapshot(index) {
        const scene = State.scene;
        if (!scene || !scene.snapshots[index]) return;
        if (!confirm('删除此存档？此操作不可撤销。')) return;
        scene.snapshots.splice(index, 1);
        await State.saveCurrentScene();
        showToast('已删除存档');
    }
};
