/**
 * 左侧角色列表边栏（简化版）
 */
const SidebarLeft = {
    init() {
        this.el = document.getElementById('leftSidebar');
        this.listEl = document.getElementById('characterList');
        this.toggleBtn = document.getElementById('toggleLeftSidebar');

        this.toggleBtn.onclick = () => this.toggle();

        State.on('charactersChanged', () => this.render());
        State.on('sceneChanged', () => this.render());
        State.on('characterSelected', () => this.render());

        const backdrop = document.getElementById('sidebarBackdrop');
        backdrop.addEventListener('click', () => { this.el.classList.remove('open'); this._syncBackdrop(); });
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
        const open = (this.el.classList.contains('open') || document.getElementById('rightSidebar')?.classList.contains('open'));
        backdrop.classList.toggle('show', open);
    },

    toggle() {
        this.el.classList.toggle('open');
        this._syncBackdrop();
    },

    render() {
        const scene = State.scene;
        const activeIds = (scene?.characters) || [];
        const activeChars = activeIds.map(id => State.characters.find(c => c.id === id)).filter(Boolean);

        if (activeChars.length === 0) {
            this.listEl.innerHTML = '<div class="placeholder">当前场景没有角色</div>';
            return;
        }

        this.listEl.innerHTML = '';
        const allChars = State.characters.filter(c => {
            // 显示在场角色和曾经有过但已离开的角色
            const inScene = activeIds.includes(c.id);
            const wasInScene = scene && scene.messages.some(m => m.characterId === c.id);
            return inScene || wasInScene;
        });

        allChars.forEach(char => {
            const isSelected = State.currentCharacterId === char.id;
            const isStreaming = State.isStreaming;
            const hasLeft = !activeIds.includes(char.id);

            const div = document.createElement('div');
            div.className = 'character-item' + (isSelected ? ' active' : '') + (isStreaming ? ' streaming' : '') + (hasLeft ? ' left' : '');
            if (!hasLeft) {
                div.onclick = () => {
                    State.setCurrentCharacter(char.id);
                    SidebarRight.switchTab('detail');
                    if (window.innerWidth <= 900) this.el.classList.remove('open');
                    // 教学钩子：玩家主动切换角色（step1）
                    if (TutorialWorld.isCurrentScene()) {
                        Tutorial.afterCharacterSwitch().catch(e => console.warn('[Tutorial] afterCharacterSwitch 失败:', e));
                    }
                };
            }

            const emoji = char._emoji || '🧑';
            const safeAvatar = Renderer.safeUrl(char.avatar);
            const avatarHtml = safeAvatar
                ? `<img class="character-avatar" src="${Renderer.escapeAttr(safeAvatar)}" alt="${Renderer.escapeAttr(char.name)}">`
                : `<div class="character-avatar" style="background:var(--gold-dim);display:flex;align-items:center;justify-content:center;font-size:20px;">${Renderer.escapeHtml(emoji)}</div>`;

            const userName = scene?.userName || State.settings.userName || '旅人';
            const relation = char._relations?.[userName];
            const affection = relation?.affection ?? 0;
            const barWidth = Math.min(100, Math.max(0, (affection + 100) / 2)) + '%';
            const barClass = affection > 0 ? 'positive' : affection < 0 ? 'negative' : 'neutral';
            const relationHtml = `<div class="character-relation">
                <div class="relation-bar"><div class="relation-bar-fill ${barClass}" style="width:${barWidth}"></div></div>
                <span>${affection}</span>
            </div>`;

            div.innerHTML = `
                ${avatarHtml}
                <div class="character-info">
                    <div class="character-name">${Renderer.escapeHtml(char.name)}</div>
                    <div class="character-mood">${Renderer.escapeHtml(relation?.mood || '平静')}</div>
                    ${relationHtml}
                </div>
            `;

            // 右键编辑是作者/调试入口，普通玩家流程不暴露完整角色卡。
            if (typeof State.canShowDebugSpoilers === 'function' && State.canShowDebugSpoilers()) {
                div.oncontextmenu = (e) => {
                    e.preventDefault();
                    CharacterEditor.open(char.id);
                };
            }

            this.listEl.appendChild(div);
        });
    }
};
