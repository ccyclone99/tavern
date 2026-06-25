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
        const action = State.scene?.pendingAction;
        if (!action) {
            el.classList.add('hidden');
            el.innerHTML = '';
            return;
        }

        const risk = Math.max(0, Math.min(100, Number(action.risk || 0)));
        const riskClass = risk >= 75 ? 'extreme' : risk >= 55 ? 'high' : risk >= 35 ? 'mid' : 'low';
        const checkHtml = action.suggestedCheck
            ? `${Renderer.escapeHtml(action.suggestedCheck.statName)} DC${Renderer.escapeHtml(action.suggestedCheck.dc)}`
            : '通常无需检定';
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
        const check = State.scene?.pendingCheck;
        if (!check) {
            el.classList.add('hidden');
            el.innerHTML = '';
            return;
        }

        const mod = Number.isFinite(Number(check.mod)) ? Number(check.mod) : 0;
        const dc = Number.isFinite(Number(check.dc)) ? Number(check.dc) : 15;
        const sign = mod >= 0 ? `+${mod}` : String(mod);
        const statMod = Number.isFinite(Number(check.statMod)) ? Number(check.statMod) : mod;
        const itemBonus = Number(check.itemBonus || 0);
        const itemModsHtml = (check.itemModifiers || []).slice(0, 4).map(m =>
            `<span class="pending-action-factor">${Renderer.escapeHtml(m.source)} ${Renderer.escapeHtml(m.label)}</span>`
        ).join('');
        const availableItemsHtml = (check.availableItemModifiers || []).slice(0, 4).map(m =>
            `<span class="pending-action-factor pending-action-factor-available">${Renderer.escapeHtml(m.source)} ${Renderer.escapeHtml(m.label)}</span>`
        ).join('');
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

        el.classList.remove('hidden');
        el.innerHTML = `
            <div class="pending-check-head">
                <div>
                    <div class="pending-action-kicker">检定</div>
                    <div class="pending-check-title">${iconHtml}<span>${Renderer.escapeHtml(check.statName || '属性')}检定</span></div>
                    <div class="pending-action-note">${sourceText}。点击或输入“掷骰”继续；待掷状态不会提前推进世界。</div>
                </div>
                <span class="pending-check-dc">DC ${dc}</span>
            </div>
            <div class="pending-check-equation">
                <span>D20</span>
                <span>${Renderer.escapeHtml(sign)}</span>
                <span>vs</span>
                <strong>${dc}</strong>
            </div>
            <div class="pending-check-breakdown">
                属性 ${statMod >= 0 ? '+' + statMod : statMod}${itemBonus ? ` · 物品 ${itemBonus >= 0 ? '+' + itemBonus : itemBonus}` : ''}
            </div>
            ${itemModsHtml ? `<div class="pending-action-factor-row"><span class="pending-action-factor-label">自动生效</span><div class="pending-action-factors">${itemModsHtml}</div></div>` : ''}
            ${availableItemsHtml ? `<div class="pending-action-factor-row pending-check-available"><span class="pending-action-factor-label">可用但未自动消耗</span><div class="pending-action-factors">${availableItemsHtml}</div></div>` : ''}
            ${check.stakes ? `<p class="pending-check-stakes">${Renderer.escapeHtml(check.stakes)}</p>` : ''}
            ${risksHtml ? `<ul class="pending-action-risks pending-check-risks">${risksHtml}</ul>` : ''}
            <div class="pending-action-actions">
                <button class="btn btn-primary" id="rollPendingCheckBtn" type="button">掷骰</button>
                <button class="btn btn-secondary" id="cancelPendingCheckBtn" type="button">取消</button>
            </div>
        `;

        document.getElementById('rollPendingCheckBtn').onclick = () => GroupChat.rollPendingCheck();
        document.getElementById('cancelPendingCheckBtn').onclick = () => GroupChat.cancelPendingCheck();
    }
};
