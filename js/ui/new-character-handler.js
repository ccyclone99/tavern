/**
 * 新角色登场 / 角色退场 处理
 */
const NewCharacterHandler = {
    show(markup) {
        const data = this.parseCharacterData(markup);
        if (!data) {
            console.warn('新角色标记格式错误:', markup);
            return;
        }

        const modal = document.createElement('div');
        modal.className = 'modal-overlay show';
        modal.id = 'newCharacterModal';
        modal.style.zIndex = '600';
        modal.innerHTML = `
            <div class="modal new-char-modal" style="max-width:420px;text-align:center;animation:fadeInScale 0.4s ease;">
                <div style="font-size:64px;margin-bottom:8px;line-height:1;">${Renderer.escapeHtml(data.emoji)}</div>
                <h3 style="font-size:22px;color:var(--text-gold);margin-bottom:4px;">✨ 新角色登场</h3>
                <div style="font-size:20px;font-weight:600;margin-bottom:12px;">${Renderer.escapeHtml(data.name)}</div>
                <div style="text-align:left;background:var(--bg-input);border-radius:10px;padding:14px;margin-bottom:8px;">
                    <p style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">外貌</p>
                    <p style="font-size:13px;color:var(--text-dim);margin-bottom:10px;">${Renderer.escapeHtml(data.description)}</p>
                    <p style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">性格</p>
                    <p style="font-size:13px;color:var(--text-dim);margin-bottom:10px;">${Renderer.escapeHtml(data.personality)}</p>
                    <p style="font-size:12px;color:var(--text-muted);margin-bottom:4px;">开场</p>
                    <p style="font-size:13px;color:var(--text-main);font-style:italic;">"${Renderer.escapeHtml(data.firstMes.replace(/\*/g, ''))}"</p>
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
            await this.addCharacter(data);
            modal.remove();
        };
        document.getElementById('skipNewChar').onclick = () => modal.remove();
    },

    parseCharacterData(markup) {
        // markup格式: 角色名|emoji|外貌|性格|开场白|信条|价值排序|底线|动机|恐惧|秘密|筹码
        const parts = String(markup || '').split('|');
        if (parts.length < 5) return null;
        return this._normalizeCharacterData({
            name: parts[0],
            emoji: parts[1],
            description: parts[2],
            personality: parts[3],
            firstMes: parts[4],
            creed: parts[5],
            values: parts[6],
            redLines: parts[7],
            motives: parts[8],
            fears: parts[9],
            secrets: parts[10],
            leverage: parts[11]
        });
    },

    async addCharacter(input, emoji, description, personality, firstMes) {
        const data = this._normalizeCharacterData(
            input && typeof input === 'object'
                ? input
                : { name: input, emoji, description, personality, firstMes }
        );
        const scene = State.scene;
        if (!scene) return;
        if (typeof WorldEngine === 'undefined' || !WorldEngine.addExistingCharacterToScene) {
            console.warn('[NewCharacterHandler] WorldEngine.addExistingCharacterToScene 不可用，跳过动态角色登场');
            if (typeof showToast !== 'undefined') showToast('角色登场系统不可用。');
            return;
        }

        const char = {
            id: 'char_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            name: data.name,
            avatar: '',
            _emoji: data.emoji,
            description: data.description,
            personality: data.personality,
            first_mes: data.firstMes,
            mes_example: '',
            scenario: '',
            tags: ['动态角色'],
            creator: 'AI',
            character_version: '1.0',
            extensions: {},
            _relations: {},
            _emotionTags: ['平静'],
            _talkativeness: 0.5,
            _priority: 0,
            motives: data.motives,
            fears: data.fears,
            secrets: data.secrets,
            leverage: data.leverage,
            agenda: {
                currentPlan: data.motives[0] || '',
                priority: 40,
                schedule: [],
                offscreenActions: data.motives.slice(0, 2),
                lastActionTurn: 0
            },
            creed: data.creed,
            redLines: data.redLines,
            values: data.values,
            profile: this._buildCharacterProfile(data)
        };
        if (typeof WorldEngine !== 'undefined' && WorldEngine.normalizeAgenda) {
            WorldEngine.normalizeAgenda(char);
        }

        if (!WorldEngine.isScenePlaying(scene)) {
            if (typeof showToast !== 'undefined') showToast(WorldEngine.endedSceneMessage(scene));
            return;
        }

        await Storage.saveCharacter(char);
        State.characters.push(char);
        const result = WorldEngine.addExistingCharacterToScene(scene, char.id, { character: char });
        if (!result.ok) {
            State.characters = State.characters.filter(item => item.id !== char.id);
            if (Storage.deleteCharacter) {
                try { await Storage.deleteCharacter(char.id); }
                catch (e) { console.warn('回滚动态角色失败:', e); }
            }
            if (typeof showToast !== 'undefined') showToast(result.message || '角色未加入场景。');
            return;
        }
        await State.saveCurrentScene();

        // 发送开场白（增量追加，避免全量重绘）
        if (char.first_mes) {
            const msg = {
                id: 'msg_' + Date.now(),
                role: 'assistant',
                characterId: char.id,
                content: char.first_mes,
                type: 'talk',
                visibility: typeof WorldEngine !== 'undefined'
                    ? WorldEngine.createVisibility({ public: true })
                    : undefined,
                timestamp: Date.now()
            };
            scene.messages.push(msg);
            ChatUI.onMessageAdded(msg);
            await State.saveCurrentSceneDebounced();
        }

        State.emit('charactersChanged', State.characters);
        State.emit('sceneChanged', scene);
        showToast(`${char.name} 加入了场景`);
    },

    _normalizeCharacterData(data = {}) {
        const name = this._clean(data.name || '新角色', 60) || '新角色';
        const description = this._clean(data.description, 240);
        const personality = this._clean(data.personality, 180);
        const firstMes = this._clean(data.firstMes || data.first_mes, 500);
        const defaults = this._buildDefaultHooks(name);
        return {
            name,
            emoji: this._clean(data.emoji || data.avatar || '🧑', 8) || '🧑',
            description,
            personality,
            firstMes,
            creed: this._clean(data.creed, 220) || defaults.creed,
            values: this._clean(data.values, 160) || defaults.values,
            redLines: this._limitedList(data.redLines, 4, 120, defaults.redLines),
            motives: this._limitedList(data.motives, 4, 120, defaults.motives),
            fears: this._limitedList(data.fears, 4, 120, defaults.fears),
            secrets: this._limitedList(data.secrets, 4, 140, defaults.secrets),
            leverage: this._limitedList(data.leverage, 4, 120, defaults.leverage),
            title: this._clean(data.title, 80) || '身份待确认',
            firstImpression: this._clean(data.firstImpression, 120) ||
                this._publicImpression(description, personality)
        };
    },

    _buildDefaultHooks(name) {
        return {
            creed: `${name}首先忠于自己在当前事件中的职责和生存判断，不会因压力轻易让步。`,
            values: '核心目标 > 自身安全 > 与玩家的关系',
            redLines: ['绝不无代价背叛自己的核心立场'],
            motives: [`${name}想在当前局势中守住自己的位置，并确认谁值得信任。`],
            fears: [`${name}担心被卷入无法控制的冲突，或暴露尚未准备好承认的弱点。`],
            secrets: [`${name}对当前事件保留着一个尚未公开的顾虑。`],
            leverage: [`${name}掌握一条与现场、人脉或流程有关的可利用信息。`]
        };
    },

    _buildCharacterProfile(data = {}) {
        const hiddenFacts = [];
        const addFacts = (list, type, title, hint, trust, dc) => {
            (Array.isArray(list) ? list : []).forEach((truth, idx) => {
                const truthText = this._clean(truth, 160);
                if (!truthText) return;
                hiddenFacts.push({
                    id: `${type}_${idx}_${Math.random().toString(36).slice(2, 6)}`,
                    type,
                    title,
                    hint,
                    truth: truthText,
                    unlock: {
                        trust,
                        check: { stat: '感知', dc }
                    }
                });
            });
        };
        addFacts(data.motives, 'motive', '真实动机', '这个角色的行动背后似乎有更深的目标。', 10, 12);
        addFacts(data.fears, 'fear', '恐惧', '某些话题会让这个角色回避或变得紧张。', 20, 14);
        addFacts(data.secrets, 'secret', '未公开秘密', '这个角色似乎隐瞒了某件重要的事。', 30, 16);
        addFacts(data.leverage, 'leverage', '可利用筹码', '这个角色身边存在可被利用的资源、把柄或弱点。', 20, 15);
        return {
            public: {
                title: data.title || '身份待确认',
                firstImpression: data.firstImpression || '尚未形成可靠公开印象'
            },
            hiddenFacts
        };
    },

    _publicImpression(description, personality) {
        const visible = [description, personality].map(item => this._clean(item, 120)).filter(Boolean).join('；');
        return visible ? visible.slice(0, 120) : '尚未形成可靠公开印象';
    },

    _limitedList(value, limit = 4, itemLimit = 120, fallback = []) {
        const source = Array.isArray(value) ? value : String(value || '').split(/[,，、;；\n]/);
        const list = source
            .map(item => this._clean(item, itemLimit))
            .filter(Boolean)
            .slice(0, limit);
        if (list.length > 0) return list;
        return (Array.isArray(fallback) ? fallback : []).slice(0, limit);
    },

    _clean(value, max) {
        return String(value || '').trim().replace(/[\[\]<>]/g, '').slice(0, max);
    },

    async handleExit(markup) {
        // markup格式: 角色名|原因
        const parts = String(markup || '').split('|');
        const name = parts[0];
        const reason = parts[1] || '离开了';

        const scene = State.scene;
        if (!scene) return;
        if (typeof WorldEngine === 'undefined' || !WorldEngine.removeCharacterFromScene) {
            console.warn('[NewCharacterHandler] WorldEngine.removeCharacterFromScene 不可用，跳过角色退场');
            if (typeof showToast !== 'undefined') showToast('角色退场系统不可用。');
            return;
        }

        const resolved = WorldEngine.resolveCharacterReference
            ? WorldEngine.resolveCharacterReference(scene, { characterName: name }, { withStatus: true, activeOnly: true })
            : null;
        if (resolved?.ambiguous) {
            if (typeof showToast !== 'undefined') showToast(`角色「${name}」不唯一，已跳过退场。`);
            return;
        }
        const char = resolved?.character || State.characters.find(c => c.name === name && scene.characters.includes(c.id));
        if (!char) return;

        const result = WorldEngine.removeCharacterFromScene(scene, char.id, { reason });
        if (!result.ok) {
            if (typeof showToast !== 'undefined') showToast(result.message || '角色未离开场景。');
            return;
        }
        await State.saveCurrentScene();

        // 发送退场消息（增量追加）
        const msg = {
            id: 'msg_' + Date.now(),
            role: 'assistant',
            content: `*${name}${reason}*`,
            type: 'narrate',
            visibility: typeof WorldEngine !== 'undefined'
                ? WorldEngine.createVisibility({ public: true })
                : undefined,
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
