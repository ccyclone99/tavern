/**
 * RP 消息渲染器
 * 区分动作描写与对话，清晰展示角色扮演内容
 */
const Renderer = {
    // 动作/对话判定阈值（与 parseMessageType 共享）
    ACTION_THRESHOLD: 0.45,

    escapeHtml(text) {
        if (text == null) return '';
        const div = document.createElement('div');
        div.textContent = String(text);
        return div.innerHTML;
    },

    escapeAttr(text) {
        if (text == null) return '';
        return String(text)
            .replace(/&/g, '&amp;')
            .replace(/"/g, '&quot;')
            .replace(/'/g, '&#39;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;');
    },

    /**
     * 安全 URL 校验
     * 只允许 http、https、mailto、data:image/png、data:image/jpeg、data:image/webp、blob
     */
    safeUrl(url) {
        if (!url) return '';
        const str = String(url).trim();
        const lower = str.toLowerCase();
        if (lower.startsWith('http:') || lower.startsWith('https:') || lower.startsWith('mailto:')) return str;
        if (lower.startsWith('data:image/png') || lower.startsWith('data:image/jpeg') || lower.startsWith('data:image/webp')) return str;
        if (lower.startsWith('blob:')) return str;
        return '';
    },

    /**
     * 从文本中移除隐藏的 <state_update>...</state_update> 块
     */
    stripStateUpdate(text) {
        if (!text) return text;
        return String(text).replace(/<state_update>[\s\S]*?<\/state_update>/gi, '').trim();
    },

    /**
     * 应用行内格式（粗体 / 动作 / 删除线）
     * 必须先处理 **粗体**，再处理 *动作*，否则双星会被单星正则破坏
     */
    _applyInlineFormats(formatted) {
        formatted = formatted.replace(/\*\*([^*]+)\*\*/g, '<strong>$1</strong>');
        formatted = formatted.replace(/\*([^*]+)\*/g, '<span class="rp-action">$1</span>');
        formatted = formatted.replace(/~~([^~]+)~~/g, '<del>$1</del>');
        return formatted;
    },

    /**
     * 渲染完整消息内容，将动作/对话分隔为独立区块
     */
    renderRP(text) {
        if (!text) return '';

        // 保护代码块（先提取，防止被后续转义破坏）
        const codeBlocks = [];
        let processed = text.replace(/```(\w*)\n?([\s\S]*?)```/g, (match, lang, code) => {
            const idx = codeBlocks.length;
            codeBlocks.push({ lang, code: this.escapeHtml(code.trimEnd()) });
            return `\0CB_${idx}\0`;
        });

        // 保护行内代码
        const inlineCodes = [];
        processed = processed.replace(/`([^`]+)`/g, (match, code) => {
            const idx = inlineCodes.length;
            inlineCodes.push(this.escapeHtml(code));
            return `\0IC_${idx}\0`;
        });

        // 按段落分割，每个段落判断动作/对话倾向
        const paragraphs = processed.split('\n').filter(p => p.trim() !== '');
        const rendered = paragraphs.map(p => {
            const trimmed = p.trim();

            // 先转义 HTML 防止 XSS
            let formatted = this.escapeHtml(trimmed);

            // 计算 *...* 动作文本占比（在转义后的文本上计算，* 不被转义）
            const actionMatches = formatted.match(/\*[^*]+\*/g) || [];
            const actionLen = actionMatches.reduce((s, m) => s + m.length, 0);
            const isActionHeavy = actionLen > formatted.length * this.ACTION_THRESHOLD;

            // 应用行内格式（在已转义的文本上）
            formatted = this._applyInlineFormats(formatted);

            // 安全链接渲染：只允许 http/https/mailto 协议
            formatted = formatted.replace(/\[([^\]]+)\]\(([^)]+)\)/g, (match, text, url) => {
                const safeUrl = url.trim();
                const lower = safeUrl.toLowerCase();
                if (lower.startsWith('http:') || lower.startsWith('https:') || lower.startsWith('mailto:')) {
                    return `<a href="${this.escapeAttr(safeUrl)}" target="_blank" rel="noopener">${text}</a>`;
                }
                // 危险协议：只显示文本
                return text;
            });

            if (isActionHeavy) {
                return `<div class="rp-action-block">${formatted}</div>`;
            }
            return `<div class="rp-dialogue-block">${formatted}</div>`;
        });

        processed = rendered.join('');

        // 空消息兜底：仍应用行内格式
        if (!processed) {
            processed = text.split('\n').filter(p => p.trim()).map(p =>
                `<div class="rp-dialogue-block">${this._applyInlineFormats(this.escapeHtml(p.trim()))}</div>`
            ).join('');
        }

        // 恢复行内代码
        processed = processed.replace(/\0IC_(\d+)\0/g, (_, idx) =>
            `<code>${inlineCodes[+idx]}</code>`
        );

        // 恢复代码块
        processed = processed.replace(/\0CB_(\d+)\0/g, (_, idx) => {
            const block = codeBlocks[+idx];
            const safeLang = String(block.lang || '').replace(/[^a-zA-Z0-9_\-]/g, '').slice(0, 32);
            const cls = safeLang ? ` class="language-${Renderer.escapeAttr(safeLang)}"` : '';
            let hl = block.code;
            if (safeLang && window.hljs && window.hljs.getLanguage(safeLang)) {
                try { hl = window.hljs.highlight(block.code, { language: safeLang }).value; } catch(e) {}
            }
            return `<div class="code-block-wrap"><pre><code${cls}>${hl}</code></pre></div>`;
        });

        return processed;
    },

    /**
     * 提取消息类型和清理后的内容
     */
    parseMessageType(text) {
        if (!text) return { type: 'talk', content: '', emotion: null };

        // 提取情绪标签 [emotion:xxx]
        let emotion = null;
        const emoMatch = text.match(/\[emotion:([^\]]+)\]/);
        if (emoMatch) {
            emotion = emoMatch[1].trim().replace(/[^a-zA-Z0-9_\-\u4e00-\u9fa5]/g, '').slice(0, 32);
            if (!emotion) emotion = null;
            text = text.replace(/\[emotion:[^\]]+\]/g, '').trim();
        }

        // OOC 检测
        if (text.startsWith('/ooc') || text.startsWith('(OOC)') || text.startsWith('（OOC）')) {
            return { type: 'ooc', content: text.replace(/^\/ooc\s*/, '').replace(/^\(OOC\)\s*/, '').replace(/^（OOC）\s*/, ''), emotion };
        }

        // Strategy 检测
        if (text.startsWith('/strategy') || text.startsWith('（计策）')) {
            return { type: 'strategy', content: text.replace(/^\/strategy\s*/, '').replace(/^（计策）\s*/, ''), emotion };
        }

        // 旁白检测：以 ** 开头且以 ** 结尾（允许首尾空白）
        const trimmedText = text.trim();
        if (trimmedText.startsWith('**') && trimmedText.endsWith('**')) {
            return { type: 'narrate', content: trimmedText.slice(2, -2).trim(), emotion };
        }

        // 判断是否主要是动作（使用统一阈值）
        const actionMatches = text.match(/\*[^*]+\*/g) || [];
        const actionLen = actionMatches.reduce((sum, m) => sum + m.length, 0);
        if (actionLen > text.length * this.ACTION_THRESHOLD) {
            return { type: 'action', content: text, emotion };
        }

        return { type: 'talk', content: text, emotion };
    }
};
