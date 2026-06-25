/**
 * 自然输入路由
 * 将同一个输入框里的文本分流为帮助、pending 操作、行动预览、计策或普通对话。
 */
const IntentRouter = {
    route(text, scene) {
        const raw = String(text || '').trim();
        const normalized = this._normalize(raw);
        if (!raw) return { kind: 'empty' };
        if (this.isOoc(raw, normalized)) return { kind: 'ooc', text: this._stripOoc(raw), reason: 'ooc_command' };
        if (scene?.pendingCheck) return this._routePendingCheck(raw, normalized);
        if (scene?.pendingAction) return this._routePendingAction(raw, normalized);
        if (this.isHelp(raw, normalized)) return { kind: 'help', text: raw, reason: 'help_question' };
        if (this.isStrategy(raw, normalized)) return { kind: 'strategy', text: raw, reason: 'strategy_intent' };

        const action = this.classifyAction(raw, scene);
        if (action.isRisky) {
            return { kind: 'action_preview', text: raw, meta: action, reason: action.reason };
        }
        return { kind: 'talk', text: raw, meta: action, reason: 'default_talk' };
    },

    classifyAction(text, scene) {
        const action = typeof ActionPlanner !== 'undefined'
            ? ActionPlanner.create(scene, text)
            : null;
        const type = action?.type || 'talk';
        const risk = Number(action?.risk || 0);
        const forcePreviewTypes = ['combat', 'force', 'sneak', 'lie', 'threaten'];
        const contextualRiskWords = ['偷', '抢', '攻击', '威胁', '骗', '潜入', '撬锁', '藏', '打翻', '破坏', '杀', '开枪'];
        const textLower = String(text || '').toLowerCase();
        const hasRiskWord = contextualRiskWords.some(w => textLower.includes(w.toLowerCase()));
        const isRisky = type !== 'talk' && (
            forcePreviewTypes.includes(type) ||
            risk >= 35 ||
            hasRiskWord
        );
        const currentCharacterId = scene?.currentCharacterId ||
            (typeof State !== 'undefined' ? State.currentCharacterId : '');
        return {
            kind: isRisky ? 'action' : type,
            actionType: type,
            confidence: isRisky ? 0.8 : (type === 'talk' ? 0.35 : 0.65),
            isRisky,
            needsPreview: isRisky,
            risk,
            reason: isRisky ? 'risky_action' : `classified_${type}`,
            targetCharacterIds: currentCharacterId ? [currentCharacterId] : []
        };
    },

    isHelp(raw, normalized = this._normalize(raw)) {
        const helpPatterns = [
            '怎么搞', '怎么做', '怎么操作', '什么情况', '然后呢', '我现在该干什么',
            '该干什么', '下一步', '怎么玩', '什么意思', '是什么', '干嘛用',
            '如何', '帮助', '检定', 'help'
        ];
        const questionOnly = /^[?？]+$/.test(String(raw || '').trim());
        return questionOnly || helpPatterns.some(p => {
            const pattern = this._normalize(p);
            return pattern && normalized.includes(pattern);
        });
    },

    isStrategy(raw, normalized = this._normalize(raw)) {
        const patterns = ['计策', '计划', '规划', '打算', '谋划', '策略', '分几步', '嫁祸', '挑拨', '拉拢', '离间'];
        return patterns.some(p => normalized.includes(this._normalize(p))) &&
            !this._startsWithAny(normalized, ['执行', '确认', '取消', '掷骰']);
    },

    isOoc(raw, normalized = this._normalize(raw)) {
        return normalized.startsWith('/ooc') ||
            normalized.startsWith('ooc ') ||
            normalized.startsWith('ooc：') ||
            normalized.startsWith('系统 ') ||
            normalized.startsWith('系统：');
    },

    buildHelpText(raw, scene) {
        const state = scene?.pendingCheck
            ? 'pending_check'
            : (scene?.pendingAction ? 'pending_action' : 'idle');
        if (state === 'pending_check') {
            const check = scene.pendingCheck;
            return `当前：等待你完成${check.statName || '属性'}检定。输入“掷骰”继续，或输入“取消”放弃这次检定。`;
        }
        if (state === 'pending_action') {
            const action = scene.pendingAction;
            return `当前：行动预览还没有进入剧情。你准备做的是“${action.intent || '这个行动'}”。输入“执行”确认，输入“取消”放弃，或直接输入新的动作来改写。`;
        }
        const objective = this._currentObjective(scene);
        return objective
            ? `当前：${objective}。你可以直接输入想说的话、观察、询问、行动或“我想制定一个计划...”。有风险时我会先让你确认。`
            : '你可以直接输入想说的话、观察、询问、行动或“我想制定一个计划...”。有风险时我会先让你确认；需要骰子时系统会提示你掷骰。';
    },

    _routePendingCheck(raw, normalized) {
        if (this._isCancel(normalized)) return { kind: 'cancel_check', text: raw, reason: 'pending_check_cancel' };
        if (this._isRoll(normalized)) return { kind: 'roll_check', text: raw, reason: 'pending_check_roll' };
        if (this.isHelp(raw, normalized)) return { kind: 'help', text: raw, reason: 'pending_check_help' };
        return { kind: 'blocked_by_check', text: raw, reason: 'pending_check_blocks_text' };
    },

    _routePendingAction(raw, normalized) {
        if (this._isCancel(normalized)) return { kind: 'cancel_action', text: raw, reason: 'pending_action_cancel' };
        if (this._isConfirm(normalized)) return { kind: 'confirm_action', text: raw, reason: 'pending_action_confirm' };
        if (this.isHelp(raw, normalized) || normalized.includes('为什么')) {
            return { kind: 'explain_action', text: raw, reason: 'pending_action_explain' };
        }
        const rewritten = this._stripRewritePrefix(raw);
        return { kind: 'rewrite_action', text: rewritten, reason: 'pending_action_rewrite' };
    },

    _stripOoc(raw) {
        return raw.replace(/^\/ooc\s*/i, '').replace(/^ooc[：:\s]*/i, '').replace(/^系统[：:\s]*/, '').trim() || raw;
    },

    _stripRewritePrefix(raw) {
        return raw
            .replace(/^(改成|换成|不是[，,]?\s*我想|我想改成|改为|换为)[：:\s]*/i, '')
            .trim() || raw;
    },

    _isConfirm(normalized) {
        return ['执行', '确认', '开始', '继续', '就这样', '行动', '做', '提交'].includes(normalized);
    },

    _isCancel(normalized) {
        return ['取消', '算了', '不做了', '放弃', '撤销', '不要了'].includes(normalized);
    },

    _isRoll(normalized) {
        return ['掷骰', '骰', '投骰', 'roll', 'roll dice', '开始', '继续'].includes(normalized);
    },

    _startsWithAny(text, prefixes) {
        return prefixes.some(p => text.startsWith(this._normalize(p)));
    },

    _currentObjective(scene) {
        const quest = (scene?.quests || []).find(q => q.status !== 'completed');
        const obj = quest?.objectives?.find(o => !o.completed);
        if (obj?.text) return `当前目标：${obj.text}`;
        const situation = scene?.currentSituation || {};
        if (situation.summary) return situation.summary;
        if (situation.mainObjective) return `当前目标：${situation.mainObjective}`;
        return '';
    },

    _normalize(text) {
        return String(text || '')
            .trim()
            .replace(/[。！？!?.，,；;：:、\s]+$/g, '')
            .replace(/\s+/g, ' ')
            .toLowerCase();
    }
};
