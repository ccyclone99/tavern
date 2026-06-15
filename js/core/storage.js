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
        return { characters: chars, scenes, settings, exportedAt: Date.now() };
    },

    async importAll(data) {
        if (data.characters) {
            for (const c of data.characters) await this.put('characters', c);
        }
        if (data.scenes) {
            for (const s of data.scenes) await this.put('scenes', s);
        }
        if (data.settings) {
            await this.put('settings', { key: 'main', value: data.settings });
        }
    }
};
