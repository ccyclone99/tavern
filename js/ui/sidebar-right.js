/**
 * 右侧边栏（世界书 + 角色详情 + 计策）
 */
const SidebarRight = {
    _tabBadges: {},  // { tabName: count } 未读角标计数
    _knowledgeFilter: 'all',
    _knowledgeSubjectFilter: 'all',

    init() {
        this.el = document.getElementById('rightSidebar');
        this.toggleBtn = document.getElementById('toggleRightSidebar');
        this.tabBtns = this.el.querySelectorAll('.tab-btn');
        this.tabContents = {
            situation: document.getElementById('tabSituation'),
            strategies: document.getElementById('tabStrategies'),
            knowledge: document.getElementById('tabKnowledge'),
            lorebook: document.getElementById('tabLorebook'),
            map: document.getElementById('tabMap'),
            quests: document.getElementById('tabQuests'),
            inventory: document.getElementById('tabInventory'),
            detail: document.getElementById('tabDetail')
        };
        this.loreListEl = document.getElementById('lorebookList');
        this.detailEl = document.getElementById('characterDetail');
        this.detailPlaceholder = this.tabContents.detail.querySelector('.detail-placeholder');
        this.strategiesEl = document.getElementById('strategiesList');
        this.knowledgeEl = document.getElementById('knowledgeList');
        this.situationEl = document.getElementById('situationPanel');

        this.toggleBtn.onclick = () => this.toggle();
        this.tabBtns.forEach(btn => {
            btn.onclick = () => this.switchTab(btn.dataset.tab);
        });
        document.getElementById('addLoreEntryBtn').onclick = () => Lorebook.openEditor();
        document.getElementById('aiBatchLoreBtn').onclick = () => Lorebook.generateBatch();

        State.on('characterSelected', () => this.renderDetail());
        State.on('sceneChanged', () => {
            this.switchTab('situation');
            this.renderStrategies();
            this.renderSituation();
            this.renderKnowledge();
            this.renderLorebook();
            this.renderMap();
            this.renderQuests();
            this.renderInventory();
        });

        document.addEventListener('click', (e) => {
            if (window.innerWidth <= 600 && this.el.classList.contains('open')) {
                if (!this.el.contains(e.target) && e.target !== this.toggleBtn) {
                    this.el.classList.remove('open');
                    this._syncBackdrop();
                }
            }
        });
    },

    _syncBackdrop() {
        const backdrop = document.getElementById('sidebarBackdrop');
        if (!backdrop) return;
        const open = (this.el.classList.contains('open') || document.getElementById('leftSidebar')?.classList.contains('open'));
        backdrop.classList.toggle('show', open);
    },

    toggle() {
        this.el.classList.toggle('open');
        this._syncBackdrop();
    },

    switchTab(tab) {
        this.tabBtns.forEach(b => {
            const active = b.dataset.tab === tab;
            b.classList.toggle('active', active);
            b.setAttribute('aria-selected', active ? 'true' : 'false');
        });
        Object.values(this.tabContents).forEach(c => c.classList.add('hidden'));
        if (this.tabContents[tab]) this.tabContents[tab].classList.remove('hidden');
        if (tab === 'map') MapView.render();
        if (tab === 'quests') QuestTracker.render();
        if (tab === 'inventory') this.renderInventory();
        if (tab === 'situation') this.renderSituation();
        if (tab === 'strategies') this.renderStrategies();
        if (tab === 'knowledge') this.renderKnowledge();
        // 玩家查看该 tab，清除角标
        this.clearTabBadge(tab);
    },

    openTab(tab) {
        if (window.innerWidth <= 900 && !this.el.classList.contains('open')) {
            this.toggle();
        }
        this.switchTab(tab);
    },

    /** 标记某 tab 有新内容（AI 驱动/被动获得时调用） */
    markTabNew(tab, n = 1) {
        if (!this.el || !this.tabBtns) return;
        // 当前正在看的 tab 不标记
        const activeBtn = this.el.querySelector('.tab-btn.active');
        if (activeBtn && activeBtn.dataset.tab === tab) return;
        this._tabBadges[tab] = (this._tabBadges[tab] || 0) + n;
        this._renderBadges();
    },

    /** 清除某 tab 的角标 */
    clearTabBadge(tab) {
        if (this._tabBadges[tab]) {
            delete this._tabBadges[tab];
            this._renderBadges();
        }
    },

    /** 渲染所有 tab 的角标 DOM */
    _renderBadges() {
        this.tabBtns.forEach(btn => {
            const tab = btn.dataset.tab;
            const count = this._tabBadges[tab] || 0;
            let badge = btn.querySelector('.tab-badge');
            if (count > 0) {
                if (!badge) {
                    badge = document.createElement('span');
                    badge.className = 'tab-badge';
                    btn.appendChild(badge);
                }
                badge.textContent = count > 9 ? '9+' : count;
            } else if (badge) {
                badge.remove();
            }
        });
    },

    renderMap() { MapView.render(); },
    renderQuests() { QuestTracker.render(); },

    renderSituation() {
        if (!this.situationEl) return;
        const scene = State.scene;
        if (!scene) {
            this.situationEl.innerHTML = '<p class="placeholder">暂无世界</p>';
            this.renderStatusSummary(null);
            return;
        }
        const situation = typeof WorldEngine !== 'undefined'
            ? WorldEngine.getCurrentSituation(scene)
            : null;
        if (!situation) {
            this.situationEl.innerHTML = '<p class="placeholder">暂无局势信息</p>';
            this.renderStatusSummary(null);
            return;
        }
        this.renderStatusSummary(situation);

        const locationName = situation.location?.name || '未知地点';
        const locationDesc = situation.location?.description || '';
        const quest = situation.activeQuest;
        const objective = quest ? (quest.objectives || []).find(o => !o.completed) : null;
        const phase = situation.storyPhase;
        const challenge = situation.activeChallenge;
        const texture = situation.storyTexture;
        const runRecordHtml = this._buildRunRecordHtml(scene.runRecord);
        const eventLogHtml = this._buildEventLogHtml(
            typeof WorldEngine !== 'undefined' && WorldEngine.getEventLog
                ? WorldEngine.getEventLog(scene, 8)
                : (scene.eventLog || []).slice(-8).reverse()
        );
        const consequenceHtml = this._buildConsequenceLedgerHtml(
            typeof WorldEngine !== 'undefined' && WorldEngine.getActiveConsequences
                ? WorldEngine.getActiveConsequences(scene, { limit: 6 })
                : (scene.consequenceLedger || []).filter(c => !c.status || c.status === 'active').slice(-6).reverse()
        );
        const textureHtml = texture && (texture.tone || texture.sensory?.length || texture.motifs?.length || texture.dramaticQuestions?.length) ? `
            <div class="situation-section">
                <h4>氛围锚点</h4>
                <div class="situation-main-goal">
                    ${texture.tone ? `<span>${Renderer.escapeHtml(texture.tone)}</span>` : ''}
                    ${texture.motifs?.[0] ? `<p class="situation-stakes">意象：${Renderer.escapeHtml(texture.motifs[0])}</p>` : ''}
                    ${texture.dramaticQuestions?.[0] ? `<p class="situation-stakes">问题：${Renderer.escapeHtml(texture.dramaticQuestions[0])}</p>` : ''}
                </div>
            </div>
        ` : '';
        const phaseHtml = phase ? `
            <div class="situation-section">
                <h4>当前阶段</h4>
                <div class="situation-main-goal">
                    <strong>${Renderer.escapeHtml(phase.title || '剧情阶段')}</strong>
                    ${phase.goal ? `<span>${Renderer.escapeHtml(phase.goal)}</span>` : ''}
                    ${phase.stakes ? `<p class="situation-stakes">${Renderer.escapeHtml(phase.stakes)}</p>` : ''}
                </div>
            </div>
        ` : '';
        const questHtml = quest ? `
            <div class="situation-section">
                <h4>主线目标</h4>
                <div class="situation-main-goal">
                    <strong>${Renderer.escapeHtml(quest.name)}</strong>
                    <span>${Renderer.escapeHtml(objective?.text || quest.description || '等待下一步')}</span>
                </div>
            </div>
        ` : '';
        const challengeHtml = challenge ? (() => {
            const progressPct = Math.min(100, Math.max(0, (Number(challenge.progress || 0) / Math.max(1, Number(challenge.targetProgress || 1))) * 100));
            const strainPct = Math.min(100, Math.max(0, (Number(challenge.strain || 0) / Math.max(1, Number(challenge.maxStrain || 1))) * 100));
            const approaches = (challenge.approaches || []).slice(0, 3).map(a =>
                `<button class="situation-action situation-action-compact" type="button" data-action="${Renderer.escapeAttr(a.label)}" aria-label="尝试：${Renderer.escapeAttr(a.label)}">${Renderer.escapeHtml(a.label)}<small>${Renderer.escapeHtml(a.statName || a.stat || '')} DC${a.dc || '?'}</small></button>`
            ).join('');
            const evidence = (situation.challengeEvidence || []).slice(0, 3).map(e =>
                `<span title="${Renderer.escapeAttr(e.text || e.title || '')}">${Renderer.escapeHtml(e.title || '证据')}</span>`
            ).join('');
            return `
                <div class="situation-section situation-challenge">
                    <h4>当前挑战</h4>
                    <div class="situation-main-goal">
                        <strong>${Renderer.escapeHtml(challenge.title || '挑战')}</strong>
                        ${challenge.goal ? `<span>${Renderer.escapeHtml(challenge.goal)}</span>` : ''}
                        ${challenge.stakes ? `<p class="situation-stakes">${Renderer.escapeHtml(challenge.stakes)}</p>` : ''}
                    </div>
                    <div class="situation-challenge-meters">
                        <div class="situation-meter">
                            <div class="situation-row"><span>进度</span><strong>${challenge.progress || 0}/${challenge.targetProgress || 0}</strong></div>
                            <div class="situation-bar"><div class="situation-bar-fill" style="width:${progressPct}%"></div></div>
                        </div>
                        <div class="situation-meter situation-meter-strain">
                            <div class="situation-row"><span>压力</span><strong>${challenge.strain || 0}/${challenge.maxStrain || 0}</strong></div>
                            <div class="situation-bar"><div class="situation-bar-fill" style="width:${strainPct}%"></div></div>
                        </div>
                        <div class="situation-meter">
                            <div class="situation-row"><span>关键交锋</span><strong>${challenge.checkCount || 0}/${challenge.checkBudget?.min || 0}</strong></div>
                            <div class="situation-bar"><div class="situation-bar-fill" style="width:${Math.min(100, Math.max(0, (Number(challenge.checkCount || 0) / Math.max(1, Number(challenge.checkBudget?.min || 1))) * 100))}%"></div></div>
                        </div>
                    </div>
                    ${approaches ? `<div class="situation-actions situation-challenge-actions">${approaches}</div>` : ''}
                    ${evidence ? `<div class="situation-tags situation-evidence-tags">${evidence}</div>` : ''}
                </div>
            `;
        })() : '';
        const companionResources = typeof WorldEngine !== 'undefined' && WorldEngine.getUnlockedCompanionResources
            ? WorldEngine.getUnlockedCompanionResources(scene)
            : (scene.companionResources || []).filter(r => Number(r.uses || 0) > 0);
        const companionResourcesHtml = companionResources.length > 0
            ? `<div class="situation-section">
                <h4>可用协助</h4>
                <div class="situation-resource-list">
                    ${companionResources.slice(0, 5).map(resource => {
                        const effect = resource.effect || {};
                        const bits = [];
                        if (effect.checkBonus) bits.push(`检定${effect.checkBonus >= 0 ? '+' : ''}${effect.checkBonus}`);
                        if (effect.dcDelta) bits.push(`DC${effect.dcDelta >= 0 ? '+' : ''}${effect.dcDelta}`);
                        if (effect.riskDelta) bits.push(`风险${effect.riskDelta >= 0 ? '+' : ''}${effect.riskDelta}`);
                        if (effect.clockDelta) bits.push(`时钟${effect.clockDelta >= 0 ? '+' : ''}${effect.clockDelta}`);
                        if (effect.evidenceReliability) bits.push(`证据→${effect.evidenceReliability}`);
                        if (effect.resolveConsequence || (effect.resolveConsequenceTags || []).length || (effect.consequenceTags || []).length) bits.push('解除后果');
                        return `<div class="situation-resource">
                            <div class="situation-row">
                                <span>${Renderer.escapeHtml(resource.name)}</span>
                                <strong>${Renderer.escapeHtml(bits.join('、') || '协助')} · ${resource.uses}次</strong>
                            </div>
                            ${resource.risk ? `<p>${Renderer.escapeHtml(resource.risk)}</p>` : ''}
                        </div>`;
                    }).join('')}
                </div>
            </div>`
            : '';

        const clocksHtml = situation.clocks.length > 0
            ? situation.clocks.map(clock => {
                const pct = Math.min(100, Math.max(0, (clock.value / Math.max(1, clock.max)) * 100));
                const cls = pct >= 75 ? 'danger' : pct >= 50 ? 'warn' : 'calm';
                return `<div class="situation-clock situation-clock-${cls}">
                    <div class="situation-row">
                        <span>${Renderer.escapeHtml(clock.name)}</span>
                        <strong>${clock.value}/${clock.max}</strong>
                    </div>
                    <div class="situation-bar"><div class="situation-bar-fill" style="width:${pct}%"></div></div>
                    ${clock.description ? `<p>${Renderer.escapeHtml(clock.description)}</p>` : ''}
                </div>`;
            }).join('')
            : '<p class="placeholder">暂无公开时钟</p>';
        const hiddenHtml = situation.hiddenPressure > 0
            ? `<div class="situation-hidden-pressure">有 ${situation.hiddenPressure} 股未公开压力正在暗处推进</div>`
            : '';
        const failureWarningsHtml = (situation.failureWarnings || []).length > 0
            ? situation.failureWarnings.map(failure => {
                const pct = Math.min(100, Math.max(0, (failure.value / Math.max(1, failure.max)) * 100));
                const cls = pct >= 80 ? 'danger' : pct >= 50 ? 'warn' : 'calm';
                return `<div class="situation-failure situation-failure-${cls}">
                    <div class="situation-row">
                        <span>${Renderer.escapeHtml(failure.title || '失败临界')}</span>
                        <strong>${failure.value}/${failure.max}</strong>
                    </div>
                    <div class="situation-bar"><div class="situation-bar-fill" style="width:${pct}%"></div></div>
                    <p>${Renderer.escapeHtml(failure.text || '公开危机满格会导致失败结局。')}</p>
                </div>`;
            }).join('')
            : '';

        const countersHtml = situation.counterStrategies.length > 0
            ? situation.counterStrategies.slice(0, 5).map(counter => `<div class="situation-counter">
                <div class="situation-row">
                    <span>${Renderer.escapeHtml(counter.title)}</span>
                    <strong>${counter.progress || 0}%${counter.status === 'revealed' ? ' · 已揭示' : ''}</strong>
                </div>
                <p>${Renderer.escapeHtml(counter.hint || counter.lastAction || '对方正在准备反制')}</p>
                ${(counter.counterplay || []).length > 0 ? `<div class="situation-tags">${counter.counterplay.slice(0, 3).map(t => `<span>${Renderer.escapeHtml(t)}</span>`).join('')}</div>` : ''}
            </div>`).join('')
            : '<p class="placeholder">暂无可见反制</p>';

        const risksHtml = situation.recentRisks.length > 0
            ? situation.recentRisks.slice(-5).reverse().map(r => `<li>${Renderer.escapeHtml(r)}</li>`).join('')
            : '<li>局势暂未出现新的公开风险</li>';
        const cluesHtml = situation.availableClues.length > 0
            ? situation.availableClues.map(c => `<span>${Renderer.escapeHtml(c.title || c.text || '线索')}</span>`).join('')
            : '<span>暂无可用线索</span>';
        const unknownsHtml = (situation.knownUnknowns || []).length > 0
            ? situation.knownUnknowns.slice(0, 3).map(item => {
                const actions = (item.actions || []).slice(0, 2)
                    .map(a => `<button class="situation-action situation-action-compact" type="button" data-action="${Renderer.escapeAttr(a)}" aria-label="追查线索：${Renderer.escapeAttr(a)}">${Renderer.escapeHtml(a)}</button>`)
                    .join('');
                return `<div class="situation-unknown">
                    <div class="situation-row">
                        <span>${Renderer.escapeHtml(item.title || '关键未知')}</span>
                        <strong>${Renderer.escapeHtml(item.level || item.status || '线索')}</strong>
                    </div>
                    <p>${Renderer.escapeHtml(item.text || '仍需调查')}</p>
                    ${item.source ? `<small>来源：${Renderer.escapeHtml(item.source)}</small>` : ''}
                    ${actions ? `<div class="situation-actions">${actions}</div>` : ''}
                </div>`;
            }).join('')
            : '<p class="placeholder">暂无明确关键未知</p>';
        const actionsHtml = situation.recommendedActions.map(a => `<button class="situation-action" type="button" data-action="${Renderer.escapeAttr(a)}" aria-label="采用行动：${Renderer.escapeAttr(a)}">${Renderer.escapeHtml(a)}</button>`).join('');

        this.situationEl.innerHTML = `
            <div class="situation-card situation-location">
                <div class="situation-kicker">当前位置</div>
                <h4>${Renderer.escapeHtml(locationName)}</h4>
                ${locationDesc ? `<p>${Renderer.escapeHtml(locationDesc)}</p>` : ''}
                <span class="situation-turn">回合 ${scene.turnCount || 0}</span>
            </div>
            ${runRecordHtml}
            ${textureHtml}
            ${phaseHtml}
            ${questHtml}
            ${challengeHtml}
            ${companionResourcesHtml}
            ${consequenceHtml}
            ${eventLogHtml}
            <div class="situation-section">
                <h4>局势时钟</h4>
                ${clocksHtml}
                ${hiddenHtml}
            </div>
            ${failureWarningsHtml ? `
            <div class="situation-section situation-failure-section">
                <h4>失败临界</h4>
                ${failureWarningsHtml}
            </div>
            ` : ''}
            <div class="situation-section">
                <h4>反制与压力</h4>
                ${countersHtml}
            </div>
            <div class="situation-section">
                <h4>最近风险</h4>
                <ul class="situation-risk-list">${risksHtml}</ul>
            </div>
            <div class="situation-section">
                <h4>可用线索</h4>
                <div class="situation-tags">${cluesHtml}</div>
            </div>
            <div class="situation-section">
                <h4>关键未知</h4>
                ${unknownsHtml}
            </div>
            <div class="situation-section">
                <h4>可选行动</h4>
                <div class="situation-actions">${actionsHtml}</div>
            </div>
        `;

        this.situationEl.querySelectorAll('.situation-action').forEach(btn => {
            btn.onclick = () => {
                const input = document.getElementById('chatInput');
                if (!input) return;
                State.isOOC = false;
                State.inputMode = 'talk';
                if (typeof ChatUI !== 'undefined' && ChatUI._syncInputMode) ChatUI._syncInputMode();
                input.value = btn.dataset.action || '';
                input.focus();
                if (window.innerWidth <= 900 && this.el.classList.contains('open')) {
                    this.el.classList.remove('open');
                    this._syncBackdrop();
                }
            };
        });
    },

    _buildRunRecordHtml(record) {
        if (!record || typeof record !== 'object') return '';
        const outcomeLabel = record.outcome === 'victorious' ? '通关' : (record.outcome === 'defeated' ? '失败' : '记录');
        const outcomeCls = record.outcome === 'victorious' ? 'victory' : (record.outcome === 'defeated' ? 'defeat' : 'neutral');
        const moments = (record.keyMoments || []).slice(-6).map(m => `
            <li>
                <strong>${Renderer.escapeHtml(m.title || '事件')}</strong>
                <span>${Renderer.escapeHtml(m.text || '')}</span>
            </li>
        `).join('');
        const phases = (record.phaseSummaries || []).slice(0, 5).map(p => `
            <li>
                <strong>${Renderer.escapeHtml(p.title || '阶段')}</strong>
                <span>${Renderer.escapeHtml(p.summary || '')}</span>
            </li>
        `).join('');
        const quests = (record.quests || []).slice(0, 6).map(q => `
            <span>${Renderer.escapeHtml(q.name || '任务')}：${Renderer.escapeHtml(q.status || 'active')} ${q.completed || 0}/${q.total || 0}</span>
        `).join('');
        const discoveries = (record.discoveries || []).slice(-6).map(d => `
            <span>${Renderer.escapeHtml(d.title || d.text || '线索')}</span>
        `).join('');
        const clocks = (record.clocks || []).slice(0, 6).map(c => `
            <span>${Renderer.escapeHtml(c.name || '时钟')} ${c.value || 0}/${c.max || 0}</span>
        `).join('');
        const challenges = (record.challenges || []).slice(0, 6).map(c => `
            <span>${Renderer.escapeHtml(c.title || '挑战')}：${Renderer.escapeHtml(c.status || '')} ${c.progress || 0}/${c.targetProgress || 0}</span>
        `).join('');
        const evidence = (record.evidence || []).slice(-6).map(e => `
            <span>${Renderer.escapeHtml(e.title || '证据')}：${Renderer.escapeHtml(e.reliability || '')}</span>
        `).join('');
        const checks = (record.checks || []).slice(-6).map(c => `
            <span>${Renderer.escapeHtml(c.statName || '检定')} ${c.total || 0}/DC${c.dc || 0} ${Renderer.escapeHtml(c.outcome || '')}</span>
        `).join('');
        const transcriptEntries = (record.transcript || []).map(entry => {
            const check = entry.check
                ? `<small>${Renderer.escapeHtml(entry.check.statName || '检定')} ${entry.check.total || 0}/DC${entry.check.dc || 0} ${Renderer.escapeHtml(entry.check.outcome || '')}</small>`
                : '';
            return `<li class="run-record-transcript-entry run-record-transcript-${Renderer.escapeAttr(entry.type || 'message')}">
                <strong>${Renderer.escapeHtml(entry.speaker || '记录')}<em>${Renderer.escapeHtml(this._eventTimeText(entry.timestamp))}</em></strong>
                <p>${Renderer.escapeHtml(entry.text || '')}</p>
                ${check}
            </li>`;
        }).join('');
        const transcript = transcriptEntries
            ? `<details class="run-record-transcript">
                <summary>完整对话记录（${record.transcriptCount || (record.transcript || []).length}条）</summary>
                <ol>${transcriptEntries}</ol>
            </details>`
            : '';
        return `
            <div class="situation-section run-record run-record-${outcomeCls}">
                <div class="run-record-head">
                    <div>
                        <div class="situation-kicker">冒险回顾</div>
                        <h4>${Renderer.escapeHtml(record.title || '本次冒险')}</h4>
                    </div>
                    <span class="run-record-outcome">${outcomeLabel}</span>
                </div>
                <p>${Renderer.escapeHtml(record.summary || record.ending || '暂无摘要')}</p>
                ${record.ending ? `<blockquote>${Renderer.escapeHtml(record.ending)}</blockquote>` : ''}
                <div class="run-record-meta">
                    <span>${Renderer.escapeHtml(record.player?.name || '旅人')}</span>
                    <span>回合 ${record.turns || 0}</span>
                    <span>Lv.${record.player?.level || 1}</span>
                    <span>HP ${record.player?.hp || 0}/${record.player?.maxHp || 0}</span>
                </div>
                ${phases ? `<ol class="run-record-phases">${phases}</ol>` : ''}
                ${moments ? `<ol class="run-record-moments">${moments}</ol>` : ''}
                ${quests ? `<div class="situation-tags run-record-tags">${quests}</div>` : ''}
                ${challenges ? `<div class="situation-tags run-record-tags">${challenges}</div>` : ''}
                ${evidence ? `<div class="situation-tags run-record-tags">${evidence}</div>` : ''}
                ${checks ? `<div class="situation-tags run-record-tags">${checks}</div>` : ''}
                ${discoveries ? `<div class="situation-tags run-record-tags">${discoveries}</div>` : ''}
                ${clocks ? `<div class="situation-tags run-record-tags">${clocks}</div>` : ''}
                ${transcript}
            </div>
        `;
    },

    _eventTimeText(timestamp) {
        if (!timestamp) return '';
        const d = new Date(timestamp);
        if (Number.isNaN(d.getTime())) return '';
        return d.toLocaleString('zh-CN', {
            month: '2-digit',
            day: '2-digit',
            hour: '2-digit',
            minute: '2-digit'
        });
    },

    _buildEventLogHtml(events) {
        if (!Array.isArray(events) || events.length === 0) return '';
        const labels = {
            check: '检定',
            quest: '任务',
            inventory: '物品',
            resource: '资源',
            exploration: '探索',
            challenge: '挑战',
            progress: '进展',
            survival: '生存',
            economy: '经济',
            level: '成长',
            movement: '移动',
            failure: '失败',
            victory: '通关',
            system: '系统'
        };
        const items = events.slice(0, 8).map(event => {
            const label = labels[event.category] || '事件';
            const turn = Number(event.turn || 0) > 0 ? `回合 ${event.turn}` : '';
            return `<li class="event-log-item event-log-${Renderer.escapeAttr(event.category || 'system')}">
                <span class="event-log-label">${Renderer.escapeHtml(label)}</span>
                <div class="event-log-body">
                    <strong>${Renderer.escapeHtml(event.title || '事件')}</strong>
                    <p>${Renderer.escapeHtml(event.text || '')}</p>
                    ${turn ? `<small>${Renderer.escapeHtml(turn)}</small>` : ''}
                </div>
            </li>`;
        }).join('');
        return `<div class="situation-section event-log">
            <h4>最近事件</h4>
            <ol>${items}</ol>
        </div>`;
    },

    _buildConsequenceLedgerHtml(items) {
        if (!Array.isArray(items) || items.length === 0) return '';
        const labels = { low: '轻微', medium: '中等', high: '严重', critical: '致命' };
        const html = items.slice(0, 6).map(item => {
            const cls = item.severity || 'low';
            return `<div class="situation-consequence situation-consequence-${Renderer.escapeAttr(cls)}">
                <div class="situation-row">
                    <span>${Renderer.escapeHtml(item.title || '后果')}</span>
                    <strong>${Renderer.escapeHtml(labels[cls] || cls)}</strong>
                </div>
                ${item.cause ? `<p>原因：${Renderer.escapeHtml(item.cause)}</p>` : ''}
                ${item.effect ? `<p>影响：${Renderer.escapeHtml(item.effect)}</p>` : ''}
            </div>`;
        }).join('');
        return `<div class="situation-section consequence-ledger">
            <h4>未解决后果</h4>
            ${html}
        </div>`;
    },

    renderStatusSummary(situation) {
        const summaryEl = document.getElementById('statusSummary');
        const roomStatus = document.getElementById('roomStatus');
        const scene = State.scene;
        if (!summaryEl || !roomStatus) return;
        if (!scene || !situation) {
            summaryEl.classList.add('hidden');
            roomStatus.textContent = '';
            return;
        }

        const locationName = situation.location?.name || '未知地点';
        const quest = situation.activeQuest;
        const objective = quest ? (quest.objectives || []).find(o => !o.completed) : null;
        const goal = objective?.text || quest?.description || quest?.name || '等待下一步';
        const urgentClock = [...(situation.clocks || [])]
            .sort((a, b) => (b.value / Math.max(1, b.max)) - (a.value / Math.max(1, a.max)))[0];
        const risk = (situation.recentRisks || []).slice(-1)[0] || '';
        const pressure = urgentClock
            ? `${urgentClock.name} ${urgentClock.value}/${urgentClock.max}`
            : (situation.hiddenPressure > 0 ? `${situation.hiddenPressure} 股暗处压力` : '局势稳定');

        summaryEl.classList.remove('hidden');
        summaryEl.innerHTML = `
            <span class="status-summary-main">
                <span class="status-chip status-chip-location">${Renderer.escapeHtml(locationName)}</span>
                <span class="status-goal">${Renderer.escapeHtml(goal)}</span>
            </span>
            <span class="status-summary-sub">
                <span>${Renderer.escapeHtml(pressure)}</span>
                ${risk ? `<span>${Renderer.escapeHtml(risk)}</span>` : '<span>暂无公开风险</span>'}
            </span>
        `;
        roomStatus.textContent = `${locationName} · ${pressure}`;
        summaryEl.onclick = () => this.openTab('situation');
    },

    renderKnowledge() {
        if (!this.knowledgeEl) return;
        const scene = State.scene;
        if (!scene) {
            this.knowledgeEl.innerHTML = '<p class="placeholder">暂无世界</p>';
            return;
        }

        const entries = [
            ...((scene.knowledge?.discoveries || []).filter(Boolean)),
            ...this._buildProfileKnowledgeEntries(scene)
        ].sort((a, b) => (b.discoveredAt || 0) - (a.discoveredAt || 0));

        if (entries.length === 0) {
            this.knowledgeEl.innerHTML = '<p class="placeholder">暂无线索<br>通过观察、对话、检定或计策逐步解锁</p>';
            return;
        }

        const levelLabels = {
            hint: '观察',
            rumor: '传闻',
            evidence: '证据',
            inference: '推论',
            truth: '确认'
        };
        const reliabilityLabels = {
            unverified: '未验证',
            contested: '有争议',
            confirmed: '已确认',
            false: '虚假'
        };
        const subjectLabels = {
            all: '全部主体',
            character: '角色',
            faction: '势力',
            location: '地点',
            item: '物品',
            evidence: '证据',
            event: '事件',
            strategy: '计策'
        };
        const counts = entries.reduce((acc, item) => {
            const level = levelLabels[item.level] ? item.level : 'hint';
            acc[level] = (acc[level] || 0) + 1;
            return acc;
        }, {});
        const subjectCounts = entries.reduce((acc, item) => {
            const subjectType = subjectLabels[item.subjectType] ? item.subjectType : 'event';
            acc[subjectType] = (acc[subjectType] || 0) + 1;
            return acc;
        }, {});
        const filters = [
            ['all', '全部', entries.length],
            ['hint', '观察', counts.hint || 0],
            ['rumor', '传闻', counts.rumor || 0],
            ['evidence', '证据', counts.evidence || 0],
            ['inference', '推论', counts.inference || 0],
            ['truth', '确认', counts.truth || 0]
        ];
        const subjectFilters = [
            ['all', '全部主体', entries.length],
            ['character', '角色', subjectCounts.character || 0],
            ['location', '地点', subjectCounts.location || 0],
            ['faction', '势力', subjectCounts.faction || 0],
            ['strategy', '计策', subjectCounts.strategy || 0],
            ['item', '物品', subjectCounts.item || 0],
            ['evidence', '证据', subjectCounts.evidence || 0],
            ['event', '事件', subjectCounts.event || 0]
        ].filter(([key, , count]) => key === 'all' || count > 0);
        const summaryHtml = `
            <div class="knowledge-summary">
                ${filters.map(([key, label, count]) => `<button class="knowledge-pill ${this._knowledgeFilter === key ? 'active' : ''}" type="button" data-filter="${Renderer.escapeAttr(key)}">${Renderer.escapeHtml(label)} ${count}</button>`).join('')}
            </div>
            <div class="knowledge-summary knowledge-subject-summary">
                ${subjectFilters.map(([key, label, count]) => `<button class="knowledge-pill ${this._knowledgeSubjectFilter === key ? 'active' : ''}" type="button" data-subject-filter="${Renderer.escapeAttr(key)}">${Renderer.escapeHtml(label)} ${count}</button>`).join('')}
            </div>
        `;

        const visibleEntries = entries.filter(item => {
            const level = levelLabels[item.level] ? item.level : 'hint';
            const subjectType = subjectLabels[item.subjectType] ? item.subjectType : 'event';
            const levelMatches = this._knowledgeFilter === 'all' || level === this._knowledgeFilter;
            const subjectMatches = this._knowledgeSubjectFilter === 'all' || subjectType === this._knowledgeSubjectFilter;
            return levelMatches && subjectMatches;
        });
        const cardsHtml = visibleEntries.map(item => {
            const level = levelLabels[item.level] ? item.level : 'hint';
            const reliability = reliabilityLabels[item.reliability] ? item.reliability : 'unverified';
            const subjectType = subjectLabels[item.subjectType] ? item.subjectType : 'event';
            const subjectName = this._getKnowledgeSubjectName(scene, item);
            const title = item.title || item.text || '未命名线索';
            const text = item.text || item.title || '';
            const source = item.source || '未知来源';
            const timeText = item.discoveredAt ? new Date(item.discoveredAt).toLocaleString('zh-CN', {
                month: '2-digit',
                day: '2-digit',
                hour: '2-digit',
                minute: '2-digit'
            }) : '';
            const tagsHtml = Array.isArray(item.tags) && item.tags.length > 0
                ? `<div class="knowledge-tags">${item.tags.slice(0, 6).map(tag => `<span class="knowledge-tag">${Renderer.escapeHtml(tag)}</span>`).join('')}</div>`
                : '';
            return `
                <article class="knowledge-card knowledge-${Renderer.escapeAttr(reliability)}">
                    <div class="knowledge-card-head">
                        <span class="knowledge-badge knowledge-level-${Renderer.escapeAttr(level)}">${Renderer.escapeHtml(levelLabels[level])}</span>
                        <span class="knowledge-title">${Renderer.escapeHtml(title)}</span>
                    </div>
                    <p class="knowledge-text">${Renderer.escapeHtml(text)}</p>
                    <div class="knowledge-meta">
                        <span>${Renderer.escapeHtml(subjectLabels[subjectType])}${subjectName ? ` · ${Renderer.escapeHtml(subjectName)}` : ''}</span>
                        <span>${Renderer.escapeHtml(source)}</span>
                        <span class="knowledge-reliability">${Renderer.escapeHtml(reliabilityLabels[reliability])}</span>
                        ${timeText ? `<span>${Renderer.escapeHtml(timeText)}</span>` : ''}
                    </div>
                    ${tagsHtml}
                </article>
            `;
        }).join('');

        this.knowledgeEl.innerHTML = summaryHtml + (cardsHtml || '<p class="placeholder">该分类下暂无线索</p>');
        this.knowledgeEl.querySelectorAll('.knowledge-pill').forEach(btn => {
            btn.onclick = () => {
                if (btn.dataset.filter !== undefined) this._knowledgeFilter = btn.dataset.filter || 'all';
                if (btn.dataset.subjectFilter !== undefined) this._knowledgeSubjectFilter = btn.dataset.subjectFilter || 'all';
                this.renderKnowledge();
            };
        });
    },

    _buildProfileKnowledgeEntries(scene) {
        const sceneCharacterIds = new Set(scene.characters || []);
        const characters = (State.characters || []).filter(c => sceneCharacterIds.has(c.id));
        const entries = [];
        characters.forEach(char => {
            const discovered = scene.discoveries?.characters?.[char.id] || {};
            const facts = Array.isArray(char.profile?.hiddenFacts) ? char.profile.hiddenFacts : [];
            facts.forEach(fact => {
                const state = discovered[fact.id]?.state || 'locked';
                if (state === 'locked') return;
                const confirmed = state === 'confirmed';
                entries.push({
                    id: `profile_${char.id}_${fact.id}`,
                    subjectType: 'character',
                    subjectId: char.id,
                    level: confirmed ? 'truth' : (state === 'suspected' ? 'inference' : 'hint'),
                    title: fact.title || `${char.name}的线索`,
                    text: confirmed ? (fact.truth || fact.hint || fact.title) : (fact.hint || fact.title || '未知线索'),
                    source: '角色档案',
                    reliability: confirmed ? 'confirmed' : 'unverified',
                    tags: [char.name, fact.type || '档案'],
                    discoveredAt: discovered[fact.id]?.discoveredAt || 0
                });
            });
        });
        return entries;
    },

    _getKnowledgeSubjectName(scene, item) {
        if (!item || !item.subjectId) return '';
        if (item.subjectType === 'character') {
            return State.characters.find(c => c.id === item.subjectId)?.name || item.subjectId;
        }
        if (item.subjectType === 'location') {
            return (scene.locations || []).find(l => l.id === item.subjectId)?.name || item.subjectId;
        }
        if (item.subjectType === 'faction') {
            return (scene.factions || []).find(f => f.id === item.subjectId || f.name === item.subjectId)?.name || item.subjectId;
        }
        if (item.subjectType === 'strategy') {
            return (scene.strategies || []).find(s => s.id === item.subjectId)?.title || item.subjectId;
        }
        return item.subjectId;
    },

    renderLorebook() {
        const scene = State.scene;
        const entries = scene ? scene.lorebookEntries : [];
        if (entries.length === 0) {
            this.loreListEl.innerHTML = '<p class="placeholder">暂无世界书条目<br>点击 + 添加</p>';
            return;
        }
        this.loreListEl.innerHTML = '';
        entries.forEach((entry, idx) => {
            const div = document.createElement('div');
            div.className = 'lore-entry';
            const keysHtml = (entry.keys || []).map(k => `<span class="lore-key">${Renderer.escapeHtml(k)}</span>`).join('');
            div.innerHTML = `
                <div class="lore-entry-header">
                    <div class="lore-entry-keys">${keysHtml}</div>
                    <button class="icon-btn lore-delete-btn" data-lore-idx="${idx}" style="font-size:12px;">🗑</button>
                </div>
                <div class="lore-entry-content">${Renderer.escapeHtml(entry.content)}</div>
            `;
            div.querySelector('.lore-delete-btn').onclick = (e) => { e.stopPropagation(); Lorebook.deleteEntry(idx); };
            div.onclick = () => Lorebook.openEditor(idx);
            this.loreListEl.appendChild(div);
        });
    },

    renderInventory() {
        const scene = State.scene;
        const inventory = scene ? scene.inventory || [] : [];
        const equipment = scene ? scene.equipment || {} : {};
        const pendingExplorationRewards = (scene?.pendingExplorationRewards || [])
            .map((reward, idx) => typeof WorldEngine !== 'undefined' && WorldEngine.normalizePendingExplorationReward
                ? WorldEngine.normalizePendingExplorationReward(reward, idx)
                : reward)
            .filter(Boolean);
        const canMutateInventory = typeof WorldEngine !== 'undefined' && WorldEngine.isScenePlaying
            ? WorldEngine.isScenePlaying(scene)
            : !!scene && (!scene.gameState || scene.gameState === 'playing');
        const eqEl = document.getElementById('equipmentDisplay');
        const listEl = document.getElementById('inventoryList');
        if (!eqEl || !listEl) return;

        const slotLabels = { weapon: '⚔ 武器', armor: '🛡 防具', accessory: '💍 饰品' };
        eqEl.innerHTML = Object.entries(slotLabels).map(([slot, label]) => {
            const itemName = equipment[slot];
            const item = itemName ? inventory.find(i => i.name === itemName) : null;
            return `<div class="eq-slot ${item ? 'occupied' : ''}">
                <div class="eq-slot-label">${label}</div>
                <div class="eq-slot-item">${item ? Renderer.escapeHtml(item.name) : '空'}</div>
                ${item && canMutateInventory ? `<button class="text-btn inv-unequip-btn" data-item-name="${Renderer.escapeAttr(item.name)}" style="font-size:10px;">卸下</button>` : ''}
            </div>`;
        }).join('');

        const pendingRewardsHtml = pendingExplorationRewards.length > 0
            ? pendingExplorationRewards.slice(0, 6).map(reward => `
                <div class="inventory-item inventory-pending-reward">
                    <span class="inv-icon">⏳</span>
                    <div class="inv-info">
                        <span class="inv-name">待领取：${Renderer.escapeHtml(reward.item?.name || '探索奖励')}</span>
                        <span class="inv-desc">${Renderer.escapeHtml(reward.evidenceTitle || '探索收获')} · 清理或消耗背包物品后自动补发</span>
                    </div>
                    <span class="inv-hint">待补发</span>
                </div>
            `).join('')
            : '';

        if (inventory.length === 0 && pendingExplorationRewards.length === 0) {
            listEl.innerHTML = '<p class="placeholder">暂无物品</p>';
        } else {
            const inventoryHtml = inventory.map(item => {
                if (typeof WorldEngine !== 'undefined') WorldEngine.normalizeItem(item);
                const typeIcons = { weapon: '⚔', armor: '🛡', consumable: '🧪', quest: '📜', misc: '📦' };
                const icon = typeIcons[item.type] || '📦';
                const usesHtml = item.uses !== undefined ? `<span class="inv-effect-chip">剩余 ${Renderer.escapeHtml(item.uses)}</span>` : '';
                const statLabels = { strength: '力量', dexterity: '敏捷', constitution: '体质', intelligence: '智力', wisdom: '感知', charisma: '魅力' };
                const effectsHtml = (item.effects || []).slice(0, 3).map(effect => {
                    const label = effect.type === 'check_bonus'
                        ? `检定${effect.value >= 0 ? '+' : ''}${effect.value}${effect.stat ? ` · ${statLabels[effect.stat] || effect.stat}` : ''}${effect.consume ? ' · 需选择消耗' : ''}`
                        : effect.type === 'heal'
                            ? `使用恢复 ${effect.value}`
                        : effect.type === 'gold'
                            ? `金币${effect.value >= 0 ? '+' : ''}${effect.value}`
                        : effect.type === 'exp'
                            ? `经验+${effect.value}`
                        : effect.type === 'risk_delta'
                            ? `风险${effect.value >= 0 ? '+' : ''}${effect.value}`
                            : effect.type === 'dc_delta'
                                ? `DC${effect.value >= 0 ? '+' : ''}${effect.value}`
                                : (effect.type === 'clock_delta' || effect.type === 'clock_resist')
                                    ? `时钟${effect.value >= 0 ? '+' : ''}${effect.value}`
                                    : effect.type === 'world_tension'
                                        ? `世界紧张${effect.value >= 0 ? '+' : ''}${effect.value}`
                                    : effect.type === 'strategy_leverage'
                                        ? `计策筹码${effect.tag ? ' · ' + effect.tag : ''}`
                                        : effect.type;
                    return `<span class="inv-effect-chip">${Renderer.escapeHtml(label)}</span>`;
                }).join('');
                const tagsHtml = (item.tags || []).slice(0, 4).map(tag => `<span class="inv-tag">${Renderer.escapeHtml(tag)}</span>`).join('');
                const canUse = typeof WorldEngine !== 'undefined' && WorldEngine.canUseInventoryItem
                    ? WorldEngine.canUseInventoryItem(item) && (item.uses === undefined || Number(item.uses || 0) > 0) && Number(item.quantity || 1) > 0
                    : false;
                const depleted = (item.uses !== undefined && Number(item.uses || 0) <= 0) || Number(item.quantity || 1) <= 0;
                const canEquip = typeof WorldEngine !== 'undefined' && WorldEngine.canEquipInventoryItem
                    ? WorldEngine.canEquipInventoryItem(item)
                    : item.type !== 'consumable';
                const actionHtml = item.equipped
                    ? (canMutateInventory ? `<button class="text-btn inv-unequip-btn" data-item-name="${Renderer.escapeAttr(item.name)}" style="font-size:10px;">卸下</button>` : '<span class="inv-hint">已装备</span>')
                    : `<span class="inv-actions">
                        ${canMutateInventory && canUse ? `<button class="text-btn inv-use-btn" data-item-id="${Renderer.escapeAttr(item.id || '')}" data-item-name="${Renderer.escapeAttr(item.name)}" style="font-size:10px;">使用</button>` : ''}
                        ${canMutateInventory && canEquip ? `<button class="text-btn inv-equip-btn" data-item-name="${Renderer.escapeAttr(item.name)}" style="font-size:10px;">装备</button>` : (!canMutateInventory ? '<span class="inv-hint">回顾</span>' : (!canUse ? `<span class="inv-hint">${depleted ? '已用尽' : '检定时可用'}</span>` : ''))}
                    </span>`;
                return `<div class="inventory-item ${item.equipped ? 'equipped' : ''}">
                    <span class="inv-icon">${icon}</span>
                    <div class="inv-info">
                        <span class="inv-name">${Renderer.escapeHtml(item.name)}</span>
                        <span class="inv-desc">${Renderer.escapeHtml(item.description || '')}</span>
                        ${usesHtml || effectsHtml ? `<span class="inv-effects">${usesHtml}${effectsHtml}</span>` : ''}
                        ${tagsHtml ? `<span class="inv-tags">${tagsHtml}</span>` : ''}
                    </div>
                    <span class="inv-qty">${item.quantity > 1 ? 'x' + item.quantity : ''}</span>
                    ${actionHtml}
                </div>`;
            }).join('');
            listEl.innerHTML = `${pendingRewardsHtml}${inventoryHtml}`;
        }

        // 绑定按钮事件（避免动态 onclick 属性带来的注入风险）
        eqEl.querySelectorAll('.inv-unequip-btn').forEach(btn => {
            btn.onclick = () => this._unequipItem(btn.dataset.itemName);
        });
        listEl.querySelectorAll('.inv-equip-btn').forEach(btn => {
            btn.onclick = () => this._equipItem(btn.dataset.itemName);
        });
        listEl.querySelectorAll('.inv-use-btn').forEach(btn => {
            btn.onclick = () => this._useItem(btn.dataset.itemId || btn.dataset.itemName);
        });
        listEl.querySelectorAll('.inv-unequip-btn').forEach(btn => {
            btn.onclick = () => this._unequipItem(btn.dataset.itemName);
        });
    },

    _useItem(ref) {
        const scene = State.scene;
        if (!scene || typeof WorldEngine === 'undefined' || !WorldEngine.useInventoryItem) return;
        const result = WorldEngine.useInventoryItem(scene, ref);
        if (!result.ok) {
            showToast(result.message || '无法使用这个物品');
            return;
        }
        State.saveCurrentSceneDebounced();
        this.renderInventory();
    },

    _equipItem(name) {
        const scene = State.scene;
        if (!scene || typeof WorldEngine === 'undefined' || !WorldEngine.equipInventoryItem) return;
        const result = WorldEngine.equipInventoryItem(scene, name);
        if (!result.ok) {
            showToast(result.message || '无法装备这个物品');
            return;
        }
        State.saveCurrentSceneDebounced();
        this.renderInventory();
    },

    _unequipItem(name) {
        const scene = State.scene;
        if (!scene || typeof WorldEngine === 'undefined' || !WorldEngine.unequipInventoryItem) return;
        const result = WorldEngine.unequipInventoryItem(scene, name);
        if (!result.ok) {
            showToast(result.message || '无法卸下这个物品');
            return;
        }
        State.saveCurrentSceneDebounced();
        this.renderInventory();
    },

    _renderPlayerSheet() {
        const scene = State.scene;
        const persona = scene?.playerPersona;
        const st = scene?.playerStats;
        const equipment = scene?.equipment;
        const inventory = scene?.inventory || [];
        const canMutatePlayer = typeof WorldEngine !== 'undefined' && WorldEngine.isScenePlaying
            ? WorldEngine.isScenePlaying(scene)
            : !!scene && (!scene.gameState || scene.gameState === 'playing');

        if (!persona) {
            this.detailEl.innerHTML = '<div class="detail-placeholder"><p>尚未创建玩家角色</p></div>';
            return;
        }

        const safeAvatar = Renderer.safeUrl(persona.avatar);
        const avatarHtml = safeAvatar
            ? `<img class="detail-avatar" src="${Renderer.escapeAttr(safeAvatar)}" alt="${Renderer.escapeAttr(persona.name)}" style="border-color:var(--blue);">`
            : `<div class="detail-avatar" style="background:var(--blue);display:flex;align-items:center;justify-content:center;color:#fff;font-size:36px;font-weight:bold;margin:0 auto 12px;">${Renderer.escapeHtml(persona.name[0])}</div>`;

        const m = v => v >= 10 ? `+${Math.floor((v-10)/2)}` : `${Math.floor((v-10)/2)}`;
        const statDefs = [
            { key: 'strength', icon: 'str', label: '力量' },
            { key: 'dexterity', icon: 'dex', label: '敏捷' },
            { key: 'constitution', icon: 'con', label: '体质' },
            { key: 'intelligence', icon: 'int', label: '智力' },
            { key: 'wisdom', icon: 'wis', label: '感知' },
            { key: 'charisma', icon: 'cha', label: '魅力' }
        ];
        const attrPts = scene?.attrPoints || 0;
        const statsHtml = st ? statDefs.map(d =>
            `<span class="detail-stat-row">${Icons.get(d.icon, { size: 13 })}<span>${Renderer.escapeHtml(d.label)} ${st[d.key]}(${m(st[d.key])})</span>${attrPts > 0 && canMutatePlayer ? `<button class="stat-plus-btn" data-stat="${d.key}" title="分配 1 点">+</button>` : ''}</span>`
        ).join('') : '';
        const attrPtsHtml = attrPts > 0
            ? `<div class="attr-pts-hint">${canMutatePlayer ? '可分配属性点' : '未分配属性点'}：${attrPts}${canMutatePlayer ? '' : '（冒险已结束）'}</div>`
            : '';

        const eqSlots = equipment ? [
            `⚔ ${Renderer.escapeHtml(equipment.weapon || '无')}`,
            `🛡 ${Renderer.escapeHtml(equipment.armor || '无')}`,
            `💍 ${Renderer.escapeHtml(equipment.accessory || '无')}`
        ] : [];

        this.detailEl.innerHTML = `
            ${avatarHtml}
            <div class="detail-name" style="color:var(--blue);">${Renderer.escapeHtml(persona.name)}</div>
            ${persona.personality ? `<div class="detail-tags"><span class="detail-tag">${Renderer.escapeHtml(persona.personality)}</span></div>` : ''}
            ${statsHtml ? `<div class="detail-section"><h4>属性</h4>${attrPtsHtml}<div class="stat-display" style="grid-template-columns:1fr;">${statsHtml}</div></div>` : ''}
            ${eqSlots.length > 0 ? `<div class="detail-section"><h4>装备</h4><p style="font-size:12px;">${eqSlots.join(' · ')}</p></div>` : ''}
            ${inventory.length > 0 ? `<div class="detail-section"><h4>物品 (${inventory.length})</h4><p style="font-size:12px;">${inventory.map(i => `${Renderer.escapeHtml(i.name)}${i.equipped ? ' [已装备]' : ''}`).join('、')}</p></div>` : ''}
            ${persona.goal ? `<div class="detail-section"><h4>目标</h4><p>${Renderer.escapeHtml(persona.goal)}</p></div>` : ''}
            <div style="margin-top:16px;text-align:center;">
                <button class="btn btn-secondary" id="editPlayerBtn">编辑角色</button>
            </div>
        `;
        document.getElementById('editPlayerBtn').onclick = () => PlayerCreator.open();
        // 属性分配按钮
        this.detailEl.querySelectorAll('.stat-plus-btn').forEach(btn => {
            btn.onclick = () => this._allocStat(btn.dataset.stat);
        });
    },

    /** 分配 1 点属性 */
    _allocStat(key) {
        if (this._allocating) return;
        const scene = State.scene;
        if (!scene || !scene.playerStats || (scene.attrPoints || 0) <= 0) return;
        this._allocating = true;
        let result = { ok: false, message: '无法分配属性点' };
        if (typeof WorldEngine !== 'undefined' && WorldEngine.allocateStatPoint) {
            result = WorldEngine.allocateStatPoint(scene, key);
        } else {
            console.warn('[SidebarRight] WorldEngine.allocateStatPoint 不可用，跳过属性点分配');
            result = { ok: false, message: '属性点系统不可用。' };
        }
        if (result.ok) {
            State.saveCurrentSceneDebounced();
            this.renderDetail();
            if (typeof ActionBar !== 'undefined' && ActionBar.renderStatsDisplay) ActionBar.renderStatsDisplay();
            showToast(`${result.label} +1`);
        } else {
            showToast(result.message || '无法分配属性点');
        }
        this._allocating = false;
    },

    renderDetail() {
        const char = State.character;
        if (!char) {
            this.detailEl.style.display = 'block';
            this._renderPlayerSheet();
            return;
        }
        this.detailPlaceholder.style.display = 'none';
        this.detailEl.style.display = 'block';

        const safeAvatar = Renderer.safeUrl(char.avatar);
        const avatarHtml = safeAvatar
            ? `<img class="detail-avatar" src="${Renderer.escapeAttr(safeAvatar)}" alt="${Renderer.escapeAttr(char.name)}">`
            : `<div class="detail-avatar" style="background:var(--gold-dim);display:flex;align-items:center;justify-content:center;color:#fff;font-size:36px;font-weight:bold;margin:0 auto 12px;">${Renderer.escapeHtml(char.name[0])}</div>`;

        const relation = char._relations?.[State.scene?.userName || '旅人'];
        const affection = relation ? relation.affection : 0;
        const trust = relation?.trust || 0;
        const suspicion = relation?.suspicion || 0;
        const fear = relation?.fear || 0;
        const debt = relation?.debt || 0;
        const profile = char.profile || {};
        const publicProfile = profile.public || {};
        const hiddenFacts = Array.isArray(profile.hiddenFacts) ? profile.hiddenFacts : [];
        const characterDiscovery = State.scene?.discoveries?.characters?.[char.id] || {};
        const knowledgeItems = (State.scene?.knowledge?.discoveries || [])
            .filter(item => item.subjectType === 'character' && item.subjectId === char.id)
            .slice(-8);
        const levelLabels = { hint: '观察', rumor: '传闻', evidence: '证据', inference: '推论', truth: '确认' };
        const title = publicProfile.title || char.tags?.[0] || '身份未明';
        const relationTags = [
            `好感:${affection}`,
            trust ? `信任:${trust}` : '',
            suspicion ? `警觉:${suspicion}` : '',
            fear ? `畏惧:${fear}` : '',
            debt ? `人情:${debt}` : ''
        ].filter(Boolean);
        const knowledgeHtml = knowledgeItems.length > 0
            ? knowledgeItems.map(item => `<div class="st-clue st-clue-${item.reliability || 'unverified'}">
                <span class="st-clue-badge">${levelLabels[item.level] || '线索'}</span>
                <span class="st-clue-text">${Renderer.escapeHtml(item.text || item.title)}</span>
            </div>`).join('')
            : '<p class="placeholder">尚未掌握关于此人的可靠线索</p>';
        const firstImpression = publicProfile.firstImpression || '尚未形成可靠公开印象';
        const hiddenFactsHtml = hiddenFacts.length > 0
            ? hiddenFacts.map(fact => {
                const state = characterDiscovery[fact.id]?.state || 'locked';
                const isConfirmed = state === 'confirmed';
                const isKnown = state === 'hinted' || state === 'suspected' || isConfirmed;
                const text = isConfirmed ? fact.truth : (isKnown ? fact.hint : '???');
                const unlock = fact.unlock?.trust
                    ? `需要信任 ${fact.unlock.trust}+ 或相关调查`
                    : '需要调查或对话解锁';
                return `<div class="st-step st-step-${isConfirmed ? 'done' : (isKnown ? 'active' : 'pending')}">
                    <span class="st-step-idx">${isConfirmed ? '✓' : '?'}</span>
                    <span class="st-step-text">${Renderer.escapeHtml(text)}</span>
                    <span class="st-step-status">${isKnown ? Renderer.escapeHtml(state) : Renderer.escapeHtml(unlock)}</span>
                </div>`;
            }).join('')
            : '<p class="placeholder">暂无可解锁档案槽</p>';
        const canShowDebugSpoilers = typeof State.canShowDebugSpoilers === 'function' && State.canShowDebugSpoilers();
        const debugSpoilerHtml = canShowDebugSpoilers ? `
            <details class="detail-spoiler">
                <summary>作者/调试：完整角色卡 <span class="spoiler-warn">(剧透)</span></summary>
                <div class="spoiler-content">
                    <div class="detail-section">
                        <h4>背景</h4>
                        <p>${Renderer.escapeHtml(char.description || '无')}</p>
                    </div>
                    <div class="detail-section">
                        <h4>性格</h4>
                        <p>${Renderer.escapeHtml(char.personality || '无')}</p>
                    </div>
                    ${char.creed ? `<div class="detail-section detail-creed">
                        <h4>⚖ 信条</h4>
                        <p class="creed-text">${Renderer.escapeHtml(char.creed)}</p>
                        ${char.values ? `<p class="creed-values"><span class="creed-label">价值排序：</span>${Renderer.escapeHtml(char.values)}</p>` : ''}
                        ${Array.isArray(char.redLines) && char.redLines.length > 0 ? `<div class="creed-redlines"><span class="creed-label">绝不：</span><ul>${char.redLines.map(r => `<li>${Renderer.escapeHtml(r)}</li>`).join('')}</ul></div>` : ''}
                    </div>` : ''}
                    <div class="detail-section">
                        <h4>场景</h4>
                        <p>${Renderer.escapeHtml(char.scenario || '无')}</p>
                    </div>
                </div>
            </details>
            <div style="margin-top:16px;text-align:center;">
                <button class="btn btn-secondary" id="editCharBtn">编辑角色</button>
            </div>
        ` : '';

        this.detailEl.innerHTML = `
            ${avatarHtml}
            <div class="detail-name">${Renderer.escapeHtml(char.name)}</div>
            <div class="detail-tags">
                ${char.tags?.map(t => `<span class="detail-tag">${Renderer.escapeHtml(t)}</span>`).join('') || ''}
                ${relationTags.map(t => `<span class="detail-tag">${Renderer.escapeHtml(t)}</span>`).join('')}
                ${relation?.mood ? `<span class="detail-tag">${Renderer.escapeHtml(relation.mood)}</span>` : ''}
            </div>
            <div class="detail-section">
                <h4>公开档案</h4>
                <p><strong>${Renderer.escapeHtml(title)}</strong></p>
                <p>${Renderer.escapeHtml(firstImpression)}</p>
            </div>
            <div class="detail-section">
                <h4>已知线索</h4>
                ${knowledgeHtml}
            </div>
            <div class="detail-section">
                <h4>未解锁信息</h4>
                <div class="st-steps">${hiddenFactsHtml}</div>
            </div>
            ${debugSpoilerHtml}
        `;
        const editCharBtn = document.getElementById('editCharBtn');
        if (editCharBtn) editCharBtn.onclick = () => CharacterEditor.open(char.id);
    },

    renderStrategies() {
        const scene = State.scene;
        if (!this.strategiesEl) return;
        if (!scene || !scene.strategies || scene.strategies.length === 0) {
            this.strategiesEl.innerHTML = '<p class="placeholder">暂无计策<br>直接输入“我想制定一个计划...”提出目标</p>';
            return;
        }

        const active = scene.strategies.find(s => s.id === scene.activeStrategyId) || scene.strategies[0];
        const others = scene.strategies.filter(s => s.id !== active.id);
        const canMutateStrategy = typeof WorldEngine !== 'undefined' && WorldEngine.isScenePlaying
            ? WorldEngine.isScenePlaying(scene)
            : (!scene.gameState || scene.gameState === 'playing');

        const riskPct = Math.min(100, Math.max(0, active.risk || 0));
        const progressPct = Math.min(100, Math.max(0, active.progress || 0));
        const exposurePct = Math.min(100, Math.max(0, active.exposure || 0));
        const tension = scene.worldTension || 0;

        const statusLabels = {
            draft: '草稿', preparing: '筹备中', executing: '执行中', exposed: '已暴露',
            resolved: '已解决', failed: '失败'
        };
        const phaseLabels = {
            intel: '情报', setup: '准备', action: '行动', complication: '转折', resolution: '结局'
        };

        const participantsHtml = (active.participants || []).map(p => {
            const trust = p.trust || 0;
            const suspicion = p.suspicion || 0;
            return `<div class="st-participant">
                <span class="st-participant-name">${Renderer.escapeHtml(p.name)}</span>
                <span class="st-participant-role">${Renderer.escapeHtml(p.role || '参与者')}</span>
                <div class="st-mini-bars">
                    <span title="信任">信 ${trust}</span>
                    <span title="警觉">警 ${suspicion}</span>
                </div>
            </div>`;
        }).join('');

        const stepsHtml = (active.steps || []).map((step, i) => {
            const statusLabelsStep = { pending: '待办', active: '进行中', done: '完成', failed: '失败' };
            const cls = step.status || 'pending';
            return `<div class="st-step st-step-${cls}">
                <span class="st-step-idx">${i + 1}</span>
                <span class="st-step-text">${Renderer.escapeHtml(step.text)}</span>
                <span class="st-step-status">${statusLabelsStep[cls] || '待办'}</span>
            </div>`;
        }).join('');

        const cluesHtml = (active.clues || []).map(c => {
            const relLabel = { rumor: '传闻', confirmed: '确认', false: '虚假' };
            return `<div class="st-clue st-clue-${c.reliability || 'rumor'}">
                <span class="st-clue-badge">${relLabel[c.reliability] || '传闻'}</span>
                <span class="st-clue-text">${Renderer.escapeHtml(c.text)}</span>
            </div>`;
        }).join('');
        const intelHtml = [
            ...(active.requiredIntel || []).map(x => ({ type: '需要', text: x })),
            ...(active.usedIntel || []).map(x => ({ type: '已用', text: x }))
        ].map(item => `<span class="st-intel-chip st-intel-${item.type === '已用' ? 'used' : 'required'}">${Renderer.escapeHtml(item.type)}：${Renderer.escapeHtml(item.text)}</span>`).join('');
        const counterplayHtml = (active.counterplay || []).map(item =>
            `<span class="st-intel-chip st-intel-counter">${Renderer.escapeHtml(item)}</span>`
        ).join('');
        const strategyItems = typeof WorldEngine !== 'undefined' && WorldEngine.getStrategyItemResources
            ? WorldEngine.getStrategyItemResources(scene, active, { limit: 6 })
            : [];
        const strategyItemsHtml = strategyItems.map(item => {
            const details = [
                item.riskDelta ? `风险${item.riskDelta >= 0 ? '+' : ''}${item.riskDelta}` : '',
                item.dcDelta ? `DC${item.dcDelta >= 0 ? '+' : ''}${item.dcDelta}` : '',
                item.checkBonus ? `检定${item.checkBonus >= 0 ? '+' : ''}${item.checkBonus}` : '',
                item.consume ? '会消耗' : ''
            ].filter(Boolean).join(' · ');
            return `<div class="st-clue st-item-resource">
                <span class="st-clue-badge">物品</span>
                <span class="st-clue-text">${Renderer.escapeHtml(item.name)}：${Renderer.escapeHtml(item.label)}${details ? `（${Renderer.escapeHtml(details)}）` : ''}</span>
            </div>`;
        }).join('');

        const othersHtml = others.length > 0
            ? `<div class="st-others"><h4>其他计策</h4>${others.map(s =>
                `<div class="st-other-item" data-st-id="${Renderer.escapeAttr(s.id)}">
                    <span class="st-other-title">${Renderer.escapeHtml(s.title)}</span>
                    <span class="st-other-status">${statusLabels[s.status] || s.status}</span>
                </div>`).join('')}</div>`
            : '';

        this.strategiesEl.innerHTML = `
            <div class="st-active-card">
                <div class="st-header">
                    <div class="st-title">${Renderer.escapeHtml(active.title)}</div>
                    <div class="st-badges">
                        <span class="st-badge st-status-${active.status}">${statusLabels[active.status] || active.status}</span>
                        <span class="st-badge">${phaseLabels[active.phase] || active.phase || '—'}</span>
                    </div>
                </div>
                <div class="st-goal"><strong>目标：</strong>${Renderer.escapeHtml(active.goal)}</div>
                <div class="st-bars">
                    <div class="st-bar-row"><span>风险</span><div class="st-bar"><div class="st-bar-fill st-risk" style="width:${riskPct}%"></div></div><span>${riskPct}%</span></div>
                    <div class="st-bar-row"><span>进度</span><div class="st-bar"><div class="st-bar-fill st-progress" style="width:${progressPct}%"></div></div><span>${progressPct}%</span></div>
                    <div class="st-bar-row"><span>暴露</span><div class="st-bar"><div class="st-bar-fill st-exposure" style="width:${exposurePct}%"></div></div><span>${exposurePct}%</span></div>
                    <div class="st-bar-row"><span>世界紧张度</span><div class="st-bar"><div class="st-bar-fill st-tension" style="width:${Math.min(100, Math.max(0, tension))}%"></div></div><span>${tension}</span></div>
                </div>
                ${active.stakes ? `<div class="st-stakes"><strong>赌注：</strong>${Renderer.escapeHtml(active.stakes)}</div>` : ''}
                ${intelHtml ? `<div class="st-section"><h4>情报资源</h4><div class="st-intel-list">${intelHtml}</div></div>` : ''}
                ${counterplayHtml ? `<div class="st-section"><h4>反制解法</h4><div class="st-intel-list">${counterplayHtml}</div></div>` : ''}
                ${strategyItemsHtml ? `<div class="st-section"><h4>可用物品</h4><div class="st-clues">${strategyItemsHtml}</div></div>` : ''}
                ${stepsHtml ? `<div class="st-section"><h4>步骤</h4><div class="st-steps">${stepsHtml}</div></div>` : ''}
                ${participantsHtml ? `<div class="st-section"><h4>参与 NPC</h4><div class="st-participants">${participantsHtml}</div></div>` : ''}
                ${cluesHtml ? `<div class="st-section"><h4>情报</h4><div class="st-clues">${cluesHtml}</div></div>` : ''}
                ${active.latestOutcome ? `<div class="st-section"><h4>最近结果</h4><div class="st-outcome">${Renderer.escapeHtml(active.latestOutcome)}</div></div>` : ''}
                ${canMutateStrategy ? `<div class="st-actions">
                    <button class="btn btn-secondary" id="stAbandonBtn">放弃</button>
                    <button class="btn btn-primary" id="stReplanBtn">重新规划</button>
                </div>` : '<div class="st-outcome">冒险已结束，计策仅供回顾。</div>'}
            </div>
            ${othersHtml}
        `;

        const abandonBtn = document.getElementById('stAbandonBtn');
        if (abandonBtn) abandonBtn.onclick = () => StrategyManager.abandonStrategy(active.id);
        const replanBtn = document.getElementById('stReplanBtn');
        if (replanBtn) replanBtn.onclick = () => {
            const input = document.getElementById('chatInput');
            if (input) {
                State.isOOC = false;
                State.inputMode = 'talk';
                ChatUI._syncInputMode();
                input.value = `我想重新规划「${active.title}」：`;
                input.focus();
            }
        };

        this.strategiesEl.querySelectorAll('.st-other-item').forEach(el => {
            el.onclick = () => StrategyManager.setActiveStrategy(el.dataset.stId);
        });
    }
};
