/**
 * 行动预览器
 * 在玩家确认前，本地估算行动类型、建议检定和失败风险。
 */
const ActionPlanner = {
    statLabels: {
        strength: '力量',
        dexterity: '敏捷',
        constitution: '体质',
        intelligence: '智力',
        wisdom: '感知',
        charisma: '魅力'
    },

    typeLabels: {
        talk: '交谈',
        observe: '观察',
        ask: '询问',
        probe: '试探',
        lie: '欺骗',
        threaten: '威胁',
        persuade: '说服',
        investigate: '调查',
        sneak: '潜行',
        force: '强行动作',
        combat: '战斗',
        trade: '交易',
        use_item: '使用物品',
        rest: '休息'
    },

    profiles: [
        { type: 'combat', stat: 'strength', baseRisk: 72, baseDc: 17, keywords: ['攻击', '打倒', '杀', '砍', '射击', '开枪', '制服', '决斗', '战斗'] },
        { type: 'force', stat: 'strength', baseRisk: 58, baseDc: 16, keywords: ['撞开', '砸开', '破门', '推开', '掰开', '拖住', '夺走', '抢'] },
        { type: 'sneak', stat: 'dexterity', baseRisk: 55, baseDc: 15, keywords: ['潜入', '偷偷', '偷', '撬锁', '开锁', '解锁', '躲开', '绕过', '跟踪', '藏', '溜进'] },
        { type: 'lie', stat: 'charisma', baseRisk: 52, baseDc: 15, keywords: ['撒谎', '骗', '伪装', '冒充', '编造', '欺骗'] },
        { type: 'threaten', stat: 'charisma', baseRisk: 60, baseDc: 16, keywords: ['威胁', '恐吓', '逼问', '胁迫', '勒索'] },
        { type: 'persuade', stat: 'charisma', baseRisk: 42, baseDc: 14, keywords: ['说服', '劝', '谈判', '请求', '拉拢', '安抚', '讨价还价'] },
        { type: 'probe', stat: 'wisdom', baseRisk: 38, baseDc: 14, keywords: ['试探', '套话', '旁敲侧击', '引诱他说', '观察反应'] },
        { type: 'investigate', stat: 'intelligence', baseRisk: 36, baseDc: 14, keywords: ['调查', '研究', '分析', '破解', '解读', '查资料', '搜查', '翻找'] },
        { type: 'observe', stat: 'wisdom', baseRisk: 26, baseDc: 13, keywords: ['观察', '察看', '查看', '留意', '倾听', '嗅', '感知'] },
        { type: 'ask', stat: 'charisma', baseRisk: 20, baseDc: 12, keywords: ['询问', '问问', '打听', '请教'] },
        { type: 'trade', stat: 'charisma', baseRisk: 24, baseDc: 12, keywords: ['交易', '购买', '出售', '交换', '买', '卖'] },
        { type: 'use_item', stat: 'intelligence', baseRisk: 30, baseDc: 13, keywords: ['使用', '拿出', '装备', '点燃', '喝下', '打开道具'] },
        { type: 'rest', stat: 'constitution', baseRisk: 12, baseDc: 10, keywords: ['休息', '睡觉', '扎营', '疗伤', '恢复'] }
    ],

    create(scene, intent) {
        const text = String(intent || '').trim().slice(0, 800);
        const profile = this._classify(text);
        const modifiers = this._buildModifiers(scene, profile, text);
        const riskDelta = modifiers.reduce((sum, m) => sum + (m.riskDelta || 0), 0);
        const dcDelta = modifiers.reduce((sum, m) => sum + (m.dcDelta || 0), 0);
        const risk = this._clamp(profile.baseRisk + riskDelta, 5, 95);
        const dc = this._clamp(profile.baseDc + dcDelta + (risk >= 75 ? 2 : risk <= 25 ? -1 : 0), 8, 25);
        const needsCheck = risk >= 20 || profile.type !== 'talk';

        return {
            id: 'action_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            status: 'preview',
            type: profile.type,
            typeLabel: this.typeLabels[profile.type] || '行动',
            intent: text,
            risk,
            riskLevel: this._riskLevel(risk),
            suggestedCheck: needsCheck ? {
                stat: profile.stat,
                statName: this.statLabels[profile.stat] || profile.stat,
                dc
            } : null,
            modifiers,
            risks: this._risksFor(profile.type, risk),
            stakes: this._stakesFor(profile.type, risk),
            createdAt: Date.now()
        };
    },

    formatForPrompt(action) {
        if (!action) return '';
        const check = action.suggestedCheck
            ? `${action.suggestedCheck.statName}|DC${action.suggestedCheck.dc}`
            : '无强制检定，若 NPC 或环境抗拒再要求检定';
        const modifiers = (action.modifiers || []).length > 0
            ? action.modifiers.map(m => `- ${m.source}：${m.label}`).join('\n')
            : '- 无明显本地修正';
        const risks = (action.risks || []).map(r => `- ${r}`).join('\n') || '- 风险较低';
        return `目标：${action.intent}
行动类型：${action.typeLabel || action.type}
风险预览：${action.risk}%（${action.riskLevel}）
建议检定：${check}
风险来源：
${modifiers}
失败推进：
${risks}
玩家已确认承担风险。请按公正 DM 规则结算：可以要求 [check:属性|DC]，也可以让 NPC 提出条件、代价或局势变化；失败时必须推进剧情，而不是简单阻断。`;
    },

    _classify(text) {
        const lower = text.toLowerCase();
        return this.profiles.find(p => p.keywords.some(k => lower.includes(k.toLowerCase()))) || {
            type: 'talk',
            stat: 'charisma',
            baseRisk: 14,
            baseDc: 10,
            keywords: []
        };
    },

    _buildModifiers(scene, profile, intent = '') {
        const modifiers = [];
        const stats = scene?.playerStats || {};
        const statVal = stats[profile.stat] || 10;
        const statMod = Math.floor((statVal - 10) / 2);
        if (statMod >= 2) {
            modifiers.push({ source: `${this.statLabels[profile.stat]}优势`, label: `风险 -${statMod * 4}`, riskDelta: -statMod * 4, dcDelta: -1 });
        } else if (statMod <= -1) {
            modifiers.push({ source: `${this.statLabels[profile.stat]}短板`, label: `风险 +${Math.abs(statMod) * 5}`, riskDelta: Math.abs(statMod) * 5, dcDelta: 1 });
        }

        const knowledge = scene?.knowledge?.discoveries || [];
        const confirmedKnowledge = knowledge.filter(k => k.reliability === 'confirmed' || k.level === 'evidence' || k.level === 'truth');
        if (confirmedKnowledge.length > 0 && ['persuade', 'probe', 'lie', 'threaten', 'investigate'].includes(profile.type)) {
            const value = Math.min(12, confirmedKnowledge.length * 3);
            modifiers.push({ source: '可用已确认线索', label: `风险 -${value}`, riskDelta: -value, dcDelta: -1 });
        }

        const currentCharacterId = State.currentCharacterId;
        const char = currentCharacterId ? State.characters.find(c => c.id === currentCharacterId) : null;
        const relation = char?._relations?.[scene?.userName || '旅人'];
        if (relation && ['persuade', 'probe', 'lie', 'threaten', 'ask', 'trade'].includes(profile.type)) {
            const trust = relation.trust || 0;
            const suspicion = relation.suspicion || 0;
            if (trust >= 25) modifiers.push({ source: `${char.name}信任`, label: '风险 -8', riskDelta: -8, dcDelta: -1 });
            if (suspicion >= 30) modifiers.push({ source: `${char.name}警觉`, label: '风险 +10', riskDelta: 10, dcDelta: 1 });
        }

        const loc = (scene?.locations || []).find(l => l.id === scene.currentLocation);
        if (loc && Number(loc.alertLevel) > 0) {
            const value = Math.min(18, Math.ceil(Number(loc.alertLevel) / 6));
            modifiers.push({ source: `${loc.name}警戒`, label: `风险 +${value}`, riskDelta: value, dcDelta: value >= 10 ? 1 : 0 });
        }

        const tension = Number(scene?.worldTension || 0);
        if (tension > 0) {
            const value = Math.min(15, Math.ceil(tension / 10));
            modifiers.push({ source: '世界紧张度', label: `风险 +${value}`, riskDelta: value, dcDelta: value >= 10 ? 1 : 0 });
        }

        const hp = Number(scene?.playerHp ?? 10);
        const maxHp = Math.max(1, Number(scene?.playerMaxHp ?? 10));
        if (hp / maxHp < 0.3 && ['combat', 'force', 'sneak'].includes(profile.type)) {
            modifiers.push({ source: '生命值危急', label: '风险 +12', riskDelta: 12, dcDelta: 1 });
        }

        const equipment = scene?.equipment || {};
        if (profile.type === 'combat' && equipment.weapon) {
            modifiers.push({ source: `武器：${equipment.weapon}`, label: '风险 -6', riskDelta: -6, dcDelta: -1 });
        }
        if (['combat', 'force'].includes(profile.type) && equipment.armor) {
            modifiers.push({ source: `防具：${equipment.armor}`, label: '风险 -4', riskDelta: -4, dcDelta: 0 });
        }

        if (typeof WorldEngine !== 'undefined') {
            const itemEffects = WorldEngine.collectApplicableItemEffects(scene, {
                actionType: profile.type,
                stat: profile.stat,
                intent,
                includeUnequipped: false
            });
            itemEffects.forEach(({ item, effect }) => {
                if (effect.consume === true) return;
                if (effect.type === 'risk_delta') {
                    const value = Number(effect.value || 0);
                    modifiers.push({
                        source: `物品：${item.name}`,
                        label: `风险 ${value >= 0 ? '+' : ''}${value}`,
                        riskDelta: value,
                        dcDelta: 0
                    });
                } else if (effect.type === 'dc_delta') {
                    const value = Number(effect.value || 0);
                    modifiers.push({
                        source: `物品：${item.name}`,
                        label: `DC ${value >= 0 ? '+' : ''}${value}`,
                        riskDelta: value < 0 ? value * 3 : value * 3,
                        dcDelta: value
                    });
                } else if (effect.type === 'check_bonus') {
                    const value = Number(effect.value || 0);
                    modifiers.push({
                        source: `物品：${item.name}`,
                        label: `检定 ${value >= 0 ? '+' : ''}${value}`,
                        riskDelta: -Math.max(0, value) * 3,
                        dcDelta: value > 0 ? -1 : 0
                    });
                }
            });

            const counters = (scene?.counterStrategies || []).filter(c => c.status === 'active');
            if (counters.length > 0 && ['sneak', 'lie', 'threaten', 'persuade', 'probe', 'investigate'].includes(profile.type)) {
                const pressure = Math.min(14, counters.length * 4 + Math.ceil((counters[0].progress || 0) / 25));
                modifiers.push({ source: '敌方反制', label: `风险 +${pressure}`, riskDelta: pressure, dcDelta: pressure >= 10 ? 1 : 0 });
            }
        }

        return modifiers;
    },

    _riskLevel(risk) {
        if (risk >= 75) return '极高';
        if (risk >= 55) return '高';
        if (risk >= 35) return '中';
        if (risk >= 20) return '低';
        return '很低';
    },

    _risksFor(type, risk) {
        const map = {
            combat: ['受到伤害或被迫撤退', '目标或同伴警觉上升', '局势升级为公开冲突'],
            force: ['制造声响或留下痕迹', '损坏物品或触发警报', '失败后需要付出额外资源'],
            sneak: ['暴露位置', '目标转移或加强守卫', '留下可追踪线索'],
            lie: ['谎言被记住并等待验证', '目标警觉上升', '后续谈判 DC 提高'],
            threaten: ['关系恶化', '对方求援或反制', '获得信息但付出声誉代价'],
            persuade: ['对方提出条件', '需要交出筹码或人情', '失败后短期内更难说服'],
            probe: ['对方察觉你在套话', '只得到模糊或误导性线索', '触发反问'],
            investigate: ['消耗时间', '惊动相关人物', '得到不完整线索'],
            observe: ['错过时机', '只得到表层迹象'],
            ask: ['对方要求交换信息', '只给出片面回答'],
            trade: ['价格提高', '欠下人情或暴露需求'],
            use_item: ['物品消耗', '效果不完整或引发副作用'],
            rest: ['时间推进', '离屏事件恶化'],
            talk: ['对方态度产生轻微变化']
        };
        const risks = map[type] || map.talk;
        return risk >= 70 ? risks : risks.slice(0, Math.min(2, risks.length));
    },

    _stakesFor(type, risk) {
        const firstRisk = this._risksFor(type, risk)[0] || '局势发生变化';
        return risk >= 55 ? `失败很可能导致：${firstRisk}` : `失败可能导致：${firstRisk}`;
    },

    _clamp(value, min, max) {
        return Math.max(min, Math.min(max, Math.round(value)));
    }
};
