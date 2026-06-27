/**
 * IndexedDB 存储层
 * 存储角色卡、场景、聊天记录、设置
 */
const DB_NAME = 'tavern_db';
const DB_VERSION = 1;

const Storage = {
    db: null,

    async init() {
        return new Promise((resolve, reject) => {
            const req = indexedDB.open(DB_NAME, DB_VERSION);
            req.onerror = () => reject(req.error);
            req.onsuccess = () => { this.db = req.result; resolve(); };
            req.onupgradeneeded = (e) => {
                const db = e.target.result;
                if (!db.objectStoreNames.contains('characters')) {
                    db.createObjectStore('characters', { keyPath: 'id' });
                }
                if (!db.objectStoreNames.contains('scenes')) {
                    const s = db.createObjectStore('scenes', { keyPath: 'id' });
                    s.createIndex('updatedAt', 'updatedAt', { unique: false });
                }
                if (!db.objectStoreNames.contains('settings')) {
                    db.createObjectStore('settings', { keyPath: 'key' });
                }
                if (!db.objectStoreNames.contains('snapshots')) {
                    db.createObjectStore('snapshots', { keyPath: 'id' });
                }
            };
        });
    },

    async get(store, key) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(store, 'readonly');
            const req = tx.objectStore(store).get(key);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    async getAll(store) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(store, 'readonly');
            const req = tx.objectStore(store).getAll();
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    async put(store, data) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(store, 'readwrite');
            const req = tx.objectStore(store).put(data);
            req.onsuccess = () => resolve(req.result);
            req.onerror = () => reject(req.error);
        });
    },

    async delete(store, key) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(store, 'readwrite');
            const req = tx.objectStore(store).delete(key);
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    },

    async clear(store) {
        return new Promise((resolve, reject) => {
            const tx = this.db.transaction(store, 'readwrite');
            const req = tx.objectStore(store).clear();
            req.onsuccess = () => resolve();
            req.onerror = () => reject(req.error);
        });
    },

    async clearAll() {
        await this.clear('characters');
        await this.clear('scenes');
        await this.clear('settings');
        await this.clear('snapshots');
    },

    // ===== 便捷方法 =====
    async getSettings() {
        const raw = await this.get('settings', 'main');
        return raw ? raw.value : {};
    },

    async saveSettings(value) {
        await this.put('settings', { key: 'main', value });
    },

    async getCharacters() {
        return this.getAll('characters');
    },

    async saveCharacter(char) {
        await this.put('characters', char);
    },

    async deleteCharacter(id) {
        await this.delete('characters', id);
    },

    async getScenes() {
        return this.getAll('scenes');
    },

    async saveScene(scene) {
        scene.updatedAt = Date.now();
        await this.put('scenes', scene);
    },

    async deleteScene(id) {
        await this.delete('scenes', id);
    },

    async exportAll() {
        const chars = await this.getAll('characters');
        const scenes = await this.getAll('scenes');
        const settings = await this.getSettings();
        // 导出备份时剔除 API Key，避免明文泄露
        const exportSettings = { ...settings, apiKey: '' };
        return { characters: chars, scenes, settings: exportSettings, exportedAt: Date.now() };
    },

    async importAll(data) {
        if (data.characters) {
            for (const c of data.characters) await this.put('characters', c);
        }
        if (data.scenes) {
            for (const s of data.scenes) {
                const scene = this._normalizeImportedScene(s);
                if (scene) await this.put('scenes', scene);
            }
        }
        if (data.settings) {
            const current = await this.getSettings();
            const merged = { ...current, ...data.settings };
            // 若导入的备份 key 为空（如 exportAll 导出的），保留本地已有 key
            if (!merged.apiKey) merged.apiKey = current.apiKey || '';
            await this.put('settings', { key: 'main', value: merged });
        }
    },

    _normalizeImportedScene(scene) {
        if (!scene || typeof scene !== 'object') return null;
        const normalized = JSON.parse(JSON.stringify(scene));
        if (typeof State !== 'undefined' && State.normalizeScene) {
            return State.normalizeScene(normalized);
        }
        if (!Array.isArray(normalized.messages)) normalized.messages = [];
        if (!Array.isArray(normalized.inventory)) normalized.inventory = [];
        if (!normalized.equipment || typeof normalized.equipment !== 'object') {
            normalized.equipment = { weapon: null, armor: null, accessory: null };
        }
        if (!normalized.equipmentRefs || typeof normalized.equipmentRefs !== 'object') {
            normalized.equipmentRefs = { weapon: null, armor: null, accessory: null };
        }
        if (!Array.isArray(normalized.explorationRewardLog)) normalized.explorationRewardLog = [];
        if (!Array.isArray(normalized.pendingExplorationRewards)) normalized.pendingExplorationRewards = [];
        if (!normalized.inputContext || typeof normalized.inputContext !== 'object') {
            normalized.inputContext = { state: 'idle', prompt: '', suggestions: [], lastIntentId: '' };
        }
        if (!Array.isArray(normalized.inputContext.suggestions)) normalized.inputContext.suggestions = [];
        if (!normalized.gameState) normalized.gameState = 'playing';
        return normalized;
    }
};
