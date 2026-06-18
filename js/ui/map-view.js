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
                const cls = isCurrent ? 'map-node current' : 'map-node';
                return `<div class="${cls}" data-loc="${Renderer.escapeAttr(loc.id)}"
                    title="${Renderer.escapeAttr(loc.description || '')}"
                    data-move-to="${Renderer.escapeAttr(loc.id)}">
                    <div class="map-node-icon">${isCurrent ? '📍' : '⬤'}</div>
                    <div class="map-node-name">${Renderer.escapeHtml(loc.name)}</div>
                </div>`;
            }).join('<div class="map-connector">─</div>');
            return `<div class="map-row">${rowHtml}</div>`;
        }).join('<div class="map-spacer"></div>');

        this.el.innerHTML = `
            <div class="map-header">
                <span class="map-title">${Renderer.escapeHtml(curLoc ? curLoc.name : '地图')}</span>
                <span class="map-subtitle">${Renderer.escapeHtml(curLoc ? curLoc.description : '')}</span>
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
        const loc = scene.locations.find(l => l.id === locId);
        if (!loc) return;

        // 已在目标地点，无需移动
        if (scene.currentLocation === locId) return;

        // 检查是否可到达（当前地点的连接点或直接点击）
        const curLoc = scene.locations.find(l => l.id === scene.currentLocation);
        const reachable = !curLoc || curLoc.connections.includes(locId);
        if (!reachable) {
            showToast(`无法直接到达 ${loc.name}`);
            return;
        }

        this._moving = true;
        try {
            // 更新当前地点
            scene.currentLocation = locId;
            await State.saveCurrentScene();

            // 插入移动消息
            const msg = {
                id: 'msg_' + Date.now(),
                role: 'user',
                content: `【移动到 ${loc.name} — ${loc.description}】`,
                type: 'action',
                timestamp: Date.now()
            };
            scene.messages.push(msg);
            ChatUI.onMessageAdded(msg);

            this.render();
            QuestTracker.render();
            SidebarRight.renderMap();
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
    }
};
