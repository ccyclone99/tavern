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
            counterplay: []
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
        return strategy;
    },

    /**
     * 解析并白名单应用 AI 的状态补丁
     * 不支持 AI 任意覆盖 State，禁止修改 settings、apiKey、DOM 字段等
     */
    applyStateUpdate(update) {
        const scene = State.scene;
        if (!scene) return;
        if (!update || typeof update !== 'object') return;

        // 单条补丁上限，防止 AI 回复胀大存储
        const MAX_INTEL_PER_UPDATE = 10;
        const MAX_FACTIONS_PER_UPDATE = 20;
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
        let counterChanged = false;
        let agendaChanged = false;

        // 1. strategies.create / update
        if (update.strategies && typeof update.strategies === 'object') {
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
        if (Array.isArray(update.knowledgeAdd)) {
            if (update.knowledgeAdd.length > MAX_INTEL_PER_UPDATE) {
                console.warn(`[StrategyManager] knowledgeAdd 超过单条上限 ${MAX_INTEL_PER_UPDATE}，已截断`);
            }
            for (const item of update.knowledgeAdd.slice(0, MAX_INTEL_PER_UPDATE)) {
                if (!item || typeof item !== 'object') continue;
                const added = State.addKnowledgeDiscovery(scene, item);
                if (added) knowledgeAdded = true;
            }
        }

        if (Array.isArray(update.intelAdd)) {
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

        if (Array.isArray(update.discoveryUpdate)) {
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
        if (Array.isArray(update.clockUpdate) && typeof WorldEngine !== 'undefined') {
            const result = WorldEngine.applyClockUpdate(scene, update.clockUpdate);
            clockChanged = !!result.changed;
            if (result.triggered?.length) knowledgeAdded = true;
        }

        if (Array.isArray(update.storyArcUpdate) && typeof WorldEngine !== 'undefined') {
            storyChanged = WorldEngine.applyStoryArcUpdate(scene, update.storyArcUpdate);
        }

        if (Array.isArray(update.storyPhaseUpdate) && typeof WorldEngine !== 'undefined') {
            phaseChanged = WorldEngine.applyStoryPhaseUpdate(scene, update.storyPhaseUpdate);
        }

        if (Array.isArray(update.clueUpdate) && typeof WorldEngine !== 'undefined') {
            clueChanged = WorldEngine.applyClueUpdate(scene, update.clueUpdate);
        }

        if (Array.isArray(update.counterStrategyUpdate) && typeof WorldEngine !== 'undefined') {
            counterChanged = WorldEngine.applyCounterStrategyUpdate(scene, update.counterStrategyUpdate);
        }

        if (Array.isArray(update.npcAgendaUpdate) && typeof WorldEngine !== 'undefined') {
            agendaChanged = WorldEngine.applyNpcAgendaUpdate(update.npcAgendaUpdate);
        }

        // 3. factionsUpdate
        if (Array.isArray(update.factionsUpdate)) {
            if (update.factionsUpdate.length > MAX_FACTIONS_PER_UPDATE) {
                console.warn(`[StrategyManager] factionsUpdate 超过单条上限 ${MAX_FACTIONS_PER_UPDATE}，已截断`);
            }
            for (const f of update.factionsUpdate.slice(0, MAX_FACTIONS_PER_UPDATE)) {
                if (!f || typeof f !== 'object' || !f.name) continue;
                const existing = scene.factions.find(x => x.name === f.name);
                if (existing) {
                    if (f.attitude !== undefined) existing.attitude = Number.isFinite(Number(f.attitude)) ? Number(f.attitude) : 0;
                    if (f.power !== undefined) existing.power = Number.isFinite(Number(f.power)) ? Number(f.power) : 0;
                    if (f.description !== undefined) existing.description = String(f.description || '');
                    if (Array.isArray(f.leverage)) existing.leverage = f.leverage.map(String);
                } else {
                    scene.factions.push({
                        name: String(f.name),
                        attitude: Number.isFinite(Number(f.attitude)) ? Number(f.attitude) : 0,
                        power: Number.isFinite(Number(f.power)) ? Number(f.power) : 0,
                        description: String(f.description || ''),
                        leverage: Array.isArray(f.leverage) ? f.leverage.map(String) : []
                    });
                }
            }
        }

        // 4. characterUpdates（仅允许修改关系/警觉/秘密等安全字段）
        if (Array.isArray(update.characterUpdates)) {
            for (const cu of update.characterUpdates) {
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
                ['affection', 'trust', 'suspicion', 'fear', 'debt'].forEach(key => {
                    const deltaKey = key + 'Delta';
                    if (cu[deltaKey] === undefined) return;
                    const base = Number.isFinite(Number(rel[key])) ? Number(rel[key]) : 0;
                    const delta = Number.isFinite(Number(cu[deltaKey])) ? Number(cu[deltaKey]) : 0;
                    rel[key] = Math.max(-100, Math.min(100, base + delta));
                });
                if (cu.leverageAdd !== undefined) {
                    const list = Array.isArray(cu.leverageAdd) ? cu.leverageAdd : [cu.leverageAdd];
                    list.map(String).filter(Boolean).forEach(item => {
                        if (!rel.leverage.includes(item)) rel.leverage.push(item);
                    });
                    rel.leverage = rel.leverage.slice(-20);
                }
                if (cu.memoryAdd !== undefined) {
                    const list = Array.isArray(cu.memoryAdd) ? cu.memoryAdd : [cu.memoryAdd];
                    list.map(String).filter(Boolean).forEach(item => {
                        if (!rel.memories.includes(item)) rel.memories.push(item);
                    });
                    rel.memories = rel.memories.slice(-30);
                }
                if (cu.mood !== undefined) rel.mood = String(cu.mood);
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
                Storage.saveCharacter(char).catch(e => console.warn('保存角色关系失败:', e));
            }
            State.emit('charactersChanged', State.characters);
        }

        // 5. scene 字段（仅白名单）
        if (update.scene && typeof update.scene === 'object') {
            if (typeof update.scene.worldTensionDelta === 'number') {
                const base = Number.isFinite(Number(scene.worldTension)) ? Number(scene.worldTension) : 0;
                const delta = Number.isFinite(Number(update.scene.worldTensionDelta)) ? Number(update.scene.worldTensionDelta) : 0;
                scene.worldTension = base + delta;
            }
            if (typeof update.scene.activeStrategyId === 'string') {
                const target = scene.strategies.find(s => s.id === update.scene.activeStrategyId);
                if (target) scene.activeStrategyId = update.scene.activeStrategyId;
            }
        }

        // 6. 任务/物品/地点的轻量更新（仍走现有系统，避免重复逻辑）
        const validQuestStatuses = ['active', 'completed', 'failed', 'abandoned'];
        if (Array.isArray(update.questsUpdate)) {
            for (const qu of update.questsUpdate) {
                if (!qu || typeof qu !== 'object' || !qu.questId) continue;
                const quest = scene.quests.find(q => q.id === qu.questId);
                if (!quest) continue;
                if (qu.objectiveIdx !== undefined && quest.objectives[qu.objectiveIdx]) {
                    quest.objectives[qu.objectiveIdx].completed = true;
                }
                if (qu.status && validQuestStatuses.includes(qu.status)) quest.status = qu.status;
            }
        }

        if (Array.isArray(update.itemAdd)) {
            if (update.itemAdd.length > MAX_ITEMS_PER_UPDATE) {
                console.warn(`[StrategyManager] itemAdd 超过单条上限 ${MAX_ITEMS_PER_UPDATE}，已截断`);
            }
            for (const it of update.itemAdd.slice(0, MAX_ITEMS_PER_UPDATE)) {
                if (!it || typeof it !== 'object' || !it.name) continue;
                const existing = scene.inventory.find(i => i.name === it.name);
                const qtyRaw = Number(it.quantity);
                const qty = Number.isFinite(qtyRaw) && qtyRaw >= 0 ? qtyRaw : 1;
                if (existing) {
                    existing.quantity += qty;
                    if (Array.isArray(it.tags)) existing.tags = [...new Set([...(existing.tags || []), ...it.tags.map(String)])].slice(0, 12);
                    if (Array.isArray(it.effects) && typeof WorldEngine !== 'undefined') {
                        existing.effects = [
                            ...(existing.effects || []),
                            ...it.effects.map(e => WorldEngine.normalizeItemEffect(e)).filter(Boolean)
                        ].slice(0, 10);
                    }
                    if (it.uses !== undefined && Number.isFinite(Number(it.uses))) existing.uses = Math.max(0, Math.floor(Number(it.uses)));
                    if (typeof WorldEngine !== 'undefined') WorldEngine.normalizeItem(existing);
                } else if (qty <= 0) {
                    continue;
                } else if (scene.inventory.length < MAX_TOTAL_INVENTORY) {
                    scene.inventory.push({
                        id: 'item_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
                        name: String(it.name),
                        description: String(it.description || ''),
                        type: ['weapon', 'armor', 'consumable', 'quest', 'misc'].includes(it.type) ? it.type : 'misc',
                        quantity: qty,
                        equipped: false,
                        tags: Array.isArray(it.tags) ? it.tags.map(String).slice(0, 12) : [],
                        effects: Array.isArray(it.effects) && typeof WorldEngine !== 'undefined'
                            ? it.effects.map(e => WorldEngine.normalizeItemEffect(e)).filter(Boolean).slice(0, 10)
                            : [],
                        uses: it.uses !== undefined && Number.isFinite(Number(it.uses)) ? Math.max(0, Math.floor(Number(it.uses))) : undefined
                    });
                    if (typeof WorldEngine !== 'undefined') WorldEngine.normalizeItem(scene.inventory[scene.inventory.length - 1]);
                } else {
                    console.warn(`[StrategyManager] 背包已达上限 ${MAX_TOTAL_INVENTORY}，停止新增物品`);
                    break;
                }
                itemAdded = true;
            }
        }

        if (Array.isArray(update.locationUpdate)) {
            if (update.locationUpdate.length > MAX_LOCATIONS_PER_UPDATE) {
                console.warn(`[StrategyManager] locationUpdate 超过单条上限 ${MAX_LOCATIONS_PER_UPDATE}，已截断`);
            }
            for (const loc of update.locationUpdate.slice(0, MAX_LOCATIONS_PER_UPDATE)) {
                if (!loc || typeof loc !== 'object' || !loc.id) continue;
                const existing = scene.locations.find(l => l.id === loc.id);
                if (existing) {
                    if (loc.name) existing.name = String(loc.name);
                    if (loc.description !== undefined) existing.description = String(loc.description || '');
                    if (loc.alertLevel !== undefined) existing.alertLevel = Number.isFinite(Number(loc.alertLevel)) ? Number(loc.alertLevel) : 0;
                } else {
                    scene.locations.push({
                        id: String(loc.id),
                        name: String(loc.name || loc.id),
                        description: String(loc.description || ''),
                        connections: Array.isArray(loc.connections) ? loc.connections.map(String) : [],
                        alertLevel: Number.isFinite(Number(loc.alertLevel)) ? Number(loc.alertLevel) : 0
                    });
                }
                locAdded = true;
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
        if (discoveryChanged) SidebarRight.markTabNew('detail');
        if (itemAdded) SidebarRight.markTabNew('inventory');
        if (locAdded) SidebarRight.markTabNew('map');
        if (clockChanged || storyChanged || phaseChanged || clueChanged || counterChanged || agendaChanged) SidebarRight.markTabNew('situation');
    }
};
