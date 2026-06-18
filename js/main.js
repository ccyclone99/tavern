/**
 * 酒馆入口
 */

// 全局工具函数
function showToast(msg) {
    const el = document.getElementById('toast');
    el.textContent = msg;
    el.classList.add('show');
    setTimeout(() => el.classList.remove('show'), 2500);
}

function escapeHtml(text) {
    return Renderer.escapeHtml(text);
}

// 世界大厅 UI 控制器
const WorldPicker = {
    el: null,
    gridEl: null,
    savedGridEl: null,
    genInput: null,
    genBtn: null,

    init() {
        this.el = document.getElementById('worldPicker');
        this.gridEl = document.getElementById('worldGrid');
        this.savedGridEl = document.getElementById('savedWorldGrid');
        this.genInput = document.getElementById('worldGenInput');
        this.genBtn = document.getElementById('worldGenBtn');

        this.renderPresets();
        this.renderSaved();

        this.genBtn.onclick = () => this.onGenerate();
        this.genInput.addEventListener('keydown', e => {
            if (e.key === 'Enter') this.onGenerate();
        });

        // 设置弹窗（世界大厅内也能设置API Key）
        const settingsBtn = document.createElement('button');
        settingsBtn.className = 'icon-btn';
        settingsBtn.style.cssText = 'position:absolute;top:16px;right:16px;width:36px;height:36px;font-size:18px;';
        settingsBtn.innerHTML = Icons.get('settings', { size: 20 });
        settingsBtn.onclick = () => {
            document.getElementById('settingsApiKey').value = State.settings.apiKey || '';
            document.getElementById('settingsModel').value = State.settings.model || 'deepseek-v4-flash';
            document.getElementById('settingsBgUrl').value = State.settings.backgroundUrl || '';
            document.getElementById('settingsModal').classList.add('show');
        };
        this.el.querySelector('.world-picker-header').appendChild(settingsBtn);
    },

    renderPresets() {
        this.gridEl.innerHTML = '';

        // 教学世界卡（第一张，可关闭）
        this._maybeRenderTutorialCard();

        WorldGenerator.templates.forEach(tmpl => {
            const card = document.createElement('div');
            card.className = 'world-card';
            const charsHtml = tmpl.characters.map(c =>
                `<span class="world-card-char">${Renderer.escapeHtml(c.avatar)} ${Renderer.escapeHtml(c.name)}</span>`
            ).join('');
            card.innerHTML = `
                <div class="world-card-cover">${Renderer.escapeHtml(tmpl.cover)}</div>
                <div class="world-card-name">${Renderer.escapeHtml(tmpl.name)}</div>
                <div class="world-card-desc">${Renderer.escapeHtml(tmpl.description)}</div>
                <div class="world-card-chars">
                    ${charsHtml}
                </div>
            `;
            card.onclick = () => this.onSelectPreset(tmpl);
            this.gridEl.appendChild(card);
        });
    },

    renderSaved() {
        const scenes = State.scenes;
        if (scenes.length === 0) {
            this.savedGridEl.innerHTML = '<p class="placeholder">暂无已有世界</p>';
            return;
        }
        this.savedGridEl.innerHTML = '';
        scenes.forEach(scene => {
            const card = document.createElement('div');
            card.className = 'world-card saved-world-card';
            const chars = scene.characters.map(id => State.characters.find(c => c.id === id)).filter(Boolean);
            const charTags = chars.map(c =>
                `<span class="world-card-char">${Renderer.escapeHtml(c._emoji || '🧑')} ${Renderer.escapeHtml(c.name)}</span>`
            ).join('');
            card.innerHTML = `
                <div class="world-card-cover">🌐</div>
                <div class="world-card-name">${Renderer.escapeHtml(scene.name)}</div>
                <div class="world-card-desc">${scene.messages.length} 条对话 · ${chars.length} 个角色</div>
                <div class="world-card-chars">${charTags}</div>
                <div class="world-card-actions">
                    <button class="btn btn-primary" style="padding:6px 14px;font-size:13px;">继续</button>
                    <button class="btn btn-secondary saved-world-delete" data-scene-id="${Renderer.escapeAttr(scene.id)}" style="padding:6px 14px;font-size:13px;">删除</button>
                </div>
            `;
            card.onclick = () => this.onContinueScene(scene.id);
            card.querySelector('.saved-world-delete').onclick = (e) => { e.stopPropagation(); this.onDeleteScene(scene.id); };
            this.savedGridEl.appendChild(card);
        });
    },

    show() {
        this.el.classList.remove('hidden');
        this.renderSaved();
        this.maybeRenderQuickstart();
    },

    hide() {
        this.el.classList.add('hidden');
    },

    async onSelectPreset(tmpl, isTutorial = false) {
        if (!State.settings.apiKey) {
            showToast('请先设置 API Key（点击右上角 ⚙️）');
            return;
        }
        showToast(isTutorial ? '正在准备新手酒馆...' : '正在初始化世界...');
        try {
            await WorldGenerator.applyTemplate(tmpl);
            if (isTutorial) Tutorial.start();
            this.hide();
            PlayerCreator.open();
        } catch (err) {
            showToast('初始化失败: ' + err.message);
            console.error(err);
        }
    },

    async onGenerate() {
        const prompt = this.genInput.value.trim();
        if (!prompt) { showToast('请输入世界描述'); return; }
        if (!State.settings.apiKey) {
            showToast('请先设置 API Key（点击右上角 ⚙️）');
            return;
        }

        this.genBtn.disabled = true;
        this.genBtn.textContent = '生成中...';

        try {
            showToast('AI 正在生成世界，请稍候...');
            const data = await WorldGenerator.generateByAI(prompt);
            await WorldGenerator.applyTemplate(data);
            this.genInput.value = '';
            this.hide();
            PlayerCreator.open();
        } catch (err) {
            showToast('生成失败: ' + err.message);
            console.error(err);
        } finally {
            this.genBtn.disabled = false;
            this.genBtn.textContent = '✨ AI 生成新世界';
        }
    },

    onContinueScene(sceneId) {
        State.setCurrentScene(sceneId);
        this.hide();
        ChatUI.render();
        SidebarLeft.render();
        SidebarRight.renderLorebook();
        SidebarRight.renderMap();
        SidebarRight.renderQuests();
        SidebarRight.renderInventory();
        SidebarRight.renderStrategies();
        SidebarRight.renderDetail();
        ActionBar.renderStatsDisplay();
        applyBackground();
    },

    async onDeleteScene(sceneId) {
        if (!confirm('确定要删除这个世界吗？所有对话记录将丢失。')) return;
        await Storage.deleteScene(sceneId);
        State.scenes = State.scenes.filter(s => s.id !== sceneId);
        if (State.currentSceneId === sceneId) {
            State.currentSceneId = State.scenes.length > 0 ? State.scenes[0].id : null;
        }
        this.renderSaved();
        showToast('已删除');
    },

    async returnToHall() {
        // 保存当前进度
        await State.saveCurrentScene();
        this.show();
        this.renderSaved();
    },

    // ===== 新手教程：教学世界卡 + 快速上手清单卡 =====

    /** 渲染教学世界卡（第一张，已完成则隐藏推荐角标） */
    _maybeRenderTutorialCard() {
        const tmpl = TutorialWorld.toTemplate();
        const card = document.createElement('div');
        card.className = 'world-card world-card-tutorial';
        if (TutorialState.load().completed) card.classList.add('completed');

        const charsHtml = tmpl.characters.map(c =>
            `<span class="world-card-char">${Renderer.escapeHtml(c.avatar)} ${Renderer.escapeHtml(c.name)}</span>`
        ).join('');

        const isDone = TutorialState.load().completed;
        const ribbon = isDone ? '' : '<span class="tutorial-ribbon">推荐新手</span>';

        card.innerHTML = `
            ${ribbon}
            <div class="world-card-cover">${Renderer.escapeHtml(tmpl.cover)}</div>
            <div class="world-card-name">${Renderer.escapeHtml(tmpl.name)}${isDone ? ' <span class="tutorial-done-tag">✓ 已完成</span>' : ''}</div>
            <div class="world-card-desc">${Renderer.escapeHtml(TutorialWorld.description)}</div>
            <div class="world-card-chars">${charsHtml}</div>
        `;
        card.onclick = () => this.onSelectPreset(tmpl, true);
        this.gridEl.appendChild(card);
    },

    /** 渲染"快速上手"清单卡（仅教程未完成且未跳过时显示） */
    maybeRenderQuickstart() {
        const existing = document.getElementById('quickstartCard');
        if (!TutorialState.isNeeded()) {
            if (existing) existing.remove();
            return;
        }
        if (existing) {
            this._refreshQuickstartState(existing);
            return;
        }

        const card = document.createElement('div');
        card.id = 'quickstartCard';
        card.className = 'quickstart-card';
        this._refreshQuickstartState(card);
        this.gridEl.parentNode.insertBefore(card, this.gridEl);
    },

    /** 刷新清单卡的勾选状态 */
    _refreshQuickstartState(card) {
        const hasKey = !!(State.settings.apiKey && State.settings.apiKey.trim());
        const hasWorld = State.scenes.length > 0;
        const step1Done = hasKey;
        const step2Done = hasWorld;

        card.innerHTML = `
            <div class="quickstart-header">
                <span class="quickstart-title">📖 快速上手</span>
                <button class="quickstart-dismiss" title="不再显示">×</button>
            </div>
            <p class="quickstart-subtitle">三步开启你的冒险</p>
            <div class="quickstart-steps">
                <div class="quickstart-step ${step1Done ? 'done' : ''}">
                    <span class="qs-check">${step1Done ? '✓' : '1'}</span>
                    <span class="qs-text">设置 API Key</span>
                    ${!step1Done ? '<button class="qs-go-btn">前往设置</button>' : ''}
                </div>
                <div class="quickstart-step ${step2Done ? 'done' : ''}">
                    <span class="qs-check">${step2Done ? '✓' : '2'}</span>
                    <span class="qs-text">选个世界（推荐<b>新手酒馆</b>）</span>
                </div>
                <div class="quickstart-step">
                    <span class="qs-check">3</span>
                    <span class="qs-text">创建角色</span>
                </div>
            </div>
        `;

        // 绑定按钮
        const goBtn = card.querySelector('.qs-go-btn');
        if (goBtn) {
            goBtn.onclick = (e) => {
                e.stopPropagation();
                document.getElementById('settingsApiKey').value = State.settings.apiKey || '';
                document.getElementById('settingsModel').value = State.settings.model || 'deepseek-v4-flash';
                document.getElementById('settingsBgUrl').value = State.settings.backgroundUrl || '';
                document.getElementById('settingsModal').classList.add('show');
            };
        }
        const dismissBtn = card.querySelector('.quickstart-dismiss');
        if (dismissBtn) {
            dismissBtn.onclick = (e) => {
                e.stopPropagation();
                TutorialState.skip();
                this.maybeRenderQuickstart();
                showToast('已隐藏。需要时可从教学世界重新学习');
            };
        }
    },

    /** 刷新清单卡状态（外部设置保存后调用） */
    refreshQuickstart() {
        this.maybeRenderQuickstart();
    }
};

// 初始化
(async function init() {
    // 1. 初始化存储
    await Storage.init();

    // 2. 加载设置
    await State.loadSettings();

    // 3. 加载角色和场景
    await State.loadCharacters();
    await State.loadScenes();

    // 3.5 挂载 SVG 图标 sprite（必须在任何 Icons.get 渲染前）
    Icons.mount();

    // 4. 初始化UI模块
    ChatUI.init();
    SidebarLeft.init();
    SidebarRight.init();
    ActionBar.init();
    QuestTracker.init();
    MapView.init();
    CharacterEditor.init();
    SceneManager.init();
    WorldPicker.init();

    // 5. 设置弹窗
    initSettingsModal();

    // 6. 判断显示世界大厅还是酒馆
    if (State.scenes.length === 0) {
        // 没有世界，显示大厅
        WorldPicker.show();
    } else {
        // 有世界，直接进入最近的一个
        State.scenes.sort((a, b) => (b.updatedAt || 0) - (a.updatedAt || 0));
        State.currentSceneId = State.scenes[0].id;
        WorldPicker.hide();
        ChatUI.render();
        SidebarLeft.render();
        SidebarRight.renderLorebook();
        SidebarRight.renderMap();
        SidebarRight.renderQuests();
        SidebarRight.renderInventory();
        SidebarRight.renderStrategies();
        SidebarRight.renderDetail();
        ActionBar.renderStatsDisplay();
        applyBackground();
        // 若直接进入了教学世界，显示跳过按钮
        Tutorial.onSceneActive();
    }

    // 7. 顶部栏返回大厅按钮
    const returnBtn = document.createElement('button');
    returnBtn.className = 'icon-btn';
    returnBtn.title = '返回世界大厅';
    returnBtn.onclick = async () => { await WorldPicker.returnToHall(); };
    document.querySelector('.top-bar-right').insertBefore(returnBtn, document.getElementById('settingsBtn'));

    // 8. SVG 图标集：替换顶栏 emoji 为 SVG（sprite 已在第 3.5 步挂载）
    const iconMap = {
        toggleLeftSidebar: 'menu',
        toggleRightSidebar: 'book',
        settingsBtn: 'settings'
    };
    Object.entries(iconMap).forEach(([id, name]) => {
        const el = document.getElementById(id);
        if (el) el.innerHTML = Icons.get(name);
    });
    returnBtn.innerHTML = Icons.get('refresh');
    const backLink = document.querySelector('.top-bar-right > a.icon-btn');
    if (backLink) backLink.innerHTML = Icons.get('chat');

    // 侧边栏 tab 加图标（图标 + 文字）
    const tabIconMap = {
        strategies: 'strategy', lorebook: 'book', map: 'map',
        quests: 'quest', inventory: 'bag', detail: 'detail'
    };
    document.querySelectorAll('.tab-btn').forEach(btn => {
        const name = tabIconMap[btn.dataset.tab];
        if (name) {
            const text = btn.textContent;
            btn.innerHTML = Icons.get(name, { size: 14 }) + '<span>' + Renderer.escapeHtml(text) + '</span>';
        }
    });

    // 任务快捷按钮：直接跳到任务 tab + 展开右侧栏
    const quickQuestBtn = document.getElementById('quickQuestBtn');
    if (quickQuestBtn) {
        quickQuestBtn.innerHTML = Icons.get('quest');
        quickQuestBtn.onclick = () => {
            if (typeof SidebarRight !== 'undefined') {
                if (window.innerWidth <= 900 && !document.getElementById('rightSidebar').classList.contains('open')) {
                    SidebarRight.toggle();
                }
                SidebarRight.switchTab('quests');
            }
        };
    }

    console.log('🍷 酒馆已就绪');
})();

function initSettingsModal() {
    const modal = document.getElementById('settingsModal');
    const close = document.getElementById('closeSettings');
    const save = document.getElementById('saveSettings');

    // 顶部栏设置按钮
    const settingsBtn = document.getElementById('settingsBtn');
    settingsBtn.onclick = () => {
        document.getElementById('settingsApiKey').value = State.settings.apiKey || '';
        document.getElementById('settingsModel').value = State.settings.model || 'deepseek-v4-flash';
        document.getElementById('settingsBgUrl').value = State.settings.backgroundUrl || '';
        modal.classList.add('show');
    };

    close.onclick = () => modal.classList.remove('show');

    const clearBtn = document.getElementById('clearAllData');
    clearBtn.onclick = async () => {
        if (!confirm('⚠️ 确定要清空所有数据吗？\n\n这将删除所有场景、角色、世界书和设置，且无法恢复。')) return;
        try {
            await Storage.clearAll();
            // 同步清除教程进度（localStorage）
            try { localStorage.removeItem('tavern_tutorial_progress'); } catch (e) {}
            showToast('所有数据已清空，页面即将刷新...');
            setTimeout(() => location.reload(), 1000);
        } catch (e) {
            console.error('清空数据失败:', e);
            showToast('清空失败，请重试');
        }
    };

    save.onclick = async () => {
        try {
            State.settings.apiKey = document.getElementById('settingsApiKey').value.trim();
            State.settings.model = document.getElementById('settingsModel').value;
            State.settings.backgroundUrl = Renderer.safeUrl(document.getElementById('settingsBgUrl').value.trim());
            await State.saveSettings();
            applyBackground();
            modal.classList.remove('show');
            showToast('设置已保存');
            // 刷新大厅清单卡状态（API Key 是否已填）
            WorldPicker.refreshQuickstart();
        } catch (e) {
            console.error('保存设置失败:', e);
            showToast('保存失败，请重试');
        }
    };
    modal.addEventListener('click', e => { if (e.target === modal) modal.classList.remove('show'); });
}

function applyBackground() {
    const url = State.settings.backgroundUrl;
    const bg = document.getElementById('bgLayer');
    const scene = State.scene;
    if (scene && scene.background && !url) {
        bg.style.backgroundImage = 'none';
        bg.style.background = scene.background;
    } else if (url) {
        bg.style.background = '';
        bg.style.backgroundImage = `url(${Renderer.escapeAttr(url)})`;
    } else {
        bg.style.backgroundImage = 'none';
        bg.style.background = 'linear-gradient(180deg, #1a1614 0%, #0c0a09 100%)';
    }
}

// 键盘快捷键
document.addEventListener('keydown', e => {
    if (e.key === 'Escape') {
        document.querySelectorAll('.modal-overlay.show').forEach(m => m.classList.remove('show'));
    }
});
