/**
 * 计策管理器
 * 负责创建、更新、应用 AI 状态补丁，驱动右侧计策面板
 */
const StrategyManager = {
    /**
     * 创建新计策
     */
    createStrategy(data = {}) {
        const scene = State.scene;
        if (!scene) return null;
        if (!this._canMutateGameplay(scene, '创建计策')) return null;

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
            WorldEngine.consumeStrategyItemResources(scene, scene.strategies[idx], patch);
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
        if (!validStatuses.includes(strategy.status)) strategy.status = 'draft';
        if (!validPhases.includes(strategy.phase)) strategy.phase = 'intel';
        if (typeof strategy.risk === 'number') strategy.risk = Math.min(100, Math.max(0, strategy.risk));
        if (typeof strategy.progress === 'number') strategy.progress = Math.min(100, Math.max(0, strategy.progress));
        if (typeof strategy.exposure === 'number') strategy.exposure = Math.min(100, Math.max(0, strategy.exposure));
        if (!Array.isArray(strategy.participants)) strategy.participants = [];
        if (!Array.isArray(strategy.steps)) strategy.steps = [];
        if (!Array.isArray(strategy.resources)) strategy.resources = [];
        if (!Array.isArray(strategy.clues)) strategy.clues = [];
        if (!Array.isArray(strategy.requiredIntel)) strategy.requiredIntel = [];
        if (!Array.isArray(strategy.usedIntel)) strategy.usedIntel = [];
        if (!Array.isArray(strategy.counterplay)) strategy.counterplay = [];
        if (!Array.isArray(strategy.consumedItemResourceIds)) strategy.consumedItemResourceIds = [];
        strategy.consumedItemResourceIds = strategy.consumedItemResourceIds.map(String).filter(Boolean).slice(-50);
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
        const MAX_FACTIONS_PER_UPDATE = 20;
        const MAX_RELATION_UPDATES_PER_UPDATE = 30;
        const MAX_ITEMS_PER_UPDATE = 50;
        const MAX_LOCATIONS_PER_UPDATE = 20;
        const MAX_TOTAL_INVENTORY = 200;
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
                for (const st of update.strategies.create) {
                    if (st && typeof st === 'object') this.createStrategy(st);
                }
            }
            if (Array.isArray(update.strategies.update)) {
                for (const patch of update.strategies.update) {
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
            if (update.intelAdd.length > MAX_INTEL_PER_UPDATE) {
                console.warn(`[StrategyManager] intelAdd 超过单条上限 ${MAX_INTEL_PER_UPDATE}，已截断`);
            }
            for (const intel of update.intelAdd.slice(0, MAX_INTEL_PER_UPDATE)) {
                if (intel && typeof intel === 'object') {
                    const entry = {
                        id: 'intel_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                        text: String(intel.text || ''),
                        source: String(intel.source || '未知来源'),
                        reliability: ['rumor', 'confirmed', 'false'].includes(intel.reliability) ? intel.reliability : 'rumor',
                        tags: Array.isArray(intel.tags) ? intel.tags.map(String) : [],
                        discoveredAt: Date.now()
                    };
                    scene.intel.push(entry);
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
            if (!Array.isArray(scene.factions)) scene.factions = [];
            if (update.factionsUpdate.length > MAX_FACTIONS_PER_UPDATE) {
                console.warn(`[StrategyManager] factionsUpdate 超过单条上限 ${MAX_FACTIONS_PER_UPDATE}，已截断`);
            }
            for (const f of update.factionsUpdate.slice(0, MAX_FACTIONS_PER_UPDATE)) {
                if (!f || typeof f !== 'object' || !f.name) continue;
                const factionName = String(f.name).trim();
                if (!factionName) continue;
                const existing = scene.factions.find(x => String(x.name) === factionName);
                const changes = [];
                if (existing) {
                    if (f.attitude !== undefined) {
                        const before = Number.isFinite(Number(existing.attitude)) ? Number(existing.attitude) : 0;
                        const next = this._clampNumber(f.attitude, -100, 100, 0);
                        if (next !== before) changes.push(`态度 ${this._formatSignedChange(next - before)}（${next}）`);
                        existing.attitude = next;
                    }
                    if (f.power !== undefined) {
                        const before = Number.isFinite(Number(existing.power)) ? Number(existing.power) : 0;
                        const next = this._clampNumber(f.power, 0, 100, 0);
                        if (next !== before) changes.push(`实力 ${before}→${next}`);
                        existing.power = next;
                    }
                    if (f.description !== undefined) {
                        const before = String(existing.description || '');
                        const next = String(f.description || '').slice(0, 240);
                        if (next !== before) changes.push('描述更新');
                        existing.description = next;
                    }
                    if (Array.isArray(f.leverage)) {
                        const next = this._stringList(f.leverage, 20);
                        if (!this._sameStringList(existing.leverage, next)) changes.push(`筹码更新（${next.length}项）`);
                        existing.leverage = next;
                    }
                } else {
                    const leverage = Array.isArray(f.leverage) ? this._stringList(f.leverage, 20) : [];
                    scene.factions.push({
                        name: factionName,
                        attitude: this._clampNumber(f.attitude, -100, 100, 0),
                        power: this._clampNumber(f.power, 0, 100, 0),
                        description: String(f.description || '').slice(0, 240),
                        leverage
                    });
                    changes.push('新增势力');
                    if (leverage.length > 0) changes.push(`筹码 ${leverage.length} 项`);
                }
                if (changes.length) {
                    factionChanged = true;
                    this._recordStatePatchEvent(scene, '势力变化', `${factionName}：${changes.join('，')}`);
                }
            }
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
                if (!cu || typeof cu !== 'object' || !cu.characterId) continue;
                const char = State.characters.find(c => c.id === cu.characterId);
                if (!char) continue;
                const userName = scene.userName || State.settings.userName || '旅人';
                if (!char._relations) char._relations = {};
                if (!char._relations[userName]) {
                    char._relations[userName] = { affection: 0, trust: 0, suspicion: 0, fear: 0, debt: 0, leverage: [], mood: '平静', memories: [], history: [] };
                }
                const rel = char._relations[userName];
                if (!Array.isArray(rel.leverage)) rel.leverage = [];
                if (!Array.isArray(rel.memories)) rel.memories = [];
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
                    const list = Array.isArray(cu.leverageAdd) ? cu.leverageAdd : [cu.leverageAdd];
                    let added = 0;
                    list.map(String).filter(Boolean).forEach(item => {
                        if (!rel.leverage.includes(item)) {
                            rel.leverage.push(item);
                            added += 1;
                        }
                    });
                    rel.leverage = rel.leverage.slice(-20);
                    if (added > 0) visibleChanges.push(`新增筹码 ${added} 条`);
                }
                if (cu.memoryAdd !== undefined) {
                    const list = Array.isArray(cu.memoryAdd) ? cu.memoryAdd : [cu.memoryAdd];
                    let added = 0;
                    list.map(String).filter(Boolean).forEach(item => {
                        if (!rel.memories.includes(item)) {
                            rel.memories.push(item);
                            added += 1;
                        }
                    });
                    rel.memories = rel.memories.slice(-30);
                    if (added > 0) visibleChanges.push(`新增共同记忆 ${added} 条`);
                }
                if (cu.mood !== undefined) {
                    const mood = String(cu.mood).trim();
                    if (mood && mood !== rel.mood) visibleChanges.push(`心情：${mood}`);
                    rel.mood = mood || rel.mood || '平静';
                }
                if (cu.secret !== undefined) {
                    const secretStr = String(cu.secret).trim();
                    if (secretStr) {
                        if (!char.secrets) char.secrets = [];
                        if (!char.secrets.includes(secretStr)) {
                            char.secrets.push(secretStr);
                            if (char.secrets.length > 20) char.secrets.shift();
                        }
                    }
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
            if (typeof WorldEngine !== 'undefined') WorldEngine.checkFailureStates(scene, { type: 'quest' });
            if (typeof GroupChat !== 'undefined' && GroupChat._checkVictory) GroupChat._checkVictory();
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
            if (!Array.isArray(scene.locations)) scene.locations = [];
            if (update.locationUpdate.length > MAX_LOCATIONS_PER_UPDATE) {
                console.warn(`[StrategyManager] locationUpdate 超过单条上限 ${MAX_LOCATIONS_PER_UPDATE}，已截断`);
            }
            for (const loc of update.locationUpdate.slice(0, MAX_LOCATIONS_PER_UPDATE)) {
                if (!loc || typeof loc !== 'object' || !loc.id) continue;
                const locationId = String(loc.id).trim();
                if (!locationId) continue;
                const existing = scene.locations.find(l => String(l.id) === locationId);
                const changes = [];
                if (existing) {
                    if (loc.name) {
                        const next = String(loc.name).trim().slice(0, 80);
                        if (next && next !== existing.name) changes.push(`名称：${next}`);
                        if (next) existing.name = next;
                    }
                    if (loc.description !== undefined) {
                        const before = String(existing.description || '');
                        const next = String(loc.description || '').slice(0, 240);
                        if (next !== before) changes.push('描述更新');
                        existing.description = next;
                    }
                    if (loc.alertLevel !== undefined) {
                        const before = Number.isFinite(Number(existing.alertLevel)) ? Number(existing.alertLevel) : 0;
                        const next = this._clampNumber(loc.alertLevel, 0, 100, 0);
                        if (next !== before) changes.push(`警戒 ${before}→${next}`);
                        existing.alertLevel = next;
                    }
                    if (Array.isArray(loc.connections)) {
                        const next = this._stringList(loc.connections, 20);
                        if (!this._sameStringList(existing.connections, next)) changes.push(`出口更新（${next.length}处）`);
                        existing.connections = next;
                    }
                } else {
                    const connections = Array.isArray(loc.connections) ? this._stringList(loc.connections, 20) : [];
                    scene.locations.push({
                        id: locationId,
                        name: String(loc.name || locationId).trim().slice(0, 80) || locationId,
                        description: String(loc.description || '').slice(0, 240),
                        connections,
                        alertLevel: this._clampNumber(loc.alertLevel, 0, 100, 0)
                    });
                    changes.push('新增地点');
                    if (connections.length > 0) changes.push(`出口 ${connections.length} 处`);
                }
                if (changes.length) {
                    locAdded = true;
                    const displayName = String((existing || scene.locations.find(l => l.id === locationId))?.name || locationId);
                    this._recordStatePatchEvent(scene, '地图变化', `${displayName}：${changes.join('，')}`, 'movement');
                }
            }
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
        if (Array.isArray(data.effects) && typeof WorldEngine !== 'undefined') {
            const effects = data.effects.map(e => WorldEngine.normalizeItemEffect(e)).filter(Boolean);
            if (effects.length > 0) base.effects = effects.slice(0, 10);
        }
        if (data.uses !== undefined && Number.isFinite(Number(data.uses))) {
            base.uses = Math.max(0, Math.floor(Number(data.uses)));
            base.quantity = 1;
        }
        return typeof WorldEngine !== 'undefined' && WorldEngine.normalizeItem
            ? WorldEngine.normalizeItem(base)
            : base;
    },

    _clampNumber(value, min, max, fallback = 0) {
        const num = Number(value);
        if (!Number.isFinite(num)) return fallback;
        return Math.max(min, Math.min(max, num));
    },

    _stringList(value, limit = 20) {
        return (Array.isArray(value) ? value : [value])
            .map(item => String(item || '').trim())
            .filter(Boolean)
            .slice(0, limit);
    },

    _sameStringList(a, b) {
        const left = this._stringList(a, 200);
        const right = this._stringList(b, 200);
        if (left.length !== right.length) return false;
        return left.every((item, idx) => item === right[idx]);
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
