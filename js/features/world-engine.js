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
        if (!Array.isArray(scene.eventLog)) scene.eventLog = [];
        if (!Array.isArray(scene.failureStates)) scene.failureStates = [];
        if (!Array.isArray(scene.runHistory)) scene.runHistory = [];
        if (!Array.isArray(scene.transcriptLog)) scene.transcriptLog = [];
        if (!Array.isArray(scene.sceneChallenges)) scene.sceneChallenges = [];
        if (!Array.isArray(scene.evidenceLedger)) scene.evidenceLedger = [];
        if (!Array.isArray(scene.companionResources)) scene.companionResources = [];
        if (!Array.isArray(scene.explorationRewardLog)) scene.explorationRewardLog = [];
        if (!Array.isArray(scene.pendingExplorationRewards)) scene.pendingExplorationRewards = [];
        if (!scene.flowGraph || typeof scene.flowGraph !== 'object') scene.flowGraph = { nodes: [], revelations: [] };
        scene.gameplayProfile = this.normalizeGameplayProfile(scene.gameplayProfile);
        scene.storyTexture = this.normalizeStoryTexture(scene.storyTexture);
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
        this.normalizePlayerVitals(scene);
        if (!Array.isArray(scene.quests)) scene.quests = [];
        scene.quests = scene.quests.map((quest, idx) => this.normalizeQuest(quest, idx)).filter(Boolean).slice(0, 40);

        scene.clocks = scene.clocks.map(c => this.normalizeClock(c)).filter(Boolean).slice(0, 12);
        scene.counterStrategies = scene.counterStrategies.map(c => this.normalizeCounterStrategy(c)).filter(Boolean).slice(0, 20);
        scene.storyPhases = scene.storyPhases.map((p, idx) => this.normalizeStoryPhase(p, idx)).filter(Boolean).slice(0, 12);
        scene.clueGraph = scene.clueGraph.map(c => this.normalizeCluePath(c)).filter(Boolean).slice(0, 40);
        scene.consequenceLedger = scene.consequenceLedger.map(c => this.normalizeConsequence(c)).filter(Boolean).slice(-60);
        scene.eventLog = scene.eventLog.map(e => this.normalizeEventLogEntry(e)).filter(Boolean).slice(-120);
        scene.failureStates = scene.failureStates.map((f, idx) => this.normalizeFailureState(f, idx)).filter(Boolean).slice(0, 24);
        scene.flowGraph = this.normalizeFlowGraph(scene.flowGraph);
        scene.sceneChallenges = scene.sceneChallenges.map((c, idx) => this.normalizeSceneChallenge(c, idx)).filter(Boolean).slice(0, 24);
        this.ensureGameplayScaffold(scene);
        scene.evidenceLedger = scene.evidenceLedger.map(e => this.normalizeEvidence(e)).filter(Boolean).slice(-120);
        scene.companionResources = scene.companionResources
            .map(r => this._repairCompanionResourceLink(scene, r))
            .map(r => this.normalizeCompanionResource(r))
            .filter(Boolean)
            .slice(0, 24);
        scene.explorationRewardLog = scene.explorationRewardLog.map(String).filter(Boolean).slice(-200);
        scene.pendingExplorationRewards = scene.pendingExplorationRewards
            .map((reward, idx) => this.normalizePendingExplorationReward(reward, idx))
            .filter(Boolean)
            .slice(-40);
        (State.activeCharacters || []).forEach(char => this.normalizeAgenda(char));
        return scene;
    },

    ensureGameplayScaffold(scene) {
        if (!scene || !this._shouldBackfillGameplayScaffold(scene)) return scene;
        if (!Array.isArray(scene.storyPhases)) scene.storyPhases = [];
        if (!Array.isArray(scene.sceneChallenges)) scene.sceneChallenges = [];
        if (!scene.flowGuide || typeof scene.flowGuide !== 'object') scene.flowGuide = this.normalizeFlowGuide({});

        if (scene.storyPhases.length === 0) {
            scene.storyPhases = this._buildFallbackStoryPhases(scene);
        }
        this._ensureActiveStoryPhase(scene);

        if (scene.sceneChallenges.length === 0) {
            scene.sceneChallenges = this._buildFallbackSceneChallenges(scene);
        }
        this._ensureActiveSceneChallenge(scene);

        if (!this._hasFlowGuideSuggestions(scene.flowGuide)) {
            scene.flowGuide = this._buildFallbackFlowGuide(scene);
        } else {
            scene.flowGuide = this.normalizeFlowGuide(scene.flowGuide);
        }
        return scene;
    },

    _shouldBackfillGameplayScaffold(scene) {
        if (!scene || !this.isScenePlaying(scene)) return false;
        return (Array.isArray(scene.quests) && scene.quests.length > 0) ||
            (Array.isArray(scene.conflictSeeds) && scene.conflictSeeds.length > 0) ||
            (Array.isArray(scene.storyArcs) && scene.storyArcs.length > 0) ||
            (Array.isArray(scene.clueGraph) && scene.clueGraph.length > 0);
    },

    _isTerminalProgressStatus(status) {
        return ['completed', 'failed', 'bypassed'].includes(String(status || ''));
    },

    _ensureActiveStoryPhase(scene) {
        if (!Array.isArray(scene.storyPhases) || scene.storyPhases.length === 0) return null;
        const active = scene.storyPhases.find(phase => phase.status === 'active');
        if (active) return active;
        const next = scene.storyPhases.find(phase => !this._isTerminalProgressStatus(phase.status)) || scene.storyPhases[0];
        if (next && !this._isTerminalProgressStatus(next.status)) next.status = 'active';
        return next || null;
    },

    _ensureActiveSceneChallenge(scene) {
        if (!Array.isArray(scene.sceneChallenges) || scene.sceneChallenges.length === 0) return null;
        const active = scene.sceneChallenges.find(challenge => challenge.status === 'active');
        if (active) return active;
        const phase = this.getActiveStoryPhase(scene);
        if (phase && this._isTerminalProgressStatus(phase.status)) return null;
        const next = scene.sceneChallenges.find(challenge =>
            challenge.status === 'locked' && (!phase?.id || !challenge.phaseId || challenge.phaseId === phase.id)
        ) || scene.sceneChallenges.find(challenge => !this._isTerminalProgressStatus(challenge.status));
        if (next && !this._isTerminalProgressStatus(next.status)) next.status = 'active';
        return next || null;
    },

    _buildFallbackStoryPhases(scene) {
        const mainQuest = this._getMainQuest(scene);
        const objectives = (mainQuest?.objectives || [])
            .map(obj => String(obj?.text || obj || '').trim())
            .filter(Boolean);
        const seeds = Array.isArray(scene.conflictSeeds) ? scene.conflictSeeds.map(String).filter(Boolean) : [];
        const arc = Array.isArray(scene.storyArcs) ? scene.storyArcs[0] : null;
        const source = objectives.length > 0
            ? objectives
            : (seeds.length > 0 ? seeds : [arc?.synopsis || scene.description || scene.name || '推进当前故事']);
        return source.slice(0, 3).map((text, idx) => this.normalizeStoryPhase({
            id: `phase_auto_${idx + 1}`,
            title: idx === 0 ? '建立立足点' : (idx === source.length - 1 ? '完成关键抉择' : '取得关键证据'),
            status: idx === 0 ? 'active' : 'locked',
            goal: text,
            stakes: seeds[idx] || seeds[0] || '拖延或失败会让局势压力上升。',
            entry: idx === 0 ? '场景开始' : '上一阶段目标已有明确进展',
            exit: `围绕「${text}」取得证据、让步或付出代价`,
            recommendedActions: this._fallbackActionsForObjective(scene, text),
            pressureTags: ['main'],
            spotlight: []
        }, idx)).filter(Boolean);
    },

    _buildFallbackSceneChallenges(scene) {
        const rawPhases = Array.isArray(scene.storyPhases) && scene.storyPhases.length > 0
            ? scene.storyPhases
            : this._buildFallbackStoryPhases(scene);
        const phases = rawPhases.filter(phase => !this._isTerminalProgressStatus(phase.status));
        const mainQuest = this._getMainQuest(scene);
        return phases.slice(0, 4).map((phase, idx) => this.normalizeSceneChallenge({
            id: `challenge_auto_${phase.id || idx + 1}`,
            phaseId: phase.id || '',
            title: `${phase.title || '阶段'}挑战`,
            status: phase.status === 'active' ? 'active' : 'locked',
            goal: phase.goal || '通过行动、证据和检定推进当前阶段。',
            stakes: phase.stakes || '失败会带来代价，但故事继续推进。',
            targetProgress: idx >= 2 ? 4 : 3,
            maxStrain: 3,
            checkBudget: { min: 1, target: 2, max: 4 },
            tags: ['main', 'fallback'],
            supports: mainQuest?.id ? [`${mainQuest.id}:${idx + 1}`] : [],
            approaches: [
                { id: `approach_${idx + 1}_talk`, label: '用已有信息争取支持', stat: 'charisma', dc: 13 + idx, effect: 1, actionType: 'persuade', tags: ['social'], keywords: ['说服', '谈判', '争取支持'] },
                { id: `approach_${idx + 1}_investigate`, label: '调查可验证证据', stat: 'intelligence', dc: 13 + idx, effect: 1, actionType: 'investigate', tags: ['evidence'], keywords: ['调查', '搜索', '验证证据'] },
                { id: `approach_${idx + 1}_observe`, label: '观察现场异常', stat: 'wisdom', dc: 12 + idx, effect: 1, actionType: 'observe', tags: ['clue'], keywords: ['观察', '察看', '留意异常'] }
            ],
            failForward: ['得到片面线索但付出代价。', '公开时钟、反制或关系压力推进。']
        }, idx)).filter(Boolean);
    },

    _buildFallbackFlowGuide(scene) {
        const phase = this.getActiveStoryPhase(scene) || scene.storyPhases?.[0] || null;
        const challenge = this.getActiveChallenge(scene) || scene.sceneChallenges?.[0] || null;
        const objective = phase?.goal || this._getMainQuest(scene)?.objectives?.[0]?.text || scene.conflictSeeds?.[0] || '推进当前目标';
        const openingMoves = [
            ...(phase?.recommendedActions || []),
            ...(challenge?.approaches || []).map(approach => approach.label ? `${approach.label}：${objective}` : '')
        ].map(String).filter(Boolean);
        const firstChar = this._sceneCharacters(scene)[0];
        const loc = (scene.locations || []).find(l => l.id === scene.currentLocation);
        return this.normalizeFlowGuide({
            openingMoves: [
                ...openingMoves,
                loc?.name ? `观察${loc.name}里和目标有关的异常` : '观察当前地点有没有异常',
                firstChar?.name ? `询问${firstChar.name}当前最紧急的问题` : '询问在场的人当前最紧急的问题'
            ],
            sessionGoals: [objective, ...(scene.storyPhases || []).map(p => p.goal).filter(Boolean)].slice(0, 4),
            stalledPrompts: [
                '观察当前地点有没有异常',
                firstChar?.name ? `询问${firstChar.name}下一步该做什么` : '询问在场的人下一步该做什么',
                '制定一个计划，先收集情报再行动'
            ],
            failForward: [
                '失败时推进局势压力，但给出一个更清晰的新线索。',
                '部分成功时让目标达成一半，并引入代价或新压力。'
            ],
            completedMoves: []
        });
    },

    _fallbackActionsForObjective(scene, objective) {
        const text = String(objective || '当前目标').slice(0, 80);
        const firstChar = this._sceneCharacters(scene)[0];
        const loc = (scene.locations || []).find(l => l.id === scene.currentLocation);
        return [
            `围绕「${text}」采取下一步`,
            loc?.name ? `观察${loc.name}里和「${text}」有关的异常` : `观察当前地点和「${text}」有关的线索`,
            firstChar?.name ? `询问${firstChar.name}关于「${text}」的看法` : `询问在场的人关于「${text}」的线索`
        ];
    },

    _getMainQuest(scene) {
        return (scene?.quests || []).find(q => q?.type === 'main') || (scene?.quests || [])[0] || null;
    },

    _hasFlowGuideSuggestions(flowGuide) {
        return ['openingMoves', 'stalledPrompts'].some(key =>
            Array.isArray(flowGuide?.[key]) && flowGuide[key].some(item => String(item || '').trim())
        );
    },

    _repairCompanionResourceLink(scene, resource) {
        if (!scene || !resource || typeof resource !== 'object') return resource;
        const chars = this._sceneCharacters(scene);
        if (chars.length === 0) return resource;

        const rawId = String(resource.characterId || '').trim();
        const findByName = value => {
            const name = String(value || '').trim();
            if (!name) return null;
            return chars.find(char => String(char.name || '').trim() === name) || null;
        };

        let matched = null;
        if (rawId) {
            matched = chars.find(char => char.id === rawId) || findByName(rawId);
        }
        const explicitName = String(resource.characterName || resource.character || resource.actorName || '').trim();
        if (!matched) {
            matched = findByName(explicitName);
        }
        const resourceName = String(resource.name || '').trim();
        if (!matched && resourceName) {
            matched = chars.find(char => {
                const name = String(char.name || '').trim();
                return name && resourceName.includes(name);
            }) || null;
        }
        const mentionsAnyKnownCharacter = resourceName && typeof State !== 'undefined' && Array.isArray(State.characters)
            ? State.characters.some(char => {
                const name = String(char?.name || '').trim();
                return name && resourceName.includes(name);
            })
            : false;
        if (!matched && chars.length === 1 && !rawId && !explicitName && !mentionsAnyKnownCharacter) matched = chars[0];
        if (!matched || resource.characterId === matched.id) return resource;
        return { ...resource, characterId: matched.id };
    },

    _sceneCharacters(scene) {
        if (typeof State === 'undefined' || !Array.isArray(State.characters)) return [];
        const sceneIds = new Set(Array.isArray(scene?.characters) ? scene.characters.map(String) : []);
        return State.characters.filter(char => char && (!sceneIds.size || sceneIds.has(String(char.id))));
    },

    normalizeStoryTexture(texture = {}) {
        const src = texture && typeof texture === 'object' ? texture : {};
        const list = (key, limit, itemLimit = 160) => (
            Array.isArray(src[key]) ? src[key] : []
        ).map(s => String(s || '').trim()).filter(Boolean).map(s => s.slice(0, itemLimit)).slice(0, limit);
        return {
            tone: String(src.tone || '').slice(0, 220),
            sensory: list('sensory', 8),
            motifs: list('motifs', 8),
            dramaticQuestions: list('dramaticQuestions', 8, 220),
            npcBeats: list('npcBeats', 8, 220),
            sceneRules: list('sceneRules', 8, 220)
        };
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
            evidenceIds: list('evidenceIds', 20),
            expReward: Number.isFinite(Number(data.expReward)) ? this._clamp(Number(data.expReward), 0, 200) : 0,
            rewardGranted: data.rewardGranted === true,
            lastReason: String(data.lastReason || '').slice(0, 240),
            updatedAt: typeof data.updatedAt === 'number' ? data.updatedAt : Date.now()
        };
    },

    normalizeQuest(data = {}, index = 0) {
        if (!data || typeof data !== 'object') return null;
        const rawObjectives = Array.isArray(data.objectives) ? data.objectives : [];
        const objectives = rawObjectives
            .map(item => {
                const text = typeof item === 'object'
                    ? String(item.text || item.name || '').trim()
                    : String(item || '').trim();
                if (!text) return null;
                return {
                    text: text.slice(0, 180),
                    completed: typeof item === 'object' ? item.completed === true : false
                };
            })
            .filter(Boolean)
            .slice(0, 8);
        const fallbackName = `任务 ${index + 1}`;
        const name = String(data.name || fallbackName).trim().slice(0, 80) || fallbackName;
        const status = ['active', 'completed', 'failed', 'abandoned'].includes(data.status) ? data.status : 'active';
        const quest = {
            id: String(data.id || `q_${Date.now()}_${index}`).trim().slice(0, 100),
            name,
            type: data.type === 'main' ? 'main' : 'side',
            description: String(data.description || '').trim().slice(0, 240),
            objectives: objectives.length > 0 ? objectives : [{ text: '推进任务', completed: false }],
            status,
            giver: String(data.giver || '剧情').trim().slice(0, 60),
            reward: String(data.reward || '').trim().slice(0, 220),
            rewardGranted: data.rewardGranted === true
        };
        if (typeof data.completedAt === 'number') quest.completedAt = data.completedAt;
        return quest;
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

    normalizeEventLogEntry(data = {}) {
        if (!data || typeof data !== 'object') return null;
        const validCategories = [
            'system', 'check', 'quest', 'inventory', 'resource', 'exploration',
            'challenge', 'progress', 'survival', 'economy', 'level', 'movement', 'failure', 'victory'
        ];
        const category = validCategories.includes(data.category) ? data.category : this._eventCategoryFromText(data.title || data.text || '');
        return {
            id: String(data.id || 'evlog_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)).slice(0, 100),
            category,
            title: String(data.title || '事件').slice(0, 120),
            text: String(data.text || data.title || '').slice(0, 360),
            turn: Number.isFinite(Number(data.turn)) ? Number(data.turn) : 0,
            timestamp: Number.isFinite(Number(data.timestamp)) ? Number(data.timestamp) : Date.now(),
            messageId: String(data.messageId || '').slice(0, 100),
            refId: String(data.refId || '').slice(0, 100)
        };
    },

    normalizeCompanionResource(data = {}) {
        if (!data || typeof data !== 'object') return null;
        const obj = key => (data[key] && typeof data[key] === 'object') ? data[key] : {};
        const list = (key, limit, itemLimit = 80) => (
            Array.isArray(data[key]) ? data[key] : []
        ).map(String).filter(Boolean).map(s => s.slice(0, itemLimit)).slice(0, limit);
        return {
            id: String(data.id || 'ally_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)).slice(0, 100),
            characterId: String(data.characterId || '').slice(0, 100),
            name: String(data.name || '同伴协助').slice(0, 120),
            unlock: obj('unlock'),
            uses: this._clamp(Number(data.uses ?? 1), 0, 10),
            cost: obj('cost'),
            effect: this.normalizeCompanionEffect(obj('effect')),
            tags: list('tags', 10),
            risk: String(data.risk || '').slice(0, 220)
        };
    },

    normalizeCompanionEffect(effect = {}) {
        const statMap = {
            '力量': 'strength',
            '敏捷': 'dexterity',
            '体质': 'constitution',
            '智力': 'intelligence',
            '感知': 'wisdom',
            '魅力': 'charisma'
        };
        const stat = effect.stat ? String(effect.stat) : '';
        const num = (key, fallback = 0) => {
            const n = Number(effect[key]);
            return Number.isFinite(n) ? n : fallback;
        };
        const list = (key, limit = 10) => this._asStringList(effect[key], limit);
        const fallbackBonus = Number.isFinite(Number(effect.value)) ? Number(effect.value) : 0;
        const reliability = this.evidenceReliabilities.includes(effect.evidenceReliability) ? effect.evidenceReliability : '';
        return {
            checkBonus: num('checkBonus', fallbackBonus),
            dcDelta: num('dcDelta', 0),
            riskDelta: num('riskDelta', 0),
            clockDelta: num('clockDelta', 0),
            clockId: effect.clockId ? String(effect.clockId).slice(0, 100) : '',
            clockTag: effect.clockTag ? String(effect.clockTag).slice(0, 60) : '',
            evidenceReliability: reliability,
            evidenceIds: list('evidenceIds', 12),
            evidenceTags: list('evidenceTags', 12),
            resolveConsequence: effect.resolveConsequence === true,
            resolveConsequenceTags: list('resolveConsequenceTags', 12),
            consequenceTags: list('consequenceTags', 12),
            resolveLimit: this._clamp(Number(effect.resolveLimit || 1), 1, 3),
            stat: statMap[stat] || stat,
            actionType: effect.actionType ? String(effect.actionType).slice(0, 40) : '',
            when: effect.when ? String(effect.when).slice(0, 120) : ''
        };
    },

    normalizeStoryPhase(phase = {}, index = 0) {
        if (!phase || typeof phase !== 'object') return null;
        const statuses = ['locked', 'active', 'completed', 'failed', 'bypassed'];
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
        const severities = ['low', 'medium', 'high', 'critical'];
        const statuses = ['active', 'resolved', 'expired'];
        const list = (key, limit, itemLimit = 80) => (
            Array.isArray(data[key]) ? data[key] : []
        ).map(String).filter(Boolean).map(s => s.slice(0, itemLimit)).slice(0, limit);
        return {
            id: String(data.id || 'cons_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6)).slice(0, 100),
            title: String(data.title || '后果').slice(0, 120),
            cause: String(data.cause || '').slice(0, 260),
            effect: String(data.effect || '').slice(0, 260),
            severity: severities.includes(data.severity) ? data.severity : 'low',
            status: statuses.includes(data.status) ? data.status : 'active',
            category: String(data.category || 'general').slice(0, 60),
            tags: list('tags', 10),
            turn: Number.isFinite(Number(data.turn)) ? Number(data.turn) : 0,
            resolvedAt: Number.isFinite(Number(data.resolvedAt)) ? Number(data.resolvedAt) : 0,
            resolvedBy: String(data.resolvedBy || '').slice(0, 120),
            resolution: String(data.resolution || '').slice(0, 260),
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
            resolvedAt: Number.isFinite(Number(data.resolvedAt)) ? Number(data.resolvedAt) : 0,
            resolution: String(data.resolution || '').slice(0, 260),
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

    normalizePendingExplorationReward(reward = {}, index = 0) {
        if (!reward || typeof reward !== 'object' || !reward.item) return null;
        const item = this.normalizeItem({ ...reward.item });
        if (!item || !item.name) return null;
        const evidenceId = String(reward.evidenceId || reward.refId || item.id || `pending_${index}`).slice(0, 100);
        return {
            id: String(reward.id || `explore_reward_${evidenceId}`).slice(0, 120),
            evidenceId,
            evidenceTitle: String(reward.evidenceTitle || reward.title || '探索收获').slice(0, 140),
            item,
            createdAt: Number.isFinite(Number(reward.createdAt)) ? Number(reward.createdAt) : Date.now(),
            attempts: this._clamp(Number(reward.attempts || 0), 0, 20)
        };
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
        const value = [effect.value, effect.checkBonus, effect.dcDelta, effect.riskDelta, effect.clockDelta]
            .map(Number)
            .find(Number.isFinite);
        const rawValue = value ?? 0;
        const lowerType = type.toLowerCase();
        let safeValue = rawValue;
        if (lowerType === 'check_bonus') safeValue = this._clamp(rawValue, -10, 10);
        else if (lowerType === 'dc_delta') safeValue = this._clamp(rawValue, -10, 10);
        else if (lowerType === 'risk_delta' || lowerType === 'strategy_leverage') safeValue = this._clamp(rawValue, -50, 50);
        else if (lowerType === 'heal') safeValue = this._clamp(rawValue, 0, 50);
        else if (lowerType === 'gold') safeValue = this._clamp(rawValue, -500, 500);
        else if (lowerType === 'exp') safeValue = this._clamp(rawValue, 0, 200);
        else if (lowerType === 'clock_delta' || lowerType === 'clock_resist') safeValue = this._clamp(rawValue, -12, 12);
        else if (lowerType === 'world_tension') safeValue = this._clamp(rawValue, -100, 100);
        return {
            type,
            stat: statMap[stat] || stat,
            actionType: effect.actionType ? String(effect.actionType) : '',
            tag: effect.tag ? String(effect.tag).slice(0, 80) : '',
            clockId: effect.clockId ? String(effect.clockId).slice(0, 100) : '',
            clockTag: effect.clockTag ? String(effect.clockTag).slice(0, 60) : '',
            clockName: effect.clockName ? String(effect.clockName).slice(0, 100) : '',
            value: safeValue,
            when: effect.when ? String(effect.when).slice(0, 120) : '',
            consume: effect.consume === true
        };
    },

    createInventoryItemFromReward(name, quantity = 1, options = {}) {
        const cleanName = String(name || '未知物品').trim().slice(0, 80) || '未知物品';
        const desc = String(options.description || '').trim().slice(0, 180);
        const qty = this._clamp(Number(quantity || 1), 1, 20);
        const text = `${cleanName} ${desc}`.toLowerCase();
        const has = (...words) => words.some(word => text.includes(String(word).toLowerCase()));
        const validTypes = ['weapon', 'armor', 'consumable', 'quest', 'misc'];
        const requestedType = validTypes.includes(options.type) ? options.type : '';
        const item = {
            id: 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            name: cleanName,
            description: desc,
            type: requestedType || 'misc',
            quantity: qty,
            equipped: false,
            tags: [],
            effects: []
        };

        if (has('医疗', '治疗', '急救', '药', '血清', '绷带', 'medical', 'heal', 'serum', 'potion')) {
            item.type = 'consumable';
            item.quantity = 1;
            item.uses = qty;
            item.tags = ['医疗', '治疗'];
            item.description = desc || '可直接恢复生命的消耗品。';
            item.effects = [{ type: 'heal', value: has('高级', '强效') ? 6 : 4, consume: true }];
        } else if (has('补给', '口粮', '食物', '饮水', 'ration', 'supply')) {
            item.type = 'consumable';
            item.quantity = 1;
            item.uses = qty;
            item.tags = ['补给', '探索'];
            item.description = desc || '可恢复少量生命，也能在合适检定中作为准备资源。';
            item.effects = [
                { type: 'heal', value: 2, consume: true },
                { type: 'check_bonus', value: 2, consume: true }
            ];
        } else if (has('零件', '备件', '维修包', 'repair kit', 'parts')) {
            item.type = 'consumable';
            item.quantity = 1;
            item.uses = qty;
            item.tags = ['零件', '修复', '设备'];
            item.description = desc || '可辅助一次修复、破解或设备操作。';
            item.effects = [{ type: 'check_bonus', stat: 'intelligence', actionType: 'use_item', value: 2, consume: true }];
        } else if (requestedType === 'weapon' || has('剑', '刀', '枪', '弓', '斧', '锤', 'weapon', 'blade', 'rifle', 'pistol')) {
            item.type = 'weapon';
            item.tags = ['武器'];
            item.description = desc || '装备后可降低战斗行动风险。';
            item.effects = [{ type: 'check_bonus', actionType: 'combat', value: 1, consume: false }];
        } else if (requestedType === 'armor' || has('甲', '护甲', '盾', '防具', 'armor', 'shield')) {
            item.type = 'armor';
            item.tags = ['防具'];
            item.description = desc || '装备后可降低战斗或强行突破的风险。';
            item.effects = [{ type: 'check_bonus', stat: 'constitution', actionType: 'force', value: 1, consume: false }];
        } else if (requestedType === 'quest' || has('钥匙', '地图', '账本', '档案', '徽章', '许可', '证据', '情报', '线索', 'key', 'map', 'ledger', 'evidence')) {
            item.type = 'quest';
            item.tags = ['线索', '任务'];
            item.description = desc || '关键线索或任务物品，可在调查、观察或交涉时作为依据。';
            item.effects = [{ type: 'check_bonus', actionType: 'investigate', value: 1, consume: false }];
        } else if (has('工具', '探测器', '扫描仪', 'kit', 'tool', 'scanner')) {
            item.type = requestedType || 'misc';
            item.tags = ['工具'];
            item.description = desc || '可在合适的调查或操作中提供轻微优势。';
            item.effects = [{ type: 'check_bonus', actionType: 'investigate', value: 1, consume: false }];
        }
        return this.normalizeItem(item);
    },

    addOrMergeInventoryItem(scene, item) {
        return this._addOrMergeInventoryItem(scene, item);
    },

    grantInventoryItem(scene, item, options = {}) {
        if (!scene || !item) return { ok: false, message: '没有可添加的物品。' };
        this.normalizeScene(scene);
        if (!this.isScenePlaying(scene)) return { ok: false, message: this.endedSceneMessage(scene) };
        const normalized = this.normalizeItem({ ...item });
        if (!normalized) return { ok: false, message: '物品数据无效。' };
        const added = this._addOrMergeInventoryItem(scene, normalized);
        if (!added) return { ok: false, message: '背包已满，无法获得物品。' };

        const quantity = normalized.uses !== undefined
            ? Number(normalized.uses ?? 1)
            : Number(normalized.quantity || 1);
        const qtyText = quantity > 1 ? ` x${quantity}` : '';
        const source = String(options.source || '').trim().slice(0, 120);
        const text = `${source ? `${source}，` : ''}获得 ${normalized.name}${qtyText}`;
        if (options.record !== false) {
            this.recordEvent(scene, {
                category: 'inventory',
                title: '获得物品',
                text
            });
        }
        if (typeof SidebarRight !== 'undefined') {
            SidebarRight.renderInventory?.();
            SidebarRight.renderDetail?.();
            SidebarRight.markTabNew?.('inventory');
        }
        return { ok: true, itemName: normalized.name, quantity, item: normalized };
    },

    isScenePlaying(scene) {
        return !!scene && (!scene.gameState || scene.gameState === 'playing');
    },

    endedSceneMessage(scene) {
        if (scene?.gameState === 'victorious') return '本次冒险已经通关，不能再改变角色、背包、地图或任务状态。可以查看通关记录，或回到大厅开始新的世界。';
        if (scene?.gameState === 'defeated') return '本次冒险已经失败，不能再改变角色、背包、地图或任务状态。可以查看失败记录，或读取存档重试。';
        return '当前冒险已经结束，不能继续改变游戏状态。';
    },

    calculatePlayerMaxHp(scene) {
        const con = Number(scene?.playerStats?.constitution ?? 10);
        const level = Number(scene?.level || 1);
        return Math.max(1, 10 + Math.floor((con - 10) / 2) * 4 + (level - 1) * 4);
    },

    normalizePlayerVitals(scene) {
        if (!scene) return scene;
        const derivedMax = this.calculatePlayerMaxHp(scene);
        const currentMax = Number(scene.playerMaxHp);
        const hasValidMax = Number.isFinite(currentMax) && currentMax > 0;
        const nextMax = hasValidMax ? Math.max(currentMax, derivedMax) : derivedMax;
        const currentHp = Number(scene.playerHp);
        const wasFull = hasValidMax && Number.isFinite(currentHp) && currentHp >= currentMax;
        scene.playerMaxHp = nextMax;
        if (!Number.isFinite(currentHp)) {
            scene.playerHp = nextMax;
        } else if (nextMax > currentMax && wasFull) {
            scene.playerHp = nextMax;
        } else {
            scene.playerHp = this._clamp(currentHp, 0, nextMax);
        }
        return scene;
    },

    addExperience(scene, amount, options = {}) {
        if (!scene) return { ok: false, amount: 0, levelsGained: 0, message: '没有可用场景。' };
        this.normalizeScene(scene);
        if (!this.isScenePlaying(scene)) {
            return { ok: false, amount: 0, levelsGained: 0, message: this.endedSceneMessage(scene) };
        }
        if (!Array.isArray(scene.messages)) scene.messages = [];
        const currentLevel = Math.floor(Number(scene.level || 1));
        const currentExp = Math.floor(Number(scene.exp || 0));
        const currentAttrPoints = Math.floor(Number(scene.attrPoints || 0));
        scene.level = Number.isFinite(currentLevel) ? Math.max(1, currentLevel) : 1;
        scene.exp = Number.isFinite(currentExp) ? Math.max(0, currentExp) : 0;
        scene.attrPoints = Number.isFinite(currentAttrPoints) ? Math.max(0, currentAttrPoints) : 0;

        const numeric = Number(amount || 0);
        const gained = Number.isFinite(numeric) ? Math.max(0, Math.floor(numeric)) : 0;
        if (gained <= 0) {
            return { ok: false, amount: 0, levelsGained: 0, message: '经验值无变化。' };
        }

        const beforeLevel = scene.level;
        scene.exp += gained;
        let levelsGained = 0;
        while (true) {
            const need = Math.max(1, Number(scene.level || 1) * 100);
            if (scene.exp < need) break;
            scene.exp -= need;
            scene.level = Number(scene.level || 1) + 1;
            scene.attrPoints = Number(scene.attrPoints || 0) + 2;
            levelsGained += 1;
        }

        if (levelsGained > 0) {
            scene.playerMaxHp = this.calculatePlayerMaxHp(scene);
            scene.playerHp = scene.playerMaxHp;
        }

        const source = String(options.source || options.reason || '经验获得').replace(/\s+/g, ' ').trim().slice(0, 120) || '经验获得';
        const title = levelsGained > 0 ? '升级' : '获得经验';
        const content = levelsGained > 0
            ? `【${title}】${source}：经验 +${gained}，升级到 ${scene.level} 级，获得 ${levelsGained * 2} 属性点，生命值已回满。`
            : `【${title}】${source}：经验 +${gained}，当前 ${scene.exp}/${scene.level * 100}。`;
        const shouldShowMessage = options.silent !== true || (levelsGained > 0 && options.levelMessage !== false);
        if (shouldShowMessage) {
            this.addSystemMessage(scene, content, 'system');
        } else {
            this.recordEvent(scene, {
                category: 'level',
                title,
                text: content.replace(/^【[^】]+】/, '')
            });
        }

        if (levelsGained > 0 && typeof showToast !== 'undefined') {
            showToast(`升级！现在是 ${scene.level} 级，获得 ${levelsGained * 2} 属性点`);
        } else if (options.toast === true && typeof showToast !== 'undefined') {
            showToast(`经验 +${gained}`);
        }
        if (typeof ActionBar !== 'undefined' && ActionBar.renderStatsDisplay) ActionBar.renderStatsDisplay();
        if (typeof SidebarRight !== 'undefined') {
            SidebarRight.renderDetail?.();
            SidebarRight.renderSituation?.();
            if (levelsGained > 0) SidebarRight.markTabNew?.('detail');
        }
        return {
            ok: true,
            amount: gained,
            beforeLevel,
            level: scene.level,
            exp: scene.exp,
            attrPoints: scene.attrPoints,
            levelsGained
        };
    },

    addGold(scene, amount, options = {}) {
        if (!scene) return { ok: false, amount: 0, message: '没有可用场景。' };
        this.normalizeScene(scene);
        if (!this.isScenePlaying(scene)) return { ok: false, amount: 0, message: this.endedSceneMessage(scene) };
        const numeric = Number(amount || 0);
        const delta = Number.isFinite(numeric) ? this._clamp(Math.trunc(numeric), -9999, 9999) : 0;
        if (delta === 0) return { ok: false, amount: 0, message: '金币无变化。' };

        const before = Math.max(0, Number(scene.gold || 0));
        const after = Math.max(0, before + delta);
        const actual = after - before;
        scene.gold = after;
        if (actual === 0) return { ok: false, amount: 0, gold: scene.gold, message: '金币无变化。' };

        const source = String(options.source || options.reason || '金币变动').replace(/\s+/g, ' ').trim().slice(0, 120) || '金币变动';
        const title = actual >= 0 ? '获得金币' : '花费金币';
        const text = `${source}：${actual >= 0 ? '获得' : '花费'} ${Math.abs(actual)} 金币，当前 ${scene.gold}。`;
        if (options.silent === true) {
            if (options.record !== false) this.recordEvent(scene, { category: 'economy', title, text });
        } else {
            this.addSystemMessage(scene, `【${title}】${text}`, 'system');
        }

        if (typeof ActionBar !== 'undefined' && ActionBar.renderStatsDisplay) ActionBar.renderStatsDisplay();
        if (typeof SidebarRight !== 'undefined') {
            SidebarRight.renderDetail?.();
            SidebarRight.renderSituation?.();
        }
        return { ok: true, amount: actual, gold: scene.gold, before };
    },

    addWorldTension(scene, amount, options = {}) {
        if (!scene) return { ok: false, amount: 0, message: '没有可用场景。' };
        this.normalizeScene(scene);
        if (!this.isScenePlaying(scene)) {
            return { ok: false, amount: 0, tension: Number(scene.worldTension || 0), message: this.endedSceneMessage(scene) };
        }
        const numeric = Number(amount || 0);
        const delta = Number.isFinite(numeric) ? this._clamp(Math.trunc(numeric), -100, 100) : 0;
        if (delta === 0) return { ok: false, amount: 0, tension: Number(scene.worldTension || 0), message: '世界紧张度无变化。' };

        const before = this._clamp(Number(scene.worldTension || 0), 0, 100);
        scene.worldTension = this._clamp(before + delta, 0, 100);
        const actual = scene.worldTension - before;
        if (actual === 0) return { ok: false, amount: 0, tension: scene.worldTension, before, message: '世界紧张度无变化。' };

        const source = String(options.source || options.reason || '局势变化').replace(/\s+/g, ' ').trim().slice(0, 120) || '局势变化';
        const title = actual >= 0 ? '世界紧张度上升' : '世界紧张度下降';
        const text = `${source}：世界紧张度 ${actual >= 0 ? '+' : ''}${actual}，当前 ${scene.worldTension}/100。`;
        if (options.silent === true) {
            if (options.record !== false) this.recordEvent(scene, { category: 'progress', title, text });
        } else {
            this.addSystemMessage(scene, `【${title}】${text}`, 'system');
        }

        if (typeof SidebarRight !== 'undefined') SidebarRight.renderSituation?.();
        const failure = options.checkFailure === false
            ? null
            : this.checkFailureStates(scene, { type: 'worldTension', source, delta: actual });
        return { ok: true, amount: actual, tension: scene.worldTension, before, failure };
    },

    applyPlayerDamage(scene, amount, options = {}) {
        if (!scene) return { ok: false, amount: 0, message: '没有可用场景。' };
        this.normalizeScene(scene);
        if (!this.isScenePlaying(scene)) return { ok: false, amount: 0, message: this.endedSceneMessage(scene) };
        const maxHp = Math.max(1, Number(scene.playerMaxHp || this.calculatePlayerMaxHp(scene)));
        scene.playerMaxHp = maxHp;
        const before = this._clamp(Number(scene.playerHp ?? maxHp), 0, maxHp);
        const requested = Number(amount || 0);
        const damage = Number.isFinite(requested) ? this._clamp(Math.trunc(requested), 1, maxHp) : 1;
        scene.playerHp = Math.max(0, before - damage);
        const actual = before - scene.playerHp;
        if (actual <= 0) return { ok: false, amount: 0, hp: scene.playerHp, maxHp, message: '生命值无变化。' };

        const reason = String(options.reason || '').trim().slice(0, 160);
        const content = `【受伤】受到 ${actual} 点伤害${reason ? `（${reason}）` : ''}，剩余生命 ${scene.playerHp}/${maxHp}。`;
        if (options.silent === true) {
            if (options.record !== false) {
                this.recordEvent(scene, {
                    category: 'survival',
                    title: '受伤',
                    text: content.replace(/^【[^】]+】/, '')
                });
            }
        } else {
            this.addSystemMessage(scene, content, 'system');
        }
        if (typeof ActionBar !== 'undefined' && ActionBar.renderStatsDisplay) ActionBar.renderStatsDisplay();
        if (typeof SidebarRight !== 'undefined') SidebarRight.renderDetail?.();
        if (scene.playerHp <= 0 && options.triggerGameOver !== false) {
            this.triggerHpGameOver(scene, { reason: reason || 'HP 归零' });
        }
        return { ok: true, amount: actual, hp: scene.playerHp, maxHp, before };
    },

    applyPlayerHealing(scene, amount, options = {}) {
        if (!scene) return { ok: false, amount: 0, message: '没有可用场景。' };
        this.normalizeScene(scene);
        if (!this.isScenePlaying(scene)) return { ok: false, amount: 0, message: this.endedSceneMessage(scene) };
        const maxHp = Math.max(1, Number(scene.playerMaxHp || this.calculatePlayerMaxHp(scene)));
        scene.playerMaxHp = maxHp;
        const before = this._clamp(Number(scene.playerHp ?? maxHp), 0, maxHp);
        const requested = Number(amount || 0);
        const heal = Number.isFinite(requested) ? this._clamp(Math.trunc(requested), 1, maxHp) : 1;
        scene.playerHp = Math.min(maxHp, before + heal);
        const actual = scene.playerHp - before;
        const reason = String(options.reason || '').trim().slice(0, 160);
        const content = actual > 0
            ? `【恢复生命】恢复 ${actual} 点生命${reason ? `（${reason}）` : ''}，当前 ${scene.playerHp}/${maxHp}。`
            : `【恢复生命】生命已满，当前 ${scene.playerHp}/${maxHp}。`;
        if (options.silent === true) {
            if (options.record !== false) {
                this.recordEvent(scene, {
                    category: 'survival',
                    title: '恢复生命',
                    text: content.replace(/^【[^】]+】/, '')
                });
            }
        } else {
            this.addSystemMessage(scene, content, 'system');
        }
        if (typeof ActionBar !== 'undefined' && ActionBar.renderStatsDisplay) ActionBar.renderStatsDisplay();
        if (typeof SidebarRight !== 'undefined') SidebarRight.renderDetail?.();
        return { ok: actual > 0, amount: actual, hp: scene.playerHp, maxHp, before };
    },

    triggerHpGameOver(scene, options = {}) {
        if (!scene) return { ok: false, message: '没有可用场景。' };
        this.normalizeScene(scene);
        if (!this.isScenePlaying(scene)) return { ok: false, message: this.endedSceneMessage(scene) };
        const locName = (scene.locations || []).find(l => l.id === scene.currentLocation)?.name || '这片土地';
        const content = String(options.message || `你的生命值归零，倒在了${locName}上。冒险就此终结……但或许还有未读的存档能让你重来。`).slice(0, 900);
        scene.gameState = 'defeated';
        scene.defeatReason = String(options.reasonId || scene.defeatReason || 'hp_zero').slice(0, 100);
        if (!scene.currentSituation) scene.currentSituation = { recentRisks: [], recommendedActions: [] };
        if (!Array.isArray(scene.currentSituation.recentRisks)) scene.currentSituation.recentRisks = [];
        scene.currentSituation.recentRisks.push('失败结局：HP 归零');
        scene.currentSituation.recentRisks = scene.currentSituation.recentRisks.slice(-12);
        const msg = this._addEndingMessage(scene, content, 'gameover', 'failure', '失败结局');
        if (typeof RunRecorder !== 'undefined') RunRecorder.complete(scene, 'defeated', String(options.reason || 'HP 归零').slice(0, 160));
        if (typeof ActionBar !== 'undefined' && ActionBar.renderStatsDisplay) ActionBar.renderStatsDisplay();
        if (typeof SidebarRight !== 'undefined') {
            SidebarRight.renderSituation?.();
            SidebarRight.markTabNew?.('situation');
        }
        State.saveCurrentSceneDebounced?.();
        if (options.toast !== false && typeof showToast !== 'undefined') showToast('你倒下了…可读取存档重来');
        return { ok: true, outcome: 'defeated', message: msg };
    },

    checkVictory(scene = State.scene, options = {}) {
        if (!scene) return { ok: false, message: '没有可用场景。' };
        this.normalizeScene(scene);
        if (!this.isScenePlaying(scene)) return { ok: false, message: this.endedSceneMessage(scene) };
        const mainQuests = (scene.quests || []).filter(q => q.type === 'main');
        if (mainQuests.length === 0) return { ok: false, reason: 'no_main_quests' };
        const allDone = mainQuests.every(q => q.status === 'completed');
        if (!allDone) return { ok: false, reason: 'main_quests_incomplete' };

        const rewardSettlement = this.settleCompletedQuestRewards(scene, mainQuests, { suppressBlockedMessage: true });
        if (rewardSettlement.blocked?.length) {
            const names = rewardSettlement.blocked.map(item => item.questName).filter(Boolean).join('、') || '主线任务';
            const content = `【通关待结算】${names} 的任务奖励因背包空间不足暂未发放。请先清理或消耗物品；奖励补发后会自动完成通关。`;
            const alreadyNotified = (scene.messages || []).slice(-5).some(msg => msg.content === content);
            if (!alreadyNotified) this.addSystemMessage(scene, content, 'system');
            if (typeof SidebarRight !== 'undefined') {
                SidebarRight.renderInventory?.();
                SidebarRight.renderSituation?.();
                SidebarRight.markTabNew?.('inventory');
                SidebarRight.markTabNew?.('situation');
            }
            State.saveCurrentSceneDebounced?.();
            if (options.toast !== false && typeof showToast !== 'undefined') showToast('主线奖励待领取：请先清理背包');
            return { ok: false, blocked: true, settlement: rewardSettlement };
        }
        return this.triggerVictory(scene, {
            reason: options.reason || '主线任务完成',
            toast: options.toast
        });
    },

    triggerVictory(scene, options = {}) {
        if (!scene) return { ok: false, message: '没有可用场景。' };
        this.normalizeScene(scene);
        if (!this.isScenePlaying(scene)) return { ok: false, message: this.endedSceneMessage(scene) };
        scene.gameState = 'victorious';
        const sceneName = scene.name || scene.title || '这个世界';
        const content = String(options.message || `所有主线任务已完成！${sceneName}的故事迎来了它的结局。恭喜你，冒险者。`).slice(0, 900);
        if (!scene.currentSituation) scene.currentSituation = { recentRisks: [], recommendedActions: [] };
        if (!Array.isArray(scene.currentSituation.recentRisks)) scene.currentSituation.recentRisks = [];
        scene.currentSituation.recentRisks.push('通关：主线任务完成');
        scene.currentSituation.recentRisks = scene.currentSituation.recentRisks.slice(-12);
        const msg = this._addEndingMessage(scene, content, 'victory', 'victory', '通关');
        if (typeof RunRecorder !== 'undefined') RunRecorder.complete(scene, 'victorious', String(options.reason || '主线任务完成').slice(0, 160));
        if (typeof SidebarRight !== 'undefined') {
            SidebarRight.renderSituation?.();
            SidebarRight.markTabNew?.('situation');
        }
        State.saveCurrentSceneDebounced?.();
        if (options.toast !== false && typeof showToast !== 'undefined') showToast('🏆 冒险完成！');
        return { ok: true, outcome: 'victorious', message: msg };
    },

    moveToLocation(scene, locId, options = {}) {
        if (!scene) return { ok: false, message: '没有可用场景。' };
        this.normalizeScene(scene);
        if (!this.isScenePlaying(scene)) return { ok: false, message: this.endedSceneMessage(scene) };
        if (!Array.isArray(scene.locations)) return { ok: false, message: '当前世界暂无地图。' };

        const targetId = String(locId || '').trim();
        const loc = scene.locations.find(item => item && item.id === targetId);
        if (!loc) return { ok: false, message: '地点不存在。' };
        if (scene.currentLocation === targetId) return { ok: false, duplicate: true, loc, message: `已经在 ${loc.name || '该地点'}。` };

        const curLoc = scene.locations.find(item => item && item.id === scene.currentLocation);
        const connections = Array.isArray(curLoc?.connections) ? curLoc.connections.map(String) : [];
        const reachable = !curLoc || options.ignoreReachability === true || connections.includes(targetId);
        if (!reachable) return { ok: false, blocked: true, loc, message: `无法直接到达 ${loc.name || targetId}` };

        scene.currentLocation = targetId;
        if (!Array.isArray(scene.messages)) scene.messages = [];
        const timestamp = Date.now();
        const msg = {
            id: `msg_${timestamp}_${Math.random().toString(36).slice(2, 6)}`,
            role: 'user',
            content: `【移动到 ${loc.name || targetId}${loc.description ? ` — ${loc.description}` : ''}】`,
            type: 'action',
            visibility: { public: true, locationId: targetId, participants: [], overheardBy: [] },
            timestamp
        };
        if (options.message !== false) scene.messages.push(msg);
        this.recordEvent(scene, {
            category: 'movement',
            title: '移动地点',
            text: `移动到 ${loc.name || targetId}`,
            messageId: options.message !== false ? msg.id : '',
            timestamp
        });

        if (options.notify !== false && typeof ChatUI !== 'undefined' && ChatUI.onMessageAdded && options.message !== false) {
            ChatUI.onMessageAdded(msg);
        }
        if (typeof SidebarRight !== 'undefined') {
            SidebarRight.renderMap?.();
            SidebarRight.renderSituation?.();
            SidebarRight.markTabNew?.('map');
        }
        return { ok: true, loc, msg: options.message !== false ? msg : null };
    },

    addExistingCharacterToScene(scene, charId, options = {}) {
        if (!scene) return { ok: false, message: '没有可用场景。' };
        this.normalizeScene(scene);
        if (!this.isScenePlaying(scene)) return { ok: false, message: this.endedSceneMessage(scene) };
        if (!Array.isArray(scene.characters)) scene.characters = [];

        const id = String(charId || '').trim();
        if (!id) return { ok: false, message: '角色不存在。' };
        const char = options.character || (typeof State !== 'undefined'
            ? (State.characters || []).find(item => item && item.id === id)
            : null);
        if (!char) return { ok: false, message: '角色不存在。' };
        if (scene.characters.includes(id)) return { ok: false, duplicate: true, char, message: `${char.name || '角色'}已经在场。` };

        const activeChars = typeof State !== 'undefined'
            ? (State.characters || []).filter(item => item && scene.characters.includes(item.id))
            : [];
        const normalizedName = this._normalizeQuestText(char.name || '');
        const duplicateName = normalizedName && activeChars.some(item => item.id !== id && this._normalizeQuestText(item.name || '') === normalizedName);
        if (duplicateName) return { ok: false, duplicate: true, char, message: `场景中已经存在角色：${char.name || '角色'}` };
        if (scene.characters.length >= 12) return { ok: false, message: '当前场景角色过多，无法继续加入。' };

        scene.characters.push(id);
        this.recordEvent(scene, {
            category: 'progress',
            title: '角色登场',
            text: `${char.name || '角色'}加入场景`,
            refId: id
        });
        if (typeof SidebarRight !== 'undefined') {
            SidebarRight.renderDetail?.();
            SidebarRight.renderSituation?.();
        }
        return { ok: true, char, charId: id };
    },

    removeCharacterFromScene(scene, charId, options = {}) {
        if (!scene) return { ok: false, message: '没有可用场景。' };
        this.normalizeScene(scene);
        if (!this.isScenePlaying(scene)) return { ok: false, message: this.endedSceneMessage(scene) };
        if (!Array.isArray(scene.characters)) scene.characters = [];

        const id = String(charId || '').trim();
        if (!id || !scene.characters.includes(id)) return { ok: false, duplicate: true, message: '角色不在当前场景。' };
        const char = typeof State !== 'undefined'
            ? (State.characters || []).find(item => item && item.id === id)
            : null;
        scene.characters = scene.characters.filter(item => item !== id);
        const reason = String(options.reason || '离开了').trim().slice(0, 120) || '离开了';
        this.recordEvent(scene, {
            category: 'progress',
            title: '角色退场',
            text: `${char?.name || '角色'}${reason}`,
            refId: id
        });
        if (typeof SidebarRight !== 'undefined') {
            SidebarRight.renderDetail?.();
            SidebarRight.renderSituation?.();
        }
        return { ok: true, char, charId: id };
    },

    addQuest(scene, questData = {}, options = {}) {
        if (!scene) return { ok: false, message: '没有可用场景。' };
        this.normalizeScene(scene);
        if (!this.isScenePlaying(scene)) return { ok: false, message: this.endedSceneMessage(scene) };
        if (!Array.isArray(scene.quests)) scene.quests = [];

        const quest = this.normalizeQuest({
            ...questData,
            id: questData.id || `q_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`,
            status: questData.status || 'active',
            rewardGranted: false
        }, scene.quests.length);
        if (!quest) return { ok: false, message: '任务数据无效。' };

        const normalizedName = this._normalizeQuestText(quest.name);
        const duplicate = scene.quests.find(existing =>
            existing &&
            existing.status === 'active' &&
            this._normalizeQuestText(existing.name) === normalizedName
        );
        if (duplicate) {
            return { ok: false, duplicate: true, quest: duplicate, message: `任务已存在：${duplicate.name}` };
        }

        const activeCount = scene.quests.filter(q => q && q.status === 'active').length;
        if (activeCount >= 12 || scene.quests.length >= 40) {
            return { ok: false, message: '当前任务过多，无法继续新增。' };
        }

        scene.quests.push(quest);
        const objectiveText = quest.objectives.map(o => o.text).filter(Boolean).slice(0, 3).join('；');
        const content = `【新任务：${quest.name}】${quest.description || objectiveText || '新的目标已加入任务列表。'}`;
        let msg = null;
        if (options.message !== false) msg = this.addSystemMessage(scene, content, 'system');

        if (typeof SidebarRight !== 'undefined') {
            SidebarRight.renderQuests?.();
            SidebarRight.renderSituation?.();
            SidebarRight.markTabNew?.('quests');
        }
        return { ok: true, quest, messageId: msg?.id || '' };
    },

    grantQuestReward(scene, quest, options = {}) {
        if (!scene || !quest) return { ok: false, rewards: [], message: '没有可发放的任务奖励。' };
        this.normalizeScene(scene);
        if (!this.isScenePlaying(scene)) return { ok: false, rewards: [], message: this.endedSceneMessage(scene) };
        const rewardText = String(options.reward || quest.reward || '').trim();
        if (!rewardText) return { ok: false, rewards: [], message: '任务没有奖励。' };
        if (quest.rewardGranted === true) return { ok: false, rewards: [], duplicate: true, message: '任务奖励已经发放。' };

        const questName = String(options.questName || quest.name || '任务').trim().slice(0, 120) || '任务';
        const entries = this._parseQuestRewardEntries(rewardText);
        const rewards = [];
        const itemRewards = entries
            .filter(entry => entry?.type === 'item')
            .map(entry => ({ entry, item: this.createInventoryItemFromReward(entry.name, entry.quantity) }))
            .filter(data => data.item);
        if (!this._canAddInventoryItems(scene, itemRewards.map(data => data.item))) {
            const message = `背包空间不足，无法发放任务奖励：${questName}。`;
            if (options.suppressBlockedMessage !== true) {
                this.addSystemMessage(scene, `【任务奖励未发放：${questName}】${message}`, 'system');
            }
            return { ok: false, rewards: [], blocked: true, message };
        }

        entries.forEach(entry => {
            if (!entry) return;
            if (entry.type === 'gold') {
                const result = this.addGold(scene, entry.amount, { source: `任务奖励：${questName}`, silent: true });
                if (result.ok) rewards.push(`金币 ${result.amount >= 0 ? '+' : ''}${result.amount}`);
                return;
            }
            if (entry.type === 'exp') {
                const result = this.addExperience(scene, entry.amount, { source: `任务奖励：${questName}`, silent: true, levelMessage: false });
                if (result.ok) {
                    const levelText = result.levelsGained > 0
                        ? `（升级到 ${result.level}，属性点 +${result.levelsGained * 2}）`
                        : '';
                    rewards.push(`经验 +${result.amount}${levelText}`);
                }
                return;
            }
            if (entry.type === 'item') {
                const item = itemRewards.find(data => data.entry === entry)?.item || this.createInventoryItemFromReward(entry.name, entry.quantity);
                const added = this.grantInventoryItem(scene, item, { source: `任务奖励：${questName}` });
                if (!added.ok) return;
                const qtyText = entry.quantity > 1 ? ` x${entry.quantity}` : '';
                rewards.push(`${item.name}${qtyText}`);
            }
        });

        if (rewards.length === 0) {
            return { ok: false, rewards, message: '奖励没有产生有效变化。' };
        }
        quest.rewardGranted = true;
        const msg = this.addSystemMessage(scene, `【任务奖励：${questName}】${rewards.join('，')}`, 'system');
        if (typeof ActionBar !== 'undefined' && ActionBar.renderStatsDisplay) ActionBar.renderStatsDisplay();
        if (typeof SidebarRight !== 'undefined') {
            SidebarRight.renderInventory?.();
            SidebarRight.renderDetail?.();
            SidebarRight.renderSituation?.();
            SidebarRight.markTabNew?.('inventory');
        }
        return { ok: true, rewards, messageId: msg?.id || '', questName };
    },

    settleCompletedQuestRewards(scene, quests = [], options = {}) {
        if (!scene || !Array.isArray(quests)) return { ok: true, settled: [], blocked: [] };
        this.normalizeScene(scene);
        const settled = [];
        const blocked = [];
        quests
            .filter(quest =>
                quest &&
                quest.status === 'completed' &&
                quest.rewardGranted !== true &&
                String(quest.reward || '').trim()
            )
            .slice(0, 12)
            .forEach(quest => {
                const result = this.grantQuestReward(scene, quest, {
                    questName: quest.name,
                    suppressBlockedMessage: options.suppressBlockedMessage === true
                });
                if (result.ok) {
                    settled.push({
                        questId: quest.id || '',
                        questName: result.questName || quest.name || '任务',
                        rewards: result.rewards || []
                    });
                } else if (result.blocked) {
                    blocked.push({
                        questId: quest.id || '',
                        questName: quest.name || '任务',
                        message: result.message || '任务奖励被背包容量阻塞。'
                    });
                }
            });
        return { ok: blocked.length === 0, settled, blocked };
    },

    retryPendingQuestRewards(scene, options = {}) {
        if (!scene || !Array.isArray(scene.quests)) return [];
        if (scene._retryingQuestRewards) return [];
        this.normalizeScene(scene);
        if (options.onlyWhenPlaying !== false && !this.isScenePlaying(scene)) return [];

        scene._retryingQuestRewards = true;
        const results = [];
        try {
            (scene.quests || [])
                .filter(quest =>
                    quest &&
                    quest.status === 'completed' &&
                    quest.rewardGranted !== true &&
                    String(quest.reward || '').trim()
                )
                .slice(0, 8)
                .forEach(quest => {
                    const result = this.grantQuestReward(scene, quest, {
                        questName: quest.name,
                        suppressBlockedMessage: options.suppressBlockedMessage === true
                    });
                    if (result.ok) {
                        results.push({
                            questId: quest.id || '',
                            questName: result.questName || quest.name || '任务',
                            rewards: result.rewards || []
                        });
                    }
                });
        } finally {
            delete scene._retryingQuestRewards;
        }

        if (results.length > 0 && typeof SidebarRight !== 'undefined') {
            SidebarRight.renderQuests?.();
            SidebarRight.renderInventory?.();
            SidebarRight.renderDetail?.();
            SidebarRight.markTabNew?.('quests');
            SidebarRight.markTabNew?.('inventory');
        }
        if (results.length > 0) this.checkVictory(scene);
        return results;
    },

    _retryPendingQuestRewardsAfterInventoryChange(scene) {
        return this.retryPendingQuestRewards(scene, { suppressBlockedMessage: true });
    },

    _canAddInventoryItems(scene, items = []) {
        if (!scene || !Array.isArray(scene.inventory)) return false;
        let projected = scene.inventory.length;
        const planned = [];
        for (const rawItem of items) {
            const item = this.normalizeItem({ ...rawItem });
            if (!item) return false;
            const canMergeExisting = scene.inventory.some(existing =>
                existing && ((item.id && existing.id === item.id) || existing.name === item.name)
            );
            const canMergePlanned = planned.some(existing =>
                existing && ((item.id && existing.id === item.id) || existing.name === item.name)
            );
            if (!canMergeExisting && !canMergePlanned) {
                projected += 1;
                if (projected > 200) return false;
            }
            planned.push(item);
        }
        return true;
    },

    completeQuestObjective(scene, quest, objectiveIdx, options = {}) {
        if (!scene || !quest || !Array.isArray(quest.objectives)) {
            return { ok: false, message: '没有可更新的任务目标。' };
        }
        this.normalizeScene(scene);
        if (!this.isScenePlaying(scene)) return { ok: false, message: this.endedSceneMessage(scene) };
        const idx = Math.trunc(Number(objectiveIdx));
        if (!Number.isFinite(idx) || idx < 0 || idx >= quest.objectives.length) {
            return { ok: false, message: '任务目标不存在。' };
        }
        const objective = quest.objectives[idx];
        if (!objective) return { ok: false, message: '任务目标不存在。' };
        if (objective.completed) return { ok: false, duplicate: true, message: '任务目标已经完成。' };

        const gateOptions = options.gateOptions || {};
        const allowed = options.skipGate === true || !this._objectiveAllowedByProgressGates ||
            this._objectiveAllowedByProgressGates(scene, quest, objective, idx, '', gateOptions);
        if (!allowed) {
            this.addSystemMessage(scene, `【任务进展待确认：${quest.name}】${objective.text} 需要明确挑战结果、证据或结论支持。`, 'system');
            if (typeof SidebarRight !== 'undefined') SidebarRight.renderSituation?.();
            return { ok: false, blocked: true, message: '任务目标缺少规则依据。' };
        }

        objective.completed = true;
        const reason = String(options.reason || '').trim().slice(0, 160);
        if (options.message !== false) {
            this.addSystemMessage(scene, `【任务进展：${quest.name}】${objective.text}${reason ? `（${reason}）` : ''}`, 'system');
        }

        let questCompleted = false;
        if (quest.objectives.every(o => o.completed)) {
            quest.status = 'completed';
            quest.completedAt = quest.completedAt || Date.now();
            questCompleted = true;
            if (options.message !== false) this.addSystemMessage(scene, `【任务完成：${quest.name}】`, 'system');
            this.grantQuestReward(scene, quest);
        } else if (quest.status !== 'active') {
            quest.status = 'active';
        }

        if (scene.questProgressGuards) {
            scene.questProgressGuards.autoAdvanceStreak = 0;
            scene.questProgressGuards.lastAdvancedAt = Date.now();
        }
        this.checkVictory(scene);
        if (typeof SidebarRight !== 'undefined') SidebarRight.renderSituation?.();
        return { ok: true, questCompleted, objectiveIdx: idx, questId: quest.id };
    },

    reopenQuestObjective(scene, quest, objectiveIdx, options = {}) {
        if (!scene || !quest || !Array.isArray(quest.objectives)) {
            return { ok: false, message: '没有可回退的任务目标。' };
        }
        this.normalizeScene(scene);
        if (!this.isScenePlaying(scene)) return { ok: false, message: this.endedSceneMessage(scene) };
        const idx = Math.trunc(Number(objectiveIdx));
        if (!Number.isFinite(idx) || idx < 0 || idx >= quest.objectives.length) {
            return { ok: false, message: '任务目标不存在。' };
        }
        const objective = quest.objectives[idx];
        if (!objective) return { ok: false, message: '任务目标不存在。' };
        if (!objective.completed) return { ok: false, duplicate: true, message: '任务目标尚未完成。' };

        objective.completed = false;
        if (quest.status === 'completed') quest.status = 'active';
        const reason = String(options.reason || '').trim().slice(0, 160);
        if (options.message !== false) {
            this.addSystemMessage(scene, `【任务回退：${quest.name}】${objective.text}${reason ? `（${reason}）` : ''}`, 'system');
        }
        if (scene.questProgressGuards) {
            scene.questProgressGuards.autoAdvanceStreak = 0;
            scene.questProgressGuards.lastAdvancedAt = Date.now();
        }
        this.checkVictory(scene);
        if (typeof SidebarRight !== 'undefined') SidebarRight.renderSituation?.();
        return { ok: true, questReopened: true, objectiveIdx: idx, questId: quest.id };
    },

    applyQuestUpdates(scene, updates, options = {}) {
        if (!scene || !Array.isArray(updates)) return { changed: false, results: [] };
        this.normalizeScene(scene);
        const validQuestStatuses = ['active', 'completed', 'failed', 'abandoned'];
        const results = [];
        let changed = false;

        updates.slice(0, 12).forEach(update => {
            if (!update || typeof update !== 'object' || !update.questId) return;
            const quest = (scene.quests || []).find(q => q.id === update.questId);
            if (!quest) return;
            const reason = update.reason || options.reason || '';

            if (update.objectiveIdx !== undefined || update.objectiveNumber !== undefined) {
                const idx = update.objectiveIdx !== undefined
                    ? Math.trunc(Number(update.objectiveIdx))
                    : Math.trunc(Number(update.objectiveNumber)) - 1;
                const result = this.completeQuestObjective(scene, quest, idx, {
                    reason,
                    gateOptions: { stateUpdate: options.stateUpdate !== false }
                });
                results.push({ questId: quest.id, objectiveIdx: idx, ...result });
                changed = result.ok || changed;
            }

            if (update.status && validQuestStatuses.includes(update.status)) {
                if (update.status === 'completed') {
                    const allDone = (quest.objectives || []).every(o => o.completed);
                    const structured = this._sceneUsesStructuredProgress(scene);
                    if (allDone) {
                        const wasCompleted = quest.status === 'completed';
                        quest.status = 'completed';
                        quest.completedAt = quest.completedAt || Date.now();
                        if (!wasCompleted) this.addSystemMessage(scene, `【任务完成：${quest.name}】`, 'system');
                        this.grantQuestReward(scene, quest);
                        changed = true;
                    } else if (!structured) {
                        (quest.objectives || []).forEach((objective, idx) => {
                            if (!objective.completed) {
                                const result = this.completeQuestObjective(scene, quest, idx, {
                                    reason,
                                    skipGate: true
                                });
                                results.push({ questId: quest.id, objectiveIdx: idx, ...result });
                                changed = result.ok || changed;
                            }
                        });
                    } else {
                        this.addSystemMessage(scene, `【任务完成待确认：${quest.name}】仍有目标缺少挑战、证据或结论支持。`, 'system');
                    }
                } else if (quest.status !== update.status) {
                    quest.status = update.status;
                    changed = true;
                }
            }
        });

        if (changed) {
            if (typeof SidebarRight !== 'undefined') SidebarRight.renderSituation?.();
            this.checkVictory(scene);
        }
        return { changed, results };
    },

    _parseQuestRewardEntries(rewardText) {
        return String(rewardText || '')
            .split(/[,，、;]/)
            .map(raw => String(raw || '').trim())
            .filter(raw => raw && !/^(无|none|null)$/i.test(raw))
            .map(raw => {
                const countMatch = raw.match(/^(.+?)\s*[x×]\s*(\d+)$/i);
                const label = countMatch ? countMatch[1].trim() : raw;
                const explicitCount = countMatch ? Number(countMatch[2]) : 0;
                const numberMatch = raw.match(/([+-]?\d+)/);
                const numeric = Number(numberMatch ? numberMatch[1] : explicitCount);
                const lower = raw.toLowerCase();
                const qty = this._clamp(Number.isFinite(explicitCount) && explicitCount > 0 ? explicitCount : 1, 1, 20);

                if (/金币|gold|铜币|银币|钱/i.test(label) || /金币|gold|铜币|银币|钱/i.test(lower)) {
                    const amount = Number.isFinite(numeric) && numeric !== 0 ? Math.abs(Math.trunc(numeric)) : 10;
                    return { type: 'gold', amount: this._clamp(amount, 1, 9999) };
                }
                if (/经验|exp|experience/i.test(label) || /经验|exp|experience/i.test(lower)) {
                    const amount = Number.isFinite(numeric) && numeric !== 0 ? Math.abs(Math.trunc(numeric)) : 20;
                    return { type: 'exp', amount: this._clamp(amount, 1, 2000) };
                }
                return { type: 'item', name: label || raw, quantity: qty };
            });
    },

    allocateStatPoint(scene, key) {
        const statLabels = { strength: '力量', dexterity: '敏捷', constitution: '体质', intelligence: '智力', wisdom: '感知', charisma: '魅力' };
        if (!scene || !statLabels[key]) return { ok: false, message: '未知属性。' };
        this.normalizeScene(scene);
        if (!this.isScenePlaying(scene)) return { ok: false, message: this.endedSceneMessage(scene) };
        if (Number(scene.attrPoints || 0) <= 0) return { ok: false, message: '没有可分配属性点。' };
        const before = this._clamp(Number(scene.playerStats[key] || 10), 1, 30);
        if (before >= 20) return { ok: false, message: `${statLabels[key]} 已达到当前上限。` };
        const oldMaxHp = Number(scene.playerMaxHp || this.calculatePlayerMaxHp(scene));
        scene.playerStats[key] = before + 1;
        scene.attrPoints = Math.max(0, Number(scene.attrPoints || 0) - 1);
        if (key === 'constitution') {
            const newMaxHp = this.calculatePlayerMaxHp(scene);
            const diff = newMaxHp - oldMaxHp;
            scene.playerMaxHp = newMaxHp;
            scene.playerHp = Math.min(scene.playerMaxHp, Number(scene.playerHp || 0) + Math.max(0, diff));
        }
        this.recordEvent(scene, {
            category: 'level',
            title: '分配属性点',
            text: `${statLabels[key]} +1，剩余属性点 ${scene.attrPoints}`
        });
        if (typeof ActionBar !== 'undefined' && ActionBar.renderStatsDisplay) ActionBar.renderStatsDisplay();
        if (typeof SidebarRight !== 'undefined') {
            SidebarRight.renderDetail?.();
            SidebarRight.renderSituation?.();
        }
        return { ok: true, stat: key, label: statLabels[key], value: scene.playerStats[key], attrPoints: scene.attrPoints };
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
        if (!scene.currentSituation || typeof scene.currentSituation !== 'object') {
            scene.currentSituation = { recentRisks: [], recommendedActions: [] };
        }
        if (!Array.isArray(scene.currentSituation.recentRisks)) scene.currentSituation.recentRisks = [];
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
            const beforeBeat = this._clamp(Number(arc.currentBeat || 0), 0, Math.max(beats.length, 0));
            let nextBeat = beforeBeat;
            const reason = String(update.reason || '').replace(/\s+/g, ' ').trim().slice(0, 240);
            const explicitResolution = update.phase === 'resolution' || arc.phase === 'resolution';
            if (update.currentBeat !== undefined) {
                nextBeat = this._clamp(Number(update.currentBeat), 0, Math.max(beats.length, 0));
            } else if (update.advance === true || Number(update.advanceBy || 0) !== 0) {
                const rawStep = update.advance === true ? 1 : Number(update.advanceBy || 0);
                const step = explicitResolution ? rawStep : Math.sign(rawStep || 0);
                nextBeat = this._clamp(beforeBeat + step, 0, Math.max(beats.length, 0));
            }

            const wantsAdvance = nextBeat > beforeBeat;
            if (wantsAdvance && !reason) {
                const total = Math.max(beats.length, 0);
                this.recordEvent(scene, {
                    category: 'progress',
                    title: '剧情推进待确认',
                    text: `${arc.title || '剧情弧'} 请求推进到进度 ${Math.min(nextBeat, total)}/${total}，但缺少原因，已保持在进度 ${Math.min(beforeBeat, total)}/${total}。`
                });
                nextBeat = beforeBeat;
            } else if (wantsAdvance && nextBeat > beforeBeat + 1 && !explicitResolution) {
                nextBeat = beforeBeat + 1;
            }

            if (nextBeat !== beforeBeat) arc.currentBeat = nextBeat;
            if (reason) arc.lastReason = reason;
            arc.updatedAt = Date.now();
            changed = true;
            if (nextBeat !== beforeBeat) {
                const total = Math.max(beats.length, 0);
                const text = `${arc.title || '剧情弧'}：${reason || '剧情阶段推进'}（${Math.min(nextBeat, total)}/${total}）`;
                this.recordEvent(scene, {
                    category: 'progress',
                    title: '剧情弧推进',
                    text
                });
                scene.currentSituation.recentRisks.push(`剧情推进：${arc.title || '剧情弧'}`);
                scene.currentSituation.recentRisks = scene.currentSituation.recentRisks.slice(-12);
            }
        });
        return changed;
    },

    applyStoryPhaseUpdate(scene, updates) {
        if (!scene || !Array.isArray(updates)) return false;
        this.normalizeScene(scene);
        const statuses = ['locked', 'active', 'completed', 'failed', 'bypassed'];
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
            const wantsActive = update.activate === true || update.status === 'active';
            const wantsCompleted = update.status === 'completed';
            if (wantsActive && phase.status !== 'active') {
                const currentActive = scene.storyPhases.find(p => p.id !== phase.id && p.status === 'active');
                if (currentActive && currentActive.status !== 'completed') {
                    const gate = this._storyPhaseGateResult(scene, currentActive, update);
                    if (!gate.ok) {
                        this._recordStoryPhaseGateBlocked(scene, currentActive, phase, gate.message);
                        phase.lastBlockedReason = gate.message;
                        phase.updatedAt = Date.now();
                        changed = true;
                        return;
                    }
                    const currentActiveId = currentActive.id;
                    const targetPhaseId = phase.id;
                    if (gate.cost === true) this._applyStoryPhaseCosts(scene, currentActive, update, gate);
                    const activeRef = scene.storyPhases.find(p => p.id === currentActiveId) || currentActive;
                    phase = scene.storyPhases.find(p => p.id === targetPhaseId) || phase;
                    activeRef.status = 'completed';
                    activeRef.lastReason = gate.reason;
                    activeRef.updatedAt = Date.now();
                }
                scene.storyPhases.forEach(p => {
                    if (p.id !== phase.id && p.status === 'active') p.status = 'completed';
                });
                phase.status = 'active';
                const reason = String(update.reason || phase.entry || '阶段推进').slice(0, 240);
                phase.lastReason = reason;
                this.recordEvent(scene, {
                    category: 'progress',
                    title: '剧情阶段推进',
                    text: `${phase.title || '剧情阶段'} 已激活：${reason}`
                });
            }
            if (wantsCompleted && phase.status === 'active') {
                const gate = this._storyPhaseGateResult(scene, phase, update);
                if (!gate.ok) {
                    this._recordStoryPhaseGateBlocked(scene, phase, null, gate.message);
                    phase.lastBlockedReason = gate.message;
                    phase.updatedAt = Date.now();
                    changed = true;
                    return;
                }
                const targetPhaseId = phase.id;
                if (gate.cost === true) this._applyStoryPhaseCosts(scene, phase, update, gate);
                phase = scene.storyPhases.find(p => p.id === targetPhaseId) || phase;
                phase.status = 'completed';
                phase.lastReason = gate.reason;
                this.recordEvent(scene, {
                    category: 'progress',
                    title: '剧情阶段完成',
                    text: `${phase.title || '剧情阶段'} 已完成：${gate.reason}`
                });
            } else if (update.status !== undefined && statuses.includes(update.status) && !wantsActive) {
                phase.status = update.status;
            }
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

    _storyPhaseGateResult(scene, phase, update = {}) {
        const reason = String(update.reason || update.lastReason || update.cause || '').replace(/\s+/g, ' ').trim().slice(0, 240);
        const challenges = (scene?.sceneChallenges || []).filter(c => c.phaseId === phase?.id);
        const completed = challenges.find(c => c.status === 'completed');
        if (completed) return { ok: true, reason: reason || `已完成阶段挑战：${completed.title || completed.id}` };

        const failed = challenges.find(c => c.status === 'failed')
            || update.failForward === true
            || update.alternative === true
            || update.alternate === true
            || ['failed', 'fail_forward', 'alternative'].includes(String(update.outcome || ''));
        if (failed && reason) return { ok: true, reason: `失败推进：${reason}` };

        const cost = this._storyPhaseCostText(update);
        if (cost && reason) {
            const validation = this._validateStoryPhaseCosts(scene, update);
            if (!validation.ok) return { ok: false, message: validation.message };
            return { ok: true, reason: `绕过代价：${cost}；${reason}`, cost: true, costText: cost };
        }

        const title = phase?.title || '当前阶段';
        return {
            ok: false,
            message: `${title} 还缺少阶段推进依据：需要完成至少一个阶段挑战，或明确失败替代路线，或写明绕过本阶段付出的资源、关系、时钟等代价。`
        };
    },

    _storyPhaseCostText(update = {}) {
        const parts = [];
        ['cost', 'bypassCost', 'resourceCost', 'relationCost', 'clockCost', 'consequence'].forEach(key => {
            if (update[key] !== undefined) {
                const text = String(update[key] || '').replace(/\s+/g, ' ').trim().slice(0, 120);
                if (text) parts.push(text);
            }
        });
        if (Array.isArray(update.costs)) {
            update.costs.slice(0, 4).forEach(item => {
                let text = '';
                if (item && typeof item === 'object') {
                    const type = String(item.type || item.kind || '').replace(/[-_\s]/g, '').toLowerCase();
                    if (['gold', 'money', 'coin', 'coins'].includes(type)) {
                        text = `金币 ${Math.abs(Number(item.amount ?? item.value ?? item.cost ?? 0)) || ''}`.trim();
                    } else if (['item', 'resource', 'inventory'].includes(type)) {
                        const name = item.itemName || item.name || item.itemId || item.id || '物品';
                        const quantity = Number(item.quantity || item.amount || 1);
                        text = `${name}${quantity > 1 ? ` x${quantity}` : ''}`;
                    } else if (['worldtension', 'tension', 'pressure'].includes(type)) {
                        const delta = Number(item.delta ?? item.amount ?? item.value ?? 0);
                        text = `世界紧张度 ${delta >= 0 ? '+' : ''}${delta}`;
                    } else if (['clock', 'timer'].includes(type)) {
                        const delta = Number(item.delta ?? item.clockDelta ?? item.amount ?? 0);
                        text = `${item.name || item.clockName || item.id || item.clockId || '时钟'} ${delta >= 0 ? '+' : ''}${delta}`;
                    } else if (['consequence', 'debt', 'injury', 'complication'].includes(type)) {
                        text = String(item.text || item.effect || item.title || item.label || '持续后果');
                    } else {
                        text = String(item.label || item.text || item.type || JSON.stringify(item));
                    }
                } else {
                    text = String(item || '');
                }
                text = text.replace(/\s+/g, ' ').trim().slice(0, 120);
                if (text) parts.push(text);
            });
        }
        ['worldTensionDelta', 'clockDelta', 'goldCost'].forEach(key => {
            if (Number.isFinite(Number(update[key])) && Number(update[key]) !== 0) {
                parts.push(`${key} ${Number(update[key]) > 0 ? '+' : ''}${Number(update[key])}`);
            }
        });
        return [...new Set(parts)].slice(0, 4).join('；');
    },

    _validateStoryPhaseCosts(scene, update = {}) {
        const costs = this._extractStoryPhaseCosts(update);
        const gold = Number(costs.gold || 0);
        if (gold > 0 && Number(scene?.gold || 0) < gold) {
            return { ok: false, message: `绕过阶段需要 ${gold} 金币，当前只有 ${Number(scene?.gold || 0)}。` };
        }
        const itemTotals = new Map();
        costs.items.forEach(itemCost => {
            const ref = String(itemCost.itemRef || '').trim();
            if (!ref) return;
            itemTotals.set(ref, (itemTotals.get(ref) || 0) + Number(itemCost.quantity || 1));
        });
        for (const [itemRef, quantity] of itemTotals.entries()) {
            const item = this._findInventoryItem(scene, itemRef);
            if (!item) return { ok: false, message: `绕过阶段需要物品「${itemRef}」，但背包中没有。` };
            const available = item.uses !== undefined
                ? Math.max(0, Number(item.uses || 0))
                : Math.max(1, Number(item.quantity || 1));
            if (available < quantity) {
                return { ok: false, message: `绕过阶段需要 ${item.name} x${quantity}，当前只有 ${available}。` };
            }
        }
        return { ok: true };
    },

    _applyStoryPhaseCosts(scene, phase, update = {}, gate = {}) {
        if (!scene) return false;
        const costs = this._extractStoryPhaseCosts(update);
        const phaseName = phase?.title || '剧情阶段';
        const summary = [];
        let freedInventorySpace = false;

        if (costs.gold > 0) {
            const result = this.addGold(scene, -costs.gold, { source: `阶段代价：${phaseName}`, silent: true });
            if (result.ok) summary.push(`金币 -${Math.abs(result.amount)}`);
        }
        if (costs.worldTension !== 0) {
            const result = this.addWorldTension(scene, costs.worldTension, { source: `阶段代价：${phaseName}`, silent: true });
            if (result.ok) summary.push(`世界紧张度 ${result.amount >= 0 ? '+' : ''}${result.amount}`);
        }
        costs.clocks.forEach(clockCost => {
            const clock = this._findStoryPhaseCostClock(scene, clockCost);
            if (!clock) {
                if (clockCost.label) costs.notes.push(clockCost.label);
                return;
            }
            const result = this.applyClockUpdate(scene, [{
                id: clock.id,
                delta: clockCost.delta,
                reason: `阶段代价：${phaseName}`
            }]);
            if (result.changed) summary.push(`${clock.name || '局势时钟'} ${clockCost.delta >= 0 ? '+' : ''}${clockCost.delta}`);
        });
        costs.items.forEach(itemCost => {
            const result = this.removeInventoryItem(scene, itemCost.itemRef, itemCost.quantity, {
                source: `阶段代价：${phaseName}`,
                record: true,
                retryQuestRewards: false,
                retryExplorationRewards: false
            });
            if (result.ok) {
                summary.push(`${result.itemName} -${result.quantity}`);
                if (result.removedAll) freedInventorySpace = true;
            }
        });
        costs.consequences.forEach(item => {
            const consequence = this.recordConsequence(scene, {
                title: item.title || `${phaseName}的绕过代价`,
                cause: `阶段代价：${phaseName}`,
                effect: item.effect || item.text || item.title || gate.costText || '绕过阶段产生了持续后果。',
                severity: item.severity || 'medium',
                category: 'story_phase',
                tags: ['story_phase', phase?.id].filter(Boolean)
            });
            if (consequence) summary.push(`后果：${consequence.title}`);
        });

        const notes = [...new Set(costs.notes.map(item => String(item || '').trim()).filter(Boolean))].slice(0, 4);
        if (notes.length > 0) {
            this.recordEvent(scene, {
                category: 'progress',
                title: '阶段代价',
                text: `${phaseName}：${notes.join('；')}`
            });
        }
        if (summary.length > 0 || notes.length > 0) {
            this.addSystemMessage(scene, `【阶段代价：${phaseName}】${[...summary, ...notes].slice(0, 6).join('，') || gate.costText || '代价已记录。'}`, 'system');
            if (freedInventorySpace) {
                this._retryPendingQuestRewardsAfterInventoryChange(scene);
                this._retryPendingExplorationRewardsAfterInventoryChange(scene);
            }
            if (typeof SidebarRight !== 'undefined') {
                SidebarRight.renderInventory?.();
                SidebarRight.renderDetail?.();
                SidebarRight.renderSituation?.();
            }
            return true;
        }
        return false;
    },

    _extractStoryPhaseCosts(update = {}) {
        const result = { gold: 0, worldTension: 0, clocks: [], items: [], consequences: [], notes: [] };
        const pushNote = value => {
            const text = String(value || '').replace(/\s+/g, ' ').trim().slice(0, 160);
            if (text) result.notes.push(text);
        };
        const addGoldCost = value => {
            const amount = Math.abs(Math.trunc(Number(value || 0)));
            if (Number.isFinite(amount) && amount > 0) result.gold += this._clamp(amount, 1, 9999);
        };
        const addWorldTension = value => {
            const delta = Math.trunc(Number(value || 0));
            if (Number.isFinite(delta) && delta !== 0) result.worldTension += this._clamp(delta, -100, 100);
        };
        const addClock = data => {
            const delta = Math.trunc(Number(data?.delta ?? data?.clockDelta ?? data?.amount ?? 0));
            if (!Number.isFinite(delta) || delta === 0) return;
            result.clocks.push({
                id: String(data.id || data.clockId || '').trim(),
                tag: String(data.tag || data.clockTag || '').trim(),
                name: String(data.name || data.clockName || '').trim(),
                delta: this._clamp(delta, -12, 12),
                label: String(data.label || data.text || '').trim()
            });
        };
        const addItem = data => {
            const itemRef = String(data.itemRef || data.itemId || data.itemName || data.name || data.id || '').trim();
            if (!itemRef) {
                pushNote(data.label || data.text || data.resource || '');
                return;
            }
            const rawQuantity = Number(data.quantity || data.amount || 1);
            const quantity = Math.max(1, Math.min(20, Number.isFinite(rawQuantity) ? Math.trunc(rawQuantity) : 1));
            result.items.push({ itemRef, quantity });
        };
        const addConsequence = data => {
            if (typeof data === 'string') {
                const text = data.trim();
                if (text) result.consequences.push({ title: '阶段绕过代价', effect: text, severity: 'medium' });
                return;
            }
            if (!data || typeof data !== 'object') return;
            result.consequences.push({
                title: String(data.title || data.label || '阶段绕过代价').slice(0, 120),
                effect: String(data.effect || data.text || data.description || data.label || data.title || '绕过阶段产生了持续后果。').slice(0, 260),
                severity: ['low', 'medium', 'high', 'critical'].includes(data.severity) ? data.severity : 'medium'
            });
        };

        addGoldCost(update.goldCost);
        addWorldTension(update.worldTensionDelta);
        if (Number.isFinite(Number(update.clockDelta)) && Number(update.clockDelta) !== 0) {
            addClock({
                id: update.clockId,
                tag: update.clockTag,
                name: update.clockName,
                delta: update.clockDelta,
                label: update.clockCost
            });
        }
        ['cost', 'bypassCost', 'resourceCost', 'relationCost', 'clockCost'].forEach(key => pushNote(update[key]));
        if (update.consequence !== undefined) addConsequence(update.consequence);

        if (Array.isArray(update.costs)) {
            update.costs.slice(0, 8).forEach(cost => {
                if (!cost) return;
                if (typeof cost === 'string') {
                    pushNote(cost);
                    return;
                }
                if (typeof cost !== 'object') return;
                const type = String(cost.type || cost.kind || '').replace(/[-_\s]/g, '').toLowerCase();
                if (['gold', 'money', 'coin', 'coins'].includes(type)) addGoldCost(cost.amount ?? cost.value ?? cost.cost);
                else if (['item', 'resource', 'inventory'].includes(type)) addItem(cost);
                else if (['worldtension', 'tension', 'pressure'].includes(type)) addWorldTension(cost.delta ?? cost.amount ?? cost.value);
                else if (['clock', 'timer'].includes(type)) addClock(cost);
                else if (['consequence', 'debt', 'injury', 'complication'].includes(type)) addConsequence(cost);
                else pushNote(cost.label || cost.text || cost.description || JSON.stringify(cost));
            });
        }

        result.gold = this._clamp(result.gold, 0, 9999);
        result.worldTension = this._clamp(result.worldTension, -100, 100);
        return result;
    },

    _findStoryPhaseCostClock(scene, clockCost = {}) {
        const clocks = Array.isArray(scene?.clocks) ? scene.clocks.filter(Boolean) : [];
        const id = String(clockCost.id || '').trim();
        const tag = String(clockCost.tag || '').trim();
        const name = String(clockCost.name || '').trim();
        if (id) {
            const byId = clocks.find(clock => clock.id === id);
            if (byId) return byId;
        }
        if (tag) {
            const byTag = clocks.find(clock => clock.tag === tag);
            if (byTag) return byTag;
        }
        if (name) {
            const byName = clocks.find(clock => clock.name === name);
            if (byName) return byName;
        }
        return null;
    },

    _recordStoryPhaseGateBlocked(scene, fromPhase, toPhase, message) {
        if (!scene || !message) return;
        this.recordEvent(scene, {
            category: 'progress',
            title: '剧情阶段待确认',
            text: toPhase
                ? `${fromPhase?.title || '当前阶段'} → ${toPhase.title || '下一阶段'} 被拦截：${message}`
                : `${fromPhase?.title || '当前阶段'} 完成被拦截：${message}`
        });
        if (!scene.currentSituation || typeof scene.currentSituation !== 'object') {
            scene.currentSituation = { recentRisks: [], recommendedActions: [] };
        }
        if (!Array.isArray(scene.currentSituation.recentRisks)) scene.currentSituation.recentRisks = [];
        scene.currentSituation.recentRisks.push(`阶段待确认：${fromPhase?.title || '当前阶段'}`);
        scene.currentSituation.recentRisks = scene.currentSituation.recentRisks.slice(-12);
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
            if (update.status !== undefined && this.counterStatuses.includes(update.status)) {
                counter.status = update.status;
                if (counter.status === 'resolved' && !counter.resolvedAt) counter.resolvedAt = Date.now();
            }
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

            const previousStatus = challenge.status;
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
            if (update.evidenceAdd !== undefined || update.evidenceIds !== undefined) {
                const evidenceAdd = update.evidenceAdd !== undefined
                    ? (Array.isArray(update.evidenceAdd) ? update.evidenceAdd : [update.evidenceAdd])
                    : [];
                const evidenceIds = update.evidenceIds !== undefined
                    ? (Array.isArray(update.evidenceIds) ? update.evidenceIds : [update.evidenceIds])
                    : [];
                if (!Array.isArray(challenge.evidenceIds)) challenge.evidenceIds = [];
                [...evidenceAdd, ...evidenceIds].map(String).filter(Boolean).forEach(item => {
                    if (!challenge.evidenceIds.includes(item)) challenge.evidenceIds.push(item);
                });
                challenge.evidenceIds = challenge.evidenceIds.slice(-20);
            }
            this._settleChallengeStatus(scene, challenge, update.reason || update.lastReason || '挑战状态更新', { previousStatus });
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
        if (!this.isScenePlaying(scene)) return false;
        let changed = false;
        items.slice(0, 20).forEach(item => {
            if (!item || typeof item !== 'object') return;
            const ev = this.normalizeEvidence(item);
            if (!ev) return;
            const existing = scene.evidenceLedger.find(e => e.id === ev.id || (e.title === ev.title && e.sourceNodeId === ev.sourceNodeId));
            const isNew = !existing;
            let targetEvidence = ev;
            if (existing) {
                existing.reliability = ev.reliability;
                existing.visible = ev.visible;
                existing.tags = [...new Set([...(existing.tags || []), ...ev.tags])].slice(0, 12);
                existing.supports = [...new Set([...(existing.supports || []), ...ev.supports])].slice(0, 16);
                existing.text = ev.text || existing.text;
                existing.obtainedBy = ev.obtainedBy || existing.obtainedBy;
                targetEvidence = existing;
            } else {
                scene.evidenceLedger.push(ev);
            }
            this._linkEvidenceToClues(scene, targetEvidence);
            this._grantExplorationReward(scene, targetEvidence, { isNew });
            if (isNew && targetEvidence.visible !== false) {
                this.recordEvent(scene, {
                    category: 'exploration',
                    title: '取得证据',
                    text: `${targetEvidence.title}${targetEvidence.reliability ? `（${targetEvidence.reliability}）` : ''}`,
                    refId: targetEvidence.id
                });
            }
            if (targetEvidence.visible !== false && typeof State !== 'undefined' && State.addKnowledgeDiscovery) {
                State.addKnowledgeDiscovery(scene, {
                    id: 'disc_' + targetEvidence.id,
                    subjectType: 'evidence',
                    level: targetEvidence.reliability === 'confirmed' ? 'evidence' : 'hint',
                    title: targetEvidence.title,
                    text: targetEvidence.text || targetEvidence.title,
                    source: targetEvidence.obtainedBy || targetEvidence.sourceNodeId || '证据账本',
                    reliability: targetEvidence.reliability === 'confirmed' ? 'confirmed' : (targetEvidence.reliability === 'contested' ? 'contested' : 'unverified'),
                    tags: targetEvidence.tags,
                    evidenceIds: [targetEvidence.id]
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

    _linkEvidenceToClues(scene, evidence) {
        if (!scene || !evidence || evidence.visible === false || !Array.isArray(scene.clueGraph)) return false;
        const supports = new Set([...(evidence.supports || []), ...(evidence.tags || [])].map(String).filter(Boolean));
        const linkedClueIds = new Set();
        (scene.flowGraph?.revelations || []).forEach(rev => {
            if (!rev || !supports.has(rev.id)) return;
            (rev.clueIds || []).forEach(id => linkedClueIds.add(id));
        });

        let changed = false;
        scene.clueGraph.forEach(clue => {
            if (!clue) return;
            const clueTags = [clue.id, clue.title, clue.subjectName, clue.subjectType].map(String).filter(Boolean);
            const directMatch = clueTags.some(tag => supports.has(tag)) || linkedClueIds.has(clue.id);
            const tagMatch = (evidence.tags || []).some(tag =>
                String(tag).length >= 3 &&
                clueTags.some(item => String(item).includes(String(tag)) || String(tag).includes(String(item)))
            );
            if (!directMatch && !tagMatch) return;
            if (!Array.isArray(clue.evidence)) clue.evidence = [];
            if (!clue.evidence.includes(evidence.id)) {
                clue.evidence.push(evidence.id);
                clue.evidence = clue.evidence.slice(-20);
                changed = true;
            }
            const stages = Array.isArray(clue.stages) ? clue.stages : [];
            const maxStage = Math.max(0, stages.length - 1);
            if (evidence.reliability === 'confirmed') {
                const oldStage = Number(clue.currentStage || 0);
                clue.currentStage = this._clamp(oldStage + 1, 0, maxStage);
                clue.status = clue.currentStage >= maxStage ? 'confirmed' : 'suspected';
                changed = true;
            } else if (clue.status === 'hidden' || clue.status === 'hinted') {
                clue.status = 'suspected';
                changed = true;
            }
            clue.lastReason = `证据：${evidence.title}`;
            clue.updatedAt = Date.now();
        });
        return changed;
    },

    _grantExplorationReward(scene, evidence, options = {}) {
        if (!scene || !evidence || evidence.visible === false || options.isNew !== true) return false;
        if (!this.isScenePlaying(scene)) return false;
        if (!Array.isArray(scene.explorationRewardLog)) scene.explorationRewardLog = [];
        const key = `evidence:${evidence.id}`;
        if (scene.explorationRewardLog.includes(key)) return false;
        scene.explorationRewardLog.push(key);
        scene.explorationRewardLog = scene.explorationRewardLog.slice(-200);

        const exp = evidence.reliability === 'confirmed' ? 8 : 4;
        const expResult = this.addExperience(scene, exp, { source: `探索收获：${evidence.title}`, silent: true });

        const item = this._buildExplorationRewardItem(evidence);
        const itemResult = item
            ? this.grantInventoryItem(scene, item, { source: `探索收获：${evidence.title}` })
            : { ok: false };
        const itemAdded = !!itemResult.ok;
        const itemQueued = item && !itemAdded
            ? this._queuePendingExplorationReward(scene, evidence, item)
            : false;
        const expText = expResult.ok ? `经验 +${exp}` : '经验未变化';
        const itemText = item
            ? (itemAdded
                ? `，获得 ${item.name}`
                : `，${itemResult.message || '背包已满'}，${itemQueued ? `已记录待领取 ${item.name}` : `未获得 ${item.name}`}`)
            : '';
        this.addSystemMessage(
            scene,
            `【探索收获：${evidence.title}】${expText}${itemText}`,
            'system'
        );
        if (typeof ActionBar !== 'undefined' && ActionBar.renderStatsDisplay) ActionBar.renderStatsDisplay();
        if (itemAdded && typeof SidebarRight !== 'undefined') {
            SidebarRight.renderInventory?.();
            SidebarRight.markTabNew?.('inventory');
        }
        if (typeof SidebarRight !== 'undefined') SidebarRight.markTabNew?.('knowledge');
        return true;
    },

    _queuePendingExplorationReward(scene, evidence, item) {
        if (!scene || !evidence || !item) return false;
        if (!Array.isArray(scene.pendingExplorationRewards)) scene.pendingExplorationRewards = [];
        const normalized = this.normalizePendingExplorationReward({
            evidenceId: evidence.id,
            evidenceTitle: evidence.title,
            item,
            createdAt: Date.now()
        }, scene.pendingExplorationRewards.length);
        if (!normalized) return false;
        const duplicate = scene.pendingExplorationRewards.some(entry =>
            entry && (entry.id === normalized.id || entry.evidenceId === normalized.evidenceId)
        );
        if (duplicate) return false;
        scene.pendingExplorationRewards.push(normalized);
        scene.pendingExplorationRewards = scene.pendingExplorationRewards.slice(-40);
        this.recordEvent(scene, {
            category: 'inventory',
            title: '探索奖励待领取',
            text: `${normalized.evidenceTitle}：${normalized.item.name}`,
            refId: normalized.evidenceId
        });
        return true;
    },

    retryPendingExplorationRewards(scene, options = {}) {
        if (!scene || !Array.isArray(scene.pendingExplorationRewards)) return [];
        if (scene._retryingExplorationRewards) return [];
        this.normalizeScene(scene);
        if (options.onlyWhenPlaying !== false && !this.isScenePlaying(scene)) return [];

        scene._retryingExplorationRewards = true;
        const settled = [];
        try {
            const remaining = [];
            scene.pendingExplorationRewards.forEach(raw => {
                const reward = this.normalizePendingExplorationReward(raw);
                if (!reward) return;
                const result = this.grantInventoryItem(scene, reward.item, {
                    source: `探索补发：${reward.evidenceTitle}`,
                    record: true
                });
                if (result.ok) {
                    settled.push({
                        evidenceId: reward.evidenceId,
                        evidenceTitle: reward.evidenceTitle,
                        itemName: result.itemName || reward.item.name
                    });
                } else {
                    reward.attempts = Number(reward.attempts || 0) + 1;
                    remaining.push(reward);
                }
            });
            scene.pendingExplorationRewards = remaining.slice(-40);
        } finally {
            delete scene._retryingExplorationRewards;
        }

        if (settled.length > 0) {
            const names = settled.map(item => item.itemName).filter(Boolean).join('、');
            if (options.message !== false) {
                this.addSystemMessage(scene, `【探索奖励补发】获得 ${names}。`, 'system');
            }
            if (typeof SidebarRight !== 'undefined') {
                SidebarRight.renderInventory?.();
                SidebarRight.markTabNew?.('inventory');
                SidebarRight.markTabNew?.('situation');
            }
        }
        return settled;
    },

    _retryPendingExplorationRewardsAfterInventoryChange(scene) {
        return this.retryPendingExplorationRewards(scene, { message: true });
    },

    _buildExplorationRewardItem(evidence) {
        const tags = new Set([...(evidence.tags || []), ...(evidence.supports || [])].map(s => String(s || '').toLowerCase()));
        const has = (...items) => items.some(item => tags.has(item) || [...tags].some(tag => tag.includes(item)));
        if (has('medical', 'mutation_sample', 'no_contagion', 'plant')) {
            return {
                id: `reward_${evidence.id}_medical`,
                name: '应急医疗包',
                description: '从探索和检测中整理出的可用医疗材料，可在一次体质或治疗相关检定中投入。',
                type: 'consumable',
                quantity: 1,
                uses: 1,
                tags: ['医疗', '样本', '应急'],
                effects: [
                    { type: 'heal', value: 4, consume: true },
                    { type: 'check_bonus', stat: 'constitution', value: 2, consume: true }
                ]
            };
        }
        if (has('terminal', 'repair', 'water', 'supply', 'old_device', 'hologram', 'log')) {
            return {
                id: `reward_${evidence.id}_parts`,
                name: '备用零件包',
                description: '从旧设备或终端中拆出的可用零件，可辅助一次修复、破解或设备操作。',
                type: 'consumable',
                quantity: 1,
                uses: 1,
                tags: ['零件', '修复', '设备'],
                effects: [{ type: 'check_bonus', stat: 'intelligence', value: 2, consume: true }]
            };
        }
        if (has('route', 'radiation', 'storm', 'old_mall', 'new_home', 'capacity', 'air', 'energy_key')) {
            return {
                id: `reward_${evidence.id}_field`,
                name: '探索补给包',
                description: '路线踏勘中整理出的备用补给，可辅助一次观察、穿越或野外判断。',
                type: 'consumable',
                quantity: 1,
                uses: 1,
                tags: ['探索', '路线', '补给'],
                effects: [
                    { type: 'heal', value: 2, consume: true },
                    { type: 'check_bonus', value: 2, consume: true }
                ]
            };
        }
        if (has('relic', 'warp', 'seal', 'psyker', 'shadow')) {
            return {
                id: `reward_${evidence.id}_ward`,
                name: '净化盐包',
                description: '用于压制污染、低语或仪式干扰的一次性材料。',
                type: 'consumable',
                quantity: 1,
                uses: 1,
                tags: ['净化', '封印', '污染'],
                effects: [{ type: 'check_bonus', stat: 'wisdom', actionType: 'use_item', value: 2, consume: true }]
            };
        }
        if (has('protocol', 'heart', 'xiaoqi', 'trial', 'qi', 'aura')) {
            return {
                id: `reward_${evidence.id}_debug`,
                name: '调试符片',
                description: '一次性稳定协议、灵气或法器同步的辅助材料。',
                type: 'consumable',
                quantity: 1,
                uses: 1,
                tags: ['协议', '调试', '法器'],
                effects: [{ type: 'check_bonus', stat: 'intelligence', actionType: 'use_item', value: 2, consume: true }]
            };
        }
        return null;
    },

    _addOrMergeInventoryItem(scene, item) {
        if (!scene || !item) return false;
        if (!Array.isArray(scene.inventory)) scene.inventory = [];
        const normalized = this.normalizeItem({ ...item });
        const existing = scene.inventory.find(i => (normalized.id && i.id === normalized.id) || i.name === normalized.name);
        if (existing) {
            if (normalized.uses !== undefined || existing.uses !== undefined) {
                existing.uses = Number(existing.uses || 0) + Number(normalized.uses || 0);
                existing.quantity = 1;
            } else {
                existing.quantity = Number(existing.quantity || 1) + Number(normalized.quantity || 1);
            }
            existing.tags = [...new Set([...(existing.tags || []), ...(normalized.tags || [])])].slice(0, 12);
            const seenEffects = new Set();
            existing.effects = [...(existing.effects || []), ...(normalized.effects || [])]
                .filter(effect => {
                    const key = JSON.stringify(effect || {});
                    if (seenEffects.has(key)) return false;
                    seenEffects.add(key);
                    return true;
                })
                .slice(0, 10);
            this.normalizeItem(existing);
            return true;
        }
        if (scene.inventory.length >= 200) return false;
        scene.inventory.push(normalized);
        return true;
    },

    _directItemEffects(item) {
        if (!item || !Array.isArray(item.effects)) return [];
        const directTypes = new Set(['heal', 'gold', 'exp', 'clock_delta', 'clock_resist', 'world_tension']);
        return item.effects.filter(effect => directTypes.has(effect.type));
    },

    _findInventoryItem(scene, itemRef) {
        if (!scene || !Array.isArray(scene.inventory)) return null;
        const ref = String(itemRef || '').trim();
        if (!ref) return null;
        const item = scene.inventory.find(i => i && ((i.id && i.id === ref) || i.name === ref));
        if (item) this.normalizeItem(item);
        return item || null;
    },

    removeInventoryItem(scene, itemRef, quantity = 1, options = {}) {
        if (!scene || !Array.isArray(scene.inventory)) return { ok: false, message: '没有可用背包。' };
        this.normalizeScene(scene);
        if (!this.isScenePlaying(scene)) return { ok: false, message: this.endedSceneMessage(scene) };
        const ref = String(itemRef || '').trim();
        if (!ref) return { ok: false, message: '没有指定物品。' };
        const idx = scene.inventory.findIndex(item => item && ((item.id && item.id === ref) || item.name === ref));
        if (idx < 0) return { ok: false, message: '没有找到这个物品。' };

        const item = scene.inventory[idx];
        this.normalizeItem(item);
        const itemName = item.name || ref;
        const requested = this._clamp(Number(quantity || 1), 1, 20);
        const currentQty = item.uses !== undefined
            ? Math.max(0, Number(item.uses || 0))
            : Math.max(1, Number(item.quantity || 1));
        if (currentQty <= 0) return { ok: false, message: `${itemName} 已经用完。` };
        const removed = Math.min(requested, currentQty);
        const removedAll = currentQty <= requested;

        if (item.uses !== undefined && !removedAll) {
            item.uses = currentQty - requested;
        } else if (item.uses === undefined && !removedAll) {
            item.quantity = currentQty - requested;
        } else {
            this._clearEquipmentForItem(scene, item);
            scene.inventory.splice(idx, 1);
        }

        const qtyText = removed > 1 ? ` x${removed}` : '';
        const source = String(options.source || '').trim().slice(0, 120);
        const text = `${source ? `${source}，` : ''}失去 ${itemName}${qtyText}`;
        if (options.record !== false) {
            this.recordEvent(scene, {
                category: 'inventory',
                title: '失去物品',
                text
            });
        }
        const retriedRewards = removedAll && options.retryQuestRewards !== false
            ? this._retryPendingQuestRewardsAfterInventoryChange(scene)
            : [];
        const retriedExplorationRewards = removedAll && options.retryExplorationRewards !== false
            ? this._retryPendingExplorationRewardsAfterInventoryChange(scene)
            : [];
        if (typeof SidebarRight !== 'undefined') {
            SidebarRight.renderInventory?.();
            SidebarRight.renderDetail?.();
            SidebarRight.markTabNew?.('inventory');
        }
        return { ok: true, itemName, quantity: removed, removedAll, retriedRewards, retriedExplorationRewards };
    },

    sellInventoryItem(scene, itemRef, quantity = 1, options = {}) {
        if (!scene || !Array.isArray(scene.inventory)) return { ok: false, message: '没有可用背包。' };
        this.normalizeScene(scene);
        if (!this.isScenePlaying(scene)) return { ok: false, message: this.endedSceneMessage(scene) };
        const item = this._findInventoryItem(scene, itemRef);
        if (!item) return { ok: false, message: '没有找到这个物品。' };
        if (item.type === 'quest') return { ok: false, message: `${item.name} 是关键物品，不能直接出售。` };
        if (item.equipped) return { ok: false, message: `${item.name} 已装备，请先卸下再出售。` };

        const available = item.uses !== undefined
            ? Math.max(0, Number(item.uses || 0))
            : Math.max(1, Number(item.quantity || 1));
        if (available <= 0) return { ok: false, message: `${item.name} 已经用完。` };
        const requested = options.all === true
            ? available
            : this._clamp(Number(quantity || 1), 1, available);
        const price = this._inventoryItemSalePrice(item, requested);
        if (price <= 0) return { ok: false, message: `${item.name} 没有可出售价值。` };

        const removed = this.removeInventoryItem(scene, item.id || item.name, requested, {
            source: '出售',
            record: true,
            retryQuestRewards: false,
            retryExplorationRewards: false
        });
        if (!removed.ok) return removed;
        const payment = this.addGold(scene, price, { source: `出售${item.name}`, silent: true });
        if (!payment.ok) return { ok: false, message: '交易结算失败。' };

        const qtyText = removed.quantity > 1 ? ` x${removed.quantity}` : '';
        this.addSystemMessage(scene, `【出售】${item.name}${qtyText}，获得 ${payment.amount} 金币。`, 'system');
        const retriedRewards = removed.removedAll
            ? this._retryPendingQuestRewardsAfterInventoryChange(scene)
            : [];
        const retriedExplorationRewards = removed.removedAll
            ? this._retryPendingExplorationRewardsAfterInventoryChange(scene)
            : [];
        if (typeof ActionBar !== 'undefined' && ActionBar.renderStatsDisplay) ActionBar.renderStatsDisplay();
        if (typeof SidebarRight !== 'undefined') {
            SidebarRight.renderInventory?.();
            SidebarRight.renderDetail?.();
            SidebarRight.markTabNew?.('inventory');
        }
        return { ok: true, itemName: item.name, quantity: removed.quantity, gold: payment.amount, currentGold: scene.gold, retriedRewards, retriedExplorationRewards };
    },

    _inventoryItemSalePrice(item, quantity = 1) {
        if (!item || item.type === 'quest') return 0;
        const explicit = Number(item.sellPrice ?? item.value ?? item.price);
        const qty = Math.max(1, Number(quantity || 1));
        if (Number.isFinite(explicit) && explicit > 0) return this._clamp(Math.floor(explicit * qty), 1, 9999);

        const baseByType = { weapon: 18, armor: 18, accessory: 14, consumable: 8, misc: 5 };
        let unit = baseByType[item.type] || 5;
        const effects = Array.isArray(item.effects) ? item.effects : [];
        effects.forEach(effect => {
            const value = Math.abs(Number(effect.value ?? effect.checkBonus ?? effect.dcDelta ?? effect.riskDelta ?? 0));
            if (effect.type === 'heal') unit += Math.min(12, value * 2);
            else if (effect.type === 'check_bonus') unit += Math.min(12, value * 3);
            else if (effect.type === 'dc_delta' || effect.type === 'risk_delta') unit += Math.min(10, value * 2);
            else if (effect.type === 'world_tension' || effect.type === 'clock_delta' || effect.type === 'clock_resist') unit += 4;
            else if (effect.type === 'strategy_leverage') unit += 5;
        });
        if (item.uses !== undefined) {
            unit += 2;
            return this._clamp(Math.floor(unit * qty), 1, 9999);
        }
        return this._clamp(Math.floor(unit * qty), 1, 9999);
    },

    _findItemTargetClock(scene, item, effect = {}) {
        const clocks = Array.isArray(scene?.clocks) ? scene.clocks.filter(Boolean) : [];
        if (clocks.length === 0) return null;
        const clockId = String(effect.clockId || '').trim();
        const clockTag = String(effect.clockTag || '').trim();
        const clockName = String(effect.clockName || '').trim();
        if (clockId) {
            const byId = clocks.find(clock => clock.id === clockId);
            if (byId) return byId;
        }
        if (clockTag) {
            const byTag = clocks.find(clock => clock.tag === clockTag);
            if (byTag) return byTag;
        }
        if (clockName) {
            const byName = clocks.find(clock => clock.name === clockName);
            if (byName) return byName;
        }
        const tags = new Set((item?.tags || []).map(tag => String(tag || '').toLowerCase()).filter(Boolean));
        const matched = clocks
            .filter(clock => clock.visibility !== 'hidden')
            .map(clock => {
                const haystack = `${clock.id || ''} ${clock.name || ''} ${clock.tag || ''} ${clock.description || ''}`.toLowerCase();
                let score = 0;
                tags.forEach(tag => {
                    if (tag && haystack.includes(tag)) score += 2;
                });
                if (String(clock.tag || '').toLowerCase() === 'main') score += 1;
                return { clock, score };
            })
            .filter(entry => entry.score > 0)
            .sort((a, b) => b.score - a.score || Number(b.clock.value || 0) - Number(a.clock.value || 0));
        if (matched.length > 0) return matched[0].clock;
        return clocks.filter(clock => clock.visibility !== 'hidden').sort((a, b) => Number(b.value || 0) - Number(a.value || 0))[0] || null;
    },

    _equipmentSlotForItem(item) {
        if (!item) return 'accessory';
        if (item.type === 'weapon') return 'weapon';
        if (item.type === 'armor') return 'armor';
        return 'accessory';
    },

    _clearEquipmentForItem(scene, item) {
        if (!scene || !item) return;
        if (!scene.equipment || typeof scene.equipment !== 'object') {
            scene.equipment = { weapon: null, armor: null, accessory: null };
        }
        item.equipped = false;
        Object.keys(scene.equipment).forEach(slot => {
            if (scene.equipment[slot] === item.name) scene.equipment[slot] = null;
        });
    },

    _fallbackDirectUse(item) {
        if (!item) return null;
        const text = `${item.name || ''} ${item.description || ''} ${(item.tags || []).join(' ')}`.toLowerCase();
        if (/(医疗|治疗|急救|药|血清|绷带|medical|heal|serum)/i.test(text)) return { heal: 3 };
        if (/(食物|饮水|补给|口粮|supply|ration)/i.test(text)) return { heal: 2 };
        return null;
    },

    _consumeInventoryItem(scene, item) {
        if (!scene || !item || !Array.isArray(scene.inventory)) return false;
        const idx = scene.inventory.findIndex(i => i === item || (item.id && i.id === item.id) || i.name === item.name);
        if (idx < 0) return false;
        const target = scene.inventory[idx];
        if (target.uses !== undefined) {
            target.uses = Math.max(0, Number(target.uses || 0) - 1);
            if (target.uses <= 0) {
                this._clearEquipmentForItem(scene, target);
                scene.inventory.splice(idx, 1);
            }
            return true;
        }
        if (Number(target.quantity || 1) > 1) {
            target.quantity = Number(target.quantity || 1) - 1;
            return true;
        }
        this._clearEquipmentForItem(scene, target);
        scene.inventory.splice(idx, 1);
        return true;
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
        if (!this.isScenePlaying(scene)) {
            if (typeof SidebarRight !== 'undefined') SidebarRight.renderSituation?.();
            return { challenge, progressDelta, strainDelta, outcome, ended: true };
        }
        if (approach && outcome === 'critical_success' && Array.isArray(ctx.secondaryApproachIds)) {
            const secondary = (challenge.approaches || [])
                .filter(a => ctx.secondaryApproachIds.includes(a.id))
                .slice(0, 1);
            secondary.forEach(item => this._applyChallengeApproachEffects(scene, challenge, item, 'success', check));
        }
        if (!this.isScenePlaying(scene)) {
            if (typeof SidebarRight !== 'undefined') SidebarRight.renderSituation?.();
            return { challenge, progressDelta, strainDelta, outcome, ended: true };
        }
        challenge = scene.sceneChallenges.find(c => c.id === challengeId) || challenge;
        this._settleChallengeStatus(scene, challenge, challenge.lastReason);
        if (scene.gameState === 'playing') this._activateNextChallenge(scene);
        if (typeof SidebarRight !== 'undefined') SidebarRight.renderSituation?.();
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
            const quest = scene.quests.find(q => q.id === item.questId);
            this.grantQuestReward(scene, quest);
        });

        if (typeof SidebarRight !== 'undefined') {
            SidebarRight.renderQuests?.();
            SidebarRight.renderSituation?.();
            SidebarRight.markTabNew?.('quests');
        }
        this.checkVictory(scene);
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

    _sceneUsesStructuredProgress(scene) {
        return (scene?.sceneChallenges || []).length > 0 ||
            (scene?.evidenceLedger || []).length > 0 ||
            (scene?.flowGraph?.revelations || []).length > 0;
    },

    _objectiveAllowedByProgressGates(scene, quest, objective, idx, narrative, options = {}) {
        const structured = this._sceneUsesStructuredProgress(scene);
        if (!structured) return true;

        const type = quest.type || 'side';
        if (type !== 'main') {
            return this._sideObjectiveHasExplicitSupport(scene, quest, objective, idx);
        }

        if ((quest.type || 'side') === 'main' && this._objectiveHasIncompleteLinkedChallenge(scene, quest, objective, idx)) {
            return false;
        }

        if (this._objectiveSupportedByEvidence(scene, quest, objective, idx)) return true;
        if (this._objectiveSupportedByRevelation(scene, quest, objective, idx)) return true;
        if (this._objectiveSupportedByChallenge(scene, quest, objective, idx)) return true;

        if (options.explicitMarker === true || options.stateUpdate === true || options.manualToggle === true) {
            return false;
        }

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

    _sideObjectiveHasExplicitSupport(scene, quest, objective, idx) {
        const targets = this._objectiveExactSupportTargets(quest, objective, idx);
        if (targets.size === 0) return false;
        const hasSupport = supports => this._supportsAnyExactTarget(supports, targets);

        const evidenceOk = (scene.evidenceLedger || []).some(ev => {
            if (ev.visible === false) return false;
            if (!['confirmed', 'partial'].includes(ev.reliability)) return false;
            return hasSupport(ev.supports || []);
        });
        if (evidenceOk) return true;

        const revelationOk = (scene.flowGraph?.revelations || []).some(rev => {
            if (rev.status !== 'confirmed') return false;
            return hasSupport(rev.requiredFor || []);
        });
        if (revelationOk) return true;

        return (scene.sceneChallenges || []).some(challenge => {
            if (challenge.status !== 'completed') return false;
            return hasSupport(challenge.supports || []);
        });
    },

    _objectiveExactSupportTargets(quest, objective, idx) {
        const questId = String(quest?.id || '').trim();
        const targets = [
            questId ? `${questId}:${idx + 1}` : '',
            objective?.id && questId ? `${questId}:${objective.id}` : '',
            this._normalizeQuestText(objective?.text || '')
        ].filter(Boolean);
        const objectives = Array.isArray(quest.objectives) ? quest.objectives : [];
        if (objectives.length === 1 && questId) targets.push(questId);
        return new Set(targets);
    },

    _supportsAnyExactTarget(supports, targets) {
        if (!Array.isArray(supports) || !targets || targets.size === 0) return false;
        return supports.some(item => {
            const raw = String(item || '').trim();
            if (!raw) return false;
            return targets.has(raw) || targets.has(this._normalizeQuestText(raw));
        });
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
            if (!this.isScenePlaying(scene)) {
                this._trimSituation(scene);
                SidebarRight.renderSituation?.();
                await State.saveCurrentSceneDebounced();
                return;
            }
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

    recordEvent(scene, data = {}) {
        if (!scene || !data) return null;
        if (!Array.isArray(scene.eventLog)) scene.eventLog = [];
        const text = String(data.text || data.content || data.title || '').trim();
        const title = String(data.title || this._eventTitleFromText(text) || '事件').trim();
        if (!title && !text) return null;
        const entry = this.normalizeEventLogEntry({
            ...data,
            title,
            text: text || title,
            turn: data.turn ?? scene.turnCount ?? 0,
            timestamp: data.timestamp || Date.now()
        });
        if (!entry) return null;
        const duplicateKey = `${entry.category}|${entry.title}|${entry.text}`.slice(0, 260);
        const last = scene.eventLog[scene.eventLog.length - 1];
        const lastKey = last ? `${last.category}|${last.title}|${last.text}`.slice(0, 260) : '';
        if (duplicateKey === lastKey) return last;
        scene.eventLog.push(entry);
        scene.eventLog = scene.eventLog.slice(-120);
        return entry;
    },

    recordConsequence(scene, data = {}) {
        if (!scene || !data) return null;
        if (!Array.isArray(scene.consequenceLedger)) scene.consequenceLedger = [];
        const title = String(data.title || this._eventTitleFromText(data.effect || data.cause || '') || '后果').trim();
        const effect = String(data.effect || data.text || title).trim();
        if (!title && !effect) return null;
        const entry = this.normalizeConsequence({
            ...data,
            title,
            effect,
            turn: data.turn ?? scene.turnCount ?? 0,
            createdAt: data.createdAt || Date.now()
        });
        if (!entry) return null;
        const duplicateKey = `${entry.status}|${entry.title}|${entry.cause}|${entry.effect}`.slice(0, 320);
        const last = scene.consequenceLedger[scene.consequenceLedger.length - 1];
        const lastKey = last ? `${last.status}|${last.title}|${last.cause}|${last.effect}`.slice(0, 320) : '';
        if (duplicateKey === lastKey) return last;
        scene.consequenceLedger.push(entry);
        scene.consequenceLedger = scene.consequenceLedger.slice(-60);
        this.recordEvent(scene, {
            category: entry.category === 'survival' ? 'survival' : 'progress',
            title: `后果：${entry.title}`,
            text: entry.effect || entry.cause,
            refId: entry.id,
            timestamp: entry.createdAt
        });
        return entry;
    },

    getActiveConsequences(scene, options = {}) {
        if (!scene) return [];
        const includeResolved = options.includeResolved === true;
        const limit = Math.max(1, Number(options.limit || 8));
        return (scene.consequenceLedger || [])
            .map(item => this.normalizeConsequence(item))
            .filter(Boolean)
            .filter(item => includeResolved || item.status === 'active')
            .sort((a, b) => {
                const sev = { critical: 4, high: 3, medium: 2, low: 1 };
                const sa = sev[a.severity] || 1;
                const sb = sev[b.severity] || 1;
                return sb - sa || Number(b.createdAt || 0) - Number(a.createdAt || 0);
            })
            .slice(0, limit);
    },

    resolveRelevantConsequences(scene, context = {}) {
        if (!scene || !Array.isArray(scene.consequenceLedger)) return [];
        this.normalizeScene(scene);
        const outcome = String(context.outcome || '');
        const canResolve = context.force === true || ['success', 'critical_success'].includes(outcome);
        if (!canResolve) return [];

        const severityRank = { low: 1, medium: 2, high: 3, critical: 4 };
        const scored = scene.consequenceLedger
            .map((item, index) => ({
                item,
                index,
                score: this._consequenceMatchScore(item, context)
            }))
            .filter(entry => entry.item && entry.item.status === 'active')
            .filter(entry => entry.score >= 4)
            .filter(entry => context.force === true || outcome === 'critical_success' || entry.item.severity !== 'critical')
            .sort((a, b) => {
                const sev = (severityRank[b.item.severity] || 1) - (severityRank[a.item.severity] || 1);
                return b.score - a.score || sev || Number(b.item.createdAt || 0) - Number(a.item.createdAt || 0);
            });
        if (scored.length === 0) return [];

        const limit = Math.max(1, Math.min(3, Number(context.limit || (outcome === 'critical_success' ? 2 : 1))));
        const now = Date.now();
        const reason = String(context.reason || context.intent || '后续行动成功处理了相关后果').slice(0, 260);
        const resolved = [];
        scored.slice(0, limit).forEach(entry => {
            const target = scene.consequenceLedger[entry.index];
            if (!target || target.status !== 'active') return;
            target.status = 'resolved';
            target.resolvedAt = now;
            target.resolvedBy = String(context.messageId || context.source || '').slice(0, 120);
            target.resolution = reason;
            resolved.push({
                id: target.id,
                title: target.title,
                severity: target.severity,
                score: entry.score
            });
        });

        if (resolved.length > 0) {
            const text = `解除：${resolved.map(item => item.title).join('、')}`;
            this.recordEvent(scene, {
                category: 'progress',
                title: '后果解除',
                text,
                refId: resolved[0].id,
                timestamp: now
            });
            if (!scene.currentSituation) scene.currentSituation = { recentRisks: [], recommendedActions: [] };
            if (!Array.isArray(scene.currentSituation.recentRisks)) scene.currentSituation.recentRisks = [];
            scene.currentSituation.recentRisks.push(`后果解除：${resolved.map(item => item.title).join('、')}`);
            scene.currentSituation.recentRisks = scene.currentSituation.recentRisks.slice(-12);
            if (typeof SidebarRight !== 'undefined') {
                SidebarRight.renderSituation?.();
                SidebarRight.markTabNew?.('situation');
            }
        }
        return resolved;
    },

    resolveCounterStrategies(scene, context = {}) {
        if (!scene || !Array.isArray(scene.counterStrategies)) return [];
        this.normalizeScene(scene);
        const outcome = String(context.outcome || '');
        const canAffect = context.force === true || ['partial', 'success', 'critical_success'].includes(outcome);
        if (!canAffect) return [];

        const scored = scene.counterStrategies
            .map((counter, index) => ({
                counter,
                index,
                score: this._counterMatchScore(counter, context)
            }))
            .filter(entry => entry.counter && entry.counter.status !== 'resolved')
            .filter(entry => entry.score >= (outcome === 'partial' ? 4 : 5))
            .sort((a, b) => b.score - a.score || Number(b.counter.progress || 0) - Number(a.counter.progress || 0));
        if (scored.length === 0) return [];

        const limit = Math.max(1, Math.min(2, Number(context.limit || (outcome === 'critical_success' ? 2 : 1))));
        const progressDelta = outcome === 'critical_success' ? -35 : (outcome === 'success' ? -22 : -8);
        const exposureDelta = outcome === 'critical_success' ? 35 : (outcome === 'success' ? 24 : 12);
        const now = Date.now();
        const reason = String(context.reason || context.intent || '玩家采取了有效反制').slice(0, 260);
        const results = [];

        scored.slice(0, limit).forEach(entry => {
            const counter = scene.counterStrategies[entry.index];
            if (!counter || counter.status === 'resolved') return;
            const before = {
                status: counter.status,
                visibility: counter.visibility,
                progress: Number(counter.progress || 0),
                exposure: Number(counter.exposure || 0)
            };

            const revealOnly = outcome === 'partial';
            if (counter.visibility === 'hidden') counter.visibility = revealOnly ? 'hinted' : 'known';
            else if (counter.visibility === 'hinted' && outcome !== 'partial') counter.visibility = 'known';
            if (counter.status === 'active' && (counter.visibility === 'known' || outcome !== 'partial')) {
                counter.status = 'revealed';
            }

            if (!revealOnly || before.visibility !== counter.visibility) {
                counter.progress = this._clamp(before.progress + progressDelta, 0, 100);
            }
            counter.exposure = this._clamp(before.exposure + exposureDelta, 0, 100);
            counter.lastAction = reason;
            counter.updatedAt = now;

            const decisiveCritical = outcome === 'critical_success' && (counter.progress <= 5 || entry.score >= 8);
            if (context.force === true || decisiveCritical || counter.progress <= 0 || counter.exposure >= 100) {
                counter.status = 'resolved';
                counter.visibility = 'known';
                counter.resolvedAt = now;
                counter.resolution = reason;
            }

            const result = {
                id: counter.id,
                title: counter.title,
                status: counter.status,
                visibility: counter.visibility,
                progressDelta: counter.progress - before.progress,
                exposureDelta: counter.exposure - before.exposure,
                resolved: counter.status === 'resolved',
                revealed: before.visibility !== counter.visibility || before.status !== counter.status,
                score: entry.score
            };
            results.push(result);
        });

        if (results.length > 0) {
            const resolved = results.filter(item => item.resolved);
            const weakened = results.filter(item => !item.resolved);
            const text = [
                resolved.length ? `解决：${resolved.map(item => item.title).join('、')}` : '',
                weakened.length ? `削弱/揭示：${weakened.map(item => item.title).join('、')}` : ''
            ].filter(Boolean).join('；');
            this.recordEvent(scene, {
                category: 'progress',
                title: resolved.length ? '反制解决' : '反制削弱',
                text,
                refId: results[0].id,
                timestamp: now
            });
            if (!scene.currentSituation) scene.currentSituation = { recentRisks: [], recommendedActions: [] };
            if (!Array.isArray(scene.currentSituation.recentRisks)) scene.currentSituation.recentRisks = [];
            scene.currentSituation.recentRisks.push(text);
        }
        return results;
    },

    getConsequenceRiskModifier(scene, context = {}) {
        const active = this.getActiveConsequences(scene, { limit: 6 });
        if (active.length === 0) return null;
        const actionType = String(context.actionType || '');
        const intent = String(context.intent || '').toLowerCase();
        const severityRisk = { low: 2, medium: 5, high: 9, critical: 14 };
        const matched = active.filter(item => {
            const haystack = `${item.category} ${(item.tags || []).join(' ')} ${item.title} ${item.effect}`.toLowerCase();
            if (!actionType && !intent) return true;
            if (actionType && haystack.includes(actionType.toLowerCase())) return true;
            if (intent && (item.tags || []).some(tag => intent.includes(String(tag).toLowerCase()))) return true;
            return ['critical', 'high'].includes(item.severity);
        });
        if (matched.length === 0) return null;
        const risk = Math.min(16, matched.reduce((sum, item) => sum + (severityRisk[item.severity] || 2), 0));
        const dc = risk >= 9 ? 1 : 0;
        return {
            riskDelta: risk,
            dcDelta: dc,
            sources: matched.map(item => item.title).slice(0, 3)
        };
    },

    getEventLog(scene, limit = 12) {
        if (!scene) return [];
        this.normalizeScene(scene);
        const stored = (scene.eventLog || []).map(e => this.normalizeEventLogEntry(e)).filter(Boolean);
        const derived = stored.length > 0 ? [] : this._deriveEventLogFromMessages(scene);
        return [...stored, ...derived]
            .filter(Boolean)
            .sort((a, b) => Number(b.timestamp || 0) - Number(a.timestamp || 0))
            .slice(0, Math.max(1, Number(limit || 12)));
    },

    _deriveEventLogFromMessages(scene) {
        const interesting = new Set(['check', 'system', 'event', 'gameover', 'victory']);
        return (scene.messages || [])
            .filter(msg => interesting.has(msg.type))
            .slice(-30)
            .map(msg => this.normalizeEventLogEntry({
                id: `derived:${msg.id || msg.timestamp || Math.random()}`,
                category: msg.type === 'check' ? 'check' : this._eventCategoryFromText(msg.content || ''),
                title: msg.type === 'check' && msg.checkData
                    ? `${msg.checkData.statName || '属性'}检定：${msg.checkData.resultLabel || msg.checkData.outcome || '结果'}`
                    : this._eventTitleFromText(msg.content || ''),
                text: String(msg.content || '').replace(/\n+/g, ' ').slice(0, 360),
                turn: scene.turnCount || 0,
                timestamp: msg.timestamp || 0,
                messageId: msg.id || ''
            }))
            .filter(Boolean);
    },

    _eventTitleFromText(text) {
        const clean = String(text || '').replace(/\s+/g, ' ').trim();
        const bracket = clean.match(/^【([^】]{1,40})】/);
        if (bracket) return bracket[1];
        if (clean.includes('检定')) return '检定结果';
        if (clean.includes('获得奖励')) return '获得奖励';
        if (clean.includes('升级到')) return '升级';
        if (clean.includes('受到') && clean.includes('伤害')) return '受伤';
        if (clean.includes('恢复') && clean.includes('生命')) return '恢复生命';
        return clean.slice(0, 32) || '事件';
    },

    _eventCategoryFromText(text) {
        const clean = String(text || '');
        if (/资源消耗|同伴协助|投入资源/.test(clean)) return 'resource';
        if (/检定|D20|掷骰/.test(clean)) return 'check';
        if (/任务|主线|支线/.test(clean)) return 'quest';
        if (/挑战|阶段推进|里程碑/.test(clean)) return 'challenge';
        if (/线索|证据|探索收获|知识/.test(clean)) return 'exploration';
        if (/购买|交易|金币|花费/.test(clean)) return 'economy';
        if (/物品|背包|使用物品|获得 .+包|获得 .+药|装备|卸下/.test(clean)) return 'inventory';
        if (/升级|经验|属性点/.test(clean)) return 'level';
        if (/世界紧张度|紧张度|局势压力/.test(clean)) return 'progress';
        if (/生命|伤害|休息|恢复/.test(clean)) return 'survival';
        if (/移动|前往|地点|地图/.test(clean)) return 'movement';
        if (/失败|倒下|死亡|Game Over/.test(clean)) return 'failure';
        if (/通关|胜利|完成冒险/.test(clean)) return 'victory';
        return 'system';
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
        this.recordEvent(scene, {
            category: this._eventCategoryFromText(content),
            title: this._eventTitleFromText(content),
            text: String(content),
            messageId: msg.id,
            timestamp: msg.timestamp
        });
        if (typeof ChatUI !== 'undefined' && ChatUI.onMessageAdded) ChatUI.onMessageAdded(msg);
        return msg;
    },

    _addEndingMessage(scene, content, type, category, title) {
        if (!scene || !content) return null;
        if (!Array.isArray(scene.messages)) scene.messages = [];
        const msg = {
            id: 'msg_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            role: 'assistant',
            content: String(content),
            type,
            visibility: { public: true, locationId: scene.currentLocation || '', participants: [], overheardBy: [] },
            timestamp: Date.now()
        };
        scene.messages.push(msg);
        this.recordEvent(scene, {
            category,
            title,
            text: msg.content,
            messageId: msg.id,
            timestamp: msg.timestamp
        });
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
        const matches = this.collectApplicableItemEffects(scene, {
            stat: check?.key || check?.stat,
            actionType: check?.actionType || check?.type || '',
            intent: check?.intent || check?.stakes || '',
            includeUnequipped: true
        })
            .filter(m => ['check_bonus', 'dc_delta', 'risk_delta'].includes(m.effect.type) && m.effect.consume === true);
        const groups = new Map();
        matches.forEach((m, idx) => {
            const key = m.item.id || m.item.name || `idx_${idx}`;
            if (!groups.has(key)) {
                groups.set(key, { item: m.item, checkBonus: 0, dcDelta: 0, riskDelta: 0 });
            }
            const group = groups.get(key);
            const value = Number(m.effect.value || 0);
            if (m.effect.type === 'check_bonus') group.checkBonus += value;
            if (m.effect.type === 'dc_delta') group.dcDelta += value;
            if (m.effect.type === 'risk_delta') group.riskDelta += value;
        });
        return [...groups.values()]
            .map((group, idx) => {
                const labelParts = [];
                if (group.checkBonus) labelParts.push(`检定 ${group.checkBonus >= 0 ? '+' : ''}${group.checkBonus}`);
                if (group.dcDelta) labelParts.push(`DC ${group.dcDelta >= 0 ? '+' : ''}${group.dcDelta}`);
                if (group.riskDelta) labelParts.push(`风险 ${group.riskDelta >= 0 ? '+' : ''}${group.riskDelta}`);
                if (!labelParts.length) return null;
                const itemRef = group.item.id || group.item.name || `idx_${idx}`;
                const stableId = `item:${itemRef}`;
                const legacyId = `item:${itemRef}:${idx}`;
                return {
                    id: stableId,
                    legacyIds: legacyId === stableId ? [] : [legacyId],
                    kind: 'item',
                    itemId: group.item.id || '',
                    source: group.item.name,
                    label: `${labelParts.join('，')}，可消耗使用`,
                    value: group.checkBonus,
                    checkBonus: group.checkBonus,
                    dcDelta: group.dcDelta,
                    riskDelta: group.riskDelta,
                    consume: true
                };
            })
            .filter(Boolean);
    },

    consumeCheckItems(scene, modifiers = [], options = {}) {
        if (!scene || !Array.isArray(scene.inventory)) return false;
        let consumed = false;
        const inventoryCountBefore = scene.inventory.length;
        const consumedKeys = new Set();
        const notes = [];
        modifiers.forEach(mod => {
            if (!mod.consume || !mod.source) return;
            const key = mod.itemId || mod.source;
            if (consumedKeys.has(key)) return;
            const idx = scene.inventory.findIndex(i =>
                (mod.itemId && i.id === mod.itemId) || i.name === mod.source
            );
            if (idx < 0) return;
            const item = scene.inventory[idx];
            const itemName = item.name || mod.source;
            if (!this._consumeInventoryItem(scene, item)) return;
            consumedKeys.add(key);
            consumed = true;
            notes.push(`${itemName} -1`);
        });
        if (consumed) {
            if (!Array.isArray(scene.messages)) scene.messages = [];
            this.addSystemMessage(scene, `【资源消耗】检定投入：${notes.join('，')}`, 'system');
            if (scene.inventory.length < inventoryCountBefore && options.retryPendingRewards !== false) {
                this._retryPendingQuestRewardsAfterInventoryChange(scene);
                this._retryPendingExplorationRewardsAfterInventoryChange(scene);
            }
            if (typeof SidebarRight !== 'undefined') {
                SidebarRight.renderInventory?.();
                SidebarRight.markTabNew?.('inventory');
                SidebarRight.markTabNew?.('situation');
            }
        }
        return consumed;
    },

    getStrategyItemResources(scene, strategy, options = {}) {
        if (!scene || !strategy || !Array.isArray(scene.inventory)) return [];
        const limit = Math.max(1, Math.min(12, Number(options.limit || 6)));
        const contextParts = [
            strategy.title,
            strategy.goal,
            strategy.phase,
            strategy.stakes,
            ...(strategy.resources || []),
            ...(strategy.requiredIntel || []),
            ...(strategy.usedIntel || []),
            ...(strategy.counterplay || []),
            ...((strategy.steps || []).map(step => step?.text || step)),
            ...((strategy.clues || []).map(clue => clue?.text || clue?.title || clue))
        ];
        const contextText = contextParts.map(item => String(item || '').toLowerCase()).join(' ');
        const normalizedContext = this._normalizeFlowText ? this._normalizeFlowText(contextText) : contextText;
        const resources = [];

        (scene.inventory || []).forEach((item, index) => {
            if (!item) return;
            this.normalizeItem(item);
            if (Number(item.quantity || 1) <= 0) return;
            if (item.uses !== undefined && Number(item.uses || 0) <= 0) return;

            let score = 0;
            let checkBonus = 0;
            let dcDelta = 0;
            let riskDelta = 0;
            const labels = [];
            const itemTags = (item.tags || []).map(tag => String(tag || '').toLowerCase()).filter(Boolean);
            const itemText = `${item.name || ''} ${item.description || ''} ${itemTags.join(' ')}`.toLowerCase();
            const normalizedItemText = this._normalizeFlowText ? this._normalizeFlowText(itemText) : itemText;
            const itemName = String(item.name || '').toLowerCase();

            if (itemName && contextText.includes(itemName)) score += 4;
            itemTags.forEach(tag => {
                if (!tag) return;
                const normalizedTag = this._normalizeFlowText ? this._normalizeFlowText(tag) : tag;
                if ((tag.length >= 2 && contextText.includes(tag)) || (normalizedTag.length >= 2 && normalizedContext.includes(normalizedTag))) score += 2;
            });
            if (item.type === 'quest' && score > 0) {
                score += 2;
                labels.push('任务物品筹码');
            }

            (item.effects || []).forEach(effect => {
                const value = Number(effect.value || 0);
                if (effect.type === 'strategy_leverage') {
                    const tag = String(effect.tag || '').toLowerCase();
                    const normalizedTag = this._normalizeFlowText ? this._normalizeFlowText(tag) : tag;
                    const tagMatches = !tag ||
                        (tag.length >= 2 && (contextText.includes(tag) || normalizedItemText.includes(tag))) ||
                        (normalizedTag.length >= 2 && (normalizedContext.includes(normalizedTag) || normalizedItemText.includes(normalizedTag)));
                    if (!tagMatches && score <= 0) return;
                    score += tagMatches ? 8 : 4;
                    const leverageValue = value || -10;
                    riskDelta += leverageValue > 0 ? -leverageValue : leverageValue;
                    labels.push(`筹码${effect.tag ? `:${effect.tag}` : ''}`);
                    return;
                }

                if (!['check_bonus', 'dc_delta', 'risk_delta'].includes(effect.type)) return;
                const effectAction = String(effect.actionType || '').toLowerCase();
                const actionMatches = !effectAction || effectAction === 'strategy' || contextText.includes(effectAction);
                const whenMatches = !effect.when || contextText.includes(String(effect.when).toLowerCase()) || normalizedContext.includes(this._normalizeFlowText ? this._normalizeFlowText(effect.when) : String(effect.when).toLowerCase());
                if (!actionMatches || !whenMatches || score <= 0) return;

                if (effect.type === 'check_bonus') {
                    checkBonus += value;
                    if (value) {
                        riskDelta -= Math.max(0, value) * 2;
                        labels.push(`检定 ${value >= 0 ? '+' : ''}${value}`);
                    }
                } else if (effect.type === 'dc_delta') {
                    dcDelta += value;
                    if (value) {
                        riskDelta += value * 3;
                        labels.push(`DC ${value >= 0 ? '+' : ''}${value}`);
                    }
                } else if (effect.type === 'risk_delta') {
                    riskDelta += value;
                    if (value) labels.push(`风险 ${value >= 0 ? '+' : ''}${value}`);
                }
                score += 2;
            });

            if (score <= 0 || labels.length === 0) return;
            const consume = (item.effects || []).some(effect => effect.consume === true) || item.type === 'consumable';
            resources.push({
                id: `strategy_item:${item.id || item.name || index}`,
                itemId: item.id || '',
                name: item.name || '未命名物品',
                label: [...new Set(labels)].join('，'),
                tags: item.tags || [],
                uses: item.uses,
                quantity: item.quantity || 1,
                consume,
                score,
                checkBonus,
                dcDelta,
                riskDelta
            });
        });

        return resources
            .sort((a, b) => b.score - a.score || Number(a.consume) - Number(b.consume) || String(a.name).localeCompare(String(b.name), 'zh-CN'))
            .slice(0, limit);
    },

    consumeStrategyItemResources(scene, strategy, patch = {}) {
        if (!scene || !strategy || !Array.isArray(scene.inventory)) return [];
        this.normalizeScene(scene);
        if (!this.isScenePlaying(scene)) return [];
        const inventoryCountBefore = scene.inventory.length;
        const phase = String(patch.phase || strategy.phase || '');
        const status = String(patch.status || strategy.status || '');
        const isResolutionStep = ['action', 'complication', 'resolution'].includes(phase) ||
            ['executing', 'resolved', 'failed'].includes(status) ||
            !!String(patch.latestOutcome || '').trim();
        if (!isResolutionStep) return [];

        const selectionText = this._strategyItemSelectionText(patch);
        if (!selectionText) return [];
        const normalizedSelection = this._normalizeFlowText(selectionText);
        if (!Array.isArray(strategy.consumedItemResourceIds)) strategy.consumedItemResourceIds = [];
        const consumedKeys = new Set(strategy.consumedItemResourceIds.map(String).filter(Boolean));
        const resources = this.getStrategyItemResources(scene, strategy, { limit: 12 })
            .filter(resource => resource.consume === true)
            .filter(resource => this._strategyResourceMentioned(resource, selectionText, normalizedSelection));
        const consumed = [];

        resources.forEach(resource => {
            const key = String(resource.itemId || resource.name || '').trim();
            if (!key || consumedKeys.has(key)) return;
            const idx = scene.inventory.findIndex(item =>
                item && ((resource.itemId && item.id === resource.itemId) || item.name === resource.name)
            );
            if (idx < 0) return;
            const item = scene.inventory[idx];
            const before = item.uses !== undefined ? Number(item.uses || 0) : Number(item.quantity || 1);
            if (!this._consumeInventoryItem(scene, item)) return;
            const afterItem = scene.inventory.find(next =>
                next && ((resource.itemId && next.id === resource.itemId) || next.name === resource.name)
            );
            const after = afterItem
                ? (afterItem.uses !== undefined ? Number(afterItem.uses || 0) : Number(afterItem.quantity || 1))
                : 0;
            consumedKeys.add(key);
            consumed.push({
                itemId: resource.itemId || '',
                name: resource.name,
                before,
                after
            });
        });

        if (consumed.length === 0) return [];
        strategy.consumedItemResourceIds = [...consumedKeys].slice(-50);
        const title = strategy.title || '计策';
        const text = `【计策资源消耗：${title}】${consumed.map(item => `${item.name} -1`).join('，')}`;
        this.addSystemMessage(scene, text, 'system');
        if (scene.inventory.length < inventoryCountBefore) {
            this._retryPendingQuestRewardsAfterInventoryChange(scene);
            this._retryPendingExplorationRewardsAfterInventoryChange(scene);
        }
        if (typeof SidebarRight !== 'undefined') {
            SidebarRight.renderInventory?.();
            SidebarRight.renderStrategies?.();
            SidebarRight.markTabNew?.('inventory');
            SidebarRight.markTabNew?.('strategies');
        }
        return consumed;
    },

    _strategyItemSelectionText(patch = {}) {
        const parts = [];
        const collect = value => {
            if (Array.isArray(value)) {
                value.forEach(collect);
                return;
            }
            if (value && typeof value === 'object') {
                [
                    value.name,
                    value.itemName,
                    value.itemId,
                    value.resource,
                    value.text,
                    value.title,
                    value.label,
                    value.id
                ].forEach(collect);
                return;
            }
            const text = String(value || '').replace(/\s+/g, ' ').trim();
            if (text) parts.push(text);
        };
        collect(patch.resources);
        collect(patch.usedIntel);
        return parts.join(' ');
    },

    _strategyResourceMentioned(resource, selectionText = '', normalizedSelection = '') {
        const raw = String(selectionText || '').toLowerCase();
        const normalized = normalizedSelection || this._normalizeFlowText(raw);
        const candidates = [
            resource.name,
            resource.itemId,
            resource.id
        ].map(item => String(item || '').trim()).filter(Boolean);
        return candidates.some(candidate => {
            const lower = candidate.toLowerCase();
            const normalizedCandidate = this._normalizeFlowText(lower);
            return (lower.length >= 2 && raw.includes(lower)) ||
                (normalizedCandidate.length >= 2 && normalized.includes(normalizedCandidate));
        });
    },

    canUseInventoryItem(item) {
        if (!item || typeof item !== 'object') return false;
        this.normalizeItem(item);
        return this._directItemEffects(item).length > 0 && this._canConsumeDirectUseItem(item) ||
            this._fallbackDirectUse(item) !== null;
    },

    _canConsumeDirectUseItem(item) {
        if (!item) return false;
        const effects = Array.isArray(item.effects) ? item.effects : [];
        return item.type === 'consumable' ||
            item.uses !== undefined ||
            effects.some(effect => effect?.consume === true);
    },

    canEquipInventoryItem(item) {
        if (!item || typeof item !== 'object') return false;
        this.normalizeItem(item);
        if (item.type === 'consumable') return false;
        if (Number(item.quantity || 1) <= 0) return false;
        if (item.uses !== undefined && Number(item.uses || 0) <= 0) return false;
        return true;
    },

    equipInventoryItem(scene, itemRef) {
        if (!scene || !Array.isArray(scene.inventory)) return { ok: false, message: '没有可用背包。' };
        this.normalizeScene(scene);
        if (!this.isScenePlaying(scene)) return { ok: false, message: this.endedSceneMessage(scene) };
        if (!scene.equipment || typeof scene.equipment !== 'object') scene.equipment = { weapon: null, armor: null, accessory: null };
        const item = this._findInventoryItem(scene, itemRef);
        if (!item) return { ok: false, message: '没有找到这个物品。' };
        if (!this.canEquipInventoryItem(item)) return { ok: false, message: `${item.name} 不能作为装备使用。` };

        const slot = this._equipmentSlotForItem(item);
        const previous = scene.inventory.find(i => i && i !== item && i.equipped === true && this._equipmentSlotForItem(i) === slot);
        if (previous) previous.equipped = false;
        item.equipped = true;
        scene.equipment[slot] = item.name;
        const slotLabels = { weapon: '武器', armor: '防具', accessory: '饰品' };
        const replaced = previous ? previous.name : '';
        this.addSystemMessage(scene, `【装备】${slotLabels[slot] || '装备'}：${item.name}${replaced ? `（替换 ${replaced}）` : ''}`, 'system');
        if (typeof SidebarRight !== 'undefined') {
            SidebarRight.renderInventory?.();
            SidebarRight.renderDetail?.();
            SidebarRight.markTabNew?.('inventory');
        }
        return { ok: true, itemName: item.name, slot, replaced };
    },

    unequipInventoryItem(scene, itemRef) {
        if (!scene || !Array.isArray(scene.inventory)) return { ok: false, message: '没有可用背包。' };
        this.normalizeScene(scene);
        if (!this.isScenePlaying(scene)) return { ok: false, message: this.endedSceneMessage(scene) };
        if (!scene.equipment || typeof scene.equipment !== 'object') scene.equipment = { weapon: null, armor: null, accessory: null };
        const item = this._findInventoryItem(scene, itemRef);
        if (!item) return { ok: false, message: '没有找到这个物品。' };
        if (!item.equipped) return { ok: false, message: `${item.name} 当前没有装备。` };

        item.equipped = false;
        const slot = this._equipmentSlotForItem(item);
        if (scene.equipment[slot] === item.name) scene.equipment[slot] = null;
        this.addSystemMessage(scene, `【卸下装备】${item.name}`, 'system');
        if (typeof SidebarRight !== 'undefined') {
            SidebarRight.renderInventory?.();
            SidebarRight.renderDetail?.();
            SidebarRight.markTabNew?.('inventory');
        }
        return { ok: true, itemName: item.name, slot };
    },

    useInventoryItem(scene, itemRef) {
        if (!scene || !Array.isArray(scene.inventory)) return { ok: false, message: '没有可用背包。' };
        this.normalizeScene(scene);
        if (!this.isScenePlaying(scene)) return { ok: false, message: this.endedSceneMessage(scene) };
        const item = this._findInventoryItem(scene, itemRef);
        if (!item) return { ok: false, message: '没有找到这个物品。' };
        if (item.uses !== undefined && Number(item.uses || 0) <= 0) return { ok: false, message: `${item.name} 已经没有可用次数。` };
        if (Number(item.quantity || 1) <= 0) return { ok: false, message: `${item.name} 已经用完。` };

        const effects = this._directItemEffects(item);
        const fallback = effects.length === 0 ? this._fallbackDirectUse(item) : null;
        if (effects.length === 0 && !fallback) {
            return { ok: false, message: `${item.name} 主要在检定卡中作为资源使用。` };
        }
        if (effects.length > 0 && !this._canConsumeDirectUseItem(item)) {
            return { ok: false, message: `${item.name} 不是可消耗物品，不能直接反复使用。` };
        }

        const applied = [];
        const inactive = [];
        let changed = false;
        const noteInactive = text => {
            const clean = String(text || '').trim();
            if (clean && !inactive.includes(clean)) inactive.push(clean);
        };
        const applyHeal = value => {
            const maxHp = Math.max(1, Number(scene.playerMaxHp || 10));
            const beforeHp = this._clamp(Number(scene.playerHp ?? maxHp), 0, maxHp);
            if (beforeHp >= maxHp) {
                noteInactive('生命已满');
                return;
            }
            const amount = this._clamp(Number(value || 0), 1, maxHp);
            const result = this.applyPlayerHealing(scene, amount, { reason: `使用${item.name}`, silent: true });
            if (result.amount > 0) {
                applied.push(`生命 +${result.amount}`);
                changed = true;
            } else {
                noteInactive('生命已满');
            }
        };

        if (fallback) {
            applyHeal(fallback.heal);
        }

        effects.forEach(effect => {
            const value = Number(effect.value || 0);
            if (effect.type === 'heal') {
                applyHeal(value || 1);
            } else if (effect.type === 'gold') {
                const result = this.addGold(scene, value, { source: `使用${item.name}`, silent: true });
                if (result.ok) {
                    applied.push(`金币 ${result.amount >= 0 ? '+' : ''}${result.amount}`);
                    changed = true;
                } else {
                    noteInactive('金币无变化');
                }
            } else if (effect.type === 'exp') {
                const amount = this._clamp(value, 1, 200);
                const result = this.addExperience(scene, amount, { source: `使用${item.name}`, silent: true });
                if (result.ok) {
                    applied.push(`经验 +${amount}`);
                    changed = true;
                } else {
                    noteInactive('经验无变化');
                }
            } else if (effect.type === 'clock_delta' || effect.type === 'clock_resist') {
                const clock = this._findItemTargetClock(scene, item, effect);
                const result = clock
                    ? this.applyClockUpdate(scene, [{ id: clock.id, delta: value, reason: `使用${item.name}` }])
                    : { changed: false };
                if (result.changed) {
                    applied.push(`${clock.name || '局势时钟'} ${value >= 0 ? '+' : ''}${value}`);
                    changed = true;
                } else {
                    noteInactive(clock ? '局势时钟无变化' : '没有匹配的局势时钟');
                }
            } else if (effect.type === 'world_tension') {
                const result = this.addWorldTension(scene, value, { source: `使用${item.name}`, silent: true });
                if (result.ok) {
                    applied.push(`世界紧张度 ${result.amount >= 0 ? '+' : ''}${result.amount}`);
                    changed = true;
                } else {
                    noteInactive('世界紧张度无变化');
                }
            }
        });

        const shouldConsume = item.type === 'consumable' || item.uses !== undefined || effects.some(e => e.consume === true) || !!fallback;
        if (!changed) {
            const reason = inactive.length > 0 ? inactive.join('，') : '没有可结算的直接效果';
            return { ok: false, itemName: item.name, applied: [], consumed: false, message: `${item.name} 未消耗：${reason}。` };
        }
        const inventoryCountBefore = scene.inventory.length;
        const consumed = shouldConsume ? this._consumeInventoryItem(scene, item) : false;
        const summary = applied.join('，');
        this.addSystemMessage(scene, `【使用物品：${item.name}】${summary}`, 'system');
        const retriedRewards = consumed && scene.inventory.length < inventoryCountBefore
            ? this._retryPendingQuestRewardsAfterInventoryChange(scene)
            : [];
        const retriedExplorationRewards = consumed && scene.inventory.length < inventoryCountBefore
            ? this._retryPendingExplorationRewardsAfterInventoryChange(scene)
            : [];
        if (typeof ActionBar !== 'undefined' && ActionBar.renderStatsDisplay) ActionBar.renderStatsDisplay();
        if (typeof SidebarRight !== 'undefined') {
            SidebarRight.renderInventory?.();
            SidebarRight.renderDetail?.();
            if (consumed) SidebarRight.markTabNew?.('inventory');
            SidebarRight.markTabNew?.('situation');
        }
        return { ok: true, itemName: item.name, applied, consumed, retriedRewards, retriedExplorationRewards };
    },

    async restPlayer(scene, options = {}) {
        if (!scene) return { ok: false, message: '没有可休息的场景。' };
        this.normalizeScene(scene);
        if (!this.isScenePlaying(scene)) return { ok: false, message: this.endedSceneMessage(scene) };
        const maxHp = Math.max(1, Number(scene.playerMaxHp || 10));
        const amount = options.amount !== undefined
            ? this._clamp(Number(options.amount), 1, maxHp)
            : Math.max(2, Math.ceil(maxHp * 0.35));
        const healResult = this.applyPlayerHealing(scene, amount, { reason: '休息', silent: true, record: false });
        const actual = healResult.amount;
        this.addSystemMessage(scene, `【休息】恢复 ${actual} 点生命，当前 ${scene.playerHp}/${maxHp}。时间推进，局势可能变化。`, 'system');
        if (typeof ActionBar !== 'undefined' && ActionBar.renderStatsDisplay) ActionBar.renderStatsDisplay();
        if (typeof SidebarRight !== 'undefined') SidebarRight.renderDetail?.();
        if (options.tick !== false && scene.gameState === 'playing' && typeof State !== 'undefined' && State.scene === scene) {
            await this.tickAfterPlayerTurn('rest');
        }
        return { ok: true, healed: actual, hp: scene.playerHp, maxHp };
    },

    getBasicSupplyCatalog() {
        return {
            supply: {
                price: 15,
                item: { id: 'shop_field_supply', name: '探索补给包', description: '基础补给，可辅助一次观察、穿越或野外判断。', type: 'consumable', quantity: 1, uses: 1, tags: ['探索', '路线', '补给'], effects: [{ type: 'check_bonus', value: 2, consume: true }, { type: 'heal', value: 2, consume: true }] }
            },
            medical: {
                price: 20,
                item: { id: 'shop_medical_kit', name: '应急医疗包', description: '基础医疗材料，可直接恢复生命，也可辅助体质检定。', type: 'consumable', quantity: 1, uses: 1, tags: ['医疗', '治疗', '应急'], effects: [{ type: 'heal', value: 4, consume: true }, { type: 'check_bonus', stat: 'constitution', value: 2, consume: true }] }
            },
            parts: {
                price: 20,
                item: { id: 'shop_parts_kit', name: '备用零件包', description: '备用零件，可辅助一次修复、破解或设备操作。', type: 'consumable', quantity: 1, uses: 1, tags: ['零件', '修复', '设备'], effects: [{ type: 'check_bonus', stat: 'intelligence', value: 2, consume: true }] }
            },
            weapon: {
                price: 45,
                item: { id: 'shop_short_sword', name: '短剑', description: '可靠的近战武器。装备后会降低战斗行动风险，并提供轻微战斗检定修正。', type: 'weapon', quantity: 1, tags: ['武器', '近战'], effects: [{ type: 'check_bonus', actionType: 'combat', value: 1, consume: false }, { type: 'risk_delta', actionType: 'combat', value: -4, consume: false }] }
            },
            armor: {
                price: 50,
                item: { id: 'shop_light_armor', name: '轻型护甲', description: '不妨碍行动的基础防具。装备后可降低战斗和强行突破风险。', type: 'armor', quantity: 1, tags: ['防具', '护甲'], effects: [{ type: 'risk_delta', actionType: 'combat', value: -4, consume: false }, { type: 'risk_delta', actionType: 'force', value: -4, consume: false }, { type: 'check_bonus', stat: 'constitution', actionType: 'force', value: 1, consume: false }] }
            },
            tool: {
                price: 35,
                item: { id: 'shop_utility_tools', name: '通用工具包', description: '基础撬具、量尺和小型维修工具。装备后可辅助调查、修复和开锁。', type: 'misc', quantity: 1, tags: ['工具', '修复', '开锁'], effects: [{ type: 'check_bonus', stat: 'intelligence', actionType: 'investigate', value: 1, consume: false }, { type: 'check_bonus', stat: 'dexterity', actionType: 'sneak', value: 1, consume: false }] }
            },
            scanner: {
                price: 45,
                item: { id: 'shop_portable_scanner', name: '便携扫描仪', description: '基础探测设备。装备后可辅助观察异常、读取环境读数和寻找线索。', type: 'misc', quantity: 1, tags: ['工具', '扫描', '观察'], effects: [{ type: 'check_bonus', stat: 'wisdom', actionType: 'observe', value: 1, consume: false }, { type: 'check_bonus', stat: 'intelligence', actionType: 'investigate', value: 1, consume: false }] }
            }
        };
    },

    formatBasicSupplyCatalog(scene) {
        const catalog = this.getBasicSupplyCatalog();
        const typeLabels = { weapon: '装备', armor: '装备', misc: '工具', consumable: '消耗品', quest: '任务物品' };
        const effectText = item => {
            const labels = (item.effects || []).map(effect => {
                const value = Number(effect.value || 0);
                if (effect.type === 'heal') return `恢复生命 ${value}`;
                if (effect.type === 'check_bonus') return `检定 ${value >= 0 ? '+' : ''}${value}${effect.consume ? '（消耗）' : ''}`;
                if (effect.type === 'risk_delta') return `风险 ${value >= 0 ? '+' : ''}${value}`;
                if (effect.type === 'dc_delta') return `DC ${value >= 0 ? '+' : ''}${value}`;
                return '';
            }).filter(Boolean);
            return labels.slice(0, 3).join('，') || '剧情用途';
        };
        const lines = Object.values(catalog).map(entry => {
            const item = this.normalizeItem(JSON.parse(JSON.stringify(entry.item)));
            const owned = Array.isArray(scene?.inventory)
                ? scene.inventory.some(existing => existing && ((item.id && existing.id === item.id) || existing.name === item.name))
                : false;
            const ownedText = owned && item.type !== 'consumable' ? '，已拥有' : '';
            return `- ${item.name}：${entry.price} 金币，${typeLabels[item.type] || '物品'}，${effectText(item)}${ownedText}`;
        });
        const gold = Number(scene?.gold || 0);
        return `【基础商店】当前金币 ${gold}。\n${lines.join('\n')}\n\n直接输入“购买商品名”即可购买；非消耗装备买到后还需要输入“装备商品名”才会进入常驻修正。`;
    },

    buyBasicSupply(scene, supplyType = 'supply') {
        if (!scene) return { ok: false, message: '没有可交易的场景。' };
        this.normalizeScene(scene);
        if (!this.isScenePlaying(scene)) return { ok: false, message: this.endedSceneMessage(scene) };
        const key = String(supplyType || 'supply');
        const catalog = this.getBasicSupplyCatalog();
        const entry = catalog[key] || catalog.supply;
        const gold = Number(scene.gold || 0);
        const item = this.normalizeItem(JSON.parse(JSON.stringify(entry.item)));
        const existingNonConsumable = item.type !== 'consumable' && Array.isArray(scene.inventory)
            ? scene.inventory.find(existing => existing && ((item.id && existing.id === item.id) || existing.name === item.name))
            : null;
        if (existingNonConsumable) {
            const message = `已经拥有 ${item.name}，可以输入“装备${item.name}”使用。`;
            this.addSystemMessage(scene, `【交易未完成】${message}`, 'system');
            return { ok: false, message, duplicate: true };
        }
        const canMerge = Array.isArray(scene.inventory) && scene.inventory.some(existing =>
            existing && ((item.id && existing.id === item.id) || existing.name === item.name)
        );
        if (!canMerge && Array.isArray(scene.inventory) && scene.inventory.length >= 200) {
            const message = '背包已满，无法购买。';
            this.addSystemMessage(scene, `【交易未完成】${message}`, 'system');
            return { ok: false, message };
        }
        if (gold < entry.price) {
            const message = `金币不足：需要 ${entry.price}，当前 ${gold}。`;
            this.addSystemMessage(scene, `【交易未完成】${message}`, 'system');
            return { ok: false, message };
        }
        const payment = this.addGold(scene, -entry.price, { source: `购买${entry.item.name}`, silent: true, record: false });
        if (!payment.ok) {
            const message = `交易结算失败：当前金币 ${scene.gold}。`;
            this.addSystemMessage(scene, `【交易未完成】${message}`, 'system');
            return { ok: false, message };
        }
        const added = this.grantInventoryItem(scene, item, { source: '购买' });
        if (!added.ok) {
            this.addGold(scene, entry.price, { source: `购买失败退款：${item.name}`, silent: true, record: false });
            const message = `${added.message || '无法获得物品'}，金币已退回。`;
            this.addSystemMessage(scene, `【交易未完成】${message}`, 'system');
            return { ok: false, message };
        }
        this.addSystemMessage(scene, `【购买】花费 ${entry.price} 金币，获得 ${item.name}。`, 'system');
        if (typeof ActionBar !== 'undefined' && ActionBar.renderStatsDisplay) ActionBar.renderStatsDisplay();
        if (typeof SidebarRight !== 'undefined') {
            SidebarRight.renderInventory?.();
            SidebarRight.markTabNew?.('inventory');
        }
        return { ok: true, itemName: item.name, price: entry.price, gold: scene.gold };
    },

    getAvailableCompanionResources(scene, check) {
        if (!scene) return [];
        this.normalizeScene(scene);
        const stat = String(check?.key || check?.stat || '');
        const actionType = String(check?.actionType || check?.type || '');
        const intent = String(check?.intent || check?.stakes || '').toLowerCase();
        return (scene.companionResources || [])
            .filter(resource => resource && Number(resource.uses || 0) > 0)
            .filter(resource => this.getCompanionResourceAvailability(scene, resource).ok)
            .filter(resource => this._effectMatches(resource.effect, {
                stat,
                actionType,
                intent,
                item: { tags: resource.tags || [] }
            }))
            .map(resource => {
                const effect = resource.effect || {};
                const checkBonus = Number(effect.checkBonus || 0);
                const dcDelta = Number(effect.dcDelta || 0);
                const riskDelta = Number(effect.riskDelta || 0);
                const parts = [];
                if (checkBonus) parts.push(`检定 ${checkBonus >= 0 ? '+' : ''}${checkBonus}`);
                if (dcDelta) parts.push(`DC ${dcDelta >= 0 ? '+' : ''}${dcDelta}`);
                if (riskDelta) parts.push(`风险 ${riskDelta >= 0 ? '+' : ''}${riskDelta}`);
                if (effect.clockDelta) parts.push(`时钟 ${effect.clockDelta >= 0 ? '+' : ''}${effect.clockDelta}`);
                if (effect.evidenceReliability) parts.push(`证据→${effect.evidenceReliability}`);
                if (effect.resolveConsequence || (effect.resolveConsequenceTags || []).length || (effect.consequenceTags || []).length) parts.push('解除后果');
                if (!parts.length) return null;
                const cost = resource.cost || {};
                const costText = [
                    Number(cost.time || 0) > 0 ? `耗时 ${Number(cost.time)}分` : '',
                    Number(cost.trust || 0) > 0 ? `信任 -${Number(cost.trust)}` : ''
                ].filter(Boolean).join('，');
                return {
                    id: `companion:${resource.id}`,
                    kind: 'companion',
                    resourceId: resource.id,
                    characterId: resource.characterId || '',
                    source: resource.name,
                    label: `${parts.join('，')}，使用后消耗${costText ? `（${costText}）` : ''}`,
                    value: checkBonus,
                    checkBonus,
                    dcDelta,
                    riskDelta,
                    clockDelta: Number(effect.clockDelta || 0),
                    clockId: effect.clockId || '',
                    clockTag: effect.clockTag || '',
                    evidenceReliability: effect.evidenceReliability || '',
                    evidenceIds: effect.evidenceIds || [],
                    evidenceTags: effect.evidenceTags || [],
                    resolveConsequence: effect.resolveConsequence === true,
                    resolveConsequenceTags: effect.resolveConsequenceTags || [],
                    consequenceTags: effect.consequenceTags || [],
                    consume: true,
                    risk: resource.risk || ''
                };
            })
            .filter(Boolean);
    },

    getUnlockedCompanionResources(scene, options = {}) {
        if (!scene) return [];
        this.normalizeScene(scene);
        const includeLocked = options.includeLocked === true;
        return (scene.companionResources || [])
            .filter(resource => resource && Number(resource.uses || 0) > 0)
            .map(resource => {
                const availability = this.getCompanionResourceAvailability(scene, resource);
                return includeLocked ? { ...resource, availability } : (availability.ok ? resource : null);
            })
            .filter(Boolean);
    },

    getCompanionResourceAvailability(scene, resource) {
        if (!scene || !resource) return { ok: false, reason: '缺少场景或协助资源' };
        const unlock = resource.unlock && typeof resource.unlock === 'object' ? resource.unlock : {};
        const keys = Object.keys(unlock).filter(key => unlock[key] !== undefined && unlock[key] !== null && unlock[key] !== '');
        if (keys.length === 0) return { ok: true, reason: '' };

        const relationInfo = this._getCompanionRelation(scene, resource.characterId, false);
        const trust = Number(relationInfo?.relation?.trust || 0);
        const trustAtLeast = Number.isFinite(Number(unlock.trustAtLeast))
            ? Number(unlock.trustAtLeast)
            : (Number.isFinite(Number(unlock.trust)) ? Number(unlock.trust) : null);
        if (trustAtLeast !== null) {
            if (!relationInfo?.character) return { ok: false, reason: '缺少同伴关系', trust, requiredTrust: trustAtLeast };
            if (trust < trustAtLeast) return { ok: false, reason: `需要信任 ${trustAtLeast}+`, trust, requiredTrust: trustAtLeast };
        }

        const trustBelow = Number.isFinite(Number(unlock.trustBelow)) ? Number(unlock.trustBelow) : null;
        if (trustBelow !== null && trust >= trustBelow) {
            return { ok: false, reason: `信任需低于 ${trustBelow}`, trust, requiredTrustBelow: trustBelow };
        }

        const evidenceTags = this._asStringList(unlock.evidenceTags || unlock.requiredEvidenceTags, 12);
        if (evidenceTags.length > 0) {
            const knownEvidenceTags = this._collectVisibleEvidenceTags(scene);
            const missing = evidenceTags.filter(tag => !knownEvidenceTags.has(tag));
            if (missing.length > 0) return { ok: false, reason: `缺少证据：${missing.join('、')}` };
        }

        const knowledgeTags = this._asStringList(unlock.knowledgeTags || unlock.discoveryTags, 12);
        if (knowledgeTags.length > 0) {
            const knownTags = this._collectKnowledgeTags(scene);
            const missing = knowledgeTags.filter(tag => !knownTags.has(tag));
            if (missing.length > 0) return { ok: false, reason: `缺少发现：${missing.join('、')}` };
        }

        const revelationIds = this._asStringList(unlock.revelationIds || unlock.revelations, 12);
        if (revelationIds.length > 0) {
            const confirmed = new Set((scene.flowGraph?.revelations || [])
                .filter(item => item && ['suspected', 'confirmed'].includes(item.status))
                .map(item => String(item.id || item.title || ''))
                .filter(Boolean));
            const missing = revelationIds.filter(id => !confirmed.has(id));
            if (missing.length > 0) return { ok: false, reason: `缺少关键结论：${missing.join('、')}` };
        }

        return { ok: true, reason: '', trust };
    },

    getSelectedCheckResourceModifiers(scene, check) {
        const selectedItemIds = new Set(Array.isArray(check?.selectedItemModifierIds) ? check.selectedItemModifierIds.map(String) : []);
        const selectedCompanionIds = new Set(Array.isArray(check?.selectedCompanionResourceIds) ? check.selectedCompanionResourceIds.map(String) : []);
        const isSelectedItemModifier = (modifier) => {
            if (!modifier) return false;
            if (selectedItemIds.has(String(modifier.id))) return true;
            if (Array.isArray(modifier.legacyIds) && modifier.legacyIds.some(id => selectedItemIds.has(String(id)))) return true;
            const legacyRefs = [modifier.itemId, modifier.source].map(String).filter(Boolean);
            return [...selectedItemIds].some(id => legacyRefs.some(ref => id === `item:${ref}` || id.startsWith(`item:${ref}:`)));
        };
        const itemModifiers = this.getAvailableCheckItems(scene, check).filter(isSelectedItemModifier);
        const companionModifiers = this.getAvailableCompanionResources(scene, check).filter(m => selectedCompanionIds.has(m.id));
        const modifiers = [...itemModifiers, ...companionModifiers];
        return {
            itemModifiers,
            companionModifiers,
            modifiers,
            bonus: modifiers.reduce((sum, m) => sum + Number(m.checkBonus || m.value || 0), 0),
            dcDelta: modifiers.reduce((sum, m) => sum + Number(m.dcDelta || 0), 0),
            riskDelta: modifiers.reduce((sum, m) => sum + Number(m.riskDelta || 0), 0)
        };
    },

    getCheckTotals(scene, check) {
        const selected = this.getSelectedCheckResourceModifiers(scene, check);
        const statMod = Number.isFinite(Number(check?.statMod)) ? Number(check.statMod) : 0;
        const itemBonus = Number(check?.itemBonus || 0);
        const baseDc = Number.isFinite(Number(check?.dc)) ? Number(check.dc) : 15;
        const mod = statMod + itemBonus + selected.bonus;
        const dc = this._clamp(baseDc + selected.dcDelta, 5, 30);
        return {
            ...selected,
            statMod,
            itemBonus,
            mod,
            dc,
            baseDc
        };
    },

    consumeCompanionResources(scene, modifiers = []) {
        if (!scene || !Array.isArray(scene.companionResources)) return false;
        let consumed = false;
        const notes = [];
        modifiers.forEach(mod => {
            if (mod.kind !== 'companion' || !mod.resourceId) return;
            const resource = scene.companionResources.find(r => r.id === mod.resourceId);
            if (!resource || Number(resource.uses || 0) <= 0) return;
            if (!this.getCompanionResourceAvailability(scene, resource).ok) return;
            resource.uses = Math.max(0, Number(resource.uses || 0) - 1);
            consumed = true;
            const costNotes = this._applyCompanionResourceCost(scene, resource);
            const effectNotes = this.isScenePlaying(scene)
                ? this._applyCompanionResourceEffect(scene, resource, mod)
                : [];
            const detailNotes = [...effectNotes, ...costNotes];
            notes.push(`${resource.name}${detailNotes.length ? `（${detailNotes.join('，')}）` : ''}`);
            if (resource.risk) {
                if (!scene.currentSituation) scene.currentSituation = { recentRisks: [], recommendedActions: [] };
                if (!Array.isArray(scene.currentSituation.recentRisks)) scene.currentSituation.recentRisks = [];
                scene.currentSituation.recentRisks.push(`同伴协助代价：${resource.risk}`);
                this.recordConsequence(scene, {
                    title: `${resource.name}的协助代价`,
                    cause: `使用同伴协助：${resource.name}`,
                    effect: resource.risk,
                    severity: 'medium',
                    category: 'resource',
                    tags: ['companion', resource.characterId, ...(resource.tags || [])].filter(Boolean)
                });
            }
        });
        if (consumed) {
            this.addSystemMessage(scene, `【资源消耗】使用同伴协助：${notes.join('、')}`, 'system');
            if (typeof SidebarRight !== 'undefined') {
                SidebarRight.renderSituation?.();
                SidebarRight.markTabNew?.('situation');
            }
        }
        return consumed;
    },

    _applyCompanionResourceEffect(scene, resource, modifier = {}) {
        const effect = resource?.effect && typeof resource.effect === 'object' ? resource.effect : {};
        const notes = [];

        const clockDelta = Number(effect.clockDelta || modifier.clockDelta || 0);
        if (clockDelta) {
            const clock = this._findCompanionTargetClock(scene, resource, effect, modifier);
            if (clock) {
                const before = Number(clock.value || 0);
                const result = this.applyClockUpdate(scene, [{ id: clock.id, delta: clockDelta, reason: `同伴协助：${resource.name}` }]);
                const afterClock = (scene.clocks || []).find(c => c.id === clock.id);
                const after = Number(afterClock?.value ?? before);
                const actual = after - before;
                if (result.changed && actual) notes.push(`${afterClock?.name || clock.name || '局势时钟'} ${actual >= 0 ? '+' : ''}${actual}`);
                if (!this.isScenePlaying(scene)) return notes;
            }
        }

        const reliability = effect.evidenceReliability || modifier.evidenceReliability || '';
        if (reliability) {
            const upgraded = this._applyCompanionEvidenceReliability(scene, resource, effect, reliability);
            if (upgraded.length > 0) {
                notes.push(...upgraded.map(item => `证据“${item.title}”→${item.reliability}`));
            }
        }

        const resolveTags = [
            ...(effect.resolveConsequenceTags || []),
            ...(effect.consequenceTags || []),
            ...(modifier.resolveConsequenceTags || []),
            ...(modifier.consequenceTags || [])
        ].filter(Boolean);
        const shouldResolve = effect.resolveConsequence === true || modifier.resolveConsequence === true || resolveTags.length > 0;
        if (shouldResolve) {
            const resolved = this._resolveCompanionConsequences(scene, resource, effect, resolveTags);
            if (resolved.length > 0) {
                notes.push(`解除后果：${resolved.map(item => item.title).join('、')}`);
            }
        }

        return notes;
    },

    _applyCompanionResourceCost(scene, resource) {
        const cost = resource?.cost && typeof resource.cost === 'object' ? resource.cost : {};
        const notes = [];
        const trustCost = Math.max(0, Math.floor(Number(cost.trust || 0)));
        if (trustCost > 0) {
            const relationInfo = this._getCompanionRelation(scene, resource.characterId, true);
            const relation = relationInfo?.relation;
            if (relation) {
                const before = Number(relation.trust || 0);
                relation.trust = this._clamp(before - trustCost, -100, 100);
                if (!Array.isArray(relation.history)) relation.history = [];
                relation.history.push({
                    timestamp: Date.now(),
                    delta: -trustCost,
                    trustDelta: -trustCost,
                    mood: relation.mood || '平静',
                    reason: `使用同伴协助：${resource.name}`
                });
                notes.push(`信任 -${trustCost}`);
                if (relationInfo.character && typeof Storage !== 'undefined' && Storage.saveCharacter) {
                    Storage.saveCharacter(relationInfo.character).catch(e => console.warn('保存同伴协助关系成本失败:', e));
                }
                if (typeof State !== 'undefined' && State.emit && Array.isArray(State.characters)) {
                    State.emit('charactersChanged', State.characters);
                }
            }
        }

        const timeCost = Math.max(0, Math.floor(Number(cost.time || 0)));
        if (timeCost > 0) {
            notes.push(`耗时 ${timeCost}分`);
            if (!scene.currentSituation) scene.currentSituation = { recentRisks: [], recommendedActions: [] };
            if (!Array.isArray(scene.currentSituation.recentRisks)) scene.currentSituation.recentRisks = [];
            scene.currentSituation.recentRisks.push(`同伴协助耗时：${resource.name} 占用约 ${timeCost} 分钟`);
            const clock = this._selectClockForTick(scene, 'companion_time_cost');
            if (clock) {
                const before = Number(clock.value || 0);
                const delta = this._clamp(Math.ceil(timeCost / 30), 1, 3);
                const result = this.applyClockUpdate(scene, [{
                    id: clock.id,
                    delta,
                    reason: `同伴协助耗时：${resource.name}`
                }]);
                const afterClock = (scene.clocks || []).find(c => c.id === clock.id);
                const after = Number(afterClock?.value ?? before);
                const actual = after - before;
                if (result.changed && actual) notes.push(`${afterClock?.name || clock.name || '局势时钟'} ${actual >= 0 ? '+' : ''}${actual}`);
            }
        }
        return notes;
    },

    _findCompanionTargetClock(scene, resource, effect = {}, modifier = {}) {
        const clocks = Array.isArray(scene?.clocks) ? scene.clocks.filter(Boolean) : [];
        if (clocks.length === 0) return null;
        const clockId = String(effect.clockId || modifier.clockId || '').trim();
        const clockTag = String(effect.clockTag || modifier.clockTag || '').trim();
        if (clockId) {
            const byId = clocks.find(clock => clock.id === clockId);
            if (byId) return byId;
        }
        if (clockTag) {
            const byTag = clocks.find(clock => clock.tag === clockTag);
            if (byTag) return byTag;
        }
        const tags = new Set([...(resource.tags || []), ...(effect.evidenceTags || [])].map(tag => String(tag || '').toLowerCase()).filter(Boolean));
        const matched = clocks
            .filter(clock => clock.visibility !== 'hidden')
            .map(clock => {
                const haystack = `${clock.id || ''} ${clock.name || ''} ${clock.tag || ''} ${clock.description || ''}`.toLowerCase();
                let score = 0;
                tags.forEach(tag => {
                    if (tag && haystack.includes(tag)) score += 2;
                });
                if (String(clock.tag || '').toLowerCase() === 'main') score += 1;
                return { clock, score };
            })
            .filter(entry => entry.score > 0)
            .sort((a, b) => b.score - a.score || Number(b.clock.value || 0) - Number(a.clock.value || 0));
        if (matched.length > 0) return matched[0].clock;
        return clocks.filter(clock => clock.visibility !== 'hidden').sort((a, b) => Number(b.value || 0) - Number(a.value || 0))[0] || null;
    },

    _applyCompanionEvidenceReliability(scene, resource, effect = {}, reliability = '') {
        if (!scene || !this.evidenceReliabilities.includes(reliability)) return [];
        const rank = { rumor: 0, contested: 1, partial: 2, confirmed: 3 };
        const targetRank = rank[reliability] ?? 0;
        const evidenceIds = new Set(this._asStringList(effect.evidenceIds, 12));
        const tags = new Set([
            ...this._asStringList(effect.evidenceTags, 12),
            ...this._asStringList(resource.tags, 12)
        ]);
        const candidates = (scene.evidenceLedger || [])
            .filter(ev => ev && ev.visible !== false)
            .filter(ev => evidenceIds.size === 0 || evidenceIds.has(ev.id))
            .filter(ev => {
                if (evidenceIds.size > 0) return true;
                if (tags.size === 0) return false;
                return (ev.tags || []).some(tag => tags.has(String(tag)));
            })
            .filter(ev => (rank[ev.reliability] ?? 0) < targetRank)
            .sort((a, b) => Number(b.createdAt || 0) - Number(a.createdAt || 0))
            .slice(0, Math.max(1, Number(effect.evidenceLimit || 1)));
        if (candidates.length === 0) return [];
        const updates = candidates.map(ev => ({
            ...ev,
            reliability,
            obtainedBy: `同伴协助：${resource.name}`
        }));
        this.applyEvidenceAdd(scene, updates);
        this.recordEvent(scene, {
            category: 'progress',
            title: '证据质量提升',
            text: `${resource.name} 帮助确认：${candidates.map(ev => ev.title).join('、')} → ${reliability}`,
            refId: candidates[0].id
        });
        return candidates.map(ev => ({ id: ev.id, title: ev.title, reliability }));
    },

    _resolveCompanionConsequences(scene, resource, effect = {}, tags = []) {
        if (!scene || !Array.isArray(scene.consequenceLedger)) return [];
        const tagList = this._asStringList(tags, 16);
        const context = {
            force: true,
            limit: effect.resolveLimit || 1,
            reason: `同伴协助：${resource.name}`,
            source: resource.id,
            intent: [resource.name, resource.risk, ...(resource.tags || []), ...tagList].filter(Boolean).join(' '),
            actionType: effect.actionType || ''
        };
        const resolved = this.resolveRelevantConsequences(scene, context);
        if (resolved.length > 0) return resolved;

        if (tagList.length > 0) {
            const tagSet = new Set(tagList.map(tag => String(tag).toLowerCase()));
            const severityRank = { low: 1, medium: 2, high: 3, critical: 4 };
            const limit = Math.max(1, Math.min(3, Number(effect.resolveLimit || 1)));
            const matched = (scene.consequenceLedger || [])
                .filter(item => item && item.status === 'active')
                .filter(item => item.severity !== 'critical' || effect.resolveCritical === true)
                .filter(item => (item.tags || []).some(tag => tagSet.has(String(tag).toLowerCase())))
                .sort((a, b) => (severityRank[b.severity] || 1) - (severityRank[a.severity] || 1) || Number(b.createdAt || 0) - Number(a.createdAt || 0))
                .slice(0, limit);
            if (matched.length > 0) {
                const now = Date.now();
                matched.forEach(item => {
                    item.status = 'resolved';
                    item.resolvedAt = now;
                    item.resolvedBy = String(resource.id || '').slice(0, 120);
                    item.resolution = `同伴协助：${resource.name}`;
                });
                this.recordEvent(scene, {
                    category: 'progress',
                    title: '后果解除',
                    text: `解除：${matched.map(item => item.title).join('、')}`,
                    refId: matched[0].id,
                    timestamp: now
                });
                return matched.map(item => ({ id: item.id, title: item.title, severity: item.severity, score: 0 }));
            }
            return [];
        }

        if (effect.resolveConsequence !== true) return [];
        const severityRank = { low: 1, medium: 2, high: 3, critical: 4 };
        const target = (scene.consequenceLedger || [])
            .filter(item => item && item.status === 'active')
            .filter(item => item.severity !== 'critical' || effect.resolveCritical === true)
            .sort((a, b) => (severityRank[b.severity] || 1) - (severityRank[a.severity] || 1) || Number(b.createdAt || 0) - Number(a.createdAt || 0))[0];
        if (!target) return [];
        const now = Date.now();
        target.status = 'resolved';
        target.resolvedAt = now;
        target.resolvedBy = String(resource.id || '').slice(0, 120);
        target.resolution = `同伴协助：${resource.name}`;
        const item = { id: target.id, title: target.title, severity: target.severity, score: 0 };
        this.recordEvent(scene, {
            category: 'progress',
            title: '后果解除',
            text: `解除：${target.title}`,
            refId: target.id,
            timestamp: now
        });
        return [item];
    },

    _getCompanionRelation(scene, characterId, create = false) {
        const id = String(characterId || '');
        if (!id || typeof State === 'undefined' || !Array.isArray(State.characters)) return null;
        const character = State.characters.find(char => char && char.id === id);
        if (!character) return null;
        const userName = String(scene?.userName || State.scene?.userName || State.settings?.userName || '旅人');
        if (create) {
            if (!character._relations || typeof character._relations !== 'object') character._relations = {};
            if (!character._relations[userName]) {
                character._relations[userName] = {
                    affection: 0,
                    trust: 0,
                    suspicion: 0,
                    fear: 0,
                    debt: 0,
                    leverage: [],
                    mood: '平静',
                    memories: [],
                    history: []
                };
            }
        }
        const relation = character._relations?.[userName] || null;
        return { character, relation, userName };
    },

    _collectVisibleEvidenceTags(scene) {
        const tags = new Set();
        (scene.evidenceLedger || [])
            .filter(item => item && item.visible !== false)
            .forEach(item => this._asStringList(item.tags, 20).forEach(tag => tags.add(tag)));
        return tags;
    },

    _collectKnowledgeTags(scene) {
        const tags = new Set();
        const addTags = item => this._asStringList(item?.tags, 20).forEach(tag => tags.add(tag));
        (scene.knowledge?.discoveries || []).forEach(addTags);
        (scene.knowledge?.evidence || []).forEach(addTags);
        (scene.intel || []).forEach(addTags);
        return tags;
    },

    _asStringList(value, limit = 20) {
        const source = Array.isArray(value) ? value : (value ? [value] : []);
        return source.map(item => String(item || '').trim()).filter(Boolean).slice(0, limit);
    },

    getCurrentSituation(scene) {
        if (!scene) return null;
        this.normalizeScene(scene);
        const location = (scene.locations || []).find(l => l.id === scene.currentLocation) || null;
        const activeQuest = (scene.quests || []).find(q => q.status === 'active' && q.type === 'main')
            || (scene.quests || []).find(q => q.status === 'active') || null;
        const clocks = (scene.clocks || []).filter(c => c.visibility !== 'hidden');
        const hiddenPressure = (scene.clocks || []).filter(c => c.visibility === 'hidden' && c.value > 0).length;
        const counterStrategies = (scene.counterStrategies || []).filter(c => c.status !== 'resolved' && c.visibility !== 'hidden');
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
        const storyTexture = scene.storyTexture || null;
        const stakes = storyPhase?.stakes || scene.currentSituation?.stakes || '';
        const recommendedActions = this._buildRecommendedActions(scene, { activeQuest, clocks, counterStrategies, hiddenPressure, storyPhase, knownUnknowns, failureWarnings, activeChallenge });
        scene.currentSituation.recommendedActions = recommendedActions;
        return { location, activeQuest, clocks, hiddenPressure, counterStrategies, recentRisks, availableClues, recommendedActions, storyPhase, stakes, knownUnknowns, failureWarnings, activeChallenge, challengeEvidence, visibleEvidence, revelations, storyTexture };
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
            || phases.find(p => !this._isTerminalProgressStatus(p.status))
            || phases[phases.length - 1]
            || null;
    },

    getActiveChallenge(scene) {
        const challenges = Array.isArray(scene?.sceneChallenges) ? scene.sceneChallenges : [];
        if (challenges.length === 0) return null;
        const phase = this.getActiveStoryPhase(scene);
        if (phase && this._isTerminalProgressStatus(phase.status)) {
            return challenges.find(c => c.status === 'active') || null;
        }
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
        const counterStrategies = (scene.counterStrategies || []).filter(c => c.status !== 'resolved' && c.visibility !== 'hidden');
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

    _settleChallengeStatus(scene, challenge, reason = '', options = {}) {
        if (!challenge) return;
        const was = options.previousStatus || challenge.status;
        const minChecks = this._minChecksForChallenge(challenge);
        const hasEnoughChecks = Number(challenge.checkCount || 0) >= minChecks;
        if (challenge.status === 'completed' && !hasEnoughChecks) {
            challenge.status = 'active';
        }
        if (challenge.progress >= challenge.targetProgress && !hasEnoughChecks && !['completed', 'failed', 'bypassed'].includes(challenge.status)) {
            challenge.progress = Math.max(0, Number(challenge.targetProgress || 1) - 1);
            const needed = Math.max(0, minChecks - Number(challenge.checkCount || 0));
            this.addSystemMessage(scene, `【挑战临门一脚：${challenge.title}】还需要 ${needed} 次关键交锋或等价代价来让结果站得住。`, 'system');
            this.recordConsequence(scene, {
                title: `${challenge.title}尚未坐实`,
                cause: reason || '挑战进度接近完成但缺少关键交锋',
                effect: `还需要 ${needed} 次关键交锋或等价代价，否则结果只能停留在阶段性进展。`,
                severity: 'medium',
                category: 'challenge',
                tags: ['challenge', challenge.id, challenge.phaseId].filter(Boolean)
            });
        } else if (challenge.progress >= challenge.targetProgress && challenge.status !== 'completed') {
            challenge.status = 'completed';
            this.addSystemMessage(scene, `【挑战完成：${challenge.title}】${reason || '目标已经达成。'}`, 'system');
            this._grantChallengeReward(scene, challenge);
            this._completeQuestObjectivesForChallenge(scene, challenge);
            this._completeLinkedPhaseIfReady(scene, challenge);
        } else if (challenge.status === 'completed') {
            if (Number(challenge.progress || 0) < Number(challenge.targetProgress || 1)) {
                challenge.progress = Number(challenge.targetProgress || 1);
            }
            if (was !== 'completed') {
                this.addSystemMessage(scene, `【挑战完成：${challenge.title}】${reason || '目标已经达成。'}`, 'system');
            }
            this._grantChallengeReward(scene, challenge);
            this._completeQuestObjectivesForChallenge(scene, challenge);
            this._completeLinkedPhaseIfReady(scene, challenge);
        } else if (challenge.strain >= challenge.maxStrain && !['completed', 'failed', 'bypassed'].includes(challenge.status)) {
            challenge.status = 'failed';
            const fail = (challenge.failForward || [])[0] || '挑战失败，但局势会以新的代价继续推进。';
            this.addSystemMessage(scene, `【挑战受挫：${challenge.title}】${fail}`, 'system');
            this.recordConsequence(scene, {
                title: `${challenge.title}受挫`,
                cause: '挑战压力达到上限',
                effect: fail,
                severity: 'high',
                category: 'challenge',
                tags: ['challenge', challenge.id, challenge.phaseId].filter(Boolean)
            });
        }
        if (was !== challenge.status && scene.currentSituation?.recentRisks) {
            scene.currentSituation.recentRisks.push(`${challenge.title}：${challenge.status}`);
        }
    },

    _grantChallengeReward(scene, challenge) {
        if (!scene || !challenge || challenge.rewardGranted) return 0;
        const target = Number(challenge.targetProgress || 1);
        const minChecks = Number(challenge.checkBudget?.min || 0);
        const configured = Number(challenge.expReward || 0);
        const amount = configured > 0
            ? this._clamp(configured, 1, 200)
            : this._clamp(15 + target * 8 + minChecks * 4, 20, 80);
        challenge.rewardGranted = true;
        this.addSystemMessage(scene, `【里程碑奖励：${challenge.title}】经验 +${amount}`, 'system');
        this.addExperience(scene, amount, { source: `里程碑奖励：${challenge.title}`, silent: true });
        if (typeof ActionBar !== 'undefined' && ActionBar.renderStatsDisplay) ActionBar.renderStatsDisplay();
        if (typeof SidebarRight !== 'undefined' && SidebarRight.renderDetail) SidebarRight.renderDetail();
        return amount;
    },

    _minChecksForChallenge(challenge) {
        const budget = challenge?.checkBudget || {};
        const min = Number(budget.min ?? 0);
        if (!Number.isFinite(min)) return 0;
        return this._clamp(min, 0, 8);
    },

    _completeQuestObjectivesForChallenge(scene, challenge) {
        if (!scene || !challenge || !Array.isArray(scene.quests)) return { changed: false };
        const supports = new Set((challenge.supports || []).map(item => String(item || '')).filter(Boolean));
        if (supports.size === 0) return { changed: false };

        const normalizedSupports = new Set([...supports].map(item => this._normalizeQuestText(item)));
        const completedByQuest = {};
        const completedQuests = [];
        const completedQuestRefs = [];
        let changed = false;

        scene.quests.forEach(quest => {
            if (!quest || quest.status === 'completed') return;
            const objectives = Array.isArray(quest.objectives) ? quest.objectives : [];
            objectives.forEach((objective, idx) => {
                if (!objective || objective.completed) return;
                const objectiveKeys = [
                    `${quest.id}:${idx + 1}`,
                    this._normalizeQuestText(objective.text || '')
                ].filter(Boolean);
                const matched = objectiveKeys.some(key =>
                    supports.has(key) || normalizedSupports.has(this._normalizeQuestText(key))
                );
                if (!matched) return;
                objective.completed = true;
                changed = true;
                if (!completedByQuest[quest.name]) completedByQuest[quest.name] = [];
                completedByQuest[quest.name].push(objective.text || `目标 ${idx + 1}`);
            });

            if (objectives.length > 0 && objectives.every(o => o.completed)) {
                quest.status = 'completed';
                quest.completedAt = Date.now();
                completedQuests.push(quest.name || '任务');
                completedQuestRefs.push(quest);
            }
        });

        if (!changed) return { changed: false };
        Object.entries(completedByQuest).forEach(([questName, objectives]) => {
            this.addSystemMessage(scene, `【任务进展：${questName}】${objectives.join('；')}`, 'system');
        });
        completedQuests.forEach(questName => {
            this.addSystemMessage(scene, `【任务完成：${questName}】`, 'system');
        });
        completedQuestRefs.forEach(quest => this.grantQuestReward(scene, quest));
        if (scene.questProgressGuards) {
            scene.questProgressGuards.autoAdvanceStreak = 0;
            scene.questProgressGuards.lastAdvancedAt = Date.now();
        }
        this.checkVictory(scene);
        return { changed: true, completedByQuest, completedQuests };
    },

    _completeQuestObjectiveBySupport(scene, support, reason = '') {
        if (!scene || !support || !Array.isArray(scene.quests)) return false;
        const match = String(support).match(/^([^:]+):(\d+)$/);
        if (!match) return false;
        const [, questId, indexRaw] = match;
        const quest = scene.quests.find(q => q.id === questId);
        const idx = Number(indexRaw) - 1;
        const objective = quest?.objectives?.[idx];
        if (!quest || !objective || objective.completed) return false;
        objective.completed = true;
        this.addSystemMessage(scene, `【任务进展：${quest.name}】${objective.text}${reason ? `（${reason}）` : ''}`, 'system');
        if ((quest.objectives || []).every(o => o.completed)) {
            quest.status = 'completed';
            quest.completedAt = Date.now();
            this.addSystemMessage(scene, `【任务完成：${quest.name}】`, 'system');
            this.grantQuestReward(scene, quest);
        }
        if (scene.questProgressGuards) {
            scene.questProgressGuards.autoAdvanceStreak = 0;
            scene.questProgressGuards.lastAdvancedAt = Date.now();
        }
        return true;
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
        effects.forEach(effect => this._applyChallengeEffectString(scene, challenge, approach, effect, check, outcome, effects));
    },

    _applyChallengeEffectString(scene, challenge, approach, effect, check, outcome, siblingEffects = []) {
        const text = String(effect || '').trim();
        if (!text) return;
        const sep = text.indexOf(':');
        const kindRaw = sep >= 0 ? text.slice(0, sep) : text;
        const restRaw = sep >= 0 ? text.slice(sep + 1) : '';
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
                energy_key_verified: '入口能源钥匙验证',
                mutation_plant_sample: '变异植物活性样本',
                hologram_record_module: '战前全息记录模块'
            };
            const questSupports = (siblingEffects || [])
                .map(item => String(item || '').trim())
                .filter(item => item.startsWith('quest:'))
                .map(item => item.slice('quest:'.length).trim())
                .filter(Boolean);
            this.applyEvidenceAdd(scene, [{
                id: rest.startsWith('ev_') ? rest : `ev_${rest}`,
                title: evidenceTitles[rest] || rest.replace(/[_-]/g, ' '),
                tags: [...(approach.tags || []), rest],
                reliability: outcome === 'partial' ? 'partial' : 'confirmed',
                obtainedBy: `${check.statName || approach.statName}检定`,
                supports: [challenge.id, ...(challenge.coreRevelations || []), ...(challenge.supports || []), ...questSupports]
            }]);
        } else if (kind === 'revelation' && rest) {
            this.applyRevelationUpdate(scene, [{ id: rest, status: outcome === 'partial' ? 'suspected' : 'confirmed', reason: challenge.title }]);
        } else if (kind === 'clock' && rest) {
            const match = rest.match(/([A-Za-z0-9_-]+)\s*([+-]\d+)/);
            if (match) {
                this.applyClockUpdate(scene, [{ id: match[1], delta: Number(match[2]), reason: challenge.title }]);
            }
        } else if (kind === 'quest' && rest) {
            this._completeQuestObjectiveBySupport(scene, rest, approach?.label || challenge.title);
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
        const msg = this._addEndingMessage(scene, message, 'gameover', 'failure', '失败结局');
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
            const counter = (scene.counterStrategies || []).find(c => c.status !== 'resolved' && (!trigger.counterId || c.id === trigger.counterId));
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

    _consequenceMatchScore(item, context = {}) {
        if (!item) return 0;
        const tags = (item.tags || []).map(tag => String(tag || '').toLowerCase()).filter(Boolean);
        const haystack = [
            item.category,
            item.title,
            item.cause,
            item.effect,
            ...tags
        ].join(' ').toLowerCase();
        const actionType = String(context.actionType || '').toLowerCase();
        const stat = String(context.stat || context.key || '').toLowerCase();
        const challengeId = String(context.challengeId || context.challengeContext?.challengeId || '').toLowerCase();
        const challengeTitle = String(context.challengeTitle || context.challengeContext?.challengeTitle || '').toLowerCase();
        const intent = String(context.intent || '').toLowerCase();
        let score = 0;

        if (actionType) {
            if (String(item.category || '').toLowerCase() === actionType) score += 4;
            else if (haystack.includes(actionType)) score += 2;
            if (tags.includes(actionType)) score += 3;
        }
        if (stat && tags.includes(stat)) score += 2;
        if (challengeId && tags.includes(challengeId)) score += 6;
        if (challengeTitle && (tags.includes(challengeTitle) || haystack.includes(challengeTitle))) score += 4;
        if (intent) {
            tags.forEach(tag => {
                if (tag.length >= 2 && intent.includes(tag)) score += 1;
            });
            const title = String(item.title || '').toLowerCase();
            if (title && intent.includes(title)) score += 2;
        }
        return score;
    },

    _counterMatchScore(counter, context = {}) {
        if (!counter) return 0;
        const actionType = String(context.actionType || '').toLowerCase();
        const intent = String(context.intent || '').toLowerCase();
        const challengeText = `${context.challengeId || ''} ${context.challengeTitle || ''}`.toLowerCase();
        const counterText = [
            counter.title,
            counter.actorName,
            counter.target,
            counter.hint,
            counter.lastAction,
            ...(counter.counterplay || [])
        ].join(' ').toLowerCase();
        let score = 0;

        if (['investigate', 'observe', 'probe'].includes(actionType)) score += 2;
        if (['persuade', 'threaten', 'lie', 'sneak'].includes(actionType)) score += 1;
        if (counter.visibility !== 'hidden') score += 1;
        if (intent) {
            (counter.counterplay || []).forEach(option => {
                const overlap = this._textOverlapScore(intent, option);
                if (overlap >= 4) score += 5;
                else if (overlap >= 2) score += 2;
            });
            const fieldOverlap = this._textOverlapScore(intent, counterText);
            if (fieldOverlap >= 6) score += 4;
            else if (fieldOverlap >= 3) score += 2;
        }
        if (challengeText && this._textOverlapScore(challengeText, counterText) >= 3) score += 2;
        return score;
    },

    _textOverlapScore(a = '', b = '') {
        const left = String(a || '').toLowerCase().replace(/\s+/g, '');
        const right = String(b || '').toLowerCase().replace(/\s+/g, '');
        if (!left || !right) return 0;
        if (left.includes(right) || right.includes(left)) {
            return Math.min(8, Math.max(3, Math.floor(Math.min(left.length, right.length) / 2)));
        }
        const tokens = this._matchTokens(left);
        if (tokens.length === 0) return 0;
        const rightTokens = new Set(this._matchTokens(right));
        let score = 0;
        tokens.forEach(token => {
            if (right.includes(token) || rightTokens.has(token)) score += 1;
        });
        return Math.min(8, score);
    },

    _matchTokens(text = '') {
        const clean = String(text || '').toLowerCase();
        const ignored = new Set(['玩家', '这个', '那个', '自己', '进行', '采取', '一下', '一个', '需要', '可以', '使用', '利用', '公开']);
        const chunks = clean.match(/[a-z0-9_]{2,}|[\u4e00-\u9fff]{2,}/g) || [];
        const out = new Set();
        chunks.forEach(chunk => {
            if (ignored.has(chunk)) return;
            out.add(chunk);
            if (/^[\u4e00-\u9fff]+$/.test(chunk) && chunk.length > 2) {
                for (let i = 0; i < chunk.length - 1; i += 1) {
                    const token = chunk.slice(i, i + 2);
                    if (!ignored.has(token)) out.add(token);
                }
            }
        });
        return [...out].slice(0, 80);
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
