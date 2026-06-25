/**
 * 世界推进引擎
 * 负责局势时钟、剧情弧、NPC 日程、消息可见性和物品效果的轻量规则。
 */
const WorldEngine = {
    clockVisibilities: ['hidden', 'hinted', 'known'],
    counterStatuses: ['active', 'revealed', 'resolved'],

    normalizeScene(scene) {
        if (!scene) return scene;
        if (!Array.isArray(scene.clocks)) scene.clocks = [];
        if (!Array.isArray(scene.counterStrategies)) scene.counterStrategies = [];
        scene.flowGuide = this.normalizeFlowGuide(scene.flowGuide);
        if (!scene.currentSituation || typeof scene.currentSituation !== 'object') {
            scene.currentSituation = { recentRisks: [], recommendedActions: [] };
        }
        if (!Array.isArray(scene.currentSituation.recentRisks)) scene.currentSituation.recentRisks = [];
        if (!Array.isArray(scene.currentSituation.recommendedActions)) scene.currentSituation.recommendedActions = [];
        if (typeof scene.turnCount !== 'number') scene.turnCount = 0;

        scene.clocks = scene.clocks.map(c => this.normalizeClock(c)).filter(Boolean).slice(0, 12);
        scene.counterStrategies = scene.counterStrategies.map(c => this.normalizeCounterStrategy(c)).filter(Boolean).slice(0, 20);
        (State.activeCharacters || []).forEach(char => this.normalizeAgenda(char));
        return scene;
    },

    normalizeFlowGuide(flowGuide = {}) {
        const guide = flowGuide && typeof flowGuide === 'object' ? flowGuide : {};
        const list = (key, limit, itemLimit = 140) => (
            Array.isArray(guide[key]) ? guide[key] : []
        ).map(s => String(s || '').trim()).filter(Boolean).map(s => s.slice(0, itemLimit)).slice(0, limit);
        return {
            openingMoves: list('openingMoves', 8),
            sessionGoals: list('sessionGoals', 8),
            stalledPrompts: list('stalledPrompts', 8),
            failForward: list('failForward', 8, 220),
            completedMoves: list('completedMoves', 20)
        };
    },

    normalizeClock(clock = {}) {
        if (!clock || typeof clock !== 'object') return null;
        const max = this._clamp(Number(clock.max || 6), 2, 12);
        const value = this._clamp(Number(clock.value || 0), 0, max);
        const visibility = this.clockVisibilities.includes(clock.visibility) ? clock.visibility : 'known';
        return {
            id: String(clock.id || 'clock_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)),
            name: String(clock.name || '局势时钟').slice(0, 80),
            tag: String(clock.tag || '').slice(0, 40),
            value,
            max,
            visibility,
            description: String(clock.description || '').slice(0, 300),
            trigger: this.normalizeClockTrigger(clock.trigger, max),
            firedTriggers: Array.isArray(clock.firedTriggers) ? clock.firedTriggers.map(Number).filter(Number.isFinite) : [],
            updatedAt: typeof clock.updatedAt === 'number' ? clock.updatedAt : Date.now()
        };
    },

    normalizeClockTrigger(trigger, max = 6) {
        if (!trigger || typeof trigger !== 'object') return null;
        return {
            at: this._clamp(Number(trigger.at || max), 1, max),
            event: String(trigger.event || '局势发生变化').slice(0, 240),
            knowledge: trigger.knowledge && typeof trigger.knowledge === 'object' ? trigger.knowledge : null
        };
    },

    normalizeCounterStrategy(data = {}) {
        if (!data || typeof data !== 'object') return null;
        const status = this.counterStatuses.includes(data.status) ? data.status : 'active';
        const visibility = this.clockVisibilities.includes(data.visibility) ? data.visibility : 'hinted';
        return {
            id: String(data.id || 'counter_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)),
            title: String(data.title || '敌方反制').slice(0, 100),
            actorId: data.actorId ? String(data.actorId) : '',
            actorName: data.actorName ? String(data.actorName).slice(0, 80) : '',
            target: String(data.target || '').slice(0, 120),
            status,
            visibility,
            progress: this._clamp(Number(data.progress || 0), 0, 100),
            exposure: this._clamp(Number(data.exposure || 0), 0, 100),
            counterplay: Array.isArray(data.counterplay) ? data.counterplay.map(String).slice(0, 6) : [],
            hint: String(data.hint || '').slice(0, 240),
            lastAction: String(data.lastAction || '').slice(0, 240),
            createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now(),
            updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now()
        };
    },

    normalizeAgenda(character) {
        if (!character) return null;
        if (!character.agenda || typeof character.agenda !== 'object') {
            character.agenda = {
                currentPlan: '',
                priority: 0,
                schedule: [],
                offscreenActions: [],
                lastActionTurn: 0
            };
            return character.agenda;
        }
        const agenda = character.agenda;
        agenda.currentPlan = String(agenda.currentPlan || '').slice(0, 220);
        agenda.priority = this._clamp(Number(agenda.priority || 0), 0, 100);
        agenda.schedule = Array.isArray(agenda.schedule) ? agenda.schedule.map(String).slice(0, 8) : [];
        agenda.offscreenActions = Array.isArray(agenda.offscreenActions) ? agenda.offscreenActions.map(String).slice(0, 12) : [];
        agenda.lastActionTurn = Number.isFinite(Number(agenda.lastActionTurn)) ? Number(agenda.lastActionTurn) : 0;
        return agenda;
    },

    normalizeItem(item = {}) {
        if (!item || typeof item !== 'object') return item;
        item.tags = Array.isArray(item.tags) ? item.tags.map(String).slice(0, 12) : [];
        item.effects = Array.isArray(item.effects) ? item.effects.map(effect => this.normalizeItemEffect(effect)).filter(Boolean).slice(0, 10) : [];
        if (item.uses !== undefined) {
            const uses = Number(item.uses);
            item.uses = Number.isFinite(uses) ? Math.max(0, Math.floor(uses)) : undefined;
        }
        return item;
    },

    normalizeItemEffect(effect = {}) {
        if (!effect || typeof effect !== 'object') return null;
        const type = String(effect.type || '').slice(0, 40);
        if (!type) return null;
        const statMap = {
            '力量': 'strength',
            '敏捷': 'dexterity',
            '体质': 'constitution',
            '智力': 'intelligence',
            '感知': 'wisdom',
            '魅力': 'charisma'
        };
        const stat = effect.stat ? String(effect.stat) : '';
        return {
            type,
            stat: statMap[stat] || stat,
            actionType: effect.actionType ? String(effect.actionType) : '',
            clockTag: effect.clockTag ? String(effect.clockTag) : '',
            value: Number.isFinite(Number(effect.value)) ? Number(effect.value) : 0,
            when: effect.when ? String(effect.when).slice(0, 120) : '',
            consume: effect.consume === true
        };
    },

    applyClockUpdate(scene, updates) {
        if (!scene || !Array.isArray(updates)) return { changed: false, triggered: [] };
        this.normalizeScene(scene);
        let changed = false;
        const triggered = [];

        updates.slice(0, 12).forEach(update => {
            if (!update || typeof update !== 'object') return;
            const id = update.id ? String(update.id) : '';
            const name = update.name ? String(update.name) : '';
            let clock = scene.clocks.find(c => (id && c.id === id) || (name && c.name === name));
            if (!clock) {
                clock = this.normalizeClock(update);
                if (!clock) return;
                scene.clocks.push(clock);
                changed = true;
            }

            const oldValue = Number(clock.value || 0);
            if (update.name !== undefined) clock.name = String(update.name).slice(0, 80);
            if (update.tag !== undefined) clock.tag = String(update.tag).slice(0, 40);
            if (update.description !== undefined) clock.description = String(update.description).slice(0, 300);
            if (update.visibility !== undefined && this.clockVisibilities.includes(update.visibility)) clock.visibility = update.visibility;
            if (update.max !== undefined) clock.max = this._clamp(Number(update.max), 2, 12);
            if (update.trigger !== undefined) clock.trigger = this.normalizeClockTrigger(update.trigger, clock.max);
            if (update.value !== undefined) {
                clock.value = this._clamp(Number(update.value), 0, clock.max);
            }
            if (update.delta !== undefined) {
                clock.value = this._clamp(Number(clock.value || 0) + Number(update.delta || 0), 0, clock.max);
            }
            clock.updatedAt = Date.now();
            const events = this._collectClockTriggers(scene, clock, oldValue, String(update.reason || '局势推进'));
            triggered.push(...events);
            changed = true;
        });

        return { changed, triggered };
    },

    applyStoryArcUpdate(scene, updates) {
        if (!scene || !Array.isArray(updates)) return false;
        if (!Array.isArray(scene.storyArcs)) scene.storyArcs = [];
        let changed = false;
        updates.slice(0, 8).forEach(update => {
            if (!update || typeof update !== 'object') return;
            const title = update.title ? String(update.title) : '';
            let arc = scene.storyArcs.find(a => (update.id && a.id === update.id) || (title && a.title === title));
            if (!arc && title) {
                arc = { id: update.id || 'arc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6), title, phase: 'intro', synopsis: '', beats: [], currentBeat: 0 };
                scene.storyArcs.push(arc);
            }
            if (!arc) return;
            if (update.phase !== undefined) {
                const phases = ['intro', 'rising', 'twist', 'climax', 'resolution'];
                arc.phase = phases.includes(update.phase) ? update.phase : arc.phase || 'intro';
            }
            if (update.synopsis !== undefined) arc.synopsis = String(update.synopsis).slice(0, 400);
            if (Array.isArray(update.beats)) arc.beats = update.beats.slice(0, 8);
            const beats = Array.isArray(arc.beats) ? arc.beats : [];
            if (update.currentBeat !== undefined) {
                arc.currentBeat = this._clamp(Number(update.currentBeat), 0, Math.max(beats.length, 0));
            } else if (update.advance === true || Number(update.advanceBy || 0) !== 0) {
                const step = update.advance === true ? 1 : Number(update.advanceBy || 0);
                arc.currentBeat = this._clamp(Number(arc.currentBeat || 0) + step, 0, Math.max(beats.length, 0));
            }
            arc.lastReason = String(update.reason || arc.lastReason || '').slice(0, 240);
            arc.updatedAt = Date.now();
            changed = true;
        });
        return changed;
    },

    applyCounterStrategyUpdate(scene, updates) {
        if (!scene || !Array.isArray(updates)) return false;
        this.normalizeScene(scene);
        let changed = false;
        updates.slice(0, 12).forEach(update => {
            if (!update || typeof update !== 'object') return;
            const id = update.id ? String(update.id) : '';
            let counter = scene.counterStrategies.find(c => id && c.id === id);
            if (!counter) {
                counter = this.normalizeCounterStrategy(update);
                if (!counter) return;
                scene.counterStrategies.push(counter);
                changed = true;
            }
            ['title', 'actorId', 'actorName', 'target', 'hint', 'lastAction'].forEach(key => {
                if (update[key] !== undefined) counter[key] = String(update[key]).slice(0, key === 'lastAction' || key === 'hint' ? 240 : 120);
            });
            if (update.status !== undefined && this.counterStatuses.includes(update.status)) counter.status = update.status;
            if (update.visibility !== undefined && this.clockVisibilities.includes(update.visibility)) counter.visibility = update.visibility;
            if (update.progress !== undefined) counter.progress = this._clamp(Number(update.progress), 0, 100);
            if (update.progressDelta !== undefined) counter.progress = this._clamp(Number(counter.progress || 0) + Number(update.progressDelta || 0), 0, 100);
            if (update.exposure !== undefined) counter.exposure = this._clamp(Number(update.exposure), 0, 100);
            if (update.exposureDelta !== undefined) counter.exposure = this._clamp(Number(counter.exposure || 0) + Number(update.exposureDelta || 0), 0, 100);
            if (Array.isArray(update.counterplay)) counter.counterplay = update.counterplay.map(String).slice(0, 6);
            counter.updatedAt = Date.now();
            changed = true;
        });
        return changed;
    },

    applyNpcAgendaUpdate(updates) {
        if (!Array.isArray(updates)) return false;
        let changed = false;
        updates.slice(0, 20).forEach(update => {
            if (!update || typeof update !== 'object' || !update.characterId) return;
            const char = State.characters.find(c => c.id === update.characterId);
            if (!char) return;
            const agenda = this.normalizeAgenda(char);
            if (update.currentPlan !== undefined) agenda.currentPlan = String(update.currentPlan).slice(0, 220);
            if (update.priority !== undefined) agenda.priority = this._clamp(Number(update.priority), 0, 100);
            if (Array.isArray(update.schedule)) agenda.schedule = update.schedule.map(String).slice(0, 8);
            if (Array.isArray(update.offscreenActions)) agenda.offscreenActions = update.offscreenActions.map(String).slice(0, 12);
            if (update.lastActionTurn !== undefined) agenda.lastActionTurn = Number(update.lastActionTurn) || 0;
            Storage.saveCharacter(char).catch(e => console.warn('保存 NPC 日程失败:', e));
            changed = true;
        });
        if (changed) State.emit('charactersChanged', State.characters);
        return changed;
    },

    async tickAfterPlayerTurn(reason = 'player_turn') {
        const scene = State.scene;
        if (!scene) return;
        this.normalizeScene(scene);
        scene.turnCount = Number(scene.turnCount || 0) + 1;

        const activeClock = this._selectClockForTick(scene, reason);
        if (activeClock && this._shouldAdvanceClock(scene, reason)) {
            this.applyClockUpdate(scene, [{
                id: activeClock.id,
                delta: reason === 'rest' ? 2 : 1,
                reason
            }]);
        }

        const offscreenMessages = this.runNpcOffscreenActions(scene);
        offscreenMessages.forEach(content => {
            const brief = String(content).replace(/^【离屏行动】/, '暗处变化：');
            scene.currentSituation.recentRisks.push(brief);
        });
        if (offscreenMessages.length > 0 && typeof SidebarRight !== 'undefined') {
            SidebarRight.markTabNew?.('situation');
        }
        this._trimSituation(scene);
        SidebarRight.renderSituation?.();
        await State.saveCurrentSceneDebounced();
    },

    runNpcOffscreenActions(scene) {
        const out = [];
        const turn = Number(scene.turnCount || 0);
        const chars = State.activeCharacters || [];
        chars.forEach(char => {
            const agenda = this.normalizeAgenda(char);
            if (!agenda.currentPlan && agenda.offscreenActions.length === 0) return;
            const interval = agenda.priority >= 70 ? 2 : 3;
            if (turn <= 0 || turn - Number(agenda.lastActionTurn || 0) < interval) return;
            const action = agenda.offscreenActions.length > 0
                ? agenda.offscreenActions[turn % agenda.offscreenActions.length]
                : agenda.currentPlan;
            agenda.lastActionTurn = turn;
            const target = agenda.currentPlan || action;
            const existing = (scene.counterStrategies || []).find(c =>
                c.status === 'active' &&
                c.actorId === char.id &&
                (c.target === target || c.title === `${char.name}的离屏行动`)
            );
            if (existing) {
                existing.progress = this._clamp(Number(existing.progress || 0) + Math.max(8, Math.ceil((agenda.priority || 0) / 8)), 0, 100);
                existing.exposure = this._clamp(Number(existing.exposure || 0) + (agenda.priority >= 60 ? 8 : 4), 0, 100);
                existing.lastAction = action;
                existing.hint = existing.hint || `${char.name}似乎没有停下自己的计划。`;
                existing.updatedAt = Date.now();
            } else {
                const counter = this.normalizeCounterStrategy({
                    title: `${char.name}的离屏行动`,
                    actorId: char.id,
                    actorName: char.name,
                    target,
                    progress: Math.min(100, 15 + Math.ceil((agenda.priority || 0) / 3)),
                    exposure: agenda.priority >= 60 ? 20 : 10,
                    visibility: 'hinted',
                    hint: `${char.name}似乎没有停下自己的计划。`,
                    lastAction: action,
                    counterplay: ['调查行动痕迹', '直接对质', '利用已知线索设局']
                });
                scene.counterStrategies.push(counter);
            }
            out.push(`【离屏行动】${char.name}推进了自己的计划：${action}`);
            Storage.saveCharacter(char).catch(e => console.warn('保存 NPC 离屏行动失败:', e));
        });
        return out;
    },

    addSystemMessage(scene, content, type = 'system') {
        if (!scene || !content) return null;
        const msg = {
            id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            role: 'assistant',
            content: String(content),
            type,
            visibility: { public: true, locationId: scene.currentLocation || '', participants: [], overheardBy: [] },
            timestamp: Date.now()
        };
        scene.messages.push(msg);
        if (typeof ChatUI !== 'undefined' && ChatUI.onMessageAdded) ChatUI.onMessageAdded(msg);
        return msg;
    },

    createVisibility(options = {}) {
        const scene = State.scene;
        const participants = Array.isArray(options.participants) ? options.participants.filter(Boolean).map(String) : [];
        const publicDefault = State.activeCharacters.length > 1 && participants.length !== 1;
        return {
            public: options.public !== undefined ? !!options.public : publicDefault,
            locationId: options.locationId !== undefined ? String(options.locationId || '') : (scene?.currentLocation || ''),
            participants,
            overheardBy: Array.isArray(options.overheardBy) ? options.overheardBy.filter(Boolean).map(String) : []
        };
    },

    filterMessagesForCharacter(messages, character, scene) {
        if (!character) return messages || [];
        return (messages || []).filter(msg => this.isMessageVisibleTo(msg, character, scene));
    },

    isMessageVisibleTo(msg, character, scene) {
        if (!msg || !character) return true;
        const v = msg.visibility;
        if (!v) return true;
        if (v.public) return true;
        if (msg.characterId && msg.characterId === character.id) return true;
        const participants = Array.isArray(v.participants) ? v.participants : [];
        const overheardBy = Array.isArray(v.overheardBy) ? v.overheardBy : [];
        if (participants.includes(character.id) || overheardBy.includes(character.id)) return true;
        if (msg.role === 'user' && State.currentCharacterId === character.id && participants.length === 0) return true;
        return false;
    },

    collectApplicableItemEffects(scene, context = {}) {
        const items = (scene?.inventory || []).map(item => this.normalizeItem(item)).filter(Boolean);
        const actionType = String(context.actionType || '');
        const stat = String(context.stat || '');
        const intent = String(context.intent || '').toLowerCase();
        const includeUnequipped = context.includeUnequipped === true;
        const out = [];
        items.forEach(item => {
            const autoUsableQuest = item.type === 'quest' && !(item.effects || []).some(effect => effect.consume === true);
            if (!includeUnequipped && item.equipped !== true && !autoUsableQuest) return;
            if (item.uses !== undefined && item.uses <= 0) return;
            (item.effects || []).forEach(effect => {
                if (!this._effectMatches(effect, { actionType, stat, intent, item })) return;
                out.push({ item, effect });
            });
        });
        return out;
    },

    getCheckItemBonus(scene, check) {
        const matches = this.collectApplicableItemEffects(scene, {
            stat: check?.key || check?.stat,
            actionType: check?.actionType || check?.type || '',
            intent: check?.intent || check?.stakes || '',
            includeUnequipped: false
        }).filter(m => m.effect.type === 'check_bonus' && m.effect.consume !== true);
        const bonus = matches.reduce((sum, m) => sum + Number(m.effect.value || 0), 0);
        return {
            bonus,
            modifiers: matches.map(m => ({
                source: m.item.name,
                label: `${m.effect.value >= 0 ? '+' : ''}${m.effect.value} 检定`,
                value: Number(m.effect.value || 0),
                consume: false,
                usable: m.effect.consume === true
            }))
        };
    },

    getAvailableCheckItems(scene, check) {
        return this.collectApplicableItemEffects(scene, {
            stat: check?.key || check?.stat,
            actionType: check?.actionType || check?.type || '',
            intent: check?.intent || check?.stakes || '',
            includeUnequipped: true
        })
            .filter(m => m.effect.type === 'check_bonus' && m.effect.consume === true)
            .map(m => ({
                source: m.item.name,
                label: `${m.effect.value >= 0 ? '+' : ''}${m.effect.value} 检定，可消耗使用`,
                value: Number(m.effect.value || 0),
                consume: true
            }));
    },

    consumeCheckItems(scene, modifiers = []) {
        let consumed = false;
        modifiers.forEach(mod => {
            if (!mod.consume || !mod.source) return;
            const item = (scene.inventory || []).find(i => i.name === mod.source);
            if (!item || item.uses === undefined) return;
            item.uses = Math.max(0, Number(item.uses || 0) - 1);
            consumed = true;
        });
        if (consumed) SidebarRight.renderInventory?.();
        return consumed;
    },

    getCurrentSituation(scene) {
        if (!scene) return null;
        this.normalizeScene(scene);
        const location = (scene.locations || []).find(l => l.id === scene.currentLocation) || null;
        const activeQuest = (scene.quests || []).find(q => q.status === 'active' && q.type === 'main')
            || (scene.quests || []).find(q => q.status === 'active') || null;
        const clocks = (scene.clocks || []).filter(c => c.visibility !== 'hidden');
        const hiddenPressure = (scene.clocks || []).filter(c => c.visibility === 'hidden' && c.value > 0).length;
        const counterStrategies = (scene.counterStrategies || []).filter(c => c.status === 'active' && c.visibility !== 'hidden');
        const recentRisks = [
            ...((scene.currentSituation?.recentRisks || []).slice(-5)),
            ...counterStrategies.slice(-3).map(c => c.hint || c.title).filter(Boolean)
        ].slice(-6);
        const availableClues = (scene.knowledge?.discoveries || []).slice(-5);
        const recommendedActions = this._buildRecommendedActions(scene, { activeQuest, clocks, counterStrategies, hiddenPressure });
        scene.currentSituation.recommendedActions = recommendedActions;
        return { location, activeQuest, clocks, hiddenPressure, counterStrategies, recentRisks, availableClues, recommendedActions };
    },

    _buildRecommendedActions(scene, data) {
        const actions = [];
        this._buildFlowActions(scene).forEach(a => actions.push(a));
        if (data.activeQuest) {
            const objective = (data.activeQuest.objectives || []).find(o => !o.completed);
            if (objective) actions.push(`围绕「${objective.text}」采取下一步`);
        }
        const arcAction = this._buildStoryArcAction(scene);
        if (arcAction) actions.push(arcAction);
        const urgentClock = data.clocks.find(c => c.value >= Math.max(1, c.max - 2));
        if (urgentClock) actions.push(`处理时钟：${urgentClock.name}`);
        const counter = data.counterStrategies[0];
        if (counter) actions.push(counter.counterplay[0] || `调查反制：${counter.title}`);
        const clue = (scene.knowledge?.discoveries || []).slice(-1)[0];
        if (clue) actions.push(`利用线索：${clue.title || clue.text}`);
        if (actions.length === 0) actions.push('观察当前地点', '询问在场 NPC', '提出一个具体行动');
        return [...new Set(actions)].slice(0, 4);
    },

    _buildFlowActions(scene) {
        const guide = this.normalizeFlowGuide(scene?.flowGuide);
        const completed = new Set(guide.completedMoves);
        const availableOpenings = guide.openingMoves.filter(a => !completed.has(a));
        const turn = Number(scene?.turnCount || 0);
        const actions = [];
        if (turn <= 3 && availableOpenings.length > 0) {
            actions.push(...availableOpenings.slice(0, 2));
        } else if (availableOpenings.length > 0) {
            actions.push(availableOpenings[0]);
        }
        if (actions.length < 2 && guide.sessionGoals.length > 0) {
            actions.push(`推进目标：${guide.sessionGoals[0]}`);
        }
        if (actions.length === 0 && guide.stalledPrompts.length > 0) {
            actions.push(guide.stalledPrompts[turn % guide.stalledPrompts.length]);
        }
        return actions;
    },

    _buildStoryArcAction(scene) {
        const arc = (scene?.storyArcs || []).find(a => {
            const beats = Array.isArray(a?.beats) ? a.beats : [];
            const beatIdx = Math.max(0, Number(a?.currentBeat || 0));
            return beats.length > 0 && beatIdx < beats.length;
        });
        if (!arc) return '';
        const beatIdx = Math.max(0, Number(arc.currentBeat || 0));
        const beat = arc.beats[beatIdx];
        const condition = String(beat?.condition || '').trim();
        if (!condition) return '';
        return `追查剧情线索：${condition}`;
    },

    markFlowMoveCompleted(scene, text) {
        if (!scene?.flowGuide) return false;
        this.normalizeScene(scene);
        const guide = scene.flowGuide;
        const haystack = this._normalizeFlowText(text);
        if (haystack.length < 6) return false;
        const move = guide.openingMoves.find(item => {
            const needle = this._normalizeFlowText(item);
            return needle.length >= 6 && (haystack === needle || haystack.includes(needle) || needle.includes(haystack));
        });
        if (!move || guide.completedMoves.includes(move)) return false;
        guide.completedMoves.push(move);
        guide.completedMoves = guide.completedMoves.slice(-20);
        scene.currentSituation.recommendedActions = this._buildRecommendedActions(scene, this._currentSituationData(scene));
        return true;
    },

    _currentSituationData(scene) {
        const activeQuest = (scene.quests || []).find(q => q.status === 'active' && q.type === 'main')
            || (scene.quests || []).find(q => q.status === 'active') || null;
        const clocks = (scene.clocks || []).filter(c => c.visibility !== 'hidden');
        const hiddenPressure = (scene.clocks || []).filter(c => c.visibility === 'hidden' && c.value > 0).length;
        const counterStrategies = (scene.counterStrategies || []).filter(c => c.status === 'active' && c.visibility !== 'hidden');
        return { activeQuest, clocks, counterStrategies, hiddenPressure };
    },

    _normalizeFlowText(text) {
        return String(text || '')
            .trim()
            .replace(/[你我他她它的了着过和与在上。！？!?，,；;：:\s「」《》“”"'`]/g, '')
            .toLowerCase();
    },

    _selectClockForTick(scene, reason) {
        const active = (scene.clocks || []).filter(c => c.value < c.max);
        if (active.length === 0) return null;
        if (reason === 'rest') return active[0];
        return active.find(c => c.visibility !== 'hidden') || active[0];
    },

    _shouldAdvanceClock(scene, reason) {
        if (reason === 'rest' || reason === 'check_fail' || reason === 'check_partial') return true;
        return Number(scene.turnCount || 0) > 0 && Number(scene.turnCount || 0) % 3 === 0;
    },

    _collectClockTriggers(scene, clock, oldValue, reason) {
        const events = [];
        const trigger = clock.trigger;
        if (!trigger || oldValue >= trigger.at || clock.value < trigger.at) return events;
        if (clock.firedTriggers.includes(trigger.at)) return events;
        clock.firedTriggers.push(trigger.at);
        const label = clock.visibility === 'known'
            ? `【时钟触发：${clock.name}】${trigger.event}`
            : `【局势变化】${trigger.event}`;
        this.addSystemMessage(scene, label, 'event');
        if (trigger.knowledge) {
            State.addKnowledgeDiscovery(scene, trigger.knowledge);
        }
        scene.currentSituation.recentRisks.push(`${clock.name}：${reason}`);
        events.push({ clock, event: trigger.event });
        return events;
    },

    _effectMatches(effect, ctx) {
        if (!effect) return false;
        if (effect.stat && effect.stat !== ctx.stat) return false;
        if (effect.actionType && effect.actionType !== ctx.actionType) return false;
        if (effect.when) {
            const haystack = `${ctx.intent} ${(ctx.item.tags || []).join(' ')}`.toLowerCase();
            if (!haystack.includes(effect.when.toLowerCase())) return false;
        }
        return true;
    },

    _trimSituation(scene) {
        if (!scene.currentSituation) scene.currentSituation = {};
        scene.currentSituation.recentRisks = (scene.currentSituation.recentRisks || []).slice(-12);
        scene.currentSituation.recommendedActions = (scene.currentSituation.recommendedActions || []).slice(-8);
        scene.counterStrategies = (scene.counterStrategies || []).slice(-30);
    },

    _clamp(value, min, max) {
        const n = Number(value);
        if (!Number.isFinite(n)) return min;
        return Math.max(min, Math.min(max, Math.round(n)));
    }
};
