/**
 * 关系进度 / 好感度 / 情绪系统
 */
const Relationship = {
    /**
     * 初始化角色对玩家的关系记录
     */
    initRelation(characterId, userName) {
        const char = State.characters.find(c => c.id === characterId);
        if (!char) return;
        if (!char._relations) char._relations = {};
        if (!char._relations[userName]) {
            char._relations[userName] = {
                affection: 0,
                trust: 0,
                suspicion: 0,
                mood: '平静',
                history: []
            };
        }
    },

    /**
     * 更新关系（基于LLM分析）
     * 让LLM在回复后输出一个隐藏JSON来更新状态
     */
    async analyzeAndUpdate(characterId, messages) {
        const char = State.characters.find(c => c.id === characterId);
        if (!char) return;
        const userName = State.scene?.userName || '旅人';
        this.initRelation(characterId, userName);
        const relation = char._relations[userName];

        const safeCharName = typeof PromptBuilder !== 'undefined' && PromptBuilder._sanitizeName
            ? PromptBuilder._sanitizeName(char.name)
            : String(char.name || '角色').replace(/["\\\n\r]/g, '').slice(0, 32);
        const safeUserName = typeof PromptBuilder !== 'undefined' && PromptBuilder._sanitizeName
            ? PromptBuilder._sanitizeName(userName)
            : String(userName).replace(/["\\\n\r]/g, '').slice(0, 32);

        // 获取最近几条消息作为上下文
        const recent = messages.slice(-6).map(m => {
            const name = m.role === 'user' ? safeUserName : (State.characters.find(c => c.id === m.characterId)?.name || 'AI');
            return `${name}: ${m.content}`;
        }).join('\n');

        const prompt = `基于以下对话，分析 ${safeCharName} 对 ${safeUserName} 的关系变化。只输出一个JSON对象，不要有任何其他文字：

${recent}

当前好感度: ${relation.affection}/100
当前情绪: ${relation.mood}

请输出格式：
{"affection_delta": 数值(-10到10), "mood": "情绪标签(如开心/生气/害羞/平静)", "reason": "一句话原因"}`;

        try {
            const settings = State.settings;
            const body = {
                model: settings.model || 'deepseek-v4-flash',
                messages: [{ role: 'system', content: '你是一个关系分析助手。' }, { role: 'user', content: prompt }],
                stream: false
            };
            const response = await API.fetchWithRetry('https://api.deepseek.com/chat/completions', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + settings.apiKey },
                body: JSON.stringify(body)
            });
            const result = await response.json();
            const text = result.choices?.[0]?.message?.content || '';

            // 提取JSON（支持嵌套对象）
            const jsonStr = typeof AIGenerator !== 'undefined' && AIGenerator._extractBalanced
                ? AIGenerator._extractBalanced(text, '{')
                : (text.match(/\{[\s\S]*?\}/) || [null])[0];
            if (jsonStr) {
                const data = JSON.parse(jsonStr);
                if (data.affection_delta !== undefined) {
                    relation.affection = Math.max(-100, Math.min(100, relation.affection + data.affection_delta));
                }
                if (data.mood) relation.mood = data.mood;
                relation.history.push({
                    timestamp: Date.now(),
                    delta: data.affection_delta || 0,
                    mood: data.mood,
                    reason: data.reason || ''
                });
                await Storage.saveCharacter(char);
                State.emit('charactersChanged', State.characters);

                // 好感度变化反馈：插入 system 消息 + toast
                const delta = data.affection_delta || 0;
                if (delta !== 0) {
                    const arrow = delta > 0 ? '↑' : '↓';
                    const moodTxt = data.mood ? ` · ${data.mood}` : '';
                    const reasonTxt = data.reason ? `（${data.reason}）` : '';
                    const scene = State.scene;
                    if (scene) {
                        const msg = {
                            id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                            role: 'assistant',
                            content: `${char.name} 好感 ${arrow} ${delta > 0 ? '+' : ''}${delta}${moodTxt} ${reasonTxt}`,
                            type: 'system',
                            timestamp: Date.now()
                        };
                        scene.messages.push(msg);
                        if (typeof ChatUI !== 'undefined' && ChatUI.onMessageAdded) ChatUI.onMessageAdded(msg);
                        State.saveCurrentSceneDebounced().catch(e => console.warn('关系消息保存失败:', e));
                    }
                    showToast(`${char.name} 好感${arrow}${delta > 0 ? '+' : ''}${delta}`);
                }
            }
        } catch (e) {
            console.error('关系分析失败:', e);
        }
    },

    /**
     * 简单的规则引擎更新（作为LLM分析失败时的fallback）
     */
    ruleBasedUpdate(characterId, messageContent) {
        const char = State.characters.find(c => c.id === characterId);
        if (!char) return;
        const userName = State.scene?.userName || '旅人';
        this.initRelation(characterId, userName);
        const relation = char._relations[userName];

        const text = messageContent.toLowerCase();
        let delta = 0;
        let mood = relation.mood;

        const positiveWords = ['谢谢', '感谢', '喜欢', '可爱', '漂亮', '聪明', '厉害', '棒', '好', '爱', '抱', '亲'];
        const negativeWords = ['滚', '讨厌', '恶心', '去死', '烦', '蠢', '丑', '坏', '恨', '打', '杀'];

        for (const w of positiveWords) {
            if (text.includes(w)) delta += 2;
        }
        for (const w of negativeWords) {
            if (text.includes(w)) delta -= 3;
        }

        if (delta > 5) mood = '开心';
        else if (delta < -5) mood = '生气';
        else if (text.includes('羞') || text.includes('脸红')) mood = '害羞';

        if (delta !== 0) {
            relation.affection = Math.max(-100, Math.min(100, relation.affection + delta));
            relation.mood = mood;
            relation.history.push({ timestamp: Date.now(), delta, mood, reason: '规则引擎' });
            try {
                Storage.saveCharacter(char).then(() => {
                    State.emit('charactersChanged', State.characters);
                }).catch(e => console.warn('关系保存失败:', e));
            } catch (e) {
                console.warn('关系保存失败:', e);
            }
        }
    }
};
