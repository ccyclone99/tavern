/**
 * 角色卡编辑器弹窗
 */
const CharacterEditor = {
    _setInput(id, value) {
        if (value == null) return;
        const el = document.getElementById(id);
        if (el) el.value = String(value);
    },
    init() {
        this.modal = document.getElementById('editorModal');
        this.titleEl = document.getElementById('editorTitle');
        this.bodyEl = document.getElementById('editorBody');
        document.getElementById('closeEditor').onclick = () => this.close();
        document.getElementById('cancelEditor').onclick = () => this.close();
        document.getElementById('saveCharacter').onclick = async () => {
            try { await this.save(); }
            catch (e) { console.error('保存角色失败:', e); showToast('保存失败，请重试'); }
        };
        document.getElementById('exportCharacter').onclick = () => this.exportPNG();
        this.modal.addEventListener('click', e => { if (e.target === this.modal) this.close(); });
    },

    open(characterId = null) {
        State.editingCharacterId = characterId;
        const isEdit = !!characterId;
        const char = isEdit ? State.characters.find(c => c.id === characterId) : null;

        this.titleEl.textContent = isEdit ? '编辑角色' : '新建角色';
        this.modal.classList.add('show');

        const safeAvatar = Renderer.safeUrl(char?.avatar);
        const avatarDisplay = safeAvatar ? '' : 'display:none';
        const placeholderDisplay = safeAvatar ? 'display:none' : '';
        const nameInitial = Renderer.escapeHtml(char?.name?.[0] || '?');

        this.bodyEl.innerHTML = `
            <div style="text-align:center;margin-bottom:16px;">
                <img class="editor-avatar-preview" id="editorAvatarPreview" src="${Renderer.escapeAttr(safeAvatar)}" alt="头像" style="${avatarDisplay}">
                <div id="editorAvatarPlaceholder" class="editor-avatar-preview" style="background:var(--gold-dim);display:flex;align-items:center;justify-content:center;color:#fff;font-size:28px;font-weight:bold;${placeholderDisplay}">${nameInitial}</div>
                <input type="file" id="editorAvatarInput" accept="image/*" style="display:none">
                <button class="text-btn" style="margin-top:8px;" id="editorAvatarUploadBtn">更换头像</button>
            </div>
            <div class="editor-tabs">
                <button class="editor-tab active" id="tabBtnBasic">基础</button>
                <button class="editor-tab" id="tabBtnPersonality">性格/背景</button>
                <button class="editor-tab" id="tabBtnAdvanced">高级</button>
            </div>
            <div class="editor-panel active" data-panel="basic">
                <div class="form-group">
                    <label>AI 生成描述</label>
                    <div style="display:flex;gap:8px;">
                        <input type="text" id="aiGenPrompt" placeholder="例如：一个傲娇的女骑士，金色长发，穿着银色盔甲..." style="flex:1;">
                        <button class="btn btn-primary" id="aiGenBtn" style="padding:8px 14px;">✨ 生成</button>
                    </div>
                    <p style="font-size:12px;color:var(--text-muted);margin-top:4px;">输入一句话描述，AI 会自动补全角色设定</p>
                </div>
                <div class="form-group"><label>名称 *</label><input type="text" id="editName" value="${Renderer.escapeAttr(char?.name || '')}" placeholder="角色名称"></div>
                <div class="form-group"><label>开场白</label><textarea id="editFirstMes" placeholder="角色对新玩家说的第一句话">${Renderer.escapeHtml(char?.first_mes || '')}</textarea></div>
                <div class="form-group"><label>标签（逗号分隔）</label><input type="text" id="editTags" value="${Renderer.escapeAttr(char?.tags?.join(',') || '')}" placeholder="tag1, tag2"></div>
            </div>
            <div class="editor-panel" data-panel="personality">
                <div class="form-group"><label>角色背景 / 外貌</label><textarea id="editDescription" rows="4" placeholder="角色的身世、外貌、穿着...">${Renderer.escapeHtml(char?.description || '')}</textarea></div>
                <div class="form-group"><label>性格</label><textarea id="editPersonality" rows="3" placeholder="角色如何说话、行为方式...">${Renderer.escapeHtml(char?.personality || '')}</textarea></div>
                <div class="form-group"><label>场景设定</label><textarea id="editScenario" rows="3" placeholder="故事发生的时间、地点、背景...">${Renderer.escapeHtml(char?.scenario || '')}</textarea></div>
                <div class="form-group"><label>示例对话</label><textarea id="editMesExample" rows="4" placeholder="<START>\n{{user}}: ...\n{{char}}: ...">${Renderer.escapeHtml(char?.mes_example || '')}</textarea></div>
                <div class="form-group"><label>⚖ 信条（核心价值观，角色为什么存在）</label><textarea id="editCreed" rows="2" placeholder="如：帝皇的意志高于一切，任何混沌腐蚀都必须被根除。">${Renderer.escapeHtml(char?.creed || '')}</textarea></div>
                <div class="form-group"><label>价值排序（面对两难时如何抉择）</label><input type="text" id="editValues" value="${Renderer.escapeAttr(char?.values || '')}" placeholder="如：职责 > 正义 > 仁慈 > 个人情感"></div>
                <div class="form-group"><label>底线（角色绝不会做的事，每行一条）</label><textarea id="editRedLines" rows="3" placeholder="绝不宽恕确认的异端&#10;绝不为个人感情隐瞒审讯结果">${Renderer.escapeHtml(char?.redLines?.join('\n') || '')}</textarea></div>
            </div>
            <div class="editor-panel" data-panel="advanced">
                <div class="form-group"><label>System Prompt</label><textarea id="editSystemPrompt" rows="3" placeholder="额外的系统级设定">${Renderer.escapeHtml(char?.system_prompt || '')}</textarea></div>
                <div class="form-group"><label>Post-history Instructions</label><textarea id="editPostHistory" rows="3" placeholder="对历史消息的后续指导">${Renderer.escapeHtml(char?.post_history_instructions || '')}</textarea></div>
                <div class="form-group"><label>Alternate Greetings（每行一个）</label><textarea id="editAltGreetings" rows="3" placeholder="其他开场白">${Renderer.escapeHtml(char?.alternate_greetings?.join('\n') || '')}</textarea></div>
                <div class="form-group"><label>创作者备注</label><input type="text" id="editCreatorNotes" value="${Renderer.escapeAttr(char?.creator_notes || '')}"></div>
            </div>
        `;

        // 绑定标签切换
        document.getElementById('tabBtnBasic').onclick = (e) => this.switchTab(e.target, 'basic');
        document.getElementById('tabBtnPersonality').onclick = (e) => this.switchTab(e.target, 'personality');
        document.getElementById('tabBtnAdvanced').onclick = (e) => this.switchTab(e.target, 'advanced');
        document.getElementById('editorAvatarUploadBtn').onclick = () => document.getElementById('editorAvatarInput').click();
        document.getElementById('aiGenBtn').onclick = () => this.generateByAI();

        // 头像预览
        const avatarInput = document.getElementById('editorAvatarInput');
        const preview = document.getElementById('editorAvatarPreview');
        const placeholder = document.getElementById('editorAvatarPlaceholder');
        avatarInput.onchange = (e) => {
            const file = e.target.files[0];
            if (!file) return;
            const reader = new FileReader();
            reader.onload = () => {
                preview.src = reader.result;
                preview.style.display = 'block';
                placeholder.style.display = 'none';
            };
            reader.readAsDataURL(file);
        };
    },

    switchTab(btn, panel) {
        this.bodyEl.querySelectorAll('.editor-tab').forEach(t => t.classList.remove('active'));
        btn.classList.add('active');
        this.bodyEl.querySelectorAll('.editor-panel').forEach(p => p.classList.remove('active'));
        this.bodyEl.querySelector(`[data-panel="${panel}"]`).classList.add('active');
    },

    async generateByAI() {
        const promptInput = document.getElementById('aiGenPrompt');
        const btn = document.getElementById('aiGenBtn');
        const prompt = promptInput.value.trim();
        if (!prompt) { showToast('请输入角色描述'); return; }

        const systemPrompt = `你是一个专业的AI角色扮演角色卡创作者。请根据用户的描述，生成一个完整的SillyTavern V2格式角色卡JSON。

要求：
1. name: 角色名称（有特色的名字）
2. description: 详细的外貌描写和背景设定（300字左右）
3. personality: 性格特征、说话方式、行为习惯（200字左右）
4. scenario: 当前场景设定（100字左右）
5. first_mes: 开场白，要体现角色性格和当前场景（150字左右）
6. mes_example: 示例对话，展示角色的说话风格，格式为 <START>\n{{user}}: ...\n{{char}}: ...\n（2-3轮对话）
7. tags: 标签数组，5-8个标签
8. creed: 核心信条（1-2句，角色的核心价值观，为什么存在）
9. values: 价值排序（如"职责>正义>个人情感"）
10. redLines: 底线数组（3-4条角色绝不会做的事）

只输出纯JSON，不要任何其他文字。用中文填写所有内容。角色必须有鲜明的立场，会拒绝某些事，而非讨好所有人。`;

        try {
            const data = await AIGenerator.generate({
                systemPrompt,
                userPrompt: '请创作角色：' + prompt,
                button: btn,
                loadingText: '生成中...'
            });

            // 填充表单
            this._setInput('editName', data.name);
            this._setInput('editFirstMes', data.first_mes);
            this._setInput('editTags', Array.isArray(data.tags) ? data.tags.join(',') : data.tags);
            this._setInput('editDescription', data.description);
            this._setInput('editPersonality', data.personality);
            this._setInput('editScenario', data.scenario);
            this._setInput('editMesExample', data.mes_example);
            this._setInput('editCreed', data.creed);
            this._setInput('editValues', data.values);
            this._setInput('editRedLines', Array.isArray(data.redLines) ? data.redLines.join('\n') : data.redLines);
            this._setInput('editSystemPrompt', data.system_prompt);
            this._setInput('editPostHistory', data.post_history_instructions);

            showToast('角色卡已生成，请检查并保存');
        } catch (err) {
            showToast('生成失败: ' + err.message);
            console.error(err);
        }
    },

    close() {
        this.modal.classList.remove('show');
        State.editingCharacterId = null;
    },

    async save() {
        const name = document.getElementById('editName').value.trim();
        if (!name) { showToast('请填写角色名称'); return; }

        const preview = document.getElementById('editorAvatarPreview');
        const avatarSrc = preview.style.display !== 'none' ? preview.src : '';
        const avatar = Renderer.safeUrl(avatarSrc);

        const data = {
            name,
            avatar,
            first_mes: document.getElementById('editFirstMes').value.trim(),
            tags: document.getElementById('editTags').value.split(',').map(s => s.trim()).filter(Boolean),
            description: document.getElementById('editDescription').value.trim(),
            personality: document.getElementById('editPersonality').value.trim(),
            scenario: document.getElementById('editScenario').value.trim(),
            mes_example: document.getElementById('editMesExample').value.trim(),
            creed: document.getElementById('editCreed').value.trim(),
            values: document.getElementById('editValues').value.trim(),
            redLines: document.getElementById('editRedLines').value.split('\n').map(s => s.trim()).filter(Boolean),
            system_prompt: document.getElementById('editSystemPrompt').value.trim(),
            post_history_instructions: document.getElementById('editPostHistory').value.trim(),
            alternate_greetings: document.getElementById('editAltGreetings').value.split('\n').map(s => s.trim()).filter(Boolean),
            creator_notes: document.getElementById('editCreatorNotes').value.trim(),
        };

        if (State.editingCharacterId) {
            const existing = State.characters.find(c => c.id === State.editingCharacterId);
            if (existing) {
                // 保留编辑器中不管理的内部字段，避免被空对象覆盖
                const preserve = {
                    id: existing.id,
                    _emoji: existing._emoji,
                    _relations: existing._relations,
                    _emotionTags: existing._emotionTags,
                    _talkativeness: existing._talkativeness,
                    _priority: existing._priority,
                    extensions: existing.extensions,
                    character_book: existing.character_book,
                    creator: existing.creator,
                    character_version: existing.character_version,
                };
                Object.assign(existing, data, preserve);
                await Storage.saveCharacter(existing);
            }
        } else {
            const previousCharacterId = State.currentCharacterId;
            const char = {
                id: 'char_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
                ...data,
                _relations: {},
                _emotionTags: [],
                _talkativeness: 0.5,
                _priority: 0
            };
            await Storage.saveCharacter(char);
            State.characters.push(char);
            State.setCurrentCharacter(char.id);
            if (State.scene) {
                const result = State.addCharacterToScene(char.id);
                if (!result?.ok) {
                    await Storage.deleteCharacter(char.id);
                    State.characters = State.characters.filter(item => item.id !== char.id);
                    State.setCurrentCharacter(previousCharacterId || null);
                    State.emit('charactersChanged', State.characters);
                    showToast(result?.message || '角色未加入当前场景，已取消创建。');
                    return;
                }
            }
        }

        State.emit('charactersChanged', State.characters);
        showToast(State.editingCharacterId ? '角色已更新' : '角色已创建');
        this.close();
    },

    async exportPNG() {
        const char = State.characters.find(c => c.id === State.editingCharacterId);
        if (!char) return;
        try {
            const blob = await PNGMetadata.exportCharacter(char);
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = char.name + '.png';
            a.click();
            URL.revokeObjectURL(url);
            showToast('已导出 PNG 角色卡');
        } catch (e) {
            showToast('导出失败: ' + e.message);
        }
    }
};
