/**
 * 地图面板：节点式地点展示 + 移动
 */
const MapView = {
    init() {
        this.el = document.getElementById('tabMap');
        if (!this.el) return;
        State.on('sceneChanged', () => this.render());
    },

    render() {
        if (!this.el) return;
        const scene = State.scene;
        const locs = scene ? scene.locations : [];
        if (!locs || locs.length === 0) {
            this.el.innerHTML = '<p class="placeholder">当前世界暂无地图</p>';
            return;
        }

        const curId = scene.currentLocation;
        const curLoc = locs.find(l => l.id === curId);
        const canMoveMap = this._canMutateGameplay(scene);

        // 没有当前地点时显示空地图
        if (!curLoc) {
            this.el.innerHTML = `
                <div class="map-header">
                    <span class="map-title">地图</span>
                    <span class="map-subtitle">尚未设置当前地点</span>
                </div>
                <div class="map-grid"></div>
            `;
            return;
        }

        // 构建邻接表用于简单拓扑排序
        const visited = new Set();
        const rows = [];
        const queue = [{ id: curId, depth: 0 }];
        while (queue.length > 0) {
            const { id, depth } = queue.shift();
            if (visited.has(id)) continue;
            visited.add(id);
            if (!rows[depth]) rows[depth] = [];
            const loc = locs.find(l => l.id === id);
            if (!loc) continue;
            rows[depth].push(loc);
            (loc.connections || []).forEach(cid => {
                if (!visited.has(cid)) queue.push({ id: cid, depth: depth + 1 });
            });
        }

        const nodesHtml = rows.map((row, depth) => {
            const rowHtml = row.map(loc => {
                const isCurrent = loc.id === curId;
                const cls = `map-node${isCurrent ? ' current' : ''}${canMoveMap ? '' : ' readonly'}`;
                const moveAttr = canMoveMap
                    ? `data-move-to="${Renderer.escapeAttr(loc.id)}"`
                    : 'aria-disabled="true"';
                return `<div class="${cls}" data-loc="${Renderer.escapeAttr(loc.id)}"
                    title="${Renderer.escapeAttr(loc.description || '')}"
                    ${moveAttr}>
                    <div class="map-node-icon">${isCurrent ? '📍' : '⬤'}</div>
                    <div class="map-node-name">${Renderer.escapeHtml(loc.name)}</div>
                </div>`;
            }).join('<div class="map-connector">─</div>');
            return `<div class="map-row">${rowHtml}</div>`;
        }).join('<div class="map-spacer"></div>');
        const subtitle = [curLoc ? curLoc.description : '', canMoveMap ? '' : '冒险已结束，地图仅供回顾']
            .filter(Boolean)
            .join(' · ');

        this.el.innerHTML = `
            <div class="map-header">
                <span class="map-title">${Renderer.escapeHtml(curLoc ? curLoc.name : '地图')}</span>
                <span class="map-subtitle">${Renderer.escapeHtml(subtitle)}</span>
            </div>
            <div class="map-grid">${nodesHtml}</div>
        `;

        this.el.querySelectorAll('[data-move-to]').forEach(node => {
            node.onclick = () => this.moveTo(node.dataset.moveTo);
        });
    },

    _moving: false,

    async moveTo(locId) {
        if (this._moving || State.isStreaming) return;
        const scene = State.scene;
        if (!scene) return;
        if (!this._canMutateGameplay(scene)) {
            const message = this._endedSceneMessage(scene);
            if (typeof showToast !== 'undefined') showToast(message);
            return;
        }
        if (typeof WorldEngine === 'undefined' || !WorldEngine.moveToLocation) {
            console.warn('[MapView] WorldEngine.moveToLocation 不可用，跳过移动');
            if (typeof showToast !== 'undefined') showToast('移动系统不可用。');
            return;
        }

        this._moving = true;
        try {
            const result = WorldEngine.moveToLocation(scene, locId);
            if (!result.ok) {
                if (!result.duplicate) showToast(result.message || '无法移动到该地点。');
                return;
            }
            const loc = result.loc;
            await State.saveCurrentScene();

            this.render();
            if (typeof QuestTracker !== 'undefined') QuestTracker.render?.();
            if (typeof SidebarRight !== 'undefined') SidebarRight.renderMap?.();
            showToast(`已到达 ${loc.name}`);

            // 触发 AI 描述新地点
            try {
                await GroupChat.handleLocationMove(loc);
            } catch (e) {
                console.warn('地点叙事失败:', e);
            }

            // 教学钩子：地图移动完成（step4）
            if (TutorialWorld.isCurrentScene()) {
                Tutorial.afterLocationMove().catch(e => console.warn('[Tutorial] afterLocationMove 失败:', e));
            }
        } finally {
            this._moving = false;
        }
    },

    _canMutateGameplay(scene) {
        if (!scene) return false;
        if (typeof WorldEngine !== 'undefined' && WorldEngine.isScenePlaying) {
            return WorldEngine.isScenePlaying(scene);
        }
        return !scene.gameState || scene.gameState === 'playing';
    },

    _endedSceneMessage(scene) {
        if (typeof WorldEngine !== 'undefined' && WorldEngine.endedSceneMessage) {
            return WorldEngine.endedSceneMessage(scene);
        }
        return '当前冒险已经结束，地图仅供回顾。';
    }
};
