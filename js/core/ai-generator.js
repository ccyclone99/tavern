/**
 * AI 生成公共模块
 * 抽取重复的 AI 调用 + JSON 解析逻辑
 */
const AIGenerator = {
    /**
     * 调用 AI 并提取 JSON 响应
     * @param {string} systemPrompt - 系统提示词
     * @param {string} userPrompt - 用户提示词
     * @param {Object} opts - 可选配置
     * @returns {Promise<Object>} 解析后的 JSON 对象
     */
    async call(systemPrompt, userPrompt, opts = {}) {
        const settings = State.settings;
        if (!settings.apiKey) {
            throw new Error('未设置 API Key');
        }

        const body = {
            model: settings.model || 'deepseek-v4-flash',
            messages: [
                { role: 'system', content: systemPrompt },
                { role: 'user', content: userPrompt }
            ],
            stream: false
        };

        const response = await API.fetchWithRetry('https://api.deepseek.com/chat/completions', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'Authorization': 'Bearer ' + settings.apiKey
            },
            body: JSON.stringify(body)
        });

        let result;
        try {
            result = await response.json();
        } catch (e) {
            throw new Error('API 返回非 JSON: ' + e.message);
        }
        const text = result.choices?.[0]?.message?.content || '';

        return this.parseJSON(text, opts.arrayMode);
    },

    /**
     * 从 AI 返回文本中提取第一个平衡的 JSON 对象或数组
     */
    _extractBalanced(text, openChar) {
        const closeChar = openChar === '{' ? '}' : ']';
        const start = text.indexOf(openChar);
        if (start === -1) return null;
        let depth = 0;
        let inString = false;
        let escape = false;
        for (let i = start; i < text.length; i++) {
            const ch = text[i];
            if (inString) {
                if (escape) {
                    escape = false;
                } else if (ch === '\\') {
                    escape = true;
                } else if (ch === '"') {
                    inString = false;
                }
            } else {
                if (ch === '"') {
                    inString = true;
                } else if (ch === openChar) {
                    depth++;
                } else if (ch === closeChar) {
                    depth--;
                    if (depth === 0) {
                        return text.slice(start, i + 1);
                    }
                }
            }
        }
        return null;
    },

    /**
     * 从 AI 返回文本中提取 JSON
     */
    parseJSON(text, arrayMode = false) {
        const openChar = arrayMode ? '[' : '{';
        const jsonStr = this._extractBalanced(text, openChar);
        if (!jsonStr) {
            throw new Error('AI 没有返回有效的 JSON');
        }
        return JSON.parse(jsonStr);
    },

    /**
     * 带按钮状态管理的便捷包装
     * @param {Object} opts
     * @param {string} opts.systemPrompt
     * @param {string} opts.userPrompt
     * @param {HTMLButtonElement} opts.button
     * @param {string} [opts.loadingText='生成中...']
     * @param {boolean} [opts.arrayMode=false]
     * @returns {Promise<Object>}
     */
    async generate(opts) {
        const { systemPrompt, userPrompt, button, loadingText = '生成中...', arrayMode = false } = opts;
        const originalText = button ? button.textContent : null;
        try {
            if (button) {
                button.disabled = true;
                button.textContent = loadingText;
            }
            return await this.call(systemPrompt, userPrompt, { arrayMode });
        } finally {
            if (button && originalText !== null) {
                button.disabled = false;
                button.textContent = originalText;
            }
        }
    }
};
