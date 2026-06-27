/**
 * 玩家属性面板（只读展示）
 */
const ActionBar = {
    init() {
        this.el = document.getElementById('actionBar');
        if (!this.el) return;
        this.renderStatsDisplay();
        this.renderPendingAction();
        this.renderPendingCheck();
    },

    renderStatsDisplay() {
        const el = document.getElementById('statDisplay');
        if (!el) return;
        const scene = State.scene;
        const st = scene && scene.playerStats ? scene.playerStats : null;
        const m = v => v >= 10 ? `+${Math.floor((v-10)/2)}` : `${Math.floor((v-10)/2)}`;
        const stats = [
            { icon: 'str', val: st ? st.strength : 10, key: 'strength' },
            { icon: 'dex', val: st ? st.dexterity : 10, key: 'dexterity' },
            { icon: 'con', val: st ? st.constitution : 10, key: 'constitution' },
            { icon: 'int', val: st ? st.intelligence : 10, key: 'intelligence' },
            { icon: 'wis', val: st ? st.wisdom : 10, key: 'wisdom' },
            { icon: 'cha', val: st ? st.charisma : 10, key: 'charisma' }
        ];
        const statLabels = { strength: '力量', dexterity: '敏捷', constitution: '体质', intelligence: '智力', wisdom: '感知', charisma: '魅力' };
        el.innerHTML = stats.map(s =>
            `<span class="stat-chip" title="${Renderer.escapeAttr(statLabels[s.key] + ' ' + s.val)}">${Icons.get(s.icon, { size: 13 })}${s.val}(${m(s.val)})</span>`
        ).join('');
        this.renderVitaDisplay();
        this.renderPendingAction();
        this.renderPendingCheck();
    },

    /** 渲染 HP/金币/等级经验速览 */
    renderVitaDisplay() {
        const el = document.getElementById('vitaDisplay');
        if (!el) return;
        const scene = State.scene;
        if (!scene) { el.innerHTML = ''; return; }
        const hp = scene.playerHp ?? 10;
        const maxHp = scene.playerMaxHp ?? 10;
        const gold = scene.gold || 0;
        const level = scene.level || 1;
        const exp = scene.exp || 0;
        const expNeed = level * 100;
        const hpPct = Math.max(0, Math.min(100, (hp / Math.max(1, maxHp)) * 100));
        const hpCls = hpPct > 60 ? 'hp-high' : hpPct > 30 ? 'hp-mid' : 'hp-low';
        el.innerHTML = `
            <div class="vita-chip hp-chip ${hpCls}" title="生命值 ${hp}/${maxHp}">
                <span class="hp-num">${hp}<span class="hp-max">/${maxHp}</span></span>
                <div class="hp-bar"><div class="hp-bar-fill" style="width:${hpPct}%"></div></div>
            </div>
            <span class="vita-chip" title="金币">💰 ${gold}</span>
            <span class="vita-chip" title="等级 ${level}，经验 ${exp}/${expNeed}">Lv.${level} <span class="exp-mini">${exp}/${expNeed}</span></span>
        `;
    },

    renderPendingAction() {
        const el = document.getElementById('pendingActionPreview');
        if (!el) return;
        const scene = State.scene;
        const action = scene?.pendingAction;
        if (!action || !this._isScenePlaying(scene)) {
            el.classList.add('hidden');
            el.innerHTML = '';
            return;
        }

        const risk = Math.max(0, Math.min(100, Number(action.risk || 0)));
        const riskClass = risk >= 75 ? 'extreme' : risk >= 55 ? 'high' : risk >= 35 ? 'mid' : 'low';
        const checkHtml = action.suggestedCheck
            ? `${Renderer.escapeHtml(action.suggestedCheck.statName)} DC${Renderer.escapeHtml(action.suggestedCheck.dc)}`
            : '通常无需检定';
        const secondaryLabels = action.challengeContext?.secondaryApproachLabels || [];
        const secondaryHtml = secondaryLabels.length
            ? `<div class="pending-action-factor-row"><span class="pending-action-factor-label">同时尝试</span><div class="pending-action-factors">${secondaryLabels.slice(0, 3).map(label => `<span class="pending-action-factor pending-action-factor-neutral">${Renderer.escapeHtml(label)}</span>`).join('')}</div></div>`
            : '';
        const modifierChip = (m) => {
            const riskDelta = Number(m.riskDelta || 0);
            const dcDelta = Number(m.dcDelta || 0);
            const cls = riskDelta < 0 || dcDelta < 0
                ? 'pending-action-factor-good'
                : (riskDelta > 0 || dcDelta > 0 ? 'pending-action-factor-bad' : 'pending-action-factor-neutral');
            return `<span class="pending-action-factor ${cls}">${Renderer.escapeHtml(m.source)} ${Renderer.escapeHtml(m.label)}</span>`;
        };
        const positiveMods = (action.modifiers || []).filter(m => Number(m.riskDelta || 0) < 0 || Number(m.dcDelta || 0) < 0).slice(0, 4);
        const negativeMods = (action.modifiers || []).filter(m => Number(m.riskDelta || 0) > 0 || Number(m.dcDelta || 0) > 0).slice(0, 4);
        const neutralMods = (action.modifiers || []).filter(m => !positiveMods.includes(m) && !negativeMods.includes(m)).slice(0, 3);
        const positiveHtml = positiveMods.map(modifierChip).join('');
        const negativeHtml = negativeMods.map(modifierChip).join('');
        const neutralHtml = neutralMods.map(modifierChip).join('');
        const risksHtml = (action.risks || []).slice(0, 3).map(r =>
            `<li>${Renderer.escapeHtml(r)}</li>`
        ).join('');

        el.classList.remove('hidden');
        el.innerHTML = `
            <div class="pending-action-head">
                <div>
                    <div class="pending-action-kicker">行动预览</div>
                    <div class="pending-action-title">${Renderer.escapeHtml(action.intent)}</div>
                    <div class="pending-action-note">确认前不会写入剧情，也不会推进回合。</div>
                </div>
                <span class="pending-action-type">${Renderer.escapeHtml(action.typeLabel || action.type || '行动')}</span>
            </div>
            <div class="pending-action-grid">
                <div class="pending-action-metric">
                    <span>建议检定</span>
                    <strong>${checkHtml}</strong>
                </div>
                <div class="pending-action-metric">
                    <span>风险</span>
                    <strong>${risk}% · ${Renderer.escapeHtml(action.riskLevel || '')}</strong>
                    <div class="pending-risk-bar"><div class="pending-risk-fill ${riskClass}" style="width:${risk}%"></div></div>
                </div>
            </div>
            ${positiveHtml ? `<div class="pending-action-factor-row"><span class="pending-action-factor-label">优势</span><div class="pending-action-factors">${positiveHtml}</div></div>` : ''}
            ${negativeHtml ? `<div class="pending-action-factor-row"><span class="pending-action-factor-label">压力</span><div class="pending-action-factors">${negativeHtml}</div></div>` : ''}
            ${neutralHtml ? `<div class="pending-action-factor-row"><span class="pending-action-factor-label">其他</span><div class="pending-action-factors">${neutralHtml}</div></div>` : ''}
            ${secondaryHtml}
            ${!positiveHtml && !negativeHtml && !neutralHtml ? `<div class="pending-action-factor-row"><span class="pending-action-factor-label">修正</span><div class="pending-action-factors"><span class="pending-action-factor pending-action-factor-neutral">本地未发现显著修正</span></div></div>` : ''}
            ${risksHtml ? `<ul class="pending-action-risks">${risksHtml}</ul>` : ''}
            <div class="pending-action-actions">
                <button class="btn btn-primary" id="confirmPendingActionBtn" type="button">执行行动</button>
                <button class="btn btn-secondary" id="cancelPendingActionBtn" type="button">取消</button>
            </div>
        `;

        document.getElementById('confirmPendingActionBtn').onclick = () => ChatUI.confirmPendingAction();
        document.getElementById('cancelPendingActionBtn').onclick = () => ChatUI.cancelPendingAction();
    },

    renderPendingCheck() {
        const el = document.getElementById('pendingCheckPreview');
        if (!el) return;
        const scene = State.scene;
        const check = scene?.pendingCheck;
        if (!check || !this._isScenePlaying(scene)) {
            el.classList.add('hidden');
            el.innerHTML = '';
            return;
        }

        const totals = typeof WorldEngine !== 'undefined' && WorldEngine.getCheckTotals
            ? WorldEngine.getCheckTotals(scene, check)
            : {
                mod: Number.isFinite(Number(check.mod)) ? Number(check.mod) : 0,
                dc: Number.isFinite(Number(check.dc)) ? Number(check.dc) : 15,
                baseDc: Number.isFinite(Number(check.dc)) ? Number(check.dc) : 15,
                statMod: Number.isFinite(Number(check.statMod)) ? Number(check.statMod) : 0,
                itemBonus: Number(check.itemBonus || 0),
                bonus: 0,
                dcDelta: 0,
                modifiers: []
            };
        const mod = totals.mod;
        const dc = totals.dc;
        const sign = mod >= 0 ? `+${mod}` : String(mod);
        const statMod = totals.statMod;
        const itemBonus = Number(totals.itemBonus || 0);
        const passiveItemModifiers = Array.isArray(check.itemModifiers) && check.itemModifiers.length > 0
            ? check.itemModifiers
            : (Array.isArray(totals.itemModifiers) ? totals.itemModifiers.filter(m => !m.consume) : []);
        const itemModsHtml = passiveItemModifiers.slice(0, 4).map(m =>
            `<span class="pending-action-factor">${Renderer.escapeHtml(m.source)} ${Renderer.escapeHtml(m.label)}</span>`
        ).join('');
        const selectedItemIds = new Set(Array.isArray(check.selectedItemModifierIds) ? check.selectedItemModifierIds.map(String) : []);
        const selectedCompanionIds = new Set(Array.isArray(check.selectedCompanionResourceIds) ? check.selectedCompanionResourceIds.map(String) : []);
        const availableItems = typeof WorldEngine !== 'undefined' && WorldEngine.getAvailableCheckItems
            ? WorldEngine.getAvailableCheckItems(scene, check)
            : (check.availableItemModifiers || []);
        const availableCompanions = typeof WorldEngine !== 'undefined' && WorldEngine.getAvailableCompanionResources
            ? WorldEngine.getAvailableCompanionResources(scene, check)
            : (check.availableCompanionModifiers || []);
        const isResourceSelected = (modifier, selectedIds, available = []) => {
            if (modifier?.kind === 'item' && typeof WorldEngine !== 'undefined' && WorldEngine.isCheckItemModifierSelected) {
                return WorldEngine.isCheckItemModifierSelected(modifier, selectedIds, available);
            }
            if (!modifier) return false;
            if (selectedIds.has(String(modifier.id))) return true;
            if (Array.isArray(modifier.legacyIds) && modifier.legacyIds.some(id => selectedIds.has(String(id)))) return true;
            if (modifier.kind !== 'item') return false;
            const legacyRefs = [modifier.itemId, modifier.source].map(String).filter(Boolean);
            return [...selectedIds].some(id => legacyRefs.some(ref => id === `item:${ref}` || id.startsWith(`item:${ref}:`)));
        };
        const resourceOption = (m, kind, selected) => `
            <button class="pending-resource-option ${selected ? 'selected' : ''}" type="button"
                data-resource-kind="${Renderer.escapeAttr(kind)}"
                data-resource-id="${Renderer.escapeAttr(m.id)}"
                aria-pressed="${selected ? 'true' : 'false'}">
                <span class="pending-resource-name">${Renderer.escapeHtml(m.source)}</span>
                <span class="pending-resource-label">${Renderer.escapeHtml(m.label)}</span>
            </button>
        `;
        const availableItemsHtml = availableItems.slice(0, 5).map(m =>
            resourceOption(m, 'item', isResourceSelected(m, selectedItemIds, availableItems))
        ).join('');
        const availableCompanionsHtml = availableCompanions.slice(0, 5).map(m =>
            resourceOption(m, 'companion', isResourceSelected(m, selectedCompanionIds))
        ).join('');
        const resourceBonus = Number(totals.bonus || 0);
        const dcDelta = Number(totals.dcDelta || 0);
        const riskDelta = Number(totals.riskDelta || 0);
        const breakdown = [
            `属性 ${statMod >= 0 ? '+' + statMod : statMod}`,
            itemBonus ? `常驻物品 ${itemBonus >= 0 ? '+' + itemBonus : itemBonus}` : '',
            resourceBonus ? `已选资源 ${resourceBonus >= 0 ? '+' + resourceBonus : resourceBonus}` : '',
            dcDelta ? `资源调整 DC ${dcDelta >= 0 ? '+' + dcDelta : dcDelta}` : '',
            riskDelta ? `资源调整风险 ${riskDelta >= 0 ? '+' + riskDelta : riskDelta}` : ''
        ].filter(Boolean).join(' · ');
        const statIcons = {
            strength: 'str',
            dexterity: 'dex',
            constitution: 'con',
            intelligence: 'int',
            wisdom: 'wis',
            charisma: 'cha'
        };
        const iconHtml = Icons.get(statIcons[check.key] || 'int', { size: 18 });
        const risksHtml = (check.risks || []).slice(0, 3).map(r =>
            `<li>${Renderer.escapeHtml(r)}</li>`
        ).join('');
        const sourceText = check.intent
            ? `来自行动：${Renderer.escapeHtml(check.intent)}`
            : Renderer.escapeHtml(check.source || '系统要求检定');
        const challengeText = check.challengeContext?.challengeTitle
            ? `挑战：${Renderer.escapeHtml(check.challengeContext.challengeTitle)}${check.challengeContext.approachLabel ? ` · ${Renderer.escapeHtml(check.challengeContext.approachLabel)}` : ''}`
            : '';
        const secondaryText = (check.challengeContext?.secondaryApproachLabels || []).length
            ? `同时尝试：${check.challengeContext.secondaryApproachLabels.slice(0, 3).map(label => Renderer.escapeHtml(label)).join('、')}`
            : '';

        el.classList.remove('hidden');
        el.innerHTML = `
            <div class="pending-check-head">
                <div>
                    <div class="pending-action-kicker">检定</div>
                    <div class="pending-check-title">${iconHtml}<span>${Renderer.escapeHtml(check.statName || '属性')}检定</span></div>
                    <div class="pending-action-note">${sourceText}。点击或输入“掷骰”继续；待掷状态不会提前推进世界。</div>
                    ${challengeText ? `<div class="pending-action-note pending-check-challenge">${challengeText}</div>` : ''}
                    ${secondaryText ? `<div class="pending-action-note pending-check-challenge">${secondaryText}</div>` : ''}
                </div>
                <span class="pending-check-dc">DC ${dc}${dc !== totals.baseDc ? `<small>原 ${totals.baseDc}</small>` : ''}</span>
            </div>
            <div class="pending-check-equation">
                <span>D20</span>
                <span>${Renderer.escapeHtml(sign)}</span>
                <span>vs</span>
                <strong>${dc}</strong>
            </div>
            <div class="pending-check-breakdown">
                ${Renderer.escapeHtml(breakdown)}
            </div>
            ${itemModsHtml ? `<div class="pending-action-factor-row"><span class="pending-action-factor-label">自动生效</span><div class="pending-action-factors">${itemModsHtml}</div></div>` : ''}
            ${availableItemsHtml ? `<div class="pending-action-factor-row pending-check-available"><span class="pending-action-factor-label">物品</span><div class="pending-resource-list">${availableItemsHtml}</div></div>` : ''}
            ${availableCompanionsHtml ? `<div class="pending-action-factor-row pending-check-available"><span class="pending-action-factor-label">同伴</span><div class="pending-resource-list">${availableCompanionsHtml}</div></div>` : ''}
            ${availableItemsHtml || availableCompanionsHtml ? `<div class="pending-action-note pending-check-resource-note">点击资源或输入“投入资源名”用于本次检定；掷骰时才会消耗。</div>` : ''}
            ${check.stakes ? `<p class="pending-check-stakes">${Renderer.escapeHtml(check.stakes)}</p>` : ''}
            ${risksHtml ? `<ul class="pending-action-risks pending-check-risks">${risksHtml}</ul>` : ''}
            <div class="pending-action-actions">
                <button class="btn btn-primary" id="rollPendingCheckBtn" type="button">掷骰</button>
                <button class="btn btn-secondary" id="cancelPendingCheckBtn" type="button">取消</button>
            </div>
        `;

        el.querySelectorAll('.pending-resource-option').forEach(btn => {
            btn.onclick = () => this.toggleCheckResource(btn.dataset.resourceKind, btn.dataset.resourceId);
        });
        document.getElementById('rollPendingCheckBtn').onclick = () => GroupChat.rollPendingCheck();
        document.getElementById('cancelPendingCheckBtn').onclick = () => GroupChat.cancelPendingCheck();
    },

    toggleCheckResource(kind, id) {
        return this.setCheckResourceSelected(kind, id, null);
    },

    setCheckResourceSelected(kind, id, selected = null) {
        const scene = State.scene;
        const check = scene?.pendingCheck;
        if (!check || !id) return { ok: false, message: '没有可切换的检定资源。' };
        if (!this._isScenePlaying(scene)) {
            return { ok: false, message: this._endedSceneMessage(scene) };
        }
        const key = kind === 'companion' ? 'selectedCompanionResourceIds' : 'selectedItemModifierIds';
        if (!Array.isArray(check[key])) check[key] = [];
        const available = kind === 'companion'
            ? (typeof WorldEngine !== 'undefined' && WorldEngine.getAvailableCompanionResources
                ? WorldEngine.getAvailableCompanionResources(scene, check)
                : (check.availableCompanionModifiers || []))
            : (typeof WorldEngine !== 'undefined' && WorldEngine.getAvailableCheckItems
                ? WorldEngine.getAvailableCheckItems(scene, check)
                : (check.availableItemModifiers || []));
        const target = (available || []).find(m => String(m.id) === String(id));
        const aliases = new Set([String(id)]);
        const legacyPrefixes = [];
        if (target) {
            aliases.add(String(target.id));
            (target.legacyIds || []).forEach(legacyId => aliases.add(String(legacyId)));
            if (target.kind === 'item') {
                [target.itemId, target.source].map(String).filter(Boolean).forEach(ref => {
                    aliases.add(`item:${ref}`);
                    legacyPrefixes.push(`item:${ref}:`);
                });
            }
        }
        const matchesTarget = value => {
            const normalized = String(value);
            return aliases.has(normalized) || legacyPrefixes.some(prefix => normalized.startsWith(prefix));
        };
        const alreadySelected = check[key].some(matchesTarget);
        check[key] = check[key].filter(value => !matchesTarget(value));
        const shouldSelect = selected === null ? !alreadySelected : selected === true;
        if (shouldSelect) check[key].push(String(target?.id || id));
        State.saveCurrentSceneDebounced();
        this.renderPendingCheck();
        return {
            ok: true,
            selected: shouldSelect,
            changed: alreadySelected !== shouldSelect,
            source: target?.source || target?.label || id
        };
    },

    _isScenePlaying(scene = State.scene) {
        if (typeof WorldEngine !== 'undefined' && WorldEngine.isScenePlaying) return WorldEngine.isScenePlaying(scene);
        return !!scene && (!scene.gameState || scene.gameState === 'playing');
    },

    _endedSceneMessage(scene = State.scene) {
        if (typeof WorldEngine !== 'undefined' && WorldEngine.endedSceneMessage) {
            return WorldEngine.endedSceneMessage(scene);
        }
        return '当前冒险已经结束，不能继续改变游戏状态。';
    }
};
