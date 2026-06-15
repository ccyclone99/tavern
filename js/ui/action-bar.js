/**
 * 玩家属性面板（只读展示）
 */
const ActionBar = {
    init() {
        this.el = document.getElementById('actionBar');
        if (!this.el) return;
        this.renderStatsDisplay();
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
    }
};
