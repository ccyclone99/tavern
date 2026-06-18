/**
 * 世界书管理
 */
const Lorebook = {
    _setInput(id, value) {
        if (value == null) return;
        const el = document.getElementById(id);
        if (el) el.value = String(value);
    },
    openEditor(entryIndex = null) {
        const scene = State.scene;
        if (!scene) { showToast('请先创建一个场景'); return; }

        const entry = entryIndex !== null ? scene.lorebookEntries[entryIndex] : null;
        const isEdit = entryIndex !== null;

        const modal = document.createElement('div');
        modal.className = 'modal-overlay show';
        modal.id = 'loreEditorModal';
        modal.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h3>${isEdit ? '编辑世界书条目' : '新建世界书条目'}</h3>
                    <button class="icon-btn close-btn" id="loreEditorClose">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>AI 生成</label>
                        <div style="display:flex;gap:8px;">
                            <input type="text" id="aiLorePrompt" placeholder="例如：一个中世纪魔法酒馆，有精灵、矮人和龙..." style="flex:1;">
                            <button class="btn btn-primary" id="aiLoreBtn" style="padding:8px 14px;">✨ 生成</button>
                        </div>
                        <p style="font-size:12px;color:var(--text-muted);margin-top:4px;">AI 会根据场景描述自动生成关键词和背景设定</p>
                    </div>
                    <div class="form-group"><label>关键词（逗号分隔）*</label><input type="text" id="loreKeys" value="${Renderer.escapeAttr(entry?.keys?.join(',') || '')}" placeholder="关键词1, 关键词2"></div>
                    <div class="form-group"><label>辅助关键词（selective模式）</label><input type="text" id="loreSecondaryKeys" value="${Renderer.escapeAttr(entry?.secondary_keys?.join(',') || '')}"></div>
                    <div class="form-group"><label>内容 *</label><textarea id="loreContent" rows="5" placeholder="触发时注入到prompt的内容">${Renderer.escapeHtml(entry?.content || '')}</textarea></div>
                    <div class="form-group"><label>备注</label><input type="text" id="loreComment" value="${Renderer.escapeAttr(entry?.comment || '')}"></div>
                    <div style="display:flex;gap:12px;">
                        <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-dim);cursor:pointer;">
                            <input type="checkbox" id="loreEnabled" ${entry?.enabled !== false ? 'checked' : ''}> 启用
                        </label>
                        <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-dim);cursor:pointer;">
                            <input type="checkbox" id="loreSelective" ${entry?.selective ? 'checked' : ''}> Selective
                        </label>
                        <label style="display:flex;align-items:center;gap:6px;font-size:13px;color:var(--text-dim);cursor:pointer;">
                            <input type="checkbox" id="loreConstant" ${entry?.constant ? 'checked' : ''}> 始终注入
                        </label>
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="loreEditorCancel">取消</button>
                    <button class="btn btn-primary" id="loreEditorSave">保存</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

        document.getElementById('loreEditorClose').onclick = () => Lorebook.closeEditor();
        document.getElementById('loreEditorCancel').onclick = () => Lorebook.closeEditor();
        document.getElementById('loreEditorSave').onclick = async () => {
            try { await Lorebook.saveEntry(entryIndex); }
            catch (e) { console.error('保存世界书失败:', e); showToast('保存失败，请重试'); }
        };
        document.getElementById('aiLoreBtn').onclick = () => Lorebook.generateByAI();
    },

    async generateByAI() {
        const promptInput = document.getElementById('aiLorePrompt');
        const btn = document.getElementById('aiLoreBtn');
        const prompt = promptInput.value.trim();
        if (!prompt) { showToast('请输入场景描述'); return; }

        const systemPrompt = `你是一个专业的世界观设定助手。请根据用户的场景描述，生成一个世界书(lorebook)条目。

世界书条目用于AI角色扮演时自动注入背景设定。当玩家在对话中提到某些关键词时，对应的世界书内容会被添加到AI的prompt中。

请输出一个JSON对象，包含以下字段：
- keys: 关键词数组（3-5个，用于触发此条目）
- secondary_keys: 辅助关键词数组（可选，用于selective模式）
- content: 详细的背景设定内容（200-400字，描述这个世界/地点/组织的细节）
- comment: 一句话备注说明这是什么

要求：
1. 关键词要有代表性，能自然地在对话中被提到
2. 内容要丰富具体，能帮助AI理解世界观
3. 用中文输出

只输出纯JSON，不要任何其他文字。`;

        try {
            const data = await AIGenerator.generate({
                systemPrompt,
                userPrompt: '场景描述：' + prompt,
                button: btn,
                loadingText: '生成中...'
            });

            this._setInput('loreKeys', Array.isArray(data.keys) ? data.keys.join(',') : data.keys);
            this._setInput('loreSecondaryKeys', Array.isArray(data.secondary_keys) ? data.secondary_keys.join(',') : data.secondary_keys);
            this._setInput('loreContent', data.content);
            this._setInput('loreComment', data.comment);

            showToast('世界书条目已生成，请检查并保存');
        } catch (err) {
            showToast('生成失败: ' + err.message);
            console.error(err);
        }
    },

    async generateBatch() {
        const scene = State.scene;
        if (!scene) { showToast('请先创建一个场景'); return; }

        const settings = State.settings;
        if (!settings.apiKey) { showToast('请先设置 API Key'); return; }

        // 小型输入弹窗替代 prompt()
        const modal = document.createElement('div');
        modal.className = 'modal-overlay show';
        modal.id = 'batchLoreModal';
        modal.innerHTML = `
            <div class="modal">
                <div class="modal-header">
                    <h3>AI 批量生成世界书</h3>
                    <button class="icon-btn close-btn" id="closeBatchLoreModal">✕</button>
                </div>
                <div class="modal-body">
                    <div class="form-group">
                        <label>描述你的世界设定</label>
                        <input type="text" id="batchLoreInput" placeholder="例如：一个中世纪魔法酒馆，有精灵、矮人和龙...">
                    </div>
                </div>
                <div class="modal-footer">
                    <button class="btn btn-secondary" id="cancelBatchLore">取消</button>
                    <button class="btn btn-primary" id="confirmBatchLore">生成</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

        return new Promise((resolve) => {
            const input = modal.querySelector('#batchLoreInput');
            const confirmBtn = modal.querySelector('#confirmBatchLore');
            const cancelBtn = modal.querySelector('#cancelBatchLore');
            const closeBtn = modal.querySelector('#closeBatchLoreModal');

            const cleanup = () => { modal.remove(); resolve(); };

            closeBtn.onclick = cleanup;
            cancelBtn.onclick = cleanup;

            confirmBtn.onclick = async () => {
                const prompt = input.value.trim();
                if (!prompt) { showToast('请输入世界设定描述'); return; }
                modal.remove();

                showToast('正在批量生成世界书条目...');

                const systemPrompt = `你是一个专业的世界观设定助手。请根据用户的场景描述，生成3-5个世界书(lorebook)条目数组。

每个条目格式：
{
  "keys": ["关键词1", "关键词2"],
  "content": "详细的背景设定（100-300字）",
  "comment": "一句话备注"
}

要求：
1. 条目之间要有区分度，覆盖场景的不同方面（地点、种族、文化、历史、规则等）
2. 关键词要有代表性，能自然地在对话中被提到
3. 内容要丰富具体，能帮助AI理解世界观
4. 用中文输出

请输出JSON数组格式：[{...}, {...}, {...}]
只输出纯JSON数组，不要任何其他文字。`;

                try {
                    const entries = await AIGenerator.call(systemPrompt, '场景描述：' + prompt, { arrayMode: true });

                    if (!Array.isArray(entries)) throw new Error('返回格式错误');

                    let added = 0;
                    for (const data of entries) {
                        if (!data.keys || !data.content) continue;
                        scene.lorebookEntries.push({
                            keys: Array.isArray(data.keys) ? data.keys : [data.keys],
                            secondary_keys: data.secondary_keys ? (Array.isArray(data.secondary_keys) ? data.secondary_keys : [data.secondary_keys]) : [],
                            content: data.content,
                            comment: data.comment || '',
                            enabled: true,
                            selective: false,
                            constant: false,
                            insertion_order: 0,
                            priority: 0,
                            position: 'before_char'
                        });
                        added++;
                    }

                    await State.saveCurrentScene();
                    SidebarRight.renderLorebook();
                    if (added > 0) SidebarRight.markTabNew('lorebook');
                    showToast(`已生成 ${added} 个世界书条目`);
                } catch (err) {
                    showToast('批量生成失败: ' + err.message);
                    console.error(err);
                }

                resolve();
            };

            input.focus();
            input.addEventListener('keydown', e => { if (e.key === 'Enter') confirmBtn.click(); });
        });
    },

    closeEditor() {
        const modal = document.getElementById('loreEditorModal');
        if (modal) modal.remove();
    },

    async saveEntry(index) {
        const scene = State.scene;
        if (!scene) return;

        const keys = document.getElementById('loreKeys').value.split(',').map(s => s.trim()).filter(Boolean);
        if (keys.length === 0) { showToast('请填写关键词'); return; }

        const entry = {
            keys,
            secondary_keys: document.getElementById('loreSecondaryKeys').value.split(',').map(s => s.trim()).filter(Boolean),
            content: document.getElementById('loreContent').value.trim(),
            comment: document.getElementById('loreComment').value.trim(),
            enabled: document.getElementById('loreEnabled').checked,
            selective: document.getElementById('loreSelective').checked,
            constant: document.getElementById('loreConstant').checked,
            insertion_order: 0,
            priority: 0,
            position: 'before_char'
        };

        if (index !== null && scene.lorebookEntries[index]) {
            Object.assign(scene.lorebookEntries[index], entry);
        } else {
            scene.lorebookEntries.push(entry);
        }

        await State.saveCurrentScene();
        SidebarRight.renderLorebook();
        this.closeEditor();
        showToast('世界书条目已保存');
    },

    async deleteEntry(index) {
        const scene = State.scene;
        if (!scene) return;
        scene.lorebookEntries.splice(index, 1);
        await State.saveCurrentScene();
        SidebarRight.renderLorebook();
    }
};
