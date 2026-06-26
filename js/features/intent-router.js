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
        if (this.isReview(raw, normalized)) return { kind: 'review', text: raw, reason: 'review_command' };
        if (scene?.pendingCheck) return this._routePendingCheck(raw, normalized, scene);
        if (scene?.pendingAction) return this._routePendingAction(raw, normalized);
        const statAllocation = this.matchStatAllocation(raw);
        if (statAllocation) return { kind: 'allocate_stat_point', text: raw, meta: statAllocation, reason: 'direct_stat_allocation' };
        const move = this.matchLocationMove(raw, scene);
        if (move) return { kind: 'move_location', text: raw, meta: move, reason: 'natural_location_move' };
        const equipment = this.matchInventoryEquipment(raw, scene);
        if (equipment) return { kind: `${equipment.action}_inventory_item`, text: raw, meta: equipment, reason: `direct_${equipment.action}` };
        const sale = this.matchInventorySale(raw, scene);
        if (sale) return { kind: 'sell_inventory_item', text: raw, meta: sale, reason: 'direct_sell' };
        const itemUse = this.matchInventoryUse(raw, scene);
        if (itemUse) return { kind: 'use_inventory_item', text: raw, meta: itemUse, reason: 'direct_item_use' };
        if (this.isShopCatalog(raw, normalized)) return { kind: 'shop_catalog', text: raw, reason: 'shop_catalog' };
        const purchase = this.matchPurchase(raw);
        if (purchase) return { kind: 'buy_supply', text: raw, meta: purchase, reason: 'direct_purchase' };
        if (this.matchRest(raw, normalized)) return { kind: 'local_rest', text: raw, reason: 'direct_rest' };
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
        const isChallengeAction = !!action?.challengeContext;
        const isRisky = isChallengeAction || (type !== 'talk' && (
            forcePreviewTypes.includes(type) ||
            risk >= 35 ||
            hasRiskWord
        ));
        const currentCharacterId = scene?.currentCharacterId ||
            (typeof State !== 'undefined' ? State.currentCharacterId : '');
        return {
            kind: isRisky ? 'action' : type,
            actionType: type,
            confidence: isRisky ? 0.8 : (type === 'talk' ? 0.35 : 0.65),
            isRisky,
            needsPreview: isRisky,
            risk,
            reason: isRisky ? (isChallengeAction ? 'challenge_action' : 'risky_action') : `classified_${type}`,
            targetCharacterIds: currentCharacterId ? [currentCharacterId] : []
        };
    },

    isHelp(raw, normalized = this._normalize(raw)) {
        const questionOnly = /^[?？]+$/.test(String(raw || '').trim());
        if (questionOnly) return true;
        if (this._looksLikeInWorldQuestion(raw, normalized)) return false;

        const exactHelp = [
            '帮助', 'help', '我该做什么', '我该干什么', '我现在该做什么', '我现在该干什么',
            '现在该做什么', '现在该干什么', '接下来做什么', '接下来干什么',
            '下一步', '下一步做什么', '下一步干什么', '然后呢', '什么情况'
        ];
        if (exactHelp.includes(normalized)) return true;

        const helpPatterns = [
            '怎么玩', '怎么操作', '如何操作', '怎么使用', '如何使用',
            '怎么存档', '怎么读档', '怎么设置', '怎么掷骰', '如何掷骰',
            '什么是检定', '检定是什么', '这是什么检定', '怎么检定', 'api key'
        ];
        return helpPatterns.some(p => {
            const pattern = this._normalize(p);
            return pattern && normalized.includes(pattern);
        });
    },

    isReview(raw, normalized = this._normalize(raw)) {
        const exact = [
            '回顾', '冒险回顾', '通关记录', '失败记录', '冒险记录', '游戏记录',
            '看看回顾', '查看回顾', '看看通关记录', '查看通关记录',
            '看看失败记录', '查看失败记录'
        ].map(item => this._normalize(item));
        if (exact.includes(normalized)) return true;
        const reviewTerms = ['回顾', '通关记录', '失败记录', '冒险记录', '游戏记录'];
        const askTerms = ['看', '查看', '打开', '展示', '给我', '看看'];
        return reviewTerms.some(t => normalized.includes(this._normalize(t))) &&
            askTerms.some(t => normalized.includes(this._normalize(t)));
    },

    isStrategy(raw, normalized = this._normalize(raw)) {
        const patterns = ['计策', '计划', '规划', '打算', '谋划', '策略', '分几步', '嫁祸', '挑拨', '拉拢', '离间'];
        return patterns.some(p => normalized.includes(this._normalize(p))) &&
            !this._startsWithAny(normalized, ['执行', '确认', '取消', '掷骰']);
    },

    isShopCatalog(raw, normalized = this._normalize(raw)) {
        const exact = ['商店', '商城', '补给商店', '采购', '买东西', '购买', '买', '可以买什么', '能买什么', '有什么可以买'];
        if (exact.map(item => this._normalize(item)).includes(normalized)) return true;
        const hasShopWord = ['商店', '商品', '目录', '货架', '采购', '补给'].some(word => normalized.includes(this._normalize(word)));
        const hasAskWord = ['看', '查看', '打开', '显示', '列出', '有什么', '可以买', '能买', '买什么'].some(word => normalized.includes(this._normalize(word)));
        return hasShopWord && hasAskWord;
    },

    isOoc(raw, normalized = this._normalize(raw)) {
        return normalized.startsWith('/ooc') ||
            normalized.startsWith('ooc ') ||
            normalized.startsWith('ooc：') ||
            normalized.startsWith('系统 ') ||
            normalized.startsWith('系统：');
    },

    matchLocationMove(raw, scene) {
        const text = String(raw || '').trim();
        if (!scene || !Array.isArray(scene.locations) || scene.locations.length === 0) return null;
        const normalized = this._normalize(text);
        const movePrefixes = [
            '去', '前往', '移动到', '走到', '来到', '进入', '回到', '返回',
            '我去', '我要去', '我想去', '我前往', '我走到'
        ];
        if (!movePrefixes.some(p => normalized.startsWith(this._normalize(p)))) return null;

        const current = scene.locations.find(l => l.id === scene.currentLocation);
        const locs = scene.locations
            .filter(loc => loc && loc.id !== scene.currentLocation)
            .map(loc => ({
                id: loc.id,
                name: String(loc.name || ''),
                reachable: !current || (current.connections || []).includes(loc.id)
            }))
            .filter(loc => loc.name);

        const exact = locs.find(loc =>
            normalized === this._normalize(loc.name) ||
            normalized === this._normalize('去' + loc.name) ||
            normalized === this._normalize('我去' + loc.name) ||
            normalized === this._normalize('前往' + loc.name) ||
            normalized === this._normalize('回到' + loc.name)
        );
        const matched = exact || locs.find(loc => normalized.includes(this._normalize(loc.name)));
        if (!matched) return null;
        return { locationId: matched.id, locationName: matched.name, reachable: matched.reachable };
    },

    matchInventoryUse(raw, scene) {
        const text = String(raw || '').trim();
        if (!scene || !Array.isArray(scene.inventory) || scene.inventory.length === 0) return null;
        const normalized = this._normalize(text);
        const prefixes = ['使用', '用', '喝下', '吃下', '消耗'];
        if (!prefixes.some(p => normalized.startsWith(this._normalize(p)))) return null;
        const usable = scene.inventory
            .filter(item => item && item.name && typeof WorldEngine !== 'undefined' && WorldEngine.canUseInventoryItem?.(item))
            .sort((a, b) => String(b.name).length - String(a.name).length);
        const matched = usable.find(item => normalized.includes(this._normalize(item.name)));
        if (!matched) return null;
        return { itemId: matched.id || '', itemName: matched.name };
    },

    matchInventoryEquipment(raw, scene) {
        const text = String(raw || '').trim();
        if (!scene || !Array.isArray(scene.inventory) || scene.inventory.length === 0) return null;
        const normalized = this._normalize(text);
        const equipPrefixes = ['装备', '佩戴', '穿上', '拿起', '换上'];
        const unequipPrefixes = ['卸下', '脱下', '取下', '收起'];
        const wantsEquip = equipPrefixes.some(p => normalized.startsWith(this._normalize(p)));
        const wantsUnequip = unequipPrefixes.some(p => normalized.startsWith(this._normalize(p)));
        if (!wantsEquip && !wantsUnequip) return null;

        const candidates = scene.inventory
            .filter(item => item && item.name)
            .filter(item => {
                if (wantsUnequip) return item.equipped === true;
                return typeof WorldEngine !== 'undefined' && WorldEngine.canEquipInventoryItem?.(item);
            })
            .sort((a, b) => String(b.name).length - String(a.name).length);
        const matched = candidates.find(item => normalized.includes(this._normalize(item.name)));
        if (!matched) return null;
        return {
            action: wantsUnequip ? 'unequip' : 'equip',
            itemId: matched.id || '',
            itemName: matched.name
        };
    },

    matchInventorySale(raw, scene) {
        const text = String(raw || '').trim();
        if (!scene || !Array.isArray(scene.inventory) || scene.inventory.length === 0) return null;
        const normalized = this._normalize(text);
        const prefixes = ['出售', '卖掉', '卖出', '卖'];
        if (!prefixes.some(p => normalized.startsWith(this._normalize(p)))) return null;

        const candidates = scene.inventory
            .filter(item => item && item.name)
            .sort((a, b) => String(b.name).length - String(a.name).length);
        const matched = candidates.find(item => normalized.includes(this._normalize(item.name)));
        if (!matched) return null;
        const quantityMatch = normalized.match(/(?:出售|卖掉|卖出|卖)\s*(全部|全)?\s*(\d+)?/);
        const all = normalized.includes('全部') || normalized.includes('全卖');
        const quantity = quantityMatch && quantityMatch[2] ? Number(quantityMatch[2]) : 1;
        return {
            itemId: matched.id || '',
            itemName: matched.name,
            quantity: Number.isFinite(quantity) && quantity > 0 ? quantity : 1,
            all
        };
    },

    matchPurchase(raw) {
        const normalized = this._normalize(raw);
        const buyWords = ['买', '购买'];
        if (!buyWords.some(w => normalized.startsWith(this._normalize(w)))) return null;
        if (normalized.includes('医疗') || normalized.includes('治疗') || normalized.includes('药')) {
            return { supplyType: 'medical', label: '应急医疗包' };
        }
        if (normalized.includes('零件') || normalized.includes('修理') || normalized.includes('修复')) {
            return { supplyType: 'parts', label: '备用零件包' };
        }
        if (normalized.includes('扫描') || normalized.includes('探测') || normalized.includes('侦测')) {
            return { supplyType: 'scanner', label: '便携扫描仪' };
        }
        if (normalized.includes('护甲') || normalized.includes('防具') || normalized.includes('皮甲') || normalized.includes('铠甲') || normalized.includes('甲胄') || normalized.includes('盾')) {
            return { supplyType: 'armor', label: '轻型护甲' };
        }
        if (normalized.includes('武器') || normalized.includes('短剑') || normalized.includes('剑') || normalized.includes('刀') || normalized.includes('枪')) {
            return { supplyType: 'weapon', label: '短剑' };
        }
        if (normalized.includes('工具包') || normalized.includes('工具')) {
            return { supplyType: 'tool', label: '通用工具包' };
        }
        if (normalized.includes('补给') || normalized.includes('口粮') || normalized.includes('物资')) {
            return { supplyType: 'supply', label: '探索补给包' };
        }
        return null;
    },

    matchRest(raw, normalized = this._normalize(raw)) {
        const restCommands = [
            '休息', '休息一下', '短休', '睡觉', '睡一觉', '扎营', '扎营休息', '疗伤', '原地休息'
        ].map(item => this._normalize(item));
        return restCommands.includes(normalized);
    },

    matchStatAllocation(raw) {
        const text = String(raw || '').trim();
        if (!text) return null;
        const normalized = this._normalize(text)
            .replace(/\s+/g, '')
            .replace(/[＋]/g, '+');
        const statDefs = [
            { key: 'strength', label: '力量', aliases: ['力量', 'str', 'strength'] },
            { key: 'dexterity', label: '敏捷', aliases: ['敏捷', 'dex', 'dexterity'] },
            { key: 'constitution', label: '体质', aliases: ['体质', 'con', 'constitution'] },
            { key: 'intelligence', label: '智力', aliases: ['智力', 'int', 'intelligence'] },
            { key: 'wisdom', label: '感知', aliases: ['感知', 'wis', 'wisdom'] },
            { key: 'charisma', label: '魅力', aliases: ['魅力', 'cha', 'charisma'] }
        ];
        const matched = statDefs.find(def =>
            def.aliases.some(alias => normalized.includes(this._normalize(alias).replace(/\s+/g, '')))
        );
        if (!matched) return null;
        const statAliases = matched.aliases
            .map(alias => this._normalize(alias).replace(/\s+/g, ''))
            .filter(Boolean);
        const hasExplicitPointIntent = normalized.includes('属性点') || normalized.includes('加点') || normalized.includes('分配');
        const hasPlusOne = statAliases.some(alias => normalized.includes(`${alias}+1`) || normalized.includes(`+1${alias}`));
        const hasChineseVerb = statAliases.some(alias =>
            [`加一点${alias}`, `加1点${alias}`, `提升${alias}`, `提高${alias}`, `增加${alias}`, `升级${alias}`]
                .some(pattern => normalized.includes(pattern))
        );
        const hasPointTarget = statAliases.some(alias =>
            normalized.includes(`点到${alias}`) || normalized.includes(`到${alias}`) && hasExplicitPointIntent
        );
        if (!hasExplicitPointIntent && !hasPlusOne && !hasChineseVerb && !hasPointTarget) return null;
        return { stat: matched.key, label: matched.label };
    },

    buildHelpText(raw, scene) {
        const state = scene?.pendingCheck
            ? 'pending_check'
            : (scene?.pendingAction ? 'pending_action' : 'idle');
        if (state === 'pending_check') {
            const check = scene.pendingCheck;
            return `当前：等待你完成${check.statName || '属性'}检定。输入“投入资源名”选择物品或同伴协助，输入“不用资源名”取消投入，输入“掷骰”继续，或输入“取消”放弃这次检定。`;
        }
        if (state === 'pending_action') {
            const action = scene.pendingAction;
            return `当前：行动预览还没有进入剧情。你准备做的是“${action.intent || '这个行动'}”。输入“执行”确认，输入“取消”放弃，或直接输入新的动作来改写。`;
        }
        const normalized = this._normalize(raw);
        const ruleHelpPatterns = [
            '怎么玩', '怎么操作', '如何操作', '怎么使用', '如何使用',
            '怎么存档', '怎么读档', '怎么设置', '怎么掷骰', '如何掷骰',
            '什么是检定', '检定是什么', '这是什么检定', '怎么检定', 'api key'
        ].map(item => this._normalize(item));
        const wantsRuleHelp = ruleHelpPatterns.some(pattern => normalized.includes(pattern));
        if (wantsRuleHelp) return this._buildRuleHelpText(raw, scene);
        if (!wantsRuleHelp && typeof WorldEngine !== 'undefined' && WorldEngine.formatSoftMove) {
            const softMove = WorldEngine.formatSoftMove(scene, { reason: 'help' });
            if (softMove) return softMove;
        }
        const objective = this._currentObjective(scene);
        const actions = this._recommendedActions(scene);
        const actionText = actions.length > 0
            ? `\n可以尝试：\n${actions.map((a, i) => `${i + 1}. ${a}`).join('\n')}`
            : '';
        if (objective) {
            return `当前：${objective}。${actionText || '\n你可以直接输入想说的话、观察、询问、行动或“我想制定一个计划...”。有风险时我会先让你确认。'}`;
        }
        return actionText
            ? `你可以直接输入想说的话、观察、询问、行动或“我想制定一个计划...”。${actionText}`
            : '你可以直接输入想说的话、观察、询问、行动或“我想制定一个计划...”。有风险时我会先让你确认；需要骰子时系统会提示你掷骰。也可以输入“休息”“使用应急医疗包”“购买短剑”“购买护甲”“购买工具包”“购买扫描仪”“卖掉短剑”“加一点敏捷”。';
    },

    _buildRuleHelpText(raw, scene) {
        const normalized = this._normalize(raw);
        if (normalized.includes('检定') || normalized.includes('掷骰') || normalized.includes('roll')) {
            return '检定不是主动切换的功能。你只要描述想做的事；当行动有风险、推进主线、改变 NPC 立场或取得关键线索时，系统会先给行动预览或检定卡。检定卡出现后，可以输入“投入资源名”“不用资源名”“掷骰”或“取消”。';
        }
        if (normalized.includes('存档') || normalized.includes('读档')) {
            return '存档和读档在输入框旁边的按钮里；普通剧情里也可以继续输入行动，不需要切换模式。';
        }
        if (normalized.includes('设置') || normalized.includes('api key')) {
            return '设置入口在右上角齿轮。API Key 只用于你本地调用模型；剧情输入里不要粘贴密钥。';
        }
        return '直接在同一个输入框里写你想说的话、观察、询问、移动、行动或计划。系统会自动识别对话、行动预览、计策、帮助和 OOC；有风险时先让你确认，需要骰子时才会出现检定卡。';
    },

    _routePendingCheck(raw, normalized, scene) {
        if (this._isCancel(normalized)) return { kind: 'cancel_check', text: raw, reason: 'pending_check_cancel' };
        if (this._isRoll(normalized)) return { kind: 'roll_check', text: raw, reason: 'pending_check_roll' };
        if (this.isReview(raw, normalized)) return { kind: 'review', text: raw, reason: 'pending_check_review' };
        if (this.isHelp(raw, normalized)) return { kind: 'help', text: raw, reason: 'pending_check_help' };
        const resource = this.matchPendingCheckResource(raw, scene);
        if (resource) return { kind: 'check_resource', text: raw, meta: resource, reason: 'pending_check_resource' };
        return { kind: 'blocked_by_check', text: raw, reason: 'pending_check_blocks_text' };
    },

    matchPendingCheckResource(raw, scene) {
        const check = scene?.pendingCheck;
        if (!check) return null;
        const normalized = this._normalize(raw).replace(/\s+/g, '');
        if (!normalized) return null;
        const availableItems = typeof WorldEngine !== 'undefined' && WorldEngine.getAvailableCheckItems
            ? WorldEngine.getAvailableCheckItems(scene, check)
            : (check.availableItemModifiers || []);
        const availableCompanions = typeof WorldEngine !== 'undefined' && WorldEngine.getAvailableCompanionResources
            ? WorldEngine.getAvailableCompanionResources(scene, check)
            : (check.availableCompanionModifiers || []);
        const termsFor = modifier => {
            const rawTerms = [
                modifier.source,
                modifier.label,
                modifier.itemId,
                modifier.resourceId,
                ...(String(modifier.source || '').split(/[的：:()（）,，、\s]+/))
            ];
            return rawTerms
                .map(term => this._normalize(term).replace(/\s+/g, ''))
                .filter(term => term.length >= 2);
        };
        const candidates = [
            ...availableItems.map(modifier => ({ kind: 'item', modifier, terms: termsFor(modifier) })),
            ...availableCompanions.map(modifier => ({ kind: 'companion', modifier, terms: termsFor(modifier) }))
        ].sort((a, b) => String(b.modifier.source || '').length - String(a.modifier.source || '').length);
        const matched = candidates.find(candidate =>
            candidate.terms.some(term => normalized.includes(term))
        );
        if (!matched) return null;
        const deselectWords = ['不用', '不使用', '取消投入', '取消使用', '撤回', '移除', '去掉', '别用'];
        const selected = !deselectWords.some(word => normalized.includes(this._normalize(word).replace(/\s+/g, '')));
        return {
            resourceKind: matched.kind,
            resourceId: matched.modifier.id,
            source: matched.modifier.source || matched.modifier.label || '资源',
            selected
        };
    },

    _routePendingAction(raw, normalized) {
        if (this._isCancel(normalized)) return { kind: 'cancel_action', text: raw, reason: 'pending_action_cancel' };
        if (this._isConfirm(normalized)) return { kind: 'confirm_action', text: raw, reason: 'pending_action_confirm' };
        if (this.isReview(raw, normalized)) return { kind: 'review', text: raw, reason: 'pending_action_review' };
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

    _looksLikeInWorldQuestion(raw, normalized) {
        const text = String(raw || '').trim();
        if (text.includes('@')) return true;
        if (normalized.startsWith('请问') || normalized.startsWith('告诉我')) return false;
        const prefixes = [
            '我问', '我询问', '询问', '问', '向', '对', '跟', '和',
            '告诉', '请', '让', '要求', '试探', '打听'
        ];
        return prefixes.some(p => normalized.startsWith(this._normalize(p)));
    },

    _recommendedActions(scene) {
        const situation = scene && typeof WorldEngine !== 'undefined' && WorldEngine.getCurrentSituation
            ? WorldEngine.getCurrentSituation(scene)
            : null;
        const recommended = Array.isArray(situation?.recommendedActions)
            ? situation.recommendedActions
            : (Array.isArray(scene?.currentSituation?.recommendedActions) ? scene.currentSituation.recommendedActions : []);
        const guide = scene?.flowGuide || {};
        const fallback = Array.isArray(guide.stalledPrompts) ? guide.stalledPrompts : [];
        return [...recommended, ...fallback]
            .map(a => String(a || '').trim())
            .filter(Boolean)
            .filter((a, i, arr) => arr.indexOf(a) === i)
            .slice(0, 4);
    },

    _currentObjective(scene) {
        if (scene && typeof WorldEngine !== 'undefined' && WorldEngine.getActiveChallenge) {
            const challenge = WorldEngine.getActiveChallenge(scene);
            if (challenge) return `当前挑战：${challenge.title}${challenge.goal ? `。${challenge.goal}` : ''}`;
        }
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
