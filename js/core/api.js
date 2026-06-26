/**
 * DeepSeek API 通信层
 * 复用现有 SSE 流式逻辑
 */
const API_URL = 'https://api.deepseek.com/chat/completions';

const API = {
    abortController: null,

    async fetchWithRetry(url, options, maxRetries = 2) {
        const NON_RETRYABLE = [400, 401, 402, 403, 404]; // 不可重试的状态码
        let lastErr;
        for (let i = 0; i <= maxRetries; i++) {
            try {
                const res = await fetch(url, options);
                if (res.ok) return res;
                // 429 限流：重试
                if (res.status === 429 && i < maxRetries) {
                    await this.delay(1000 * (i + 1));
                    continue;
                }
                // 不可重试的状态码：直接抛出
                if (NON_RETRYABLE.includes(res.status)) {
                    const errText = await res.text().catch(() => res.statusText);
                    throw new Error('HTTP ' + res.status + ': ' + errText);
                }
                // 其他服务端错误（5xx）：重试
                if (i < maxRetries) {
                    await this.delay(1000 * (i + 1));
                    continue;
                }
                const errText = await res.text().catch(() => res.statusText);
                throw new Error('HTTP ' + res.status + ': ' + errText);
            } catch (err) {
                if (err.name === 'AbortError') throw err;
                // 如果已经是我们抛出的 HTTP 错误（不可重试），直接抛出
                if (err.message && err.message.startsWith('HTTP ') && NON_RETRYABLE.some(code => err.message.includes('HTTP ' + code))) {
                    throw err;
                }
                lastErr = err;
                if (i < maxRetries) await this.delay(1000 * (i + 1));
            }
        }
        throw lastErr;
    },

    delay(ms) { return new Promise(r => setTimeout(r, ms)); },

    getErrorInfo(err) {
        const msg = err.message || '';
        if (msg.includes('401')) return { code: 401, message: 'API Key 无效，请检查设置' };
        if (msg.includes('429')) return { code: 429, message: '请求太频繁，请稍后再试' };
        if (msg.includes('402')) return { code: 402, message: '账户余额不足' };
        if (msg.includes('403')) return { code: 403, message: '无权访问，请检查 API Key' };
        if (msg.includes('500') || msg.includes('502') || msg.includes('503')) return { code: 500, message: 'DeepSeek 服务异常，请稍后再试' };
        return { code: 0, message: '请求失败: ' + msg };
    },

    stop() {
        if (this.abortController) {
            this.abortController.abort();
            this.abortController = null;
        }
    },

    /**
     * 流式请求
     * @param {Object} body - 请求体
     * @param {Function} onToken - 每次收到token的回调 (content, reasoningContent)
     * @param {Function} onUsage - 收到usage时的回调
     * @returns {Promise<{content, reasoningContent, usage}>}
     */
    async stream(body, onToken, onUsage) {
        if (this.abortController) {
            throw new Error('已有进行中的流式请求');
        }
        this.abortController = new AbortController();
        try {
            const settings = await Storage.getSettings();
            const apiKey = settings.apiKey || '';
            if (!apiKey) throw new Error('未设置 API Key');

            const response = await this.fetchWithRetry(API_URL, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + apiKey },
                body: JSON.stringify(body),
                signal: this.abortController.signal
            });

            if (!response.body) throw new Error('响应体为空');
            const reader = response.body.getReader();
            const decoder = new TextDecoder();
            let content = '';
            let reasoningContent = '';
            let usage = null;
            let sseBuffer = '';
            const thinkParser = { buffer: '', inThink: false, thinkContent: '', outsideContent: '' };

            function flushThink() {
                if (thinkParser.buffer) {
                    if (thinkParser.inThink) thinkParser.thinkContent += thinkParser.buffer;
                    else thinkParser.outsideContent += thinkParser.buffer;
                    thinkParser.buffer = '';
                }
            }

            function processLegacyThink(token) {
                thinkParser.buffer += token;
                if (!thinkParser.inThink) {
                    const idx = thinkParser.buffer.indexOf('<think>');
                    if (idx !== -1) {
                        thinkParser.outsideContent += thinkParser.buffer.slice(0, idx);
                        thinkParser.buffer = thinkParser.buffer.slice(idx + 7);
                        thinkParser.inThink = true;
                    } else {
                        const keep = Math.min(7, thinkParser.buffer.length);
                        thinkParser.outsideContent += thinkParser.buffer.slice(0, -keep);
                        thinkParser.buffer = thinkParser.buffer.slice(-keep);
                    }
                }
                if (thinkParser.inThink) {
                    const idx = thinkParser.buffer.indexOf('</think>');
                    if (idx !== -1) {
                        thinkParser.thinkContent += thinkParser.buffer.slice(0, idx);
                        thinkParser.buffer = thinkParser.buffer.slice(idx + 8);
                        thinkParser.inThink = false;
                    } else {
                        const keep = Math.min(8, thinkParser.buffer.length);
                        thinkParser.thinkContent += thinkParser.buffer.slice(0, -keep);
                        thinkParser.buffer = thinkParser.buffer.slice(-keep);
                    }
                }
            }

            function processSseLine(line) {
                if (!line.startsWith('data: ')) return;
                const ds = line.slice(6).trim();
                if (!ds || ds === '[DONE]') return;
                try {
                    const p = JSON.parse(ds);
                    const delta = p.choices?.[0]?.delta;
                    if (delta?.reasoning_content) {
                        reasoningContent += delta.reasoning_content;
                    }
                    if (delta?.content) {
                        processLegacyThink(delta.content);
                        content = thinkParser.outsideContent;
                    }
                    if (p.usage) usage = p.usage;
                    if (onToken) onToken(content, reasoningContent);
                    if (usage && onUsage) onUsage(usage);
                } catch (e) {
                    console.warn('SSE 行解析失败:', line, e);
                }
            }

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;
                const chunk = decoder.decode(value, { stream: true });
                sseBuffer += chunk;
                const lines = sseBuffer.split(/\r?\n/);
                sseBuffer = lines.pop() || '';
                lines.forEach(processSseLine);
            }
            if (sseBuffer.trim()) processSseLine(sseBuffer.trim());

            flushThink();
            // 把 legacy <think> 内容合并到 reasoningContent，供 UI 展示
            if (thinkParser.thinkContent) {
                reasoningContent = (reasoningContent ? reasoningContent + '\n' : '') + thinkParser.thinkContent;
            }
            return { content: thinkParser.outsideContent, reasoningContent, usage };
        } finally {
            this.abortController = null;
        }
    }
};
