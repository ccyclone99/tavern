/**
 * 玩家人物卡创建器
 */
const PlayerCreator = {
    _setInput(id, value) {
        if (value == null) return;
        const el = document.getElementById(id);
        if (el) el.value = String(value);
    },
    modal: null,

    init() {
        // 弹窗由 main.js 动态创建
    },

    open() {
        const scene = State.scene;
        if (!scene) return;

        const existing = scene.playerPersona;

        const safeAvatar = Renderer.safeUrl(existing?.avatar);
        const avatarDisplay = safeAvatar ? '' : 'display:none';
        const placeholderDisplay = safeAvatar ? 'display:none' : '';
        const nameInitial = Renderer.escapeHtml((existing?.name || scene.userName || '旅人')[0]);

        const modal = document.createElement('div');
        modal.className = 'modal-overlay show';
        modal.id = 'playerCreatorModal';
        modal.innerHTML = `
            <div class="modal modal-lg">
                <div class="modal-header">
                    <h3>创建你的角色</h3>
                    <button class="icon-btn close-btn" id="playerCreatorClose">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>AI 辅助生成</label>
                        <div style="display:flex;gap:8px;">
                            <input type="text" id="aiPersonaPrompt" placeholder="例如：一个失去记忆的赏金猎人，穿着黑色风衣，左手是机械义肢..." style="flex:1;">
                            <button class="btn btn-primary" id="aiPersonaBtn" style="padding:8px 14px;">✨ 生成</button>
                        </div>
                        <p style="font-size:12px;color:var(--text-muted);margin-top:4px;">输入一句话描述，AI 会自动补全角色设定</p>
                    </div>
                    <div class="form-group" style="text-align:center;">
                        <img class="editor-avatar-preview" id="personaAvatarPreview" src="${Renderer.escapeAttr(safeAvatar)}" alt="头像" style="${avatarDisplay}">
                        <div id="personaAvatarPlaceholder" class="editor-avatar-preview" style="background:var(--blue);display:flex;align-items:center;justify-content:center;color:#fff;font-size:32px;font-weight:bold;margin:0 auto 8px;${placeholderDisplay}">${nameInitial}</div>
                        <input type="file" id="personaAvatarInput" accept="image/*" style="display:none">
                        <button class="text-btn" id="personaAvatarUploadBtn" type="button">选择头像</button>
                    </div>
                    <div class="form-group"><label>名字 *</label><input type="text" id="personaName" value="${Renderer.escapeAttr(existing?.name || scene.userName || '旅人')}" placeholder="你在这个世界中的名字"></div>
                    <div class="form-group"><label>外貌</label><textarea id="personaAppearance" rows="2" placeholder="你的外貌特征，穿什么，有什么标志性的物品...">${Renderer.escapeHtml(existing?.appearance || '')}</textarea></div>
                    <div class="form-group"><label>背景故事</label><textarea id="personaBackground" rows="3" placeholder="你从哪里来？经历了什么？为什么会出现在这里？">${Renderer.escapeHtml(existing?.background || '')}</textarea></div>
                    <div class="form-group"><label>性格</label><textarea id="personaPersonality" rows="2" placeholder="你是开朗还是沉默？冲动还是谨慎？">${Renderer.escapeHtml(existing?.personality || '')}</textarea></div>
                    <div class="form-group"><label>目标</label><textarea id="personaGoal" rows="2" placeholder="你来到这里是为了什么？你想达成什么？">${Renderer.escapeHtml(existing?.goal || '')}</textarea></div>
                    <div class="form-group"><label>⚖ 你的信条（可选）</label><textarea id="personaCreed" rows="2" placeholder="你坚守的原则或信念，如：绝不抛弃同伴、真相高于一切...">${Renderer.escapeHtml(existing?.creed || '')}</textarea></div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="playerCreatorCancel">取消</button>
                    <button class="btn btn-primary" id="playerCreatorSave">开始冒险</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) PlayerCreator.close(); });

        document.getElementById('playerCreatorClose').onclick = () => PlayerCreator.close();
        document.getElementById('playerCreatorCancel').onclick = () => PlayerCreator.close();
        document.getElementById('playerCreatorSave').onclick = async () => {
            try { await PlayerCreator.save(); }
            catch (e) { console.error('保存玩家角色失败:', e); showToast('保存失败，请重试'); }
        };
        document.getElementById('aiPersonaBtn').onclick = () => PlayerCreator.generateByAI();
        document.getElementById('personaAvatarUploadBtn').onclick = () => document.getElementById('personaAvatarInput').click();
        document.getElementById('personaAvatarInput').onchange = (e) => PlayerCreator.onAvatarChange(e);

        this.modal = modal;
    },

    close() {
        if (this.modal) {
            this.modal.remove();
            this.modal = null;
        }
    },

    onAvatarChange(e) {
        const file = e.target.files[0];
        if (!file) return;
        const reader = new FileReader();
        reader.onload = () => {
            const preview = document.getElementById('personaAvatarPreview');
            const placeholder = document.getElementById('personaAvatarPlaceholder');
            if (preview) { preview.src = reader.result; preview.style.display = ''; }
            if (placeholder) placeholder.style.display = 'none';
        };
        reader.readAsDataURL(file);
    },

    async generateByAI() {
        const promptInput = document.getElementById('aiPersonaPrompt');
        const btn = document.getElementById('aiPersonaBtn');
        const prompt = promptInput.value.trim();
        if (!prompt) { showToast('请输入描述'); return; }

        const systemPrompt = `你是一个角色扮演人物卡生成助手。请根据用户描述生成一个人物卡JSON。

字段：
- name: 名字（有特色的）
- appearance: 外貌描写（80字）
- background: 背景故事（120字）
- personality: 性格特征（60字）
- goal: 目标/动机（60字）

只输出纯JSON，不要其他文字。用中文。`;

        try {
            const data = await AIGenerator.generate({
                systemPrompt,
                userPrompt: '描述：' + prompt,
                button: btn,
                loadingText: '生成中...'
            });

            this._setInput('personaName', data.name);
            this._setInput('personaAppearance', data.appearance);
            this._setInput('personaBackground', data.background);
            this._setInput('personaPersonality', data.personality);
            this._setInput('personaGoal', data.goal);

            showToast('人物卡已生成，请检查并保存');
        } catch (err) {
            showToast('生成失败: ' + err.message);
        }
    },

    async save() {
        const scene = State.scene;
        if (!scene) return;

        const name = document.getElementById('personaName').value.trim();
        if (!name) { showToast('请填写名字'); return; }

        const avatarPreview = document.getElementById('personaAvatarPreview');
        const avatarSrc = avatarPreview && avatarPreview.src && avatarPreview.style.display !== 'none' ? avatarPreview.src : (scene.playerPersona?.avatar || '');
        scene.playerPersona = {
            name,
            avatar: Renderer.safeUrl(avatarSrc),
            appearance: document.getElementById('personaAppearance').value.trim(),
            background: document.getElementById('personaBackground').value.trim(),
            personality: document.getElementById('personaPersonality').value.trim(),
            goal: document.getElementById('personaGoal').value.trim(),
            creed: document.getElementById('personaCreed').value.trim()
        };

        scene.userName = name;
        await State.saveCurrentScene();
        this.close();

        // 触发开场剧情播放
        await this.playOpening(scene);
    },

    async playOpening(scene) {
        ChatUI.render();
        SidebarLeft.render();
        SidebarRight.renderLorebook();
        SidebarRight.renderInventory();
        SidebarRight.renderDetail();
        SidebarRight.renderStrategies();
        ActionBar.renderStatsDisplay();
        applyBackground();
        // 教学世界：注入标记 + 显示跳过按钮
        if (TutorialWorld.isCurrentScene()) {
            Tutorial.onSceneActive();
        }
        showToast(`欢迎，${scene.playerPersona.name}。你的冒险开始了。`);
    }
};
