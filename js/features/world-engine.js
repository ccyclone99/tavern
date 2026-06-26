/**
 * 世界推进引擎
 * 负责局势时钟、剧情弧、NPC 日程、消息可见性和物品效果的轻量规则。
 */
const WorldEngine = {
    clockVisibilities: ['hidden', 'hinted', 'known'],
    counterStatuses: ['active', 'revealed', 'resolved'],
    challengeStatuses: ['locked', 'active', 'completed', 'failed', 'bypassed'],
    revelationStatuses: ['unknown', 'suspected', 'confirmed'],
    evidenceReliabilities: ['rumor', 'partial', 'confirmed', 'contested'],

    normalizeScene(scene) {
        if (!scene) return scene;
        if (!Array.isArray(scene.clocks)) scene.clocks = [];
        if (!Array.isArray(scene.counterStrategies)) scene.counterStrategies = [];
        if (!Array.isArray(scene.storyPhases)) scene.storyPhases = [];
        if (!Array.isArray(scene.clueGraph)) scene.clueGraph = [];
        if (!Array.isArray(scene.consequenceLedger)) scene.consequenceLedger = [];
        if (!Array.isArray(scene.failureStates)) scene.failureStates = [];
        if (!Array.isArray(scene.runHistory)) scene.runHistory = [];
        if (!Array.isArray(scene.sceneChallenges)) scene.sceneChallenges = [];
        if (!Array.isArray(scene.evidenceLedger)) scene.evidenceLedger = [];
        if (!Array.isArray(scene.companionResources)) scene.companionResources = [];
        if (!scene.flowGraph || typeof scene.flowGraph !== 'object') scene.flowGraph = { nodes: [], revelations: [] };
        scene.gameplayProfile = this.normalizeGameplayProfile(scene.gameplayProfile);
        if (!scene.questProgressGuards || typeof scene.questProgressGuards !== 'object') {
            scene.questProgressGuards = { autoAdvanceStreak: 0, lastAdvancedAt: 0 };
        }
        if (scene.runRecord && typeof scene.runRecord !== 'object') scene.runRecord = null;
        if (typeof RunRecorder !== 'undefined' &&
            ['victorious', 'defeated'].includes(scene.gameState) &&
            (!scene.runRecord || scene.runRecord.version !== RunRecorder.version)) {
            RunRecorder.complete(scene, scene.gameState, scene.defeatReason || '结局记录升级');
        }
        scene.flowGuide = this.normalizeFlowGuide(scene.flowGuide);
        if (!scene.currentSituation || typeof scene.currentSituation !== 'object') {
            scene.currentSituation = { recentRisks: [], recommendedActions: [] };
        }
        if (!Array.isArray(scene.currentSituation.recentRisks)) scene.currentSituation.recentRisks = [];
        if (!Array.isArray(scene.currentSituation.recommendedActions)) scene.currentSituation.recommendedActions = [];
        if (typeof scene.turnCount !== 'number') scene.turnCount = 0;

        scene.clocks = scene.clocks.map(c => this.normalizeClock(c)).filter(Boolean).slice(0, 12);
        scene.counterStrategies = scene.counterStrategies.map(c => this.normalizeCounterStrategy(c)).filter(Boolean).slice(0, 20);
        scene.storyPhases = scene.storyPhases.map((p, idx) => this.normalizeStoryPhase(p, idx)).filter(Boolean).slice(0, 12);
        scene.clueGraph = scene.clueGraph.map(c => this.normalizeCluePath(c)).filter(Boolean).slice(0, 40);
        scene.consequenceLedger = scene.consequenceLedger.map(c => this.normalizeConsequence(c)).filter(Boolean).slice(-60);
        scene.failureStates = scene.failureStates.map((f, idx) => this.normalizeFailureState(f, idx)).filter(Boolean).slice(0, 24);
        scene.flowGraph = this.normalizeFlowGraph(scene.flowGraph);
        scene.sceneChallenges = scene.sceneChallenges.map((c, idx) => this.normalizeSceneChallenge(c, idx)).filter(Boolean).slice(0, 24);
        scene.evidenceLedger = scene.evidenceLedger.map(e => this.normalizeEvidence(e)).filter(Boolean).slice(-120);
        scene.companionResources = scene.companionResources.map(r => this.normalizeCompanionResource(r)).filter(Boolean).slice(0, 24);
        (State.activeCharacters || []).forEach(char => this.normalizeAgenda(char));
        return scene;
    },

    normalizeGameplayProfile(profile = {}) {
        const p = profile && typeof profile === 'object' ? profile : {};
        const density = p.checkDensity && typeof p.checkDensity === 'object' ? p.checkDensity : {};
        const cluePolicy = p.cluePolicy && typeof p.cluePolicy === 'object' ? p.cluePolicy : {};
        const curve = p.difficultyCurve && typeof p.difficultyCurve === 'object' ? p.difficultyCurve : {};
        const npc = p.npcBoundary && typeof p.npcBoundary === 'object' ? p.npcBoundary : {};
        const range = (value, fallback, min = 0, max = 40) => {
            const src = Array.isArray(value) ? value : fallback;
            const a = this._clamp(Number(src[0] ?? fallback[0]), min, max);
            const b = this._clamp(Number(src[1] ?? fallback[1]), min, max);
            return [Math.min(a, b), Math.max(a, b)];
        };
        return {
            version: Number.isFinite(Number(p.version)) ? Number(p.version) : 1,
            checkDensity: {
                targetPerRun: range(density.targetPerRun, [8, 12], 0, 30),
                minPerMainPhase: this._clamp(Number(density.minPerMainPhase ?? 1), 0, 6),
                maxAutoQuestAdvances: this._clamp(Number(density.maxAutoQuestAdvances ?? 2), 0, 8),
                maxTrivialTurnsBeforeSoftMove: this._clamp(Number(density.maxTrivialTurnsBeforeSoftMove ?? 2), 1, 8)
            },
            cluePolicy: {
                coreCluesAreGuaranteed: cluePolicy.coreCluesAreGuaranteed !== false,
                coreClueCostOnFailure: cluePolicy.coreClueCostOnFailure !== false,
                cluesPerRevelation: this._clamp(Number(cluePolicy.cluesPerRevelation ?? 3), 1, 6),
                redHerringLimit: this._clamp(Number(cluePolicy.redHerringLimit ?? 1), 0, 6)
            },
            difficultyCurve: {
                openingDc: range(curve.openingDc, [10, 14], 5, 30),
                midDc: range(curve.midDc, [13, 17], 5, 30),
                climaxDc: range(curve.climaxDc, [15, 20], 5, 30)
            },
            npcBoundary: {
                separateNarratorFromNpc: npc.separateNarratorFromNpc !== false,
                forbidNpcOmniscientSummary: npc.forbidNpcOmniscientSummary !== false
            }
        };
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

    normalizeFlowGraph(flowGraph = {}) {
        const graph = flowGraph && typeof flowGraph === 'object' ? flowGraph : {};
        return {
            nodes: (Array.isArray(graph.nodes) ? graph.nodes : [])
                .map((node, idx) => this.normalizeFlowNode(node, idx))
                .filter(Boolean)
                .slice(0, 40),
            revelations: (Array.isArray(graph.revelations) ? graph.revelations : [])
                .map((rev, idx) => this.normalizeRevelation(rev, idx))
                .filter(Boolean)
                .slice(0, 40)
        };
    },

    normalizeFlowNode(node = {}, index = 0) {
        if (!node || typeof node !== 'object') return null;
        const statuses = ['hidden', 'hinted', 'available', 'resolved'];
        const list = (key, limit, itemLimit = 120) => (
            Array.isArray(node[key]) ? node[key] : []
        ).map(String).filter(Boolean).map(s => s.slice(0, itemLimit)).slice(0, limit);
        return {
            id: String(node.id || 'node_' + index).slice(0, 100),
            phaseId: String(node.phaseId || '').slice(0, 100),
            type: String(node.type || 'location').slice(0, 40),
            title: String(node.title || '场景节点').slice(0, 120),
            status: statuses.includes(node.status) ? node.status : 'available',
            visibleText: String(node.visibleText || node.description || '').slice(0, 360),
            privateTruth: String(node.privateTruth || '').slice(0, 500),
            npcs: list('npcs', 8),
            challengeIds: list('challengeIds', 8),
            clueIds: list('clueIds', 8),
            exits: list('exits', 10),
            updatedAt: typeof node.updatedAt === 'number' ? node.updatedAt : Date.now()
        };
    },

    normalizeRevelation(data = {}, index = 0) {
        if (!data || typeof data !== 'object') return null;
        const list = (key, limit, itemLimit = 120) => (
            Array.isArray(data[key]) ? data[key] : []
        ).map(String).filter(Boolean).map(s => s.slice(0, itemLimit)).slice(0, limit);
        const status = this.revelationStatuses.includes(data.status) ? data.status : 'unknown';
        return {
            id: String(data.id || 'rev_' + index).slice(0, 100),
            conclusion: String(data.conclusion || data.title || '关键结论').slice(0, 260),
            status,
            core: data.core !== false,
            clueIds: list('clueIds', 8),
            requiredFor: list('requiredFor', 12),
            evidenceIds: list('evidenceIds', 12),
            lastReason: String(data.lastReason || '').slice(0, 240),
            updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now()
        };
    },

    normalizeSceneChallenge(data = {}, index = 0) {
        if (!data || typeof data !== 'object') return null;
        const list = (key, limit, itemLimit = 160) => (
            Array.isArray(data[key]) ? data[key] : []
        ).map(String).filter(Boolean).map(s => s.slice(0, itemLimit)).slice(0, limit);
        const targetProgress = this._clamp(Number(data.targetProgress || data.target || 3), 1, 12);
        const maxStrain = this._clamp(Number(data.maxStrain || 3), 1, 12);
        const budget = data.checkBudget && typeof data.checkBudget === 'object' ? data.checkBudget : {};
        return {
            id: String(data.id || 'challenge_' + index).slice(0, 100),
            phaseId: String(data.phaseId || '').slice(0, 100),
            title: String(data.title || '当前挑战').slice(0, 120),
            status: this.challengeStatuses.includes(data.status) ? data.status : (index === 0 ? 'active' : 'locked'),
            goal: String(data.goal || '').slice(0, 300),
            stakes: String(data.stakes || '').slice(0, 320),
            progress: this._clamp(Number(data.progress || 0), 0, targetProgress),
            targetProgress,
            strain: this._clamp(Number(data.strain || 0), 0, maxStrain),
            maxStrain,
            checkBudget: {
                min: this._clamp(Number(budget.min ?? 1), 0, 8),
                target: this._clamp(Number(budget.target ?? 2), 0, 12),
                max: this._clamp(Number(budget.max ?? 5), 1, 20)
            },
            checkCount: this._clamp(Number(data.checkCount || 0), 0, 99),
            approaches: (Array.isArray(data.approaches) ? data.approaches : [])
                .map((a, idx) => this.normalizeChallengeApproach(a, idx))
                .filter(Boolean)
                .slice(0, 10),
            tags: list('tags', 10, 60),
            coreRevelations: list('coreRevelations', 8),
            optionalRewards: list('optionalRewards', 8),
            failForward: list('failForward', 8, 220),
            supports: list('supports', 12),
            lastReason: String(data.lastReason || '').slice(0, 240),
            updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now()
        };
    },

    normalizeChallengeApproach(data = {}, index = 0) {
        if (!data || typeof data !== 'object') return null;
        const list = (key, limit, itemLimit = 120) => (
            Array.isArray(data[key]) ? data[key] : []
        ).map(String).filter(Boolean).map(s => s.slice(0, itemLimit)).slice(0, limit);
        const stat = this._normalizeStatKey(data.stat || data.key || 'intelligence');
        return {
            id: String(data.id || 'approach_' + index).slice(0, 100),
            label: String(data.label || data.title || '尝试一种办法').slice(0, 160),
            stat,
            statName: this._statName(stat),
            dc: this._clamp(Number(data.dc || 14), 5, 30),
            effect: this._clamp(Number(data.effect || 1), 1, 4),
            risk: this._clamp(Number(data.risk || 45), 5, 95),
            actionType: String(data.actionType || '').slice(0, 40),
            tags: list('tags', 10, 60),
            keywords: list('keywords', 12, 80),
            onSuccess: list('onSuccess', 8),
            onPartial: list('onPartial', 8),
            onFailure: list('onFailure', 8),
            onCritical: list('onCritical', 8)
        };
    },

    normalizeEvidence(data = {}) {
        if (!data || typeof data !== 'object') return null;
        const list = (key, limit, itemLimit = 100) => (
            Array.isArray(data[key]) ? data[key] : []
        ).map(String).filter(Boolean).map(s => s.slice(0, itemLimit)).slice(0, limit);
        return {
            id: String(data.id || 'ev_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)).slice(0, 100),
            title: String(data.title || data.text || '证据').slice(0, 140),
            text: String(data.text || data.title || '').slice(0, 500),
            tags: list('tags', 12, 60),
            sourceNodeId: String(data.sourceNodeId || '').slice(0, 100),
            reliability: this.evidenceReliabilities.includes(data.reliability) ? data.reliability : 'partial',
            visible: data.visible !== false,
            obtainedBy: String(data.obtainedBy || '').slice(0, 220),
            supports: list('supports', 16),
            createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now()
        };
    },

    normalizeCompanionResource(data = {}) {
        if (!data || typeof data !== 'object') return null;
        const obj = key => (data[key] && typeof data[key] === 'object') ? data[key] : {};
        return {
            id: String(data.id || 'ally_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)).slice(0, 100),
            characterId: String(data.characterId || '').slice(0, 100),
            name: String(data.name || '同伴协助').slice(0, 120),
            unlock: obj('unlock'),
            uses: this._clamp(Number(data.uses ?? 1), 0, 10),
            cost: obj('cost'),
            effect: obj('effect'),
            risk: String(data.risk || '').slice(0, 220)
        };
    },

    normalizeStoryPhase(phase = {}, index = 0) {
        if (!phase || typeof phase !== 'object') return null;
        const statuses = ['locked', 'active', 'completed'];
        const status = statuses.includes(phase.status) ? phase.status : (index === 0 ? 'active' : 'locked');
        const list = (key, limit, itemLimit = 160) => (
            Array.isArray(phase[key]) ? phase[key] : []
        ).map(s => String(s || '').trim()).filter(Boolean).map(s => s.slice(0, itemLimit)).slice(0, limit);
        return {
            id: String(phase.id || 'phase_' + index).slice(0, 80),
            title: String(phase.title || '剧情阶段').slice(0, 80),
            status,
            goal: String(phase.goal || '').slice(0, 260),
            stakes: String(phase.stakes || '').slice(0, 260),
            entry: String(phase.entry || '').slice(0, 220),
            exit: String(phase.exit || '').slice(0, 220),
            recommendedActions: list('recommendedActions', 8),
            pressureTags: list('pressureTags', 8, 60),
            spotlight: list('spotlight', 8, 80),
            updatedAt: typeof phase.updatedAt === 'number' ? phase.updatedAt : Date.now()
        };
    },

    normalizeCluePath(path = {}) {
        if (!path || typeof path !== 'object') return null;
        const statuses = ['hidden', 'hinted', 'suspected', 'confirmed'];
        const stages = (Array.isArray(path.stages) ? path.stages : []).map((stage, idx) => this.normalizeClueStage(stage, idx)).filter(Boolean).slice(0, 8);
        const maxStage = Math.max(0, stages.length - 1);
        return {
            id: String(path.id || 'clue_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)).slice(0, 100),
            title: String(path.title || '未解之谜').slice(0, 100),
            subjectType: String(path.subjectType || 'mystery').slice(0, 40),
            subjectName: String(path.subjectName || '').slice(0, 100),
            status: statuses.includes(path.status) ? path.status : 'hinted',
            currentStage: this._clamp(Number(path.currentStage || 0), 0, maxStage),
            truth: String(path.truth || '').slice(0, 500),
            stages,
            evidence: Array.isArray(path.evidence) ? path.evidence.map(String).slice(0, 20) : [],
            lastReason: String(path.lastReason || '').slice(0, 240),
            updatedAt: typeof path.updatedAt === 'number' ? path.updatedAt : Date.now()
        };
    },

    normalizeClueStage(stage = {}, index = 0) {
        if (!stage || typeof stage !== 'object') return null;
        const check = stage.check && typeof stage.check === 'object'
            ? {
                stat: String(stage.check.stat || '').slice(0, 20),
                dc: this._clamp(Number(stage.check.dc || 12), 5, 30)
            }
            : null;
        return {
            id: String(stage.id || 'stage_' + index).slice(0, 80),
            level: String(stage.level || 'hint').slice(0, 40),
            title: String(stage.title || '线索阶段').slice(0, 100),
            text: String(stage.text || '').slice(0, 320),
            source: String(stage.source || '').slice(0, 120),
            locationId: String(stage.locationId || '').slice(0, 80),
            actions: Array.isArray(stage.actions) ? stage.actions.map(String).filter(Boolean).slice(0, 5) : [],
            requires: Array.isArray(stage.requires) ? stage.requires.map(String).filter(Boolean).slice(0, 6) : [],
            check,
            onFailure: String(stage.onFailure || '').slice(0, 260)
        };
    },

    normalizeConsequence(data = {}) {
        if (!data || typeof data !== 'object') return null;
        return {
            id: String(data.id || 'cons_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)).slice(0, 100),
            title: String(data.title || '后果').slice(0, 120),
            cause: String(data.cause || '').slice(0, 260),
            effect: String(data.effect || '').slice(0, 260),
            severity: String(data.severity || 'low').slice(0, 40),
            turn: Number.isFinite(Number(data.turn)) ? Number(data.turn) : 0,
            createdAt: typeof data.createdAt === 'number' ? data.createdAt : Date.now()
        };
    },

    normalizeFailureState(data = {}, index = 0) {
        if (!data || typeof data !== 'object') return null;
        const statuses = ['armed', 'triggered', 'disabled'];
        const trigger = data.trigger && typeof data.trigger === 'object' ? data.trigger : {};
        return {
            id: String(data.id || 'failure_' + index).slice(0, 100),
            title: String(data.title || '失败结局').slice(0, 120),
            status: statuses.includes(data.status) ? data.status : 'armed',
            severity: String(data.severity || 'major').slice(0, 40),
            trigger: {
                type: String(trigger.type || 'manual').slice(0, 40),
                clockId: trigger.clockId ? String(trigger.clockId).slice(0, 100) : '',
                clockTag: trigger.clockTag ? String(trigger.clockTag).slice(0, 40) : '',
                questId: trigger.questId ? String(trigger.questId).slice(0, 100) : '',
                counterId: trigger.counterId ? String(trigger.counterId).slice(0, 100) : '',
                status: trigger.status ? String(trigger.status).slice(0, 40) : '',
                at: trigger.at === 'max' ? 'max' : (trigger.at !== undefined ? Number(trigger.at) : undefined)
            },
            message: String(data.message || '').slice(0, 800),
            aftermath: String(data.aftermath || '').slice(0, 500),
            hint: String(data.hint || '').slice(0, 260),
            recoverable: data.recoverable !== false,
            triggeredAt: typeof data.triggeredAt === 'number' ? data.triggeredAt : null,
            updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now()
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

        if (changed) this.checkFailureStates(scene, { type: 'clock' });
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

    applyStoryPhaseUpdate(scene, updates) {
        if (!scene || !Array.isArray(updates)) return false;
        this.normalizeScene(scene);
        const statuses = ['locked', 'active', 'completed'];
        let changed = false;
        updates.slice(0, 8).forEach(update => {
            if (!update || typeof update !== 'object') return;
            const id = update.id ? String(update.id) : '';
            const title = update.title ? String(update.title) : '';
            let phase = scene.storyPhases.find(p => (id && p.id === id) || (title && p.title === title));
            if (!phase && (id || title)) {
                phase = this.normalizeStoryPhase({
                    id: id || undefined,
                    title: title || '新增剧情阶段',
                    status: update.status || 'locked'
                }, scene.storyPhases.length);
                if (!phase) return;
                scene.storyPhases.push(phase);
            }
            if (!phase) return;
            if (update.activate === true) {
                scene.storyPhases.forEach(p => {
                    if (p.id !== phase.id && p.status === 'active') p.status = 'completed';
                });
                phase.status = 'active';
            }
            if (update.status !== undefined && statuses.includes(update.status)) phase.status = update.status;
            ['goal', 'stakes', 'entry', 'exit'].forEach(key => {
                if (update[key] !== undefined) phase[key] = String(update[key]).slice(0, 260);
            });
            if (Array.isArray(update.recommendedActions)) phase.recommendedActions = update.recommendedActions.map(String).slice(0, 8);
            if (Array.isArray(update.pressureTags)) phase.pressureTags = update.pressureTags.map(String).slice(0, 8);
            if (Array.isArray(update.spotlight)) phase.spotlight = update.spotlight.map(String).slice(0, 8);
            phase.updatedAt = Date.now();
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

    applyClueUpdate(scene, updates) {
        if (!scene || !Array.isArray(updates)) return false;
        this.normalizeScene(scene);
        const statuses = ['hidden', 'hinted', 'suspected', 'confirmed'];
        let changed = false;
        updates.slice(0, 12).forEach(update => {
            if (!update || typeof update !== 'object') return;
            const id = update.id ? String(update.id) : '';
            const title = update.title ? String(update.title) : '';
            let clue = scene.clueGraph.find(c => (id && c.id === id) || (title && c.title === title));
            if (!clue && (id || title)) {
                clue = this.normalizeCluePath({
                    id: id || undefined,
                    title: title || '新增线索链',
                    status: update.status || 'hinted',
                    stages: []
                });
                if (!clue) return;
                scene.clueGraph.push(clue);
                changed = true;
            }
            if (!clue) return;

            if (update.status !== undefined && statuses.includes(update.status)) clue.status = update.status;
            if (update.currentStage !== undefined) {
                const maxStage = Math.max(0, (clue.stages || []).length - 1);
                clue.currentStage = this._clamp(Number(update.currentStage), 0, maxStage);
            } else if (update.advance === true || Number(update.advanceBy || 0) !== 0) {
                const step = update.advance === true ? 1 : Number(update.advanceBy || 0);
                const maxStage = Math.max(0, (clue.stages || []).length - 1);
                clue.currentStage = this._clamp(Number(clue.currentStage || 0) + step, 0, maxStage);
            }
            ['subjectType', 'subjectName', 'truth', 'lastReason'].forEach(key => {
                if (update[key] !== undefined) clue[key] = String(update[key]).slice(0, key === 'truth' ? 500 : 240);
            });
            if (Array.isArray(update.stages)) {
                clue.stages = update.stages.map((stage, idx) => this.normalizeClueStage(stage, idx)).filter(Boolean).slice(0, 8);
                clue.currentStage = this._clamp(Number(clue.currentStage || 0), 0, Math.max(0, clue.stages.length - 1));
            }
            if (update.evidenceAdd !== undefined) {
                const items = Array.isArray(update.evidenceAdd) ? update.evidenceAdd : [update.evidenceAdd];
                items.map(String).filter(Boolean).forEach(item => {
                    if (!clue.evidence.includes(item)) clue.evidence.push(item);
                });
                clue.evidence = clue.evidence.slice(-20);
            }
            clue.updatedAt = Date.now();
            changed = true;
        });
        return changed;
    },

    applyFailureStateUpdate(scene, updates) {
        if (!scene || !Array.isArray(updates)) return false;
        this.normalizeScene(scene);
        const statuses = ['armed', 'triggered', 'disabled'];
        let changed = false;
        updates.slice(0, 8).forEach(update => {
            if (!update || typeof update !== 'object') return;
            const id = update.id ? String(update.id) : '';
            const title = update.title ? String(update.title) : '';
            let failure = scene.failureStates.find(f => (id && f.id === id) || (title && f.title === title));
            if (!failure && (id || title)) {
                failure = this.normalizeFailureState({
                    id: id || undefined,
                    title: title || '失败结局',
                    trigger: update.trigger || { type: 'manual' }
                }, scene.failureStates.length);
                if (!failure) return;
                scene.failureStates.push(failure);
            }
            if (!failure) return;
            if (update.status !== undefined && statuses.includes(update.status)) failure.status = update.status;
            ['title', 'severity', 'message', 'aftermath', 'hint'].forEach(key => {
                if (update[key] !== undefined) failure[key] = String(update[key]).slice(0, key === 'message' ? 800 : 500);
            });
            if (update.recoverable !== undefined) failure.recoverable = update.recoverable !== false;
            if (update.trigger && typeof update.trigger === 'object') {
                failure.trigger = this.normalizeFailureState({ ...failure, trigger: update.trigger }, 0).trigger;
            }
            failure.updatedAt = Date.now();
            changed = true;
            if (update.status === 'triggered' || update.triggered === true || update.triggerNow === true) {
                this.triggerFailureState(scene, failure, { type: 'manual', reason: update.reason || 'AI 状态补丁触发' });
            }
        });
        return changed;
    },

    applyChallengeUpdate(scene, updates) {
        if (!scene || !Array.isArray(updates)) return false;
        this.normalizeScene(scene);
        let changed = false;
        updates.slice(0, 12).forEach(update => {
            if (!update || typeof update !== 'object') return;
            const id = update.id ? String(update.id) : '';
            const title = update.title ? String(update.title) : '';
            let challenge = scene.sceneChallenges.find(c => (id && c.id === id) || (title && c.title === title));
            if (!challenge && (id || title)) {
                challenge = this.normalizeSceneChallenge({
                    id: id || undefined,
                    title: title || '新增挑战',
                    phaseId: update.phaseId || '',
                    status: update.status || 'active'
                }, scene.sceneChallenges.length);
                if (!challenge) return;
                scene.sceneChallenges.push(challenge);
            }
            if (!challenge) return;

            if (update.status !== undefined && this.challengeStatuses.includes(update.status)) challenge.status = update.status;
            ['title', 'goal', 'stakes', 'lastReason', 'phaseId'].forEach(key => {
                if (update[key] !== undefined) challenge[key] = String(update[key]).slice(0, key === 'stakes' ? 320 : 240);
            });
            if (update.progress !== undefined) challenge.progress = this._clamp(Number(update.progress), 0, challenge.targetProgress);
            if (update.progressDelta !== undefined) {
                challenge.progress = this._clamp(Number(challenge.progress || 0) + Number(update.progressDelta || 0), 0, challenge.targetProgress);
            }
            if (update.strain !== undefined) challenge.strain = this._clamp(Number(update.strain), 0, challenge.maxStrain);
            if (update.strainDelta !== undefined) {
                challenge.strain = this._clamp(Number(challenge.strain || 0) + Number(update.strainDelta || 0), 0, challenge.maxStrain);
            }
            if (update.checkCountDelta !== undefined) {
                challenge.checkCount = this._clamp(Number(challenge.checkCount || 0) + Number(update.checkCountDelta || 0), 0, 99);
            }
            if (Array.isArray(update.approaches)) {
                challenge.approaches = update.approaches.map((a, idx) => this.normalizeChallengeApproach(a, idx)).filter(Boolean).slice(0, 10);
            }
            if (Array.isArray(update.supports)) challenge.supports = update.supports.map(String).slice(0, 12);
            this._settleChallengeStatus(scene, challenge, update.reason || update.lastReason || '挑战状态更新');
            challenge.updatedAt = Date.now();
            changed = true;
        });
        if (changed) {
            if (scene.questProgressGuards) scene.questProgressGuards.autoAdvanceStreak = 0;
            this._activateNextChallenge(scene);
            if (scene.currentSituation) {
                scene.currentSituation.recommendedActions = this._buildRecommendedActions(scene, this._currentSituationData(scene));
            }
        }
        return changed;
    },

    applyEvidenceAdd(scene, items) {
        if (!scene || !Array.isArray(items)) return false;
        this.normalizeScene(scene);
        let changed = false;
        items.slice(0, 20).forEach(item => {
            if (!item || typeof item !== 'object') return;
            const ev = this.normalizeEvidence(item);
            if (!ev) return;
            const existing = scene.evidenceLedger.find(e => e.id === ev.id || (e.title === ev.title && e.sourceNodeId === ev.sourceNodeId));
            if (existing) {
                existing.reliability = ev.reliability;
                existing.visible = ev.visible;
                existing.tags = [...new Set([...(existing.tags || []), ...ev.tags])].slice(0, 12);
                existing.supports = [...new Set([...(existing.supports || []), ...ev.supports])].slice(0, 16);
                existing.text = ev.text || existing.text;
                existing.obtainedBy = ev.obtainedBy || existing.obtainedBy;
            } else {
                scene.evidenceLedger.push(ev);
            }
            if (ev.visible !== false && typeof State !== 'undefined' && State.addKnowledgeDiscovery) {
                State.addKnowledgeDiscovery(scene, {
                    id: 'disc_' + ev.id,
                    subjectType: 'evidence',
                    level: ev.reliability === 'confirmed' ? 'evidence' : 'hint',
                    title: ev.title,
                    text: ev.text || ev.title,
                    source: ev.obtainedBy || ev.sourceNodeId || '证据账本',
                    reliability: ev.reliability === 'confirmed' ? 'confirmed' : (ev.reliability === 'contested' ? 'contested' : 'unverified'),
                    tags: ev.tags,
                    evidenceIds: [ev.id]
                });
            }
            changed = true;
        });
        if (changed) {
            if (scene.questProgressGuards) scene.questProgressGuards.autoAdvanceStreak = 0;
            this._refreshRevelationsFromEvidence(scene);
        }
        return changed;
    },

    applyRevelationUpdate(scene, updates) {
        if (!scene || !Array.isArray(updates)) return false;
        this.normalizeScene(scene);
        let changed = false;
        updates.slice(0, 12).forEach(update => {
            if (!update || typeof update !== 'object') return;
            const id = update.id ? String(update.id) : '';
            let rev = scene.flowGraph.revelations.find(r => id && r.id === id);
            if (!rev && (id || update.conclusion)) {
                rev = this.normalizeRevelation({
                    id: id || undefined,
                    conclusion: update.conclusion || update.title || '新增结论',
                    status: update.status || 'suspected'
                }, scene.flowGraph.revelations.length);
                if (!rev) return;
                scene.flowGraph.revelations.push(rev);
            }
            if (!rev) return;
            if (update.status !== undefined && this.revelationStatuses.includes(update.status)) rev.status = update.status;
            if (update.conclusion !== undefined) rev.conclusion = String(update.conclusion).slice(0, 260);
            if (Array.isArray(update.evidenceIds)) rev.evidenceIds = update.evidenceIds.map(String).slice(0, 12);
            if (Array.isArray(update.requiredFor)) rev.requiredFor = update.requiredFor.map(String).slice(0, 12);
            if (update.reason !== undefined || update.lastReason !== undefined) rev.lastReason = String(update.reason || update.lastReason || '').slice(0, 240);
            rev.updatedAt = Date.now();
            changed = true;
        });
        return changed;
    },

    applyFlowGraphUpdate(scene, update = {}) {
        if (!scene || !update || typeof update !== 'object') return false;
        this.normalizeScene(scene);
        let changed = false;
        if (Array.isArray(update.nodes)) {
            update.nodes.slice(0, 12).forEach(nodeData => {
                const node = this.normalizeFlowNode(nodeData, scene.flowGraph.nodes.length);
                if (!node) return;
                const existing = scene.flowGraph.nodes.find(n => n.id === node.id);
                if (existing) Object.assign(existing, node, { updatedAt: Date.now() });
                else scene.flowGraph.nodes.push(node);
                changed = true;
            });
        }
        if (Array.isArray(update.revelations)) {
            changed = this.applyRevelationUpdate(scene, update.revelations) || changed;
        }
        return changed;
    },

    resolveChallengeCheck(scene, check = {}, outcomeInfo = {}) {
        if (!scene || !check) return null;
        this.normalizeScene(scene);
        const ctx = check.challengeContext || {};
        let challenge = ctx.challengeId
            ? scene.sceneChallenges.find(c => c.id === ctx.challengeId)
            : this.getActiveChallenge(scene);
        if (!challenge || !['active', 'locked'].includes(challenge.status)) return null;
        if (challenge.status === 'locked') challenge.status = 'active';
        const challengeId = challenge.id;
        const approach = (challenge.approaches || []).find(a => a.id === ctx.approachId) || null;
        const effect = this._clamp(Number(approach?.effect || 1), 1, 4);
        const outcome = outcomeInfo.outcome || (outcomeInfo.success ? 'success' : 'fail');
        let progressDelta = 0;
        let strainDelta = 0;
        if (outcome === 'critical_success') progressDelta = effect + 1;
        else if (outcome === 'success') progressDelta = effect;
        else if (outcome === 'partial') {
            progressDelta = Math.max(1, effect);
            strainDelta = 1;
        } else if (outcome === 'critical_fail') {
            strainDelta = 2;
        } else {
            strainDelta = 1;
        }

        challenge.checkCount = this._clamp(Number(challenge.checkCount || 0) + 1, 0, 99);
        challenge.progress = this._clamp(Number(challenge.progress || 0) + progressDelta, 0, challenge.targetProgress);
        challenge.strain = this._clamp(Number(challenge.strain || 0) + strainDelta, 0, challenge.maxStrain);
        challenge.lastReason = `${check.statName || '属性'}检定：${outcomeInfo.label || outcome}`;
        challenge.updatedAt = Date.now();
        if (scene.questProgressGuards) scene.questProgressGuards.autoAdvanceStreak = 0;

        if (approach) {
            this._applyChallengeApproachEffects(scene, challenge, approach, outcome, check);
        }
        if (approach && outcome === 'critical_success' && Array.isArray(ctx.secondaryApproachIds)) {
            const secondary = (challenge.approaches || [])
                .filter(a => ctx.secondaryApproachIds.includes(a.id))
                .slice(0, 1);
            secondary.forEach(item => this._applyChallengeApproachEffects(scene, challenge, item, 'success', check));
        }
        challenge = scene.sceneChallenges.find(c => c.id === challengeId) || challenge;
        this._settleChallengeStatus(scene, challenge, challenge.lastReason);
        this._activateNextChallenge(scene);
        SidebarRight.renderSituation?.();
        return { challenge, progressDelta, strainDelta, outcome };
    },

    reconcileQuestProgressFromNarrative(scene, message = {}, options = {}) {
        if (!scene || scene.gameState !== 'playing' || !Array.isArray(scene.quests)) {
            return { changed: false, completedObjectives: [], completedQuests: [] };
        }
        if (!message || message.role !== 'assistant') {
            return { changed: false, completedObjectives: [], completedQuests: [] };
        }
        this.normalizeScene(scene);
        const sourceText = String(message.content || '').trim();
        if (!sourceText) return { changed: false, completedObjectives: [], completedQuests: [] };

        const narrative = this._buildQuestNarrativeCorpus(scene, message);
        const completedObjectives = [];
        const completedQuests = [];

        scene.quests
            .filter(q => q && q.status === 'active')
            .forEach(quest => {
                let questChanged = false;
                const objectives = Array.isArray(quest.objectives) ? quest.objectives : [];
                objectives.forEach((objective, idx) => {
                    if (!objective || objective.completed) return;
                    if (!this._objectiveSatisfiedByNarrative(objective.text, narrative, quest)) return;
                    if (!this._objectiveAllowedByProgressGates(scene, quest, objective, idx, narrative, options)) return;
                    objective.completed = true;
                    questChanged = true;
                    scene.questProgressGuards.autoAdvanceStreak = Number(scene.questProgressGuards.autoAdvanceStreak || 0) + 1;
                    scene.questProgressGuards.lastAdvancedAt = Date.now();
                    completedObjectives.push({
                        questId: quest.id,
                        questName: quest.name,
                        objectiveIdx: idx,
                        objectiveText: objective.text
                    });
                });

                if (questChanged && objectives.length > 0 && objectives.every(o => o.completed)) {
                    quest.status = 'completed';
                    quest.completedAt = Date.now();
                    completedQuests.push({ questId: quest.id, questName: quest.name });
                    if (typeof QuestTracker !== 'undefined' && QuestTracker._grantReward) {
                        QuestTracker._grantReward(quest);
                    }
                }
            });

        if (completedObjectives.length === 0 && completedQuests.length === 0) {
            return { changed: false, completedObjectives, completedQuests };
        }

        const grouped = completedObjectives.reduce((acc, item) => {
            if (!acc[item.questName]) acc[item.questName] = [];
            acc[item.questName].push(item.objectiveText);
            return acc;
        }, {});
        Object.entries(grouped).forEach(([questName, objectives]) => {
            this.addSystemMessage(scene, `【任务进展：${questName}】${objectives.join('；')}`, 'system');
        });
        completedQuests.forEach(item => {
            this.addSystemMessage(scene, `【任务完成：${item.questName}】`, 'system');
        });

        if (typeof SidebarRight !== 'undefined') {
            SidebarRight.renderQuests?.();
            SidebarRight.renderSituation?.();
            SidebarRight.markTabNew?.('quests');
        }
        if (typeof GroupChat !== 'undefined' && GroupChat._checkVictory) {
            GroupChat._checkVictory();
        }
        State.saveCurrentSceneDebounced?.();
        return { changed: true, completedObjectives, completedQuests };
    },

    _buildQuestNarrativeCorpus(scene, message) {
        const recent = (scene.messages || [])
            .filter(m => m && m.role === 'assistant' && !['victory', 'gameover'].includes(m.type))
            .slice(-8);
        if (message && !recent.some(m => m.id === message.id)) recent.push(message);
        return recent.map(m => String(m.content || '')).join('\n');
    },

    _objectiveSatisfiedByNarrative(objectiveText, narrative, quest = {}) {
        const objective = this._normalizeQuestText(objectiveText);
        const text = this._normalizeQuestText(narrative);
        if (!objective || !text) return false;
        if (objective.length >= 6 && text.includes(objective)) return true;

        const has = terms => terms.some(term => text.includes(this._normalizeQuestText(term)));
        const lacks = terms => terms.every(term => !text.includes(this._normalizeQuestText(term)));

        const negative = ['拒绝', '反对', '未通过', '没有通过', '不能确认', '证据不足', '无法证明', '没能说服'];
        const positiveOutcome = has(['完成', '通过', '确认', '证明', '同意', '批准', '认可', '全票通过', '安全返回', '带回证据']);
        if (!positiveOutcome) return false;
        if (!lacks(negative)) return false;

        if (this._objectiveHas(objective, ['授权', '信任', '认可', '许可', '身份', '接纳', '正式'])) {
            return has(['授权', '批准', '同意', '表决', '全票通过', '赞成', '认可', '信任', '正式成员', '不再是外来者', '迁徙向导', '通行证']);
        }

        if (this._objectiveHas(objective, ['探索', '调查', '进入', '前往', '区域', '货舱', '试炼', '考核', '测试'])) {
            const placeMatch = this._objectivePlaceTerms(objectiveText).length === 0
                || has(this._objectivePlaceTerms(objectiveText));
            return placeMatch && has(['进入', '抵达', '探索', '调查', '打开', '站在', '大厅', '控制台', '终端', '舱室', '区域', '完成考核', '通过考核', '通过试炼']);
        }

        if (this._objectiveHas(objective, ['找到', '寻找', '取得', '获得', '查明', '确认', '证明', '揭露', '找出'])) {
            const discovery = has(['找到', '发现', '取得', '拿到', '确认', '证明', '证据', '日志', '坐标', '数据', '样本', '芯片', '铭牌', '报告']);
            if (!discovery) return false;
            if (this._objectiveHas(objective, ['补给', '物资', '水源', '净水', '药品', '食物'])) {
                return has(['补给', '物资', '水源', '净水', '水循环', '药品', '食物', '容量', '可用', '可容纳', '生态', '新伊甸园']);
            }
            if (this._objectiveHas(objective, ['源头', '真相', '威胁', '异常', '遗物'])) {
                return has(['源头', '真相', '威胁', '异常', '遗物', '证据', '日志', '记录']);
            }
            return true;
        }

        if (this._objectiveHas(objective, ['返回', '带回', '交给', '提交', '汇报'])) {
            return has(['返回', '回到', '带回', '原路撤回']) &&
                has(['安全', '全员', '提前', '交给', '摆给', '提交', '报告', '证据']);
        }

        if (this._objectiveHas(objective, ['消灭', '封印', '根除', '解除'])) {
            return has(['消灭', '封印', '根除', '解除', '威胁解除', '被击败', '被摧毁']);
        }

        if (this._objectiveHas(objective, ['完成', '通过', '证明', '修复'])) {
            return has(['完成', '通过', '证明', '修复', '恢复', '正式认可', '合格']);
        }

        const questName = this._normalizeQuestText(quest.name || '');
        return questName && text.includes(questName) && has(['完成', '通过', '确认', '认可']);
    },

    _objectiveAllowedByProgressGates(scene, quest, objective, idx, narrative, options = {}) {
        const structured = (scene.sceneChallenges || []).length > 0 ||
            (scene.evidenceLedger || []).length > 0 ||
            (scene.flowGraph?.revelations || []).length > 0;
        if (!structured) return true;

        if ((quest.type || 'side') === 'main' && this._objectiveHasIncompleteLinkedChallenge(scene, quest, objective, idx)) {
            return false;
        }

        if (this._objectiveSupportedByEvidence(scene, quest, objective, idx)) return true;
        if (this._objectiveSupportedByRevelation(scene, quest, objective, idx)) return true;
        if (this._objectiveSupportedByChallenge(scene, quest, objective, idx)) return true;

        const type = quest.type || 'side';
        if (type !== 'main') return false;

        const maxAuto = Number(scene.gameplayProfile?.checkDensity?.maxAutoQuestAdvances ?? 2);
        const streak = Number(scene.questProgressGuards?.autoAdvanceStreak || 0);
        if (streak >= maxAuto) return false;

        const objectiveText = this._normalizeQuestText(objective?.text || '');
        const activeChallenge = this.getActiveChallenge(scene);
        if (activeChallenge && activeChallenge.status !== 'completed') {
            const objectiveTags = new Set(this._deriveObjectiveTags(quest, objective).map(t => this._normalizeQuestText(t)));
            const challengeTags = (activeChallenge.tags || []).map(t => this._normalizeQuestText(t));
            if (challengeTags.some(tag => objectiveTags.has(tag))) return false;
            const challengeText = this._normalizeQuestText(`${activeChallenge.title} ${activeChallenge.goal} ${(activeChallenge.tags || []).join(' ')}`);
            const overlap = objectiveText && challengeText && (
                objectiveText.includes(challengeText.slice(0, Math.min(6, challengeText.length))) ||
                challengeText.includes(objectiveText.slice(0, Math.min(6, objectiveText.length)))
            );
            if (overlap) return false;
        }

        // Structured main quests may still advance from a strong DM narration, but only while the auto streak is below cap.
        return true;
    },

    _objectiveHasIncompleteLinkedChallenge(scene, quest, objective, idx) {
        const ids = new Set([
            `${quest.id}:${idx + 1}`,
            this._normalizeQuestText(objective?.text || '')
        ].filter(Boolean));
        const linked = (scene.sceneChallenges || []).filter(challenge =>
            (challenge.supports || []).some(item => ids.has(item) || ids.has(this._normalizeQuestText(item)))
        );
        return linked.length > 0 && linked.some(challenge => challenge.status !== 'completed');
    },

    _objectiveSupportedByEvidence(scene, quest, objective, idx) {
        const tags = new Set(this._deriveObjectiveTags(quest, objective).map(t => this._normalizeQuestText(t)));
        const targetIds = new Set([
            `${quest.id}:${idx + 1}`,
            this._normalizeQuestText(objective?.text || '')
        ].filter(Boolean));
        return (scene.evidenceLedger || []).some(ev => {
            if (ev.visible === false) return false;
            if (!['confirmed', 'partial'].includes(ev.reliability)) return false;
            const supportMatch = (ev.supports || []).some(s => targetIds.has(s) || targetIds.has(this._normalizeQuestText(s)));
            if (supportMatch) return true;
            const matchedTags = (ev.tags || []).map(tag => this._normalizeQuestText(tag)).filter(tag => tags.has(tag));
            if ((quest.type || 'side') !== 'main') {
                const specific = matchedTags.filter(tag => !['route', 'permission', 'supply', 'newhome'].includes(tag));
                return specific.length > 0;
            }
            return matchedTags.length > 0;
        });
    },

    _objectiveSupportedByRevelation(scene, quest, objective, idx) {
        const objectiveText = this._normalizeQuestText(objective?.text || '');
        const questTargets = new Set([
            `${quest.id}:${idx + 1}`,
            objectiveText
        ].filter(Boolean));
        return (scene.flowGraph?.revelations || []).some(rev => {
            if (rev.status !== 'confirmed') return false;
            if ((rev.requiredFor || []).some(item => questTargets.has(item) || questTargets.has(this._normalizeQuestText(item)))) return true;
            const conclusion = this._normalizeQuestText(rev.conclusion || '');
            return objectiveText && conclusion && (objectiveText.includes(conclusion) || conclusion.includes(objectiveText.slice(0, 8)));
        });
    },

    _objectiveSupportedByChallenge(scene, quest, objective, idx) {
        const objectiveText = this._normalizeQuestText(objective?.text || '');
        const ids = new Set([`${quest.id}:${idx + 1}`, objectiveText].filter(Boolean));
        return (scene.sceneChallenges || []).some(challenge => {
            if (challenge.status !== 'completed') return false;
            if ((challenge.supports || []).some(item => ids.has(item) || ids.has(this._normalizeQuestText(item)))) return true;
            const text = this._normalizeQuestText(`${challenge.title} ${challenge.goal} ${(challenge.tags || []).join(' ')}`);
            return objectiveText && text && (text.includes(objectiveText.slice(0, 8)) || objectiveText.includes(text.slice(0, 8)));
        });
    },

    _deriveObjectiveTags(quest, objective) {
        const text = `${quest?.name || ''} ${objective?.text || ''}`;
        const tags = [];
        const addIf = (terms, tag) => {
            if (terms.some(term => text.includes(term))) tags.push(tag);
        };
        addIf(['苏珊', '体检', '变异', '样本', '血清', '医疗', '传染'], 'medical');
        addIf(['阿杰', '全息', '坐标', '徽章', '能源钥匙', '投影'], 'coordinate');
        addIf(['补给', '物资', '净水', '食物', '水源'], 'supply');
        addIf(['新家园', '新避难所', '生态', '新伊甸', '容纳', '迁徙'], 'new_home');
        addIf(['信任', '授权', '许可', '认可', '委员会'], 'permission');
        addIf(['路线', '旧商场', '地表', '通道', '探索'], 'route');
        addIf(['混沌', '遗物', '源头', '封印', '威胁'], 'corruption');
        addIf(['小七', '器灵', '协议', '试炼', '评分'], 'trial');
        return [...new Set(tags)];
    },

    _objectiveHas(objective, terms) {
        return terms.some(term => objective.includes(this._normalizeQuestText(term)));
    },

    _objectivePlaceTerms(text) {
        const source = String(text || '');
        const terms = [];
        const commonPlaces = ['旧商场', '避难所', '地表', '货舱', '引擎室', '机械寺', '试炼场', '生态试验站', '仓库', '大厅', '入口', '通道', '区域', '路线'];
        commonPlaces.forEach(term => {
            if (source.includes(term)) terms.push(term);
        });
        const matches = source.match(/[\u4e00-\u9fa5A-Za-z0-9#-]{2,}(?:区|站|所|城|港|寺|塔|仓|室|厅|门|路线|区域|商场|货舱|引擎|地表|避难所)/g);
        if (matches) terms.push(...matches);
        return [...new Set(terms)].slice(0, 8);
    },

    _normalizeQuestText(text) {
        return String(text || '')
            .replace(/<state_update>[\s\S]*?<\/state_update>/gi, '')
            .replace(/\[[^\]]+\]/g, '')
            .replace(/[ \t\r\n*`"'“”‘’「」《》【】()[\]{}，。！？、；：:,.!?;|/_\\-]/g, '')
            .toLowerCase();
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
        if (!scene || scene.gameState !== 'playing') return;
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
        this.checkFailureStates(scene, { type: 'turn', reason });
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
        const storyPhase = this.getActiveStoryPhase(scene);
        const knownUnknowns = this.getKnownUnknowns(scene);
        const failureWarnings = this.getFailureWarnings(scene);
        const activeChallenge = this.getActiveChallenge(scene);
        const challengeEvidence = activeChallenge ? this.getEvidenceForChallenge(scene, activeChallenge).slice(0, 4) : [];
        const visibleEvidence = (scene.evidenceLedger || []).filter(e => e.visible !== false).slice(-8);
        const revelations = this.getVisibleRevelations(scene);
        const stakes = storyPhase?.stakes || scene.currentSituation?.stakes || '';
        const recommendedActions = this._buildRecommendedActions(scene, { activeQuest, clocks, counterStrategies, hiddenPressure, storyPhase, knownUnknowns, failureWarnings, activeChallenge });
        scene.currentSituation.recommendedActions = recommendedActions;
        return { location, activeQuest, clocks, hiddenPressure, counterStrategies, recentRisks, availableClues, recommendedActions, storyPhase, stakes, knownUnknowns, failureWarnings, activeChallenge, challengeEvidence, visibleEvidence, revelations };
    },

    _buildRecommendedActions(scene, data) {
        const actions = [];
        const failureWarning = (data.failureWarnings || [])[0];
        if (failureWarning) actions.push(`处理失败风险：${failureWarning.title}`);
        if (data.activeChallenge) {
            this.getChallengeVisibleApproaches(data.activeChallenge)
                .slice(0, 3)
                .forEach(a => actions.push(a.label));
        }
        this._buildFlowActions(scene).forEach(a => actions.push(a));
        if (data.storyPhase?.recommendedActions?.length) {
            data.storyPhase.recommendedActions.slice(0, 2).forEach(a => actions.push(a));
        }
        if (data.activeQuest) {
            const objective = (data.activeQuest.objectives || []).find(o => !o.completed);
            if (objective) actions.push(`围绕「${objective.text}」采取下一步`);
        }
        const unknown = (data.knownUnknowns || []).find(item => item.actions?.length);
        if (unknown) actions.push(unknown.actions[0]);
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

    getActiveStoryPhase(scene) {
        const phases = Array.isArray(scene?.storyPhases) ? scene.storyPhases : [];
        if (phases.length === 0) return null;
        return phases.find(p => p.status === 'active')
            || phases.find(p => p.status !== 'completed')
            || phases[phases.length - 1]
            || null;
    },

    getActiveChallenge(scene) {
        const challenges = Array.isArray(scene?.sceneChallenges) ? scene.sceneChallenges : [];
        if (challenges.length === 0) return null;
        const phase = this.getActiveStoryPhase(scene);
        return challenges.find(c => c.status === 'active' && (!phase?.id || !c.phaseId || c.phaseId === phase.id))
            || challenges.find(c => c.status === 'active')
            || challenges.find(c => c.status === 'locked' && (!phase?.id || !c.phaseId || c.phaseId === phase.id))
            || challenges.find(c => !['completed', 'failed', 'bypassed'].includes(c.status))
            || null;
    },

    getChallengeVisibleApproaches(challenge) {
        if (!challenge) return [];
        return (challenge.approaches || []).slice(0, 5).map(a => ({
            id: a.id,
            label: a.label,
            stat: a.stat,
            statName: a.statName || this._statName(a.stat),
            dc: a.dc,
            tags: a.tags || []
        }));
    },

    getEvidenceForChallenge(scene, challenge) {
        if (!scene || !challenge) return [];
        const supportIds = new Set([
            challenge.id,
            ...(challenge.supports || []),
            ...(challenge.coreRevelations || [])
        ]);
        const tags = new Set((challenge.tags || []).map(t => this._normalizeQuestText(t)));
        return (scene.evidenceLedger || [])
            .filter(e => e.visible !== false)
            .filter(e => {
                if ((e.supports || []).some(s => supportIds.has(s))) return true;
                return (e.tags || []).some(tag => tags.has(this._normalizeQuestText(tag)));
            });
    },

    getVisibleRevelations(scene) {
        const revs = Array.isArray(scene?.flowGraph?.revelations) ? scene.flowGraph.revelations : [];
        return revs
            .filter(r => r.status !== 'unknown')
            .map(r => ({
                id: r.id,
                conclusion: r.conclusion,
                status: r.status,
                evidenceCount: (r.evidenceIds || []).length,
                core: r.core !== false
            }))
            .slice(0, 8);
    },

    matchChallengeApproach(scene, text, fallbackType = '') {
        const challenge = this.getActiveChallenge(scene);
        if (!challenge) return null;
        const source = this._normalizeFlowText(text);
        if (!source) return null;
        const matches = [];
        (challenge.approaches || []).forEach(approach => {
            const score = this._scoreApproach(source, approach, fallbackType);
            if (score <= 0) return;
            matches.push({ challenge, approach, score });
        });
        matches.sort((a, b) => b.score - a.score);
        if (matches.length > 0) {
            const best = matches[0];
            best.secondaryApproaches = matches
                .slice(1)
                .filter(item => item.score >= 3)
                .map(item => item.approach)
                .slice(0, 3);
            return best;
        }
        const challengeTerms = [
            challenge.title,
            ...(challenge.tags || [])
        ].map(t => this._normalizeFlowText(t)).filter(t => t.length >= 3);
        const challengeScore = challengeTerms.some(term => source.includes(term) || term.includes(source)) ? 1 : 0;
        return challengeScore > 0 ? { challenge, approach: null, score: challengeScore } : null;
    },

    getKnownUnknowns(scene) {
        const paths = Array.isArray(scene?.clueGraph) ? scene.clueGraph : [];
        return paths
            .filter(path => path && path.status !== 'hidden' && path.status !== 'confirmed')
            .map(path => {
                const stages = Array.isArray(path.stages) ? path.stages : [];
                const idx = this._clamp(Number(path.currentStage || 0), 0, Math.max(0, stages.length - 1));
                const stage = stages[idx] || {};
                return {
                    id: path.id,
                    title: path.title,
                    status: path.status,
                    subjectType: path.subjectType,
                    subjectName: path.subjectName,
                    level: stage.level || 'hint',
                    text: stage.text || path.title,
                    source: stage.source || '',
                    locationId: stage.locationId || '',
                    actions: Array.isArray(stage.actions) ? stage.actions.slice(0, 3) : [],
                    onFailure: stage.onFailure || '',
                    evidenceCount: Array.isArray(path.evidence) ? path.evidence.length : 0
                };
            })
            .slice(0, 6);
    },

    getFailureWarnings(scene) {
        const failures = Array.isArray(scene?.failureStates) ? scene.failureStates : [];
        return failures
            .filter(f => f && f.status === 'armed')
            .map(f => {
                const trigger = f.trigger || {};
                if (trigger.type !== 'clock') return null;
                const clock = (scene.clocks || []).find(c =>
                    (trigger.clockId && c.id === trigger.clockId) ||
                    (trigger.clockTag && c.tag === trigger.clockTag)
                );
                if (!clock || clock.visibility === 'hidden') return null;
                const ratio = Number(clock.value || 0) / Math.max(1, Number(clock.max || 1));
                if (ratio < 0.5) return null;
                return {
                    id: f.id,
                    title: f.title,
                    severity: f.severity,
                    text: f.hint || `${clock.name} 满格会导致失败结局。`,
                    clockName: clock.name,
                    value: clock.value,
                    max: clock.max
                };
            })
            .filter(Boolean)
            .sort((a, b) => (b.value / Math.max(1, b.max)) - (a.value / Math.max(1, a.max)))
            .slice(0, 3);
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
        const storyPhase = this.getActiveStoryPhase(scene);
        const knownUnknowns = this.getKnownUnknowns(scene);
        const activeChallenge = this.getActiveChallenge(scene);
        return { activeQuest, clocks, counterStrategies, hiddenPressure, storyPhase, knownUnknowns, activeChallenge };
    },

    _normalizeFlowText(text) {
        return String(text || '')
            .trim()
            .replace(/[你我他她它的了着过和与在上。！？!?，,；;：:\s「」《》“”"'`]/g, '')
            .toLowerCase();
    },

    _scoreApproach(normalizedText, approach, fallbackType = '') {
        if (!approach) return 0;
        const chunks = [
            approach.label,
            ...(approach.tags || []),
            ...(approach.keywords || []),
            ...this._approachFallbackKeywords(approach, fallbackType)
        ].map(t => this._normalizeFlowText(t)).filter(Boolean);
        let score = 0;
        chunks.forEach(chunk => {
            if (chunk.length < 2) return;
            if (normalizedText.includes(chunk) || chunk.includes(normalizedText)) score += chunk.length >= 4 ? 4 : 2;
            else {
                const chars = [...new Set(chunk.split(''))].filter(ch => normalizedText.includes(ch));
                if (chars.length >= Math.min(3, chunk.length)) score += 1;
            }
        });
        if (approach.actionType && approach.actionType === fallbackType) score += 2;
        return score;
    },

    _approachFallbackKeywords(approach, fallbackType = '') {
        const statWords = {
            strength: ['强行', '搬开', '拖住', '破开'],
            dexterity: ['潜入', '躲避', '穿越', '拆卸'],
            constitution: ['承受', '体检', '抗辐射', '坚持'],
            intelligence: ['分析', '读取', '破解', '提交数据', '研究'],
            wisdom: ['观察', '辨认', '察觉', '追踪'],
            charisma: ['说服', '解释', '陈述', '谈判']
        };
        const typeWords = {
            persuade: ['说服', '解释', '谈判'],
            investigate: ['调查', '分析', '查找'],
            observe: ['观察', '查看', '辨认'],
            sneak: ['潜入', '绕开', '躲避'],
            force: ['强行', '破开', '搬开'],
            ask: ['询问', '打听']
        };
        return [
            ...(statWords[approach.stat] || []),
            ...(typeWords[approach.actionType] || []),
            ...(typeWords[fallbackType] || [])
        ];
    },

    _settleChallengeStatus(scene, challenge, reason = '') {
        if (!challenge) return;
        const was = challenge.status;
        if (challenge.progress >= challenge.targetProgress && challenge.status !== 'completed') {
            challenge.status = 'completed';
            this.addSystemMessage(scene, `【挑战完成：${challenge.title}】${reason || '目标已经达成。'}`, 'system');
            this._completeLinkedPhaseIfReady(scene, challenge);
        } else if (challenge.strain >= challenge.maxStrain && !['completed', 'failed', 'bypassed'].includes(challenge.status)) {
            challenge.status = 'failed';
            const fail = (challenge.failForward || [])[0] || '挑战失败，但局势会以新的代价继续推进。';
            this.addSystemMessage(scene, `【挑战受挫：${challenge.title}】${fail}`, 'system');
        }
        if (was !== challenge.status && scene.currentSituation?.recentRisks) {
            scene.currentSituation.recentRisks.push(`${challenge.title}：${challenge.status}`);
        }
    },

    _completeLinkedPhaseIfReady(scene, challenge) {
        if (!challenge?.phaseId || !Array.isArray(scene.storyPhases)) return;
        const phase = scene.storyPhases.find(p => p.id === challenge.phaseId);
        if (!phase || phase.status !== 'active') return;
        const phaseChallenges = (scene.sceneChallenges || []).filter(c => c.phaseId === challenge.phaseId);
        const nextSamePhase = phaseChallenges.find(c => c.id !== challenge.id && c.status === 'locked');
        if (nextSamePhase) {
            nextSamePhase.status = 'active';
            nextSamePhase.updatedAt = Date.now();
            this.addSystemMessage(scene, `【挑战推进】${challenge.title} → ${nextSamePhase.title}`, 'system');
            return;
        }
        const unresolved = phaseChallenges.some(c => !['completed', 'failed', 'bypassed'].includes(c.status));
        if (unresolved) return;
        phase.status = 'completed';
        phase.updatedAt = Date.now();
        const next = scene.storyPhases.find(p => p.status === 'locked');
        if (next) {
            next.status = 'active';
            next.updatedAt = Date.now();
            this.addSystemMessage(scene, `【阶段推进】${phase.title} → ${next.title}`, 'system');
        }
    },

    _activateNextChallenge(scene) {
        const active = (scene.sceneChallenges || []).find(c => c.status === 'active');
        if (active) return active;
        const phase = this.getActiveStoryPhase(scene);
        const next = (scene.sceneChallenges || []).find(c =>
            c.status === 'locked' && (!phase?.id || !c.phaseId || c.phaseId === phase.id)
        ) || (scene.sceneChallenges || []).find(c => c.status === 'locked');
        if (next) {
            next.status = 'active';
            next.updatedAt = Date.now();
        }
        return next || null;
    },

    _applyChallengeApproachEffects(scene, challenge, approach, outcome, check) {
        const keys = outcome === 'critical_success'
            ? ['onCritical', 'onSuccess']
            : (outcome === 'success' ? ['onSuccess'] : (outcome === 'partial' ? ['onPartial'] : ['onFailure']));
        const effects = keys.flatMap(key => Array.isArray(approach[key]) ? approach[key] : []);
        effects.forEach(effect => this._applyChallengeEffectString(scene, challenge, approach, effect, check, outcome));
    },

    _applyChallengeEffectString(scene, challenge, approach, effect, check, outcome) {
        const text = String(effect || '').trim();
        if (!text) return;
        const [kindRaw, restRaw = ''] = text.split(':');
        const kind = kindRaw.trim();
        const rest = restRaw.trim();
        if (kind === 'evidenceAdd' && rest) {
            const evidenceTitles = {
                route_reading: '地表路线和辐射读数',
                no_contagion: '无传染性体检结论',
                b17_route_mark: 'B-17 通道标记',
                radiation_limit: '短时辐射剂量窗口',
                old_mall_route_log: '旧商场路线日志',
                new_eden_air: '新伊甸空气循环数据',
                new_eden_water: '新伊甸净水设备评估',
                new_eden_capacity: '新伊甸容量与床位记录',
                energy_key_verified: '入口能源钥匙验证'
            };
            this.applyEvidenceAdd(scene, [{
                id: rest.startsWith('ev_') ? rest : `ev_${rest}`,
                title: evidenceTitles[rest] || rest.replace(/[_-]/g, ' '),
                tags: [...(approach.tags || []), rest],
                reliability: outcome === 'partial' ? 'partial' : 'confirmed',
                obtainedBy: `${check.statName || approach.statName}检定`,
                supports: [challenge.id, ...(challenge.coreRevelations || []), ...(challenge.supports || [])]
            }]);
        } else if (kind === 'revelation' && rest) {
            this.applyRevelationUpdate(scene, [{ id: rest, status: outcome === 'partial' ? 'suspected' : 'confirmed', reason: challenge.title }]);
        } else if (kind === 'clock' && rest) {
            const match = rest.match(/([A-Za-z0-9_-]+)\s*([+-]\d+)/);
            if (match) {
                this.applyClockUpdate(scene, [{ id: match[1], delta: Number(match[2]), reason: challenge.title }]);
            }
        }
    },

    _refreshRevelationsFromEvidence(scene) {
        const revelations = Array.isArray(scene?.flowGraph?.revelations) ? scene.flowGraph.revelations : [];
        if (revelations.length === 0) return false;
        let changed = false;
        revelations.forEach(rev => {
            if (rev.status === 'confirmed') return;
            const supporting = (scene.evidenceLedger || []).filter(ev =>
                (ev.supports || []).includes(rev.id) ||
                (rev.clueIds || []).some(id => (ev.supports || []).includes(id)) ||
                (rev.evidenceIds || []).includes(ev.id)
            );
            const confirmed = supporting.filter(ev => ev.reliability === 'confirmed').length;
            const partial = supporting.filter(ev => ['confirmed', 'partial'].includes(ev.reliability)).length;
            if (confirmed >= 2 || partial >= 3) {
                rev.status = 'confirmed';
                rev.evidenceIds = [...new Set([...(rev.evidenceIds || []), ...supporting.map(ev => ev.id)])].slice(0, 12);
                rev.updatedAt = Date.now();
                changed = true;
            } else if (partial > 0 && rev.status === 'unknown') {
                rev.status = 'suspected';
                rev.evidenceIds = [...new Set([...(rev.evidenceIds || []), ...supporting.map(ev => ev.id)])].slice(0, 12);
                rev.updatedAt = Date.now();
                changed = true;
            }
        });
        return changed;
    },

    _normalizeStatKey(stat) {
        const map = {
            '力量': 'strength',
            '敏捷': 'dexterity',
            '体质': 'constitution',
            '智力': 'intelligence',
            '感知': 'wisdom',
            '魅力': 'charisma',
            strength: 'strength',
            dexterity: 'dexterity',
            constitution: 'constitution',
            intelligence: 'intelligence',
            wisdom: 'wisdom',
            charisma: 'charisma'
        };
        return map[String(stat || '').trim()] || 'intelligence';
    },

    _statName(stat) {
        const map = {
            strength: '力量',
            dexterity: '敏捷',
            constitution: '体质',
            intelligence: '智力',
            wisdom: '感知',
            charisma: '魅力'
        };
        return map[stat] || stat || '属性';
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

    checkFailureStates(scene, context = {}) {
        if (!scene || scene.gameState !== 'playing') return null;
        this.normalizeScene(scene);
        const failure = (scene.failureStates || []).find(f => f.status === 'armed' && this._failureMatches(scene, f, context));
        if (!failure) return null;
        return this.triggerFailureState(scene, failure, context);
    },

    triggerFailureState(scene, failure, context = {}) {
        if (!scene || scene.gameState !== 'playing' || !failure) return null;
        failure.status = 'triggered';
        failure.triggeredAt = Date.now();
        failure.updatedAt = Date.now();
        scene.gameState = 'defeated';
        scene.defeatReason = failure.id;
        if (!scene.currentSituation) scene.currentSituation = { recentRisks: [], recommendedActions: [] };
        if (!Array.isArray(scene.currentSituation.recentRisks)) scene.currentSituation.recentRisks = [];
        scene.currentSituation.recentRisks.push(`失败结局：${failure.title}`);
        const message = [
            `【失败结局：${failure.title}】`,
            failure.message || '关键局势已经失控，故事进入失败结局。',
            failure.aftermath || '可以读取存档，从更早的选择重新尝试。'
        ].filter(Boolean).join('\n\n');
        const msg = this.addSystemMessage(scene, message, 'gameover');
        if (typeof RunRecorder !== 'undefined') RunRecorder.complete(scene, 'defeated', failure.title);
        if (typeof showToast !== 'undefined') showToast(failure.recoverable === false ? '进入失败结局' : '进入失败结局，可读取存档重来');
        if (typeof ActionBar !== 'undefined' && ActionBar.renderStatsDisplay) ActionBar.renderStatsDisplay();
        if (typeof SidebarRight !== 'undefined') {
            SidebarRight.renderSituation?.();
            SidebarRight.markTabNew?.('situation');
        }
        State.saveCurrentSceneDebounced?.();
        return { failure, message: msg, context };
    },

    _failureMatches(scene, failure, context = {}) {
        const trigger = failure.trigger || {};
        const type = trigger.type || 'manual';
        if (type === 'manual') return context.failureId === failure.id || context.triggerFailureId === failure.id;
        if (type === 'clock') {
            const clock = (scene.clocks || []).find(c =>
                (trigger.clockId && c.id === trigger.clockId) ||
                (trigger.clockTag && c.tag === trigger.clockTag)
            );
            if (!clock) return false;
            const at = trigger.at === 'max' || trigger.at === undefined
                ? Number(clock.max || 0)
                : Number(trigger.at);
            return Number(clock.value || 0) >= at;
        }
        if (type === 'quest') {
            const quest = (scene.quests || []).find(q => !trigger.questId || q.id === trigger.questId);
            if (!quest) return false;
            const status = trigger.status || 'failed';
            return quest.status === status || (status === 'failed' && quest.status === 'abandoned');
        }
        if (type === 'counter') {
            const counter = (scene.counterStrategies || []).find(c => !trigger.counterId || c.id === trigger.counterId);
            if (!counter) return false;
            const at = trigger.at === 'max' || trigger.at === undefined ? 100 : Number(trigger.at);
            return Number(counter.progress || 0) >= at;
        }
        if (type === 'worldTension') {
            const at = Number(trigger.at || 100);
            return Number(scene.worldTension || 0) >= at;
        }
        return false;
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
        scene.consequenceLedger = (scene.consequenceLedger || []).slice(-60);
    },

    _clamp(value, min, max) {
        const n = Number(value);
        if (!Number.isFinite(n)) return min;
        return Math.max(min, Math.min(max, Math.round(n)));
    }
};
