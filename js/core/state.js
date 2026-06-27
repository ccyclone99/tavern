/**
 * 全局状态管理
 */
const State = {
    // 运行时状态
    currentSceneId: null,
    currentCharacterId: null,
    selectedCharacterIds: [], // 群聊中已选角色
    isStreaming: false,
    isOOC: false,             // 是否OOC模式
    inputMode: 'talk',        // 'talk' | 'action' | 'strategy' | 'ask' | 'ooc'
    messageQueue: [],         // 群聊待回复队列
    editingCharacterId: null, // 当前编辑的角色

    // 缓存数据（从IndexedDB加载）
    characters: [],
    scenes: [],
    settings: {
        apiKey: '',
        model: 'deepseek-v4-flash',
        thinkingEnabled: true,
        backgroundUrl: '',
        userName: '旅人'
    },

    // 当前场景对象（内存中）
    get scene() {
        return this.scenes.find(s => s.id === this.currentSceneId) || null;
    },

    get character() {
        return this.characters.find(c => c.id === this.currentCharacterId) || null;
    },

    get activeCharacters() {
        const scene = this.scene;
        if (!scene) return [];
        return scene.characters.map(id => this.characters.find(c => c.id === id)).filter(Boolean);
    },

    canShowDebugSpoilers() {
        const settings = this.settings || {};
        if (settings.debugMode === true || settings.showCharacterSpoilers === true) return true;
        try {
            if (typeof localStorage !== 'undefined') {
                const flag = localStorage.getItem('tavern_show_character_spoilers') || localStorage.getItem('tavern_debug');
                if (['1', 'true', 'yes', 'on'].includes(String(flag || '').toLowerCase())) return true;
            }
        } catch (e) {}
        try {
            if (typeof location !== 'undefined' && location.search && typeof URLSearchParams !== 'undefined') {
                const params = new URLSearchParams(location.search);
                return params.get('debug') === '1' || params.get('spoilers') === '1';
            }
        } catch (e) {}
        return false;
    },

    // 监听器
    _listeners: {},

    on(event, handler) {
        if (!this._listeners[event]) this._listeners[event] = [];
        this._listeners[event].push(handler);
    },

    off(event, handler) {
        if (!this._listeners[event]) return;
        this._listeners[event] = this._listeners[event].filter(h => h !== handler);
    },

    emit(event, data) {
        if (!this._listeners[event]) return;
        this._listeners[event].forEach(h => {
            try { h(data); } catch (e) { console.error(e); }
        });
    },

    // 持久化设置
    async loadSettings() {
        const s = await Storage.getSettings();
        this.settings = { ...this.settings, ...s };
        // 尝试从对话模式复用 API Key，迁移后立即清理 localStorage 并持久化到 IndexedDB
        try {
            const chatData = localStorage.getItem('deepseek_chat_data_v2');
            if (chatData) {
                const parsed = JSON.parse(chatData);
                if (parsed.apiKey && !this.settings.apiKey) {
                    this.settings.apiKey = parsed.apiKey;
                    await Storage.saveSettings(this.settings);
                }
                localStorage.removeItem('deepseek_chat_data_v2');
            }
        } catch (e) {}
    },

    async saveSettings() {
        await Storage.saveSettings(this.settings);
    },

    async loadCharacters() {
        this.characters = await Storage.getCharacters();
        this.emit('charactersChanged', this.characters);
    },

    async loadScenes() {
        this.scenes = await Storage.getScenes();
        // 补齐旧存档字段，避免新增字段导致报错
        this.scenes.forEach(scene => this.normalizeScene(scene));
        this.emit('scenesChanged', this.scenes);
    },

    /**
     * 补齐场景对象中可能缺失的字段，用于旧存档兼容
     */
    normalizeScene(scene) {
        if (!scene) return scene;
        if (!Array.isArray(scene.strategies)) scene.strategies = [];
        if (!Array.isArray(scene.intel)) scene.intel = [];
        if (!Array.isArray(scene.factions)) scene.factions = [];
        if (!Array.isArray(scene.conflictSeeds)) scene.conflictSeeds = [];
        if (typeof scene.worldTension !== 'number') scene.worldTension = 0;
        if (scene.activeStrategyId === undefined) scene.activeStrategyId = null;
        if (scene.pendingAction === undefined) scene.pendingAction = null;
        if (scene.pendingCheck === undefined) scene.pendingCheck = null;
        if (!scene.inputContext || typeof scene.inputContext !== 'object') {
            scene.inputContext = { state: 'idle', prompt: '', suggestions: [], lastIntentId: '' };
        }
        if (!Array.isArray(scene.inputContext.suggestions)) scene.inputContext.suggestions = [];
        if (!Array.isArray(scene.messages)) scene.messages = [];
        if (!Array.isArray(scene.lorebookEntries)) scene.lorebookEntries = [];
        if (!scene.playerStats) scene.playerStats = { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };
        if (!Array.isArray(scene.quests)) scene.quests = [];
        if (!Array.isArray(scene.locations)) scene.locations = [];
        if (scene.currentLocation === undefined) scene.currentLocation = '';
        if (!Array.isArray(scene.inventory)) scene.inventory = [];
        if (!scene.equipment) scene.equipment = { weapon: null, armor: null, accessory: null };
        if (!scene.equipmentRefs) scene.equipmentRefs = { weapon: null, armor: null, accessory: null };
        if (!Array.isArray(scene.snapshots)) scene.snapshots = [];
        if (!scene.characters) scene.characters = [];
        // 桌游核心字段（HP/经济/成长/结局）
        if (typeof scene.gold !== 'number') scene.gold = 0;
        if (typeof scene.exp !== 'number') scene.exp = 0;
        if (typeof scene.level !== 'number') scene.level = 1;
        if (typeof scene.attrPoints !== 'number') scene.attrPoints = 0;
        if (typeof scene.playerHp !== 'number') {
            // 旧存档：按体质推算 HP
            const con = (scene.playerStats && scene.playerStats.constitution) || 10;
            scene.playerHp = 10 + Math.floor((con - 10) / 2) * 4;
        }
        if (typeof scene.playerMaxHp !== 'number') {
            const con = (scene.playerStats && scene.playerStats.constitution) || 10;
            scene.playerMaxHp = 10 + Math.floor((con - 10) / 2) * 4;
        }
        if (!scene.gameState) scene.gameState = 'playing';
        if (scene.gameState !== 'playing') {
            scene.pendingAction = null;
            scene.pendingCheck = null;
            scene.inputContext.state = 'ended';
        }
        if (!Array.isArray(scene.storyArcs)) scene.storyArcs = [];
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
        if (!scene.gameplayProfile || typeof scene.gameplayProfile !== 'object') scene.gameplayProfile = {};
        if (!scene.storyTexture || typeof scene.storyTexture !== 'object') {
            scene.storyTexture = { tone: '', sensory: [], motifs: [], dramaticQuestions: [], npcBeats: [], sceneRules: [] };
        }
        if (!scene.questProgressGuards || typeof scene.questProgressGuards !== 'object') {
            scene.questProgressGuards = { autoAdvanceStreak: 0, lastAdvancedAt: 0 };
        }
        if (scene.runRecord && typeof scene.runRecord !== 'object') scene.runRecord = null;
        if (!Array.isArray(scene.clocks)) scene.clocks = [];
        if (!Array.isArray(scene.counterStrategies)) scene.counterStrategies = [];
        if (!scene.flowGuide || typeof scene.flowGuide !== 'object') {
            scene.flowGuide = { openingMoves: [], sessionGoals: [], stalledPrompts: [], failForward: [], completedMoves: [], lastProgressTurn: 0, lastSoftMoveTurn: 0 };
        }
        if (!scene.currentSituation || typeof scene.currentSituation !== 'object') {
            scene.currentSituation = { recentRisks: [], recommendedActions: [] };
        }
        if (typeof scene.turnCount !== 'number') scene.turnCount = 0;
        scene.inventory.forEach(item => {
            if (typeof WorldEngine !== 'undefined') WorldEngine.normalizeItem(item);
            else {
                if (!Array.isArray(item.tags)) item.tags = [];
                if (!Array.isArray(item.effects)) item.effects = [];
            }
        });
        if (typeof WorldEngine !== 'undefined') WorldEngine.normalizeScene(scene);
        this.normalizeKnowledge(scene);
        return scene;
    },

    normalizeKnowledge(scene) {
        if (!scene) return scene;
        if (!scene.knowledge || typeof scene.knowledge !== 'object') scene.knowledge = {};
        const knowledgeArrays = ['discoveries', 'suspicions', 'evidence', 'debts', 'leverage', 'unresolvedQuestions'];
        knowledgeArrays.forEach(key => {
            if (!Array.isArray(scene.knowledge[key])) scene.knowledge[key] = [];
        });
        if (!scene.discoveries || typeof scene.discoveries !== 'object') scene.discoveries = {};
        if (!scene.discoveries.characters || typeof scene.discoveries.characters !== 'object') {
            scene.discoveries.characters = {};
        }

        // 旧存档/旧模板中的 scene.intel 视为玩家已知情报，迁移到知识账本展示。
        const existingLegacyIds = new Set(scene.knowledge.discoveries.map(d => d.legacyIntelId).filter(Boolean));
        (scene.intel || []).forEach(intel => {
            if (!intel || !intel.text) return;
            const legacyIntelId = intel.id || intel.text;
            if (existingLegacyIds.has(legacyIntelId)) return;
            this.addKnowledgeDiscovery(scene, {
                legacyIntelId,
                subjectType: 'event',
                level: intel.reliability === 'confirmed' ? 'evidence' : 'rumor',
                title: intel.text,
                text: intel.text,
                source: intel.source || '未知来源',
                reliability: intel.reliability === 'confirmed' ? 'confirmed' : (intel.reliability === 'false' ? 'false' : 'unverified'),
                tags: Array.isArray(intel.tags) ? intel.tags : []
            });
            existingLegacyIds.add(legacyIntelId);
        });
        return scene;
    },

    addKnowledgeDiscovery(scene, data = {}) {
        if (!scene) return null;
        if (!scene.knowledge || !Array.isArray(scene.knowledge.discoveries)) {
            if (!scene.knowledge || typeof scene.knowledge !== 'object') scene.knowledge = {};
            scene.knowledge.discoveries = [];
        }
        const validLevels = ['hint', 'rumor', 'evidence', 'inference', 'truth'];
        const validReliability = ['unverified', 'contested', 'confirmed', 'false'];
        const entry = {
            id: data.id || 'disc_' + Date.now() + '_' + Math.random().toString(36).slice(2, 6),
            legacyIntelId: data.legacyIntelId,
            subjectType: String(data.subjectType || 'event'),
            subjectId: data.subjectId ? String(data.subjectId) : '',
            level: validLevels.includes(data.level) ? data.level : 'hint',
            title: String(data.title || data.text || '未命名线索').slice(0, 120),
            text: String(data.text || data.title || '').slice(0, 1000),
            source: String(data.source || '未知来源').slice(0, 120),
            reliability: validReliability.includes(data.reliability) ? data.reliability : 'unverified',
            tags: Array.isArray(data.tags) ? data.tags.map(String).slice(0, 12) : [],
            evidenceIds: Array.isArray(data.evidenceIds) ? data.evidenceIds.map(String).slice(0, 20) : [],
            discoveredAt: typeof data.discoveredAt === 'number' ? data.discoveredAt : Date.now()
        };
        const existing = scene.knowledge.discoveries.find(item => {
            if (!item) return false;
            if (entry.id && item.id === entry.id) return true;
            if (entry.legacyIntelId && item.legacyIntelId === entry.legacyIntelId) return true;
            return entry.evidenceIds.length > 0 &&
                Array.isArray(item.evidenceIds) &&
                item.evidenceIds.some(id => entry.evidenceIds.includes(id));
        });
        if (existing) {
            existing.id = existing.id || entry.id;
            existing.legacyIntelId = existing.legacyIntelId || entry.legacyIntelId;
            if (data.subjectType !== undefined) existing.subjectType = entry.subjectType;
            if (data.subjectId !== undefined) existing.subjectId = entry.subjectId;
            if (validLevels.includes(data.level)) existing.level = entry.level;
            if (data.title !== undefined || data.text !== undefined) existing.title = entry.title;
            if (data.text !== undefined || data.title !== undefined) existing.text = entry.text;
            if (data.source !== undefined) existing.source = entry.source;
            if (validReliability.includes(data.reliability)) existing.reliability = entry.reliability;
            existing.tags = [...new Set([...(existing.tags || []), ...entry.tags])].slice(0, 12);
            existing.evidenceIds = [...new Set([...(existing.evidenceIds || []), ...entry.evidenceIds])].slice(0, 20);
            existing.discoveredAt = Math.min(Number(existing.discoveredAt || entry.discoveredAt), entry.discoveredAt);
            existing.updatedAt = Date.now();
            return existing;
        }
        scene.knowledge.discoveries.push(entry);
        return entry;
    },

    async createScene(name = '新场景') {
        const scene = {
            id: 'scene_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            name,
            background: '',
            characters: [],
            userName: this.settings.userName || '旅人',
            playerPersona: null,
            dmPersona: null,
            messages: [],
            lorebookEntries: [],
            // 角色扮演规则层
            playerStats: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
            quests: [],
            locations: [],
            currentLocation: '',
            inventory: [],
            equipment: { weapon: null, armor: null, accessory: null },
            equipmentRefs: { weapon: null, armor: null, accessory: null },
            // 桌游核心字段
            gold: 0,
            exp: 0,
            level: 1,
            attrPoints: 0,
            playerHp: 10,
            playerMaxHp: 10,
            gameState: 'playing',
            storyArcs: [],
            storyPhases: [],
            clueGraph: [],
            consequenceLedger: [],
            eventLog: [],
            failureStates: [],
            gameplayProfile: {},
            storyTexture: { tone: '', sensory: [], motifs: [], dramaticQuestions: [], npcBeats: [], sceneRules: [] },
            flowGraph: { nodes: [], revelations: [] },
            sceneChallenges: [],
            evidenceLedger: [],
            companionResources: [],
            explorationRewardLog: [],
            pendingExplorationRewards: [],
            questProgressGuards: { autoAdvanceStreak: 0, lastAdvancedAt: 0 },
            runRecord: null,
            runHistory: [],
            transcriptLog: [],
            clocks: [],
            counterStrategies: [],
            flowGuide: { openingMoves: [], sessionGoals: [], stalledPrompts: [], failForward: [], completedMoves: [], lastProgressTurn: 0, lastSoftMoveTurn: 0 },
            currentSituation: { recentRisks: [], recommendedActions: [] },
            turnCount: 0,
            summary: '',
            // 计策系统字段
            strategies: [],
            intel: [],
            knowledge: {
                discoveries: [],
                suspicions: [],
                evidence: [],
                debts: [],
                leverage: [],
                unresolvedQuestions: []
            },
            discoveries: { characters: {} },
            factions: [],
            conflictSeeds: [],
            worldTension: 0,
            activeStrategyId: null,
            pendingAction: null,
            pendingCheck: null,
            inputContext: { state: 'idle', prompt: '', suggestions: [], lastIntentId: '' },
            createdAt: Date.now(),
            updatedAt: Date.now(),
            snapshots: []
        };
        await Storage.saveScene(scene);
        this.scenes.push(scene);
        this.currentSceneId = scene.id;
        this.emit('sceneChanged', scene);
        return scene;
    },

    async saveCurrentScene() {
        const scene = this.scene;
        if (scene) {
            scene.updatedAt = Date.now();
            await Storage.saveScene(scene);
        }
    },

    // 防抖版本：高频调用时合并为一次写入。所有在最终保存前发起的调用都共享同一个 Promise。
    _saveDebounceTimer: null,
    _saveDebouncePromise: null,
    _saveDebounceResolve: null,
    async saveCurrentSceneDebounced(ms = 400) {
        clearTimeout(this._saveDebounceTimer);
        // 如果已有待执行的保存 Promise，直接复用，保证调用方等待的是最终一次保存
        if (this._saveDebouncePromise) {
            this._saveDebounceTimer = setTimeout(() => this._runDebouncedSave(), ms);
            return this._saveDebouncePromise;
        }
        this._saveDebouncePromise = new Promise(resolve => {
            this._saveDebounceResolve = resolve;
        });
        this._saveDebounceTimer = setTimeout(() => this._runDebouncedSave(), ms);
        return this._saveDebouncePromise;
    },

    async _runDebouncedSave() {
        const resolve = this._saveDebounceResolve;
        this._saveDebounceTimer = null;
        this._saveDebounceResolve = null;
        this._saveDebouncePromise = null;
        try {
            await this.saveCurrentScene();
        } catch (e) {
            console.warn('Debounced scene save failed:', e);
        }
        if (resolve) resolve();
    },

    setCurrentScene(id) {
        this.currentSceneId = id;
        // 切换场景时重置模式切换
        this.isOOC = false;
        this.inputMode = 'talk';
        this.emit('sceneChanged', this.scene);
    },

    setCurrentCharacter(id) {
        this.currentCharacterId = id;
        this.emit('characterSelected', this.character);
    },

    addCharacterToScene(charId) {
        const scene = this.scene;
        if (!scene) return { ok: false, message: '没有可用场景。' };
        if (!Array.isArray(scene.characters)) scene.characters = [];

        if (typeof WorldEngine !== 'undefined' && WorldEngine.addExistingCharacterToScene) {
            const result = WorldEngine.addExistingCharacterToScene(scene, charId);
            if (result.ok) {
                this.saveCurrentScene().catch(e => console.warn('添加角色保存失败:', e));
                this.emit('sceneChanged', scene);
            } else if (!result.duplicate && typeof showToast !== 'undefined') {
                showToast(result.message || '角色未加入场景。');
            }
            return result;
        }

        if (scene.gameState && scene.gameState !== 'playing') {
            const message = '当前冒险已经结束，不能改变在场角色。';
            if (typeof showToast !== 'undefined') showToast(message);
            return { ok: false, message };
        }
        if (!scene.characters.includes(charId)) {
            scene.characters.push(charId);
            this.saveCurrentScene().catch(e => console.warn('添加角色保存失败:', e));
            this.emit('sceneChanged', scene);
            return { ok: true, charId };
        }
        return { ok: false, duplicate: true, message: '角色已经在场。' };
    },

    removeCharacterFromScene(charId) {
        const scene = this.scene;
        if (!scene) return { ok: false, message: '没有可用场景。' };
        if (!Array.isArray(scene.characters)) scene.characters = [];

        if (typeof WorldEngine !== 'undefined' && WorldEngine.removeCharacterFromScene) {
            const result = WorldEngine.removeCharacterFromScene(scene, charId);
            if (result.ok) {
                this.saveCurrentScene().catch(e => console.warn('移除角色保存失败:', e));
                this.emit('sceneChanged', scene);
            } else if (!result.duplicate && typeof showToast !== 'undefined') {
                showToast(result.message || '角色未离开场景。');
            }
            return result;
        }

        if (scene.gameState && scene.gameState !== 'playing') {
            const message = '当前冒险已经结束，不能改变在场角色。';
            if (typeof showToast !== 'undefined') showToast(message);
            return { ok: false, message };
        }
        if (!scene.characters.includes(charId)) return { ok: false, duplicate: true, message: '角色不在当前场景。' };
        scene.characters = scene.characters.filter(id => id !== charId);
        this.saveCurrentScene().catch(e => console.warn('移除角色保存失败:', e));
        this.emit('sceneChanged', scene);
        return { ok: true, charId };
    }
};
