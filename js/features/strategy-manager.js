/**
 * 计策管理器
 * 负责创建、更新、应用 AI 状态补丁，驱动右侧计策面板
 */
const StrategyManager = {
    maxStrategies: 24,
    maxStrategiesPerUpdate: 4,
    maxStrategyUpdatesPerUpdate: 12,

    /**
     * 创建新计策
     */
    createStrategy(data = {}) {
        const scene = State.scene;
        if (!scene) return null;
        if (!this._canMutateGameplay(scene, '创建计策')) return null;
        if (!Array.isArray(scene.strategies)) scene.strategies = [];
        if (scene.strategies.length >= this.maxStrategies) {
            const message = `当前计策已达上限 ${this.maxStrategies} 条。`;
            console.warn(`[StrategyManager] ${message}`);
            if (typeof showToast !== 'undefined') showToast(message);
            return null;
        }

        const now = Date.now();
        const strategy = this.normalizeStrategy({
            id: 'st_' + now + '_' + Math.random().toString(36).slice(2, 6),
            title: data.title || '未命名计策',
            goal: data.goal || '',
            status: data.status || 'draft',
            phase: data.phase || 'intel',
            risk: typeof data.risk === 'number' ? data.risk : 0,
            progress: typeof data.progress === 'number' ? data.progress : 0,
            participants: Array.isArray(data.participants) ? data.participants : [],
            steps: Array.isArray(data.steps) ? data.steps : [],
            resources: Array.isArray(data.resources) ? data.resources : [],
            clues: Array.isArray(data.clues) ? data.clues : [],
            requiredIntel: Array.isArray(data.requiredIntel) ? data.requiredIntel : [],
            usedIntel: Array.isArray(data.usedIntel) ? data.usedIntel : [],
            exposure: typeof data.exposure === 'number' ? data.exposure : 0,
            counterplay: Array.isArray(data.counterplay) ? data.counterplay : [],
            stakes: data.stakes || '',
            latestOutcome: data.latestOutcome || '',
            createdAt: now,
            updatedAt: now
        });

        scene.strategies.push(strategy);
        if (!scene.activeStrategyId) scene.activeStrategyId = strategy.id;
        State.saveCurrentSceneDebounced();
        SidebarRight.renderStrategies();
        SidebarRight.markTabNew('strategies');
        return strategy;
    },

    /**
     * 更新指定计策（浅合并白名单字段）
     */
    updateStrategy(id, patch) {
        const scene = State.scene;
        if (!scene || !scene.strategies) return null;
        if (!this._canMutateGameplay(scene, '更新计策')) return null;
        const idx = scene.strategies.findIndex(s => s.id === id);
        if (idx === -1) return null;

        const allowed = ['title', 'goal', 'status', 'phase', 'risk', 'progress', 'participants', 'steps', 'resources', 'clues', 'requiredIntel', 'usedIntel', 'exposure', 'counterplay', 'stakes', 'latestOutcome'];
        const validStatuses = ['draft', 'preparing', 'executing', 'exposed', 'resolved', 'failed'];
        const validPhases = ['intel', 'setup', 'action', 'complication', 'resolution'];
        const strategy = scene.strategies[idx];
        const previous = JSON.parse(JSON.stringify(strategy));
        for (const key of allowed) {
            if (patch[key] !== undefined) {
                strategy[key] = patch[key];
            }
        }
        if (strategy.status && !validStatuses.includes(strategy.status)) strategy.status = 'draft';
        if (strategy.phase && !validPhases.includes(strategy.phase)) strategy.phase = 'intel';
        if (typeof strategy.risk === 'number') strategy.risk = Math.min(100, Math.max(0, strategy.risk));
        if (typeof strategy.progress === 'number') strategy.progress = Math.min(100, Math.max(0, strategy.progress));
        if (typeof strategy.exposure === 'number') strategy.exposure = Math.min(100, Math.max(0, strategy.exposure));
        strategy.updatedAt = Date.now();
        scene.strategies[idx] = this.normalizeStrategy(strategy);
        if (typeof WorldEngine !== 'undefined' && WorldEngine.consumeStrategyItemResources) {
            WorldEngine.consumeStrategyItemResources(scene, scene.strategies[idx], patch, { previous });
        }
        State.saveCurrentSceneDebounced();
        SidebarRight.renderStrategies();
        return strategy;
    },

    /**
     * 设置当前激活计策
     */
    setActiveStrategy(id) {
        const scene = State.scene;
        if (!scene || !scene.strategies) return;
        const found = scene.strategies.find(s => s.id === id);
        if (found) {
            scene.activeStrategyId = id;
            State.saveCurrentSceneDebounced();
            SidebarRight.renderStrategies();
        }
    },

    /**
     * 放弃计策
     */
    abandonStrategy(id) {
        const scene = State.scene;
        if (!scene || !scene.strategies) return;
        if (!this._canMutateGameplay(scene, '放弃计策')) return;
        const strategy = scene.strategies.find(s => s.id === id);
        if (!strategy) return;
        if (!confirm(`确定要放弃计策「${String(strategy.title).replace(/</g, ' ').replace(/>/g, ' ')}」吗？`)) return;
        strategy.status = 'failed';
        strategy.latestOutcome = strategy.latestOutcome || '玩家主动放弃了这条计策。';
        strategy.updatedAt = Date.now();
        if (scene.activeStrategyId === id) {
            const remaining = scene.strategies.filter(s => s.id !== id && s.status !== 'failed' && s.status !== 'resolved');
            scene.activeStrategyId = remaining.length > 0 ? remaining[0].id : null;
        }
        State.saveCurrentSceneDebounced();
        SidebarRight.renderStrategies();
    },

    /**
     * 归一化单个计策对象，补全默认值
     */
    normalizeStrategy(strategy) {
        if (!strategy) return strategy;
        const clamp = (value, min, max, fallback = min) => {
            const n = Number(value);
            if (!Number.isFinite(n)) return fallback;
            return Math.max(min, Math.min(max, Math.round(n)));
        };
        const clip = (value, limit, fallback = '') => {
            const text = String(value ?? fallback).trim();
            return (text || fallback).slice(0, limit);
        };
        const stringList = (value, limit, itemLimit = 120) => (
            Array.isArray(value) ? value : []
        ).map(item => clip(item, itemLimit)).filter(Boolean).slice(0, limit);
        const stepList = value => (
            Array.isArray(value) ? value : []
        ).map((item, idx) => {
            const raw = item && typeof item === 'object' ? item : { text: item };
            const status = ['pending', 'active', 'done', 'failed'].includes(raw.status) ? raw.status : 'pending';
            const text = clip(raw.text || raw.title || raw.name || '', 160);
            if (!text) return null;
            return { text, status };
        }).filter(Boolean).slice(0, 8);
        const participantList = value => (
            Array.isArray(value) ? value : []
        ).map(item => {
            if (!item || typeof item !== 'object') return null;
            const name = clip(item.name || item.characterName || item.id || '', 80);
            if (!name) return null;
            return {
                id: clip(item.id || item.characterId || '', 100),
                name,
                role: clip(item.role || '参与者', 80),
                trust: clamp(item.trust, -100, 100, 0),
                suspicion: clamp(item.suspicion, -100, 100, 0)
            };
        }).filter(Boolean).slice(0, 8);
        const clueList = value => (
            Array.isArray(value) ? value : []
        ).map(item => {
            if (item && typeof item === 'object') {
                const text = clip(item.text || item.title || '', 160);
                if (!text) return null;
                return {
                    id: clip(item.id || '', 100),
                    text,
                    reliability: ['rumor', 'confirmed', 'false'].includes(item.reliability) ? item.reliability : 'rumor'
                };
            }
            const text = clip(item, 160);
            return text ? { text, reliability: 'rumor' } : null;
        }).filter(Boolean).slice(0, 10);

        const defaults = {
            status: 'draft',
            phase: 'intel',
            risk: 0,
            progress: 0,
            participants: [],
            steps: [],
            resources: [],
            clues: [],
            requiredIntel: [],
            usedIntel: [],
            exposure: 0,
            counterplay: [],
            consumedItemResourceIds: []
        };
        const validStatuses = ['draft', 'preparing', 'executing', 'exposed', 'resolved', 'failed'];
        const validPhases = ['intel', 'setup', 'action', 'complication', 'resolution'];
        for (const [key, val] of Object.entries(defaults)) {
            if (strategy[key] === undefined || strategy[key] === null) strategy[key] = val;
        }
        strategy.id = clip(strategy.id || `st_${Date.now()}_${Math.random().toString(36).slice(2, 6)}`, 100);
        strategy.title = clip(strategy.title || '未命名计策', 120, '未命名计策');
        strategy.goal = clip(strategy.goal || '', 260);
        strategy.stakes = clip(strategy.stakes || '', 240);
        strategy.latestOutcome = clip(strategy.latestOutcome || '', 320);
        if (!validStatuses.includes(strategy.status)) strategy.status = 'draft';
        if (!validPhases.includes(strategy.phase)) strategy.phase = 'intel';
        strategy.risk = clamp(strategy.risk, 0, 100, 0);
        strategy.progress = clamp(strategy.progress, 0, 100, 0);
        strategy.exposure = clamp(strategy.exposure, 0, 100, 0);
        strategy.participants = participantList(strategy.participants);
        strategy.steps = stepList(strategy.steps);
        strategy.resources = stringList(strategy.resources, 12);
        strategy.clues = clueList(strategy.clues);
        strategy.requiredIntel = stringList(strategy.requiredIntel, 12);
        strategy.usedIntel = stringList(strategy.usedIntel, 12);
        strategy.counterplay = stringList(strategy.counterplay, 8);
        strategy.consumedItemResourceIds = stringList(strategy.consumedItemResourceIds, 50, 120).slice(-50);
        return strategy;
    },

    _canMutateGameplay(scene, actionLabel = '修改计策') {
        const playing = typeof WorldEngine !== 'undefined' && WorldEngine.isScenePlaying
            ? WorldEngine.isScenePlaying(scene)
            : !!scene && (!scene.gameState || scene.gameState === 'playing');
        if (playing) return true;
        const message = typeof WorldEngine !== 'undefined' && WorldEngine.endedSceneMessage
            ? WorldEngine.endedSceneMessage(scene)
            : '当前冒险已经结束，不能继续改变游戏状态。';
        console.warn(`[StrategyManager] ${actionLabel} 被阻止：${message}`);
        if (typeof showToast !== 'undefined') showToast(message);
        return false;
    },

    /**
     * 解析并白名单应用 AI 的状态补丁
     * 不支持 AI 任意覆盖 State，禁止修改 settings、apiKey、DOM 字段等
     */
    applyStateUpdate(update) {
        const scene = State.scene;
        if (!scene) return;
        if (!update || typeof update !== 'object') return;
        if (!this._canMutateGameplay(scene, '应用状态补丁')) return;

        // 单条补丁上限，防止 AI 回复胀大存储
        const MAX_INTEL_PER_UPDATE = 10;
        const MAX_RELATION_UPDATES_PER_UPDATE = 30;
        const MAX_RELATION_ADDITIONS_PER_FIELD = 8;
        const MAX_RELATION_LEVERAGE = 20;
        const MAX_RELATION_MEMORIES = 30;
        const MAX_CHARACTER_SECRETS = 20;
        const MAX_ITEMS_PER_UPDATE = 50;
        const MAX_TOTAL_INVENTORY = 200;
        const MAX_STRATEGIES_PER_UPDATE = this.maxStrategiesPerUpdate;
        const MAX_STRATEGY_UPDATES_PER_UPDATE = this.maxStrategyUpdatesPerUpdate;
        let knowledgeAdded = false;
        let discoveryChanged = false;
        let itemAdded = false;
        let locAdded = false;
        let clockChanged = false;
        let storyChanged = false;
        let phaseChanged = false;
        let clueChanged = false;
        let failureChanged = false;
        let counterChanged = false;
        let agendaChanged = false;
        let challengeChanged = false;
        let evidenceChanged = false;
        let revelationChanged = false;
        let flowGraphChanged = false;
        let tensionChanged = false;
        let factionChanged = false;
        let relationChanged = false;
        let questChanged = false;
        let stoppedByEnding = false;
        const stateUpdateItemUnits = new Map();
        const scenePlaying = () => {
            if (typeof WorldEngine !== 'undefined' && WorldEngine.isScenePlaying) return WorldEngine.isScenePlaying(scene);
            return !scene.gameState || scene.gameState === 'playing';
        };
        const stopIfEnded = label => {
            if (scenePlaying()) return false;
            stoppedByEnding = true;
            console.warn(`[StrategyManager] ${label} 后场景已结束，跳过后续 state_update 字段`);
            return true;
        };

        // 1. strategies.create / update
        if (!stoppedByEnding && update.strategies && typeof update.strategies === 'object') {
            if (Array.isArray(update.strategies.create)) {
                if (update.strategies.create.length > MAX_STRATEGIES_PER_UPDATE) {
                    console.warn(`[StrategyManager] strategies.create 超过单条上限 ${MAX_STRATEGIES_PER_UPDATE}，已截断`);
                }
                for (const st of update.strategies.create.slice(0, MAX_STRATEGIES_PER_UPDATE)) {
                    if (st && typeof st === 'object') this.createStrategy(st);
                }
            }
            if (Array.isArray(update.strategies.update)) {
                if (update.strategies.update.length > MAX_STRATEGY_UPDATES_PER_UPDATE) {
                    console.warn(`[StrategyManager] strategies.update 超过单条上限 ${MAX_STRATEGY_UPDATES_PER_UPDATE}，已截断`);
                }
                for (const patch of update.strategies.update.slice(0, MAX_STRATEGY_UPDATES_PER_UPDATE)) {
                    if (patch && typeof patch === 'object' && patch.id) {
                        this.updateStrategy(patch.id, patch);
                    }
                }
            }
        }

        // 2. knowledgeAdd / intelAdd
        if (!stoppedByEnding && Array.isArray(update.knowledgeAdd)) {
            if (update.knowledgeAdd.length > MAX_INTEL_PER_UPDATE) {
                console.warn(`[StrategyManager] knowledgeAdd 超过单条上限 ${MAX_INTEL_PER_UPDATE}，已截断`);
            }
            for (const item of update.knowledgeAdd.slice(0, MAX_INTEL_PER_UPDATE)) {
                if (!item || typeof item !== 'object') continue;
                const added = State.addKnowledgeDiscovery(scene, item);
                if (added) knowledgeAdded = true;
            }
        }

        if (!stoppedByEnding && Array.isArray(update.intelAdd)) {
            if (!Array.isArray(scene.intel)) scene.intel = [];
            if (update.intelAdd.length > MAX_INTEL_PER_UPDATE) {
                console.warn(`[StrategyManager] intelAdd 超过单条上限 ${MAX_INTEL_PER_UPDATE}，已截断`);
            }
            for (const intel of update.intelAdd.slice(0, MAX_INTEL_PER_UPDATE)) {
                if (intel && typeof intel === 'object') {
                    const text = String(intel.text || '').trim().slice(0, 500);
                    if (!text) continue;
                    const source = String(intel.source || '未知来源').trim().slice(0, 120) || '未知来源';
                    const reliability = ['rumor', 'confirmed', 'false'].includes(intel.reliability) ? intel.reliability : 'rumor';
                    const reliabilityRank = { rumor: 1, confirmed: 2, false: 2 };
                    const tags = Array.isArray(intel.tags)
                        ? intel.tags.map(item => String(item || '').trim().slice(0, 60)).filter(Boolean).slice(0, 12)
                        : [];
                    const existing = scene.intel.find(item =>
                        item &&
                        String(item.text || '').trim() === text &&
                        String(item.source || '').trim() === source
                    );
                    const nextReliability = existing && (reliabilityRank[existing.reliability] || 0) >= reliabilityRank[reliability]
                        ? existing.reliability
                        : reliability;
                    const entry = {
                        id: existing?.id || 'intel_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                        text,
                        source,
                        reliability: nextReliability,
                        tags: existing
                            ? [...new Set([...(existing.tags || []), ...tags])].slice(0, 12)
                            : tags,
                        discoveredAt: Number(existing?.discoveredAt || 0) || Date.now()
                    };
                    if (existing) {
                        Object.assign(existing, entry);
                    } else {
                        scene.intel.push(entry);
                        scene.intel = scene.intel.slice(-120);
                    }
                    const added = State.addKnowledgeDiscovery(scene, {
                        legacyIntelId: entry.id,
                        subjectType: intel.subjectType || 'event',
                        subjectId: intel.subjectId || '',
                        level: entry.reliability === 'confirmed' ? 'evidence' : 'rumor',
                        title: entry.text,
                        text: entry.text,
                        source: entry.source,
                        reliability: entry.reliability === 'confirmed' ? 'confirmed' : (entry.reliability === 'false' ? 'false' : 'unverified'),
                        tags: entry.tags
                    });
                    if (added) knowledgeAdded = true;
                }
            }
        }

        if (!stoppedByEnding && Array.isArray(update.discoveryUpdate)) {
            const validStates = ['locked', 'hinted', 'suspected', 'confirmed'];
            for (const item of update.discoveryUpdate.slice(0, MAX_INTEL_PER_UPDATE)) {
                if (!item || typeof item !== 'object' || !item.characterId || !item.factId) continue;
                if (!scene.discoveries) scene.discoveries = { characters: {} };
                if (!scene.discoveries.characters) scene.discoveries.characters = {};
                if (!scene.discoveries.characters[item.characterId]) scene.discoveries.characters[item.characterId] = {};
                scene.discoveries.characters[item.characterId][item.factId] = {
                    state: validStates.includes(item.state) ? item.state : 'hinted',
                    evidence: Array.isArray(item.evidence) ? item.evidence.map(String).slice(0, 10) : [],
                    discoveredAt: Date.now()
                };
                discoveryChanged = true;
            }
        }

        // 2.5 clocks / story arcs / counter strategies / NPC agenda
        if (!stoppedByEnding && Array.isArray(update.clockUpdate) && typeof WorldEngine !== 'undefined') {
            const result = WorldEngine.applyClockUpdate(scene, update.clockUpdate);
            clockChanged = !!result.changed;
            if (result.triggered?.length) knowledgeAdded = true;
            stopIfEnded('clockUpdate');
        }

        if (!stoppedByEnding && Array.isArray(update.storyArcUpdate) && typeof WorldEngine !== 'undefined') {
            storyChanged = WorldEngine.applyStoryArcUpdate(scene, update.storyArcUpdate);
        }

        if (!stoppedByEnding && Array.isArray(update.storyPhaseUpdate) && typeof WorldEngine !== 'undefined') {
            phaseChanged = WorldEngine.applyStoryPhaseUpdate(scene, update.storyPhaseUpdate);
            stopIfEnded('storyPhaseUpdate');
        }

        if (!stoppedByEnding && Array.isArray(update.clueUpdate) && typeof WorldEngine !== 'undefined') {
            clueChanged = WorldEngine.applyClueUpdate(scene, update.clueUpdate);
        }

        if (!stoppedByEnding && Array.isArray(update.failureStateUpdate) && typeof WorldEngine !== 'undefined') {
            failureChanged = WorldEngine.applyFailureStateUpdate(scene, update.failureStateUpdate);
            stopIfEnded('failureStateUpdate');
        }

        if (!stoppedByEnding && Array.isArray(update.counterStrategyUpdate) && typeof WorldEngine !== 'undefined') {
            counterChanged = WorldEngine.applyCounterStrategyUpdate(scene, update.counterStrategyUpdate);
            if (counterChanged && typeof WorldEngine !== 'undefined') WorldEngine.checkFailureStates(scene, { type: 'counter' });
            stopIfEnded('counterStrategyUpdate');
        }

        if (!stoppedByEnding && Array.isArray(update.npcAgendaUpdate) && typeof WorldEngine !== 'undefined') {
            agendaChanged = WorldEngine.applyNpcAgendaUpdate(update.npcAgendaUpdate);
        }

        if (!stoppedByEnding && Array.isArray(update.challengeUpdate) && typeof WorldEngine !== 'undefined') {
            challengeChanged = WorldEngine.applyChallengeUpdate(scene, update.challengeUpdate);
            stopIfEnded('challengeUpdate');
        }

        if (!stoppedByEnding && Array.isArray(update.evidenceAdd) && typeof WorldEngine !== 'undefined') {
            evidenceChanged = WorldEngine.applyEvidenceAdd(scene, update.evidenceAdd);
            if (evidenceChanged) knowledgeAdded = true;
            stopIfEnded('evidenceAdd');
        }

        if (!stoppedByEnding && Array.isArray(update.revelationUpdate) && typeof WorldEngine !== 'undefined') {
            revelationChanged = WorldEngine.applyRevelationUpdate(scene, update.revelationUpdate);
        }

        if (!stoppedByEnding && update.flowGraphUpdate && typeof update.flowGraphUpdate === 'object' && typeof WorldEngine !== 'undefined') {
            flowGraphChanged = WorldEngine.applyFlowGraphUpdate(scene, update.flowGraphUpdate);
        }

        // 3. factionsUpdate
        if (!stoppedByEnding && Array.isArray(update.factionsUpdate)) {
            if (typeof WorldEngine !== 'undefined' && WorldEngine.applyFactionUpdates) {
                const result = WorldEngine.applyFactionUpdates(scene, update.factionsUpdate, { source: '状态补丁' });
                factionChanged = !!result.changed;
            } else {
                console.warn('[StrategyManager] WorldEngine.applyFactionUpdates 不可用，跳过 factionsUpdate');
            }
            stopIfEnded('factionsUpdate');
        }

        // 4. characterUpdates（仅允许修改关系/警觉/秘密等安全字段）
        // relationshipUpdate 是旧 SPEC 字段，兼容到同一处理路径，避免外部 agent 静默失效。
        const characterUpdates = [
            ...(Array.isArray(update.characterUpdates) ? update.characterUpdates : []),
            ...(Array.isArray(update.relationshipUpdate) ? update.relationshipUpdate : [])
        ];
        if (!stoppedByEnding && characterUpdates.length > 0) {
            if (characterUpdates.length > MAX_RELATION_UPDATES_PER_UPDATE) {
                console.warn(`[StrategyManager] characterUpdates 超过单条上限 ${MAX_RELATION_UPDATES_PER_UPDATE}，已截断`);
            }
            for (const cu of characterUpdates.slice(0, MAX_RELATION_UPDATES_PER_UPDATE)) {
                if (!cu || typeof cu !== 'object') continue;
                const char = this._resolveCharacterForUpdate(cu, scene);
                if (!char) continue;
                const userName = scene.userName || State.settings.userName || '旅人';
                if (!char._relations) char._relations = {};
                if (!char._relations[userName]) {
                    char._relations[userName] = { affection: 0, trust: 0, suspicion: 0, fear: 0, debt: 0, leverage: [], mood: '平静', memories: [], history: [] };
                }
                const rel = char._relations[userName];
                rel.leverage = this._stringList(rel.leverage, MAX_RELATION_LEVERAGE, 160);
                rel.memories = this._stringList(rel.memories, MAX_RELATION_MEMORIES, 220);
                if (!Array.isArray(rel.history)) rel.history = [];
                const visibleChanges = [];
                ['affection', 'trust', 'suspicion', 'fear', 'debt'].forEach(key => {
                    const deltaKey = key + 'Delta';
                    if (cu[deltaKey] === undefined) return;
                    const base = Number.isFinite(Number(rel[key])) ? Number(rel[key]) : 0;
                    const delta = Number.isFinite(Number(cu[deltaKey])) ? Number(cu[deltaKey]) : 0;
                    const next = Math.max(-100, Math.min(100, base + delta));
                    rel[key] = next;
                    const actualDelta = next - base;
                    if (actualDelta !== 0) {
                        visibleChanges.push(`${this._relationLabel(key)} ${this._formatSignedChange(actualDelta)}（${next}）`);
                    }
                });
                if (cu.leverageAdd !== undefined) {
                    const result = this._appendUniqueCapped(
                        rel.leverage,
                        cu.leverageAdd,
                        MAX_RELATION_LEVERAGE,
                        160,
                        MAX_RELATION_ADDITIONS_PER_FIELD
                    );
                    rel.leverage = result.list;
                    const added = result.added;
                    if (added > 0) visibleChanges.push(`新增筹码 ${added} 条`);
                }
                if (cu.memoryAdd !== undefined) {
                    const result = this._appendUniqueCapped(
                        rel.memories,
                        cu.memoryAdd,
                        MAX_RELATION_MEMORIES,
                        220,
                        MAX_RELATION_ADDITIONS_PER_FIELD
                    );
                    rel.memories = result.list;
                    const added = result.added;
                    if (added > 0) visibleChanges.push(`新增共同记忆 ${added} 条`);
                }
                if (cu.mood !== undefined) {
                    const mood = String(cu.mood).trim().slice(0, 40);
                    if (mood && mood !== rel.mood) visibleChanges.push(`心情：${mood}`);
                    rel.mood = mood || rel.mood || '平静';
                }
                if (cu.secret !== undefined) {
                    const result = this._appendUniqueCapped(
                        char.secrets,
                        cu.secret,
                        MAX_CHARACTER_SECRETS,
                        240,
                        1
                    );
                    char.secrets = result.list;
                }
                if (visibleChanges.length > 0) {
                    relationChanged = true;
                    const characterName = String(char.name || cu.characterId);
                    const text = `${characterName}：${visibleChanges.join('，')}`;
                    rel.history.push({
                        timestamp: Date.now(),
                        delta: 0,
                        mood: rel.mood || '平静',
                        reason: `状态补丁：${visibleChanges.join('，').slice(0, 120)}`
                    });
                    rel.history = rel.history.slice(-50);
                    this._recordStatePatchEvent(scene, '关系变化', text);
                }
                Storage.saveCharacter(char).catch(e => console.warn('保存角色关系失败:', e));
            }
            State.emit('charactersChanged', State.characters);
        }

        // 5. scene 字段（仅白名单）
        if (!stoppedByEnding && update.scene && typeof update.scene === 'object') {
            if (typeof update.scene.worldTensionDelta === 'number') {
                if (typeof WorldEngine !== 'undefined' && WorldEngine.addWorldTension) {
                    const result = WorldEngine.addWorldTension(scene, update.scene.worldTensionDelta, { source: '状态补丁', silent: true });
                    tensionChanged = !!result.ok;
                    stopIfEnded('scene.worldTensionDelta');
                } else {
                    console.warn('[StrategyManager] WorldEngine.addWorldTension 不可用，跳过 worldTensionDelta');
                }
            }
            if (!stoppedByEnding && typeof update.scene.activeStrategyId === 'string') {
                const target = scene.strategies.find(s => s.id === update.scene.activeStrategyId);
                if (target) scene.activeStrategyId = update.scene.activeStrategyId;
            }
        }

        // 6. 任务/物品/地点的轻量更新（仍走现有系统，避免重复逻辑）
        if (!stoppedByEnding && Array.isArray(update.questsUpdate)) {
            if (typeof WorldEngine !== 'undefined' && WorldEngine.applyQuestUpdates) {
                const result = WorldEngine.applyQuestUpdates(scene, update.questsUpdate, { stateUpdate: true });
                questChanged = !!result.changed;
            } else {
                console.warn('[StrategyManager] WorldEngine.applyQuestUpdates 不可用，跳过 questsUpdate');
            }
            if (typeof WorldEngine !== 'undefined') {
                WorldEngine.checkFailureStates(scene, { type: 'quest' });
                WorldEngine.checkVictory?.(scene);
            }
            stopIfEnded('questsUpdate');
        }

        if (!stoppedByEnding && Array.isArray(update.itemAdd)) {
            if (update.itemAdd.length > MAX_ITEMS_PER_UPDATE) {
                console.warn(`[StrategyManager] itemAdd 超过单条上限 ${MAX_ITEMS_PER_UPDATE}，已截断`);
            }
            for (const it of update.itemAdd.slice(0, MAX_ITEMS_PER_UPDATE)) {
                if (!it || typeof it !== 'object' || !it.name) continue;
                const qtyRaw = Number(it.quantity);
                const qty = Number.isFinite(qtyRaw) && qtyRaw >= 0 ? qtyRaw : 1;
                if (qty <= 0) continue;
                const safeItemData = this._sanitizeStateUpdateItemData(it, qty, stateUpdateItemUnits);
                if (!safeItemData) continue;
                if (typeof WorldEngine !== 'undefined' && WorldEngine.grantInventoryItem) {
                    const item = this._buildStateUpdateItem(safeItemData, safeItemData.quantity);
                    const result = WorldEngine.grantInventoryItem(scene, item, { source: '状态补丁' });
                    if (!result.ok) {
                        console.warn(`[StrategyManager] ${result.message || `背包已达上限 ${MAX_TOTAL_INVENTORY}，停止新增物品`}`);
                        break;
                    }
                } else {
                    console.warn('[StrategyManager] WorldEngine.grantInventoryItem 不可用，跳过 itemAdd');
                    continue;
                }
                itemAdded = true;
            }
        }

        if (!stoppedByEnding && Array.isArray(update.locationUpdate)) {
            if (typeof WorldEngine !== 'undefined' && WorldEngine.applyLocationUpdates) {
                const result = WorldEngine.applyLocationUpdates(scene, update.locationUpdate, { source: '状态补丁' });
                locAdded = !!result.changed;
            } else {
                console.warn('[StrategyManager] WorldEngine.applyLocationUpdates 不可用，跳过 locationUpdate');
            }
            stopIfEnded('locationUpdate');
        }

        State.saveCurrentSceneDebounced();
        SidebarRight.renderStrategies();
        SidebarRight.renderKnowledge();
        SidebarRight.renderDetail();
        SidebarRight.renderInventory();
        SidebarRight.renderQuests();
        SidebarRight.renderMap();
        SidebarRight.renderSituation?.();
        SidebarLeft.render();
        // 被动获得：标记角标
        if (knowledgeAdded) SidebarRight.markTabNew('knowledge');
        if (discoveryChanged || relationChanged) SidebarRight.markTabNew('detail');
        if (itemAdded) SidebarRight.markTabNew('inventory');
        if (locAdded) SidebarRight.markTabNew('map');
        if (questChanged) SidebarRight.markTabNew('quests');
        if (clockChanged || storyChanged || phaseChanged || clueChanged || failureChanged || counterChanged || agendaChanged || challengeChanged || evidenceChanged || revelationChanged || flowGraphChanged || tensionChanged || factionChanged || relationChanged || questChanged || locAdded) SidebarRight.markTabNew('situation');
    },

    _sanitizeStateUpdateItemData(data, quantity, unitCounts) {
        if (!data || typeof data !== 'object' || !data.name) return null;
        const limit = 20;
        const clean = { ...data };
        const validTypes = ['weapon', 'armor', 'consumable', 'quest', 'misc'];
        clean.name = String(data.name || '').trim().slice(0, 80);
        if (!clean.name) return null;
        clean.type = validTypes.includes(data.type) ? data.type : 'misc';
        clean.quantity = Math.max(1, Math.min(limit, Math.floor(Number(quantity || 1))));

        const hasUses = data.uses !== undefined && Number.isFinite(Number(data.uses));
        const requestedUnits = hasUses
            ? Math.max(0, Math.min(limit, Math.floor(Number(data.uses))))
            : clean.quantity;
        if (requestedUnits <= 0) return null;

        const key = `${clean.type}:${clean.name}`;
        const used = unitCounts.get(key) || 0;
        const remaining = Math.max(0, limit - used);
        if (remaining <= 0) {
            console.warn(`[StrategyManager] itemAdd「${clean.name}」超过单次补丁单位上限 ${limit}，已跳过`);
            return null;
        }
        const allowedUnits = Math.min(requestedUnits, remaining);
        unitCounts.set(key, used + allowedUnits);
        if (allowedUnits < requestedUnits) {
            console.warn(`[StrategyManager] itemAdd「${clean.name}」超过单次补丁单位上限 ${limit}，已截断`);
        }

        if (hasUses) {
            clean.uses = allowedUnits;
            clean.quantity = 1;
        } else {
            clean.quantity = allowedUnits;
        }
        return clean;
    },

    _buildStateUpdateItem(data, quantity) {
        const validTypes = ['weapon', 'armor', 'consumable', 'quest', 'misc'];
        const type = validTypes.includes(data.type) ? data.type : 'misc';
        const description = String(data.description || '').slice(0, 180);
        const qty = Math.max(1, Math.min(20, Number(quantity || 1)));
        const base = typeof WorldEngine !== 'undefined' && WorldEngine.createInventoryItemFromReward
            ? WorldEngine.createInventoryItemFromReward(data.name, qty, { description, type })
            : {
                id: 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                name: String(data.name),
                description,
                type,
                quantity: qty,
                equipped: false,
                tags: [],
                effects: []
            };
        if (Array.isArray(data.tags)) {
            base.tags = [...new Set([...(base.tags || []), ...data.tags.map(String)])].slice(0, 12);
        }
        if (Array.isArray(data.effects)) {
            const effects = typeof WorldEngine !== 'undefined'
                ? data.effects.map(e => WorldEngine.normalizeItemEffect(e)).filter(Boolean)
                : [];
            base.effects = effects.slice(0, 10);
        }
        if (data.uses !== undefined && Number.isFinite(Number(data.uses))) {
            base.uses = Math.max(0, Math.floor(Number(data.uses)));
            base.quantity = 1;
        }
        return typeof WorldEngine !== 'undefined' && WorldEngine.normalizeItem
            ? WorldEngine.normalizeItem(base)
            : base;
    },

    _resolveCharacterForUpdate(update = {}, scene = State.scene) {
        const characters = Array.isArray(State.characters) ? State.characters.filter(Boolean) : [];
        if (characters.length === 0) return null;

        const activeIds = new Set(Array.isArray(scene?.characters) ? scene.characters.map(String) : []);
        const activeChars = activeIds.size > 0
            ? characters.filter(char => activeIds.has(String(char.id || '')))
            : characters;

        const rawId = String(update.characterId || update.id || '').trim();
        if (rawId) {
            const byId = characters.find(char => String(char.id || '') === rawId);
            if (byId) return byId;
        }

        const refs = [
            update.characterName,
            update.name,
            update.actorName,
            update.targetName,
            update.character,
            update.actor,
            update.target,
            rawId
        ].map(value => String(value || '').trim()).filter(Boolean);

        for (const ref of refs) {
            const activeMatch = this._findCharacterByNameRef(activeChars, ref);
            if (activeMatch) return activeMatch;
        }

        return null;
    },

    _findCharacterByNameRef(characters, ref) {
        return this._findCharacterNameMatches(characters, ref)[0] || null;
    },

    _findCharacterNameMatches(characters, ref) {
        const normalized = this._normalizeRefText(ref);
        if (!normalized) return [];
        const exact = characters.filter(char => this._normalizeRefText(char.name || '') === normalized);
        if (exact.length > 0) return exact.length === 1 ? exact : [];

        const partial = characters.filter(char => {
            const name = this._normalizeRefText(char.name || '');
            return name.length >= 2 && normalized.length >= 2 && (name.includes(normalized) || normalized.includes(name));
        });
        return partial.length === 1 ? partial : [];
    },

    _normalizeRefText(value) {
        if (typeof WorldEngine !== 'undefined' && WorldEngine._normalizeQuestText) {
            return WorldEngine._normalizeQuestText(value);
        }
        return String(value || '')
            .replace(/[ \t\r\n*`"'“”‘’「」《》【】()[\]{}，。！？、；：:,.!?;|/_\\-]/g, '')
            .toLowerCase();
    },

    _clampNumber(value, min, max, fallback = 0) {
        const num = Number(value);
        if (!Number.isFinite(num)) return fallback;
        return Math.max(min, Math.min(max, num));
    },

    _stringList(value, limit = 20, itemLimit = 160) {
        const seen = new Set();
        const output = [];
        (Array.isArray(value) ? value : [value]).forEach(item => {
            const text = String(item || '').trim().slice(0, itemLimit);
            if (!text || seen.has(text)) return;
            seen.add(text);
            output.push(text);
        });
        return output.slice(0, limit);
    },

    _appendUniqueCapped(existing, additions, totalLimit = 20, itemLimit = 160, addLimit = 8) {
        const source = Array.isArray(existing)
            ? existing.slice(-Math.max(totalLimit * 2, totalLimit))
            : existing;
        const current = this._stringList(source, totalLimit, itemLimit);
        let added = 0;
        this._stringList(additions, addLimit, itemLimit).forEach(item => {
            if (current.includes(item)) return;
            current.push(item);
            added += 1;
        });
        return {
            list: current.slice(-totalLimit),
            added
        };
    },

    _formatSignedChange(delta) {
        const num = Number(delta) || 0;
        return `${num > 0 ? '+' : ''}${num}`;
    },

    _relationLabel(key) {
        return {
            affection: '好感',
            trust: '信任',
            suspicion: '怀疑',
            fear: '恐惧',
            debt: '人情'
        }[key] || key;
    },

    _recordStatePatchEvent(scene, title, text, category = 'progress') {
        if (typeof WorldEngine === 'undefined' || !WorldEngine.recordEvent) return null;
        return WorldEngine.recordEvent(scene, {
            category,
            title,
            text
        });
    }
};
