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
    inputMode: 'action',      // 'action' | 'strategy' | 'ask' | 'ooc'
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
        // 尝试从对话模式复用API Key
        try {
            const chatData = localStorage.getItem('deepseek_chat_data_v2');
            if (chatData) {
                const parsed = JSON.parse(chatData);
                if (parsed.apiKey && !this.settings.apiKey) {
                    this.settings.apiKey = parsed.apiKey;
                }
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
        if (!Array.isArray(scene.messages)) scene.messages = [];
        if (!Array.isArray(scene.lorebookEntries)) scene.lorebookEntries = [];
        if (!scene.playerStats) scene.playerStats = { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 };
        if (!Array.isArray(scene.quests)) scene.quests = [];
        if (!Array.isArray(scene.locations)) scene.locations = [];
        if (scene.currentLocation === undefined) scene.currentLocation = '';
        if (!Array.isArray(scene.inventory)) scene.inventory = [];
        if (!scene.equipment) scene.equipment = { weapon: null, armor: null, accessory: null };
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
        if (!Array.isArray(scene.storyArcs)) scene.storyArcs = [];
        return scene;
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
            // 桌游核心字段
            gold: 0,
            exp: 0,
            level: 1,
            attrPoints: 0,
            playerHp: 10,
            playerMaxHp: 10,
            gameState: 'playing',
            storyArcs: [],
            summary: '',
            // 计策系统字段
            strategies: [],
            intel: [],
            factions: [],
            conflictSeeds: [],
            worldTension: 0,
            activeStrategyId: null,
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

    // 防抖版本：高频调用时合并为一次写入。旧承诺立即 resolve，仅最后一次执行保存。
    _saveDebounceTimer: null,
    _saveDebounceResolve: null,
    async saveCurrentSceneDebounced(ms = 400) {
        clearTimeout(this._saveDebounceTimer);
        if (this._saveDebounceResolve) {
            this._saveDebounceResolve();
            this._saveDebounceResolve = null;
        }
        return new Promise(resolve => {
            this._saveDebounceResolve = resolve;
            this._saveDebounceTimer = setTimeout(async () => {
                this._saveDebounceResolve = null;
                await this.saveCurrentScene();
                resolve();
            }, ms);
        });
    },

    setCurrentScene(id) {
        this.currentSceneId = id;
        // 切换场景时重置模式切换
        this.isOOC = false;
        this.inputMode = 'action';
        this.emit('sceneChanged', this.scene);
    },

    setCurrentCharacter(id) {
        this.currentCharacterId = id;
        this.emit('characterSelected', this.character);
    },

    addCharacterToScene(charId) {
        const scene = this.scene;
        if (!scene) return;
        if (!scene.characters.includes(charId)) {
            scene.characters.push(charId);
            this.saveCurrentScene();
            this.emit('sceneChanged', scene);
        }
    },

    removeCharacterFromScene(charId) {
        const scene = this.scene;
        if (!scene) return;
        scene.characters = scene.characters.filter(id => id !== charId);
        this.saveCurrentScene();
        this.emit('sceneChanged', scene);
    }
};
