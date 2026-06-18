/**
 * 新角色登场 / 角色退场 处理
 */
const NewCharacterHandler = {
    show(markup) {
        // markup格式: 角色名|emoji|外貌|性格|开场白
        const parts = markup.split('|');
        if (parts.length < 5) {
            console.warn('新角色标记格式错误:', markup);
            return;
        }
        const [name, emoji, description, personality, firstMes] = parts;

        const modal = document.createElement('div');
        modal.className = 'modal-overlay show';
        modal.id = 'newCharacterModal';
        modal.style.zIndex = '600';
        modal.innerHTML = `
            <div class="modal new-char-modal" style="max-width:420px;text-align:center;animation:fadeInScale 0.4s ease;">
                <div style="font-size:64px;margin-bottom:8px;line-height:1;">${Renderer.escapeHtml(emoji)}</div>
                <h3 style="font-size:22px;color:var(--text-gold);margin-bottom:4px;">✨ 新角色登场</h3>
                <div style="font-size:20px;font-weight:600;margin-bottom:12px;">${Renderer.escapeHtml(name)}</div>
                <div style="text-align:left;background:var(--bg-input);border-radius:10px;padding:14px;margin-bottom:8px;">
                    <p style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">外貌</p>
                    <p style="font-size:13px;color:var(--text-dim);margin-bottom:10px;">${Renderer.escapeHtml(description)}</p>
                    <p style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">性格</p>
                    <p style="font-size:13px;color:var(--text-dim);margin-bottom:10px;">${Renderer.escapeHtml(personality)}</p>
                    <p style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">开场</p>
                    <p style="font-size:13px;color:var(--text-main);font-style:italic;">"${Renderer.escapeHtml(firstMes.replace(/\*/g, ''))}"</p>
                </div>
                <div style="display:flex;gap:10px;justify-content:center;">
                    <button class="btn btn-primary" id="acceptNewChar">接受并继续</button>
                    <button class="btn btn-secondary" id="skipNewChar">跳过</button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.addEventListener('click', e => { if (e.target === modal) modal.remove(); });

        document.getElementById('acceptNewChar').onclick = async () => {
            await this.addCharacter(name, emoji, description, personality, firstMes);
            modal.remove();
        };
        document.getElementById('skipNewChar').onclick = () => modal.remove();
    },

    async addCharacter(name, emoji, description, personality, firstMes) {
        const scene = State.scene;
        if (!scene) return;

        const char = {
            id: 'char_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            name,
            avatar: '',
            _emoji: emoji || '🧑',
            description,
            personality,
            first_mes: firstMes,
            mes_example: '',
            scenario: '',
            tags: ['动态角色'],
            creator: 'AI',
            character_version: '1.0',
            extensions: {},
            _relations: {},
            _emotionTags: ['平静'],
            _talkativeness: 0.5,
            _priority: 0
        };
        await Storage.saveCharacter(char);
        State.characters.push(char);
        scene.characters.push(char.id);
        await State.saveCurrentScene();

        // 发送开场白（增量追加，避免全量重绘）
        if (firstMes) {
            const msg = {
                id: 'msg_' + Date.now(),
                role: 'assistant',
                characterId: char.id,
                content: firstMes,
                type: 'talk',
                timestamp: Date.now()
            };
            scene.messages.push(msg);
            ChatUI.onMessageAdded(msg);
            await State.saveCurrentSceneDebounced();
        }

        State.emit('charactersChanged', State.characters);
        State.emit('sceneChanged', scene);
        showToast(`${name} 加入了场景`);
    },

    async handleExit(markup) {
        // markup格式: 角色名|原因
        const parts = markup.split('|');
        const name = parts[0];
        const reason = parts[1] || '离开了';

        const scene = State.scene;
        if (!scene) return;

        const char = State.characters.find(c => c.name === name && scene.characters.includes(c.id));
        if (!char) return;

        // 从场景中移除
        scene.characters = scene.characters.filter(id => id !== char.id);
        await State.saveCurrentScene();

        // 发送退场消息（增量追加）
        const msg = {
            id: 'msg_' + Date.now(),
            role: 'assistant',
            content: `*${name}${reason}*`,
            type: 'narrate',
            timestamp: Date.now()
        };
        scene.messages.push(msg);
        ChatUI.onMessageAdded(msg);
        await State.saveCurrentSceneDebounced();

        State.emit('charactersChanged', State.characters);
        State.emit('sceneChanged', scene);
        showToast(`${name} ${reason}`);
    }
};
