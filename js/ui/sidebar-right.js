/**
 * 右侧边栏（世界书 + 角色详情 + 计策）
 */
const SidebarRight = {
    _tabBadges: {},  // { tabName: count } 未读角标计数

    init() {
        this.el = document.getElementById('rightSidebar');
        this.toggleBtn = document.getElementById('toggleRightSidebar');
        this.tabBtns = this.el.querySelectorAll('.tab-btn');
        this.tabContents = {
            strategies: document.getElementById('tabStrategies'),
            lorebook: document.getElementById('tabLorebook'),
            map: document.getElementById('tabMap'),
            quests: document.getElementById('tabQuests'),
            inventory: document.getElementById('tabInventory'),
            detail: document.getElementById('tabDetail')
        };
        this.loreListEl = document.getElementById('lorebookList');
        this.detailEl = document.getElementById('characterDetail');
        this.detailPlaceholder = this.tabContents.detail.querySelector('.detail-placeholder');
        this.strategiesEl = document.getElementById('strategiesList');

        this.toggleBtn.onclick = () => this.toggle();
        this.tabBtns.forEach(btn => {
            btn.onclick = () => this.switchTab(btn.dataset.tab);
        });
        document.getElementById('addLoreEntryBtn').onclick = () => Lorebook.openEditor();
        document.getElementById('aiBatchLoreBtn').onclick = () => Lorebook.generateBatch();

        State.on('characterSelected', () => this.renderDetail());
        State.on('sceneChanged', () => {
            this.renderStrategies();
            this.renderLorebook();
            this.renderMap();
            this.renderQuests();
            this.renderInventory();
        });

        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 600 && this.el.classList.contains('open')) {
                if (!this.el.contains(e.target) && e.target !== this.toggleBtn) {
                    this.el.classList.remove('open');
                    this._syncBackdrop();
                }
            }
        });
    },

    _syncBackdrop() {
        const backdrop = document.getElementById('sidebarBackdrop');
        if (!backdrop) return;
        const open = (this.el.classList.contains('open') || document.getElementById('leftSidebar')?.classList.contains('open'));
        backdrop.classList.toggle('show', open);
    },

    toggle() {
        this.el.classList.toggle('open');
        this._syncBackdrop();
    },

    switchTab(tab) {
        this.tabBtns.forEach(b => b.classList.toggle('active', b.dataset.tab === tab));
        Object.values(this.tabContents).forEach(c => c.classList.add('hidden'));
        if (this.tabContents[tab]) this.tabContents[tab].classList.remove('hidden');
        if (tab === 'map') MapView.render();
        if (tab === 'quests') QuestTracker.render();
        if (tab === 'inventory') this.renderInventory();
        if (tab === 'strategies') this.renderStrategies();
        // 玩家查看该 tab，清除角标
        this.clearTabBadge(tab);
    },

    /** 标记某 tab 有新内容（AI 驱动/被动获得时调用） */
    markTabNew(tab, n = 1) {
        // 当前正在看的 tab 不标记
        const activeBtn = this.el.querySelector('.tab-btn.active');
        if (activeBtn && activeBtn.dataset.tab === tab) return;
        this._tabBadges[tab] = (this._tabBadges[tab] || 0) + n;
        this._renderBadges();
    },

    /** 清除某 tab 的角标 */
    clearTabBadge(tab) {
        if (this._tabBadges[tab]) {
            delete this._tabBadges[tab];
            this._renderBadges();
        }
    },

    /** 渲染所有 tab 的角标 DOM */
    _renderBadges() {
        this.tabBtns.forEach(btn => {
            const tab = btn.dataset.tab;
            const count = this._tabBadges[tab] || 0;
            let badge = btn.querySelector('.tab-badge');
            if (count > 0) {
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'tab-badge';
                    btn.appendChild(badge);
                }
                badge.textContent = count > 9 ? '9+' : count;
            } else if (badge) {
                badge.remove();
            }
        });
    },

    renderMap() { MapView.render(); },
    renderQuests() { QuestTracker.render(); },

    renderLorebook() {
        const scene = State.scene;
        const entries = scene ? scene.lorebookEntries : [];
        if (entries.length === 0) {
            this.loreListEl.innerHTML = '<p class="placeholder">暂无世界书条目<br>点击 + 添加</p>';
            return;
        }
        this.loreListEl.innerHTML = '';
        entries.forEach((entry, idx) => {
            const div = document.createElement('div');
            div.className = 'lore-entry';
            const keysHtml = (entry.keys || []).map(k => `<span class="lore-key">${Renderer.escapeHtml(k)}</span>`).join('');
            div.innerHTML = `
                <div class="lore-entry-header">
                    <div class="lore-entry-keys">${keysHtml}</div>
                    <button class="icon-btn lore-delete-btn" data-lore-idx="${idx}" style="font-size:12px;">🗑</button>
                </div>
                <div class="lore-entry-content">${Renderer.escapeHtml(entry.content)}</div>
            `;
            div.querySelector('.lore-delete-btn').onclick = (e) => { e.stopPropagation(); Lorebook.deleteEntry(idx); };
            div.onclick = () => Lorebook.openEditor(idx);
            this.loreListEl.appendChild(div);
        });
    },

    renderInventory() {
        const scene = State.scene;
        const inventory = scene ? scene.inventory || [] : [];
        const equipment = scene ? scene.equipment || {} : {};
        const eqEl = document.getElementById('equipmentDisplay');
        const listEl = document.getElementById('inventoryList');
        if (!eqEl || !listEl) return;

        const slotLabels = { weapon: '⚔ 武器', armor: '🛡 防具', accessory: '💍 饰品' };
        eqEl.innerHTML = Object.entries(slotLabels).map(([slot, label]) => {
            const itemName = equipment[slot];
            const item = itemName ? inventory.find(i => i.name === itemName) : null;
            return `<div class="eq-slot ${item ? 'occupied' : ''}">
                <div class="eq-slot-label">${label}</div>
                <div class="eq-slot-item">${item ? Renderer.escapeHtml(item.name) : '空'}</div>
                ${item ? `<button class="text-btn inv-unequip-btn" data-item-name="${Renderer.escapeAttr(item.name)}" style="font-size:10px;">卸下</button>` : ''}
            </div>`;
        }).join('');

        if (inventory.length === 0) {
            listEl.innerHTML = '<p class="placeholder">暂无物品</p>';
        } else {
            listEl.innerHTML = inventory.map(item => {
                const typeIcons = { weapon: '⚔', armor: '🛡', consumable: '🧪', quest: '📜', misc: '📦' };
                const icon = typeIcons[item.type] || '📦';
                return `<div class="inventory-item ${item.equipped ? 'equipped' : ''}">
                    <span class="inv-icon">${icon}</span>
                    <div class="inv-info">
                        <span class="inv-name">${Renderer.escapeHtml(item.name)}</span>
                        <span class="inv-desc">${Renderer.escapeHtml(item.description || '')}</span>
                    </div>
                    <span class="inv-qty">${item.quantity > 1 ? 'x' + item.quantity : ''}</span>
                    ${item.equipped
                        ? `<button class="text-btn inv-unequip-btn" data-item-name="${Renderer.escapeAttr(item.name)}" style="font-size:10px;">卸下</button>`
                        : `<button class="text-btn inv-equip-btn" data-item-name="${Renderer.escapeAttr(item.name)}" style="font-size:10px;">装备</button>`}
                </div>`;
            }).join('');
        }

        // 绑定按钮事件（避免动态 onclick 属性带来的注入风险）
        eqEl.querySelectorAll('.inv-unequip-btn').forEach(btn => {
            btn.onclick = () => this._unequipItem(btn.dataset.itemName);
        });
        listEl.querySelectorAll('.inv-equip-btn').forEach(btn => {
            btn.onclick = () => this._equipItem(btn.dataset.itemName);
        });
        listEl.querySelectorAll('.inv-unequip-btn').forEach(btn => {
            btn.onclick = () => this._unequipItem(btn.dataset.itemName);
        });
    },

    _equipItem(name) {
        const scene = State.scene;
        if (!scene) return;
        const item = scene.inventory.find(i => i.name === name);
        if (!item) return;
        const slotMap = { weapon: 'weapon', armor: 'armor' };
        const slot = slotMap[item.type] || 'accessory';
        const currentEquipped = scene.inventory.find(i => i.equipped && i !== item &&
            ((slot === 'accessory') || (slotMap[i.type] || 'accessory') === slot));
        if (currentEquipped) {
            currentEquipped.equipped = false;
            if (scene.equipment[slot] === currentEquipped.name) scene.equipment[slot] = null;
        }
        item.equipped = true;
        scene.equipment[slot] = item.name;
        State.saveCurrentSceneDebounced();
        this.renderInventory();
    },

    _unequipItem(name) {
        const scene = State.scene;
        if (!scene) return;
        const item = scene.inventory.find(i => i.name === name);
        if (!item) return;
        item.equipped = false;
        const slotMap = { weapon: 'weapon', armor: 'armor' };
        const slot = slotMap[item.type] || 'accessory';
        if (scene.equipment[slot] === item.name) scene.equipment[slot] = null;
        State.saveCurrentSceneDebounced();
        this.renderInventory();
    },

    _renderPlayerSheet() {
        const scene = State.scene;
        const persona = scene?.playerPersona;
        const st = scene?.playerStats;
        const equipment = scene?.equipment;
        const inventory = scene?.inventory || [];

        if (!persona) {
            this.detailEl.innerHTML = '<div class="detail-placeholder"><p>尚未创建玩家角色</p></div>';
            return;
        }

        const safeAvatar = Renderer.safeUrl(persona.avatar);
        const avatarHtml = safeAvatar
            ? `<img class="detail-avatar" src="${Renderer.escapeAttr(safeAvatar)}" alt="${Renderer.escapeAttr(persona.name)}" style="border-color:var(--blue);">`
            : `<div class="detail-avatar" style="background:var(--blue);display:flex;align-items:center;justify-content:center;color:#fff;font-size:36px;font-weight:bold;margin:0 auto 12px;">${Renderer.escapeHtml(persona.name[0])}</div>`;

        const m = v => v >= 10 ? `+${Math.floor((v-10)/2)}` : `${Math.floor((v-10)/2)}`;
        const statDefs = [
            { key: 'strength', icon: 'str', label: '力量' },
            { key: 'dexterity', icon: 'dex', label: '敏捷' },
            { key: 'constitution', icon: 'con', label: '体质' },
            { key: 'intelligence', icon: 'int', label: '智力' },
            { key: 'wisdom', icon: 'wis', label: '感知' },
            { key: 'charisma', icon: 'cha', label: '魅力' }
        ];
        const attrPts = scene?.attrPoints || 0;
        const statsHtml = st ? statDefs.map(d =>
            `<span class="detail-stat-row">${Icons.get(d.icon, { size: 13 })}<span>${Renderer.escapeHtml(d.label)} ${st[d.key]}(${m(st[d.key])})</span>${attrPts > 0 ? `<button class="stat-plus-btn" data-stat="${d.key}" title="分配 1 点">+</button>` : ''}</span>`
        ).join('') : '';
        const attrPtsHtml = attrPts > 0 ? `<div class="attr-pts-hint">可分配属性点：${attrPts}</div>` : '';

        const eqSlots = equipment ? [
            `⚔ ${Renderer.escapeHtml(equipment.weapon || '无')}`,
            `🛡 ${Renderer.escapeHtml(equipment.armor || '无')}`,
            `💍 ${Renderer.escapeHtml(equipment.accessory || '无')}`
        ] : [];

        this.detailEl.innerHTML = `
            ${avatarHtml}
            <div class="detail-name" style="color:var(--blue);">${Renderer.escapeHtml(persona.name)}</div>
            ${persona.personality ? `<div class="detail-tags"><span class="detail-tag">${Renderer.escapeHtml(persona.personality)}</span></div>` : ''}
            ${statsHtml ? `<div class="detail-section"><h4>属性</h4>${attrPtsHtml}<div class="stat-display" style="grid-template-columns:1fr;">${statsHtml}</div></div>` : ''}
            ${eqSlots.length > 0 ? `<div class="detail-section"><h4>装备</h4><p style="font-size:12px;">${eqSlots.join(' · ')}</p></div>` : ''}
            ${inventory.length > 0 ? `<div class="detail-section"><h4>物品 (${inventory.length})</h4><p style="font-size:12px;">${inventory.map(i => `${Renderer.escapeHtml(i.name)}${i.equipped ? ' [已装备]' : ''}`).join('、')}</p></div>` : ''}
            ${persona.goal ? `<div class="detail-section"><h4>目标</h4><p>${Renderer.escapeHtml(persona.goal)}</p></div>` : ''}
            <div style="margin-top:16px;text-align:center;">
                <button class="btn btn-secondary" id="editPlayerBtn">编辑角色</button>
            </div>
        `;
        document.getElementById('editPlayerBtn').onclick = () => PlayerCreator.open();
        // 属性分配按钮
        this.detailEl.querySelectorAll('.stat-plus-btn').forEach(btn => {
            btn.onclick = () => this._allocStat(btn.dataset.stat);
        });
    },

    /** 分配 1 点属性 */
    _allocStat(key) {
        const scene = State.scene;
        if (!scene || !scene.playerStats || (scene.attrPoints || 0) <= 0) return;
        scene.playerStats[key] = (scene.playerStats[key] || 10) + 1;
        scene.attrPoints -= 1;
        // 体质影响最大 HP
        if (key === 'constitution') {
            const con = scene.playerStats.constitution;
            const level = scene.level || 1;
            const newMax = 10 + Math.floor((con - 10) / 2) * 4 + (level - 1) * 4;
            const diff = newMax - scene.playerMaxHp;
            scene.playerMaxHp = newMax;
            scene.playerHp = Math.min(scene.playerMaxHp, (scene.playerHp || 0) + Math.max(0, diff));
        }
        State.saveCurrentSceneDebounced();
        this.renderDetail();
        if (typeof ActionBar !== 'undefined' && ActionBar.renderVitaDisplay) ActionBar.renderVitaDisplay();
        showToast(`${({strength:'力量',dexterity:'敏捷',constitution:'体质',intelligence:'智力',wisdom:'感知',charisma:'魅力'})[key]} +1`);
    },

    renderDetail() {
        const char = State.character;
        if (!char) {
            this.detailEl.style.display = 'block';
            this._renderPlayerSheet();
            return;
        }
        this.detailPlaceholder.style.display = 'none';
        this.detailEl.style.display = 'block';

        const safeAvatar = Renderer.safeUrl(char.avatar);
        const avatarHtml = safeAvatar
            ? `<img class="detail-avatar" src="${Renderer.escapeAttr(safeAvatar)}" alt="${Renderer.escapeAttr(char.name)}">`
            : `<div class="detail-avatar" style="background:var(--gold-dim);display:flex;align-items:center;justify-content:center;color:#fff;font-size:36px;font-weight:bold;margin:0 auto 12px;">${Renderer.escapeHtml(char.name[0])}</div>`;

        const relation = char._relations?.[State.scene?.userName || '旅人'];
        const affection = relation ? relation.affection : 0;

        this.detailEl.innerHTML = `
            ${avatarHtml}
            <div class="detail-name">${Renderer.escapeHtml(char.name)}</div>
            <div class="detail-tags">
                ${char.tags?.map(t => `<span class="detail-tag">${Renderer.escapeHtml(t)}</span>`).join('') || ''}
                ${relation ? `<span class="detail-tag">好感:${affection}</span>` : ''}
                ${relation?.mood ? `<span class="detail-tag">${Renderer.escapeHtml(relation.mood)}</span>` : ''}
            </div>
            <details class="detail-spoiler">
                <summary>查看角色卡 <span class="spoiler-warn">(剧透)</span></summary>
                <div class="spoiler-content">
                    <div class="detail-section">
                        <h4>背景</h4>
                        <p>${Renderer.escapeHtml(char.description || '无')}</p>
                    </div>
                    <div class="detail-section">
                        <h4>性格</h4>
                        <p>${Renderer.escapeHtml(char.personality || '无')}</p>
                    </div>
                    ${char.creed ? `<div class="detail-section detail-creed">
                        <h4>⚖ 信条</h4>
                        <p class="creed-text">${Renderer.escapeHtml(char.creed)}</p>
                        ${char.values ? `<p class="creed-values"><span class="creed-label">价值排序：</span>${Renderer.escapeHtml(char.values)}</p>` : ''}
                        ${Array.isArray(char.redLines) && char.redLines.length > 0 ? `<div class="creed-redlines"><span class="creed-label">绝不：</span><ul>${char.redLines.map(r => `<li>${Renderer.escapeHtml(r)}</li>`).join('')}</ul></div>` : ''}
                    </div>` : ''}
                    <div class="detail-section">
                        <h4>场景</h4>
                        <p>${Renderer.escapeHtml(char.scenario || '无')}</p>
                    </div>
                </div>
            </details>
            <div style="margin-top:16px;text-align:center;">
                <button class="btn btn-secondary" id="editCharBtn">编辑角色</button>
            </div>
        `;
        document.getElementById('editCharBtn').onclick = () => CharacterEditor.open(char.id);
    },

    renderStrategies() {
        const scene = State.scene;
        if (!this.strategiesEl) return;
        if (!scene || !scene.strategies || scene.strategies.length === 0) {
            this.strategiesEl.innerHTML = '<p class="placeholder">暂无计策<br>在输入栏切换到“计策”模式提出目标</p>';
            return;
        }

        const active = scene.strategies.find(s => s.id === scene.activeStrategyId) || scene.strategies[0];
        const others = scene.strategies.filter(s => s.id !== active.id);

        const riskPct = Math.min(100, Math.max(0, active.risk || 0));
        const progressPct = Math.min(100, Math.max(0, active.progress || 0));
        const tension = scene.worldTension || 0;

        const statusLabels = {
            draft: '草稿', preparing: '筹备中', executing: '执行中', exposed: '已暴露',
            resolved: '已解决', failed: '失败'
        };
        const phaseLabels = {
            intel: '情报', setup: '准备', action: '行动', complication: '转折', resolution: '结局'
        };

        const participantsHtml = (active.participants || []).map(p => {
            const trust = p.trust || 0;
            const suspicion = p.suspicion || 0;
            return `<div class="st-participant">
                <span class="st-participant-name">${Renderer.escapeHtml(p.name)}</span>
                <span class="st-participant-role">${Renderer.escapeHtml(p.role || '参与者')}</span>
                <div class="st-mini-bars">
                    <span title="信任">信 ${trust}</span>
                    <span title="警觉">警 ${suspicion}</span>
                </div>
            </div>`;
        }).join('');

        const stepsHtml = (active.steps || []).map((step, i) => {
            const statusLabelsStep = { pending: '待办', active: '进行中', done: '完成', failed: '失败' };
            const cls = step.status || 'pending';
            return `<div class="st-step st-step-${cls}">
                <span class="st-step-idx">${i + 1}</span>
                <span class="st-step-text">${Renderer.escapeHtml(step.text)}</span>
                <span class="st-step-status">${statusLabelsStep[cls] || '待办'}</span>
            </div>`;
        }).join('');

        const cluesHtml = (active.clues || []).map(c => {
            const relLabel = { rumor: '传闻', confirmed: '确认', false: '虚假' };
            return `<div class="st-clue st-clue-${c.reliability || 'rumor'}">
                <span class="st-clue-badge">${relLabel[c.reliability] || '传闻'}</span>
                <span class="st-clue-text">${Renderer.escapeHtml(c.text)}</span>
            </div>`;
        }).join('');

        const othersHtml = others.length > 0
            ? `<div class="st-others"><h4>其他计策</h4>${others.map(s =>
                `<div class="st-other-item" data-st-id="${Renderer.escapeAttr(s.id)}">
                    <span class="st-other-title">${Renderer.escapeHtml(s.title)}</span>
                    <span class="st-other-status">${statusLabels[s.status] || s.status}</span>
                </div>`).join('')}</div>`
            : '';

        this.strategiesEl.innerHTML = `
            <div class="st-active-card">
                <div class="st-header">
                    <div class="st-title">${Renderer.escapeHtml(active.title)}</div>
                    <div class="st-badges">
                        <span class="st-badge st-status-${active.status}">${statusLabels[active.status] || active.status}</span>
                        <span class="st-badge">${phaseLabels[active.phase] || active.phase || '—'}</span>
                    </div>
                </div>
                <div class="st-goal"><strong>目标：</strong>${Renderer.escapeHtml(active.goal)}</div>
                <div class="st-bars">
                    <div class="st-bar-row"><span>风险</span><div class="st-bar"><div class="st-bar-fill st-risk" style="width:${riskPct}%"></div></div><span>${riskPct}%</span></div>
                    <div class="st-bar-row"><span>进度</span><div class="st-bar"><div class="st-bar-fill st-progress" style="width:${progressPct}%"></div></div><span>${progressPct}%</span></div>
                    <div class="st-bar-row"><span>世界紧张度</span><div class="st-bar"><div class="st-bar-fill st-tension" style="width:${Math.min(100, Math.max(0, tension))}%"></div></div><span>${tension}</span></div>
                </div>
                ${active.stakes ? `<div class="st-stakes"><strong>赌注：</strong>${Renderer.escapeHtml(active.stakes)}</div>` : ''}
                ${stepsHtml ? `<div class="st-section"><h4>步骤</h4><div class="st-steps">${stepsHtml}</div></div>` : ''}
                ${participantsHtml ? `<div class="st-section"><h4>参与 NPC</h4><div class="st-participants">${participantsHtml}</div></div>` : ''}
                ${cluesHtml ? `<div class="st-section"><h4>情报</h4><div class="st-clues">${cluesHtml}</div></div>` : ''}
                ${active.latestOutcome ? `<div class="st-section"><h4>最近结果</h4><div class="st-outcome">${Renderer.escapeHtml(active.latestOutcome)}</div></div>` : ''}
                <div class="st-actions">
                    <button class="btn btn-secondary" id="stAbandonBtn">放弃</button>
                    <button class="btn btn-primary" id="stReplanBtn">重新规划</button>
                </div>
            </div>
            ${othersHtml}
        `;

        const abandonBtn = document.getElementById('stAbandonBtn');
        if (abandonBtn) abandonBtn.onclick = () => StrategyManager.abandonStrategy(active.id);
        const replanBtn = document.getElementById('stReplanBtn');
        if (replanBtn) replanBtn.onclick = () => {
            const input = document.getElementById('chatInput');
            if (input) {
                State.inputMode = 'strategy';
                ChatUI._syncInputMode();
                input.value = `重新规划「${active.title}」：`;
                input.focus();
            }
        };

        this.strategiesEl.querySelectorAll('.st-other-item').forEach(el => {
            el.onclick = () => StrategyManager.setActiveStrategy(el.dataset.stId);
        });
    }
};
