const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadStorage(context = {}) {
    const code = fs.readFileSync(path.join(root, 'js/core/storage.js'), 'utf8') + '\nthis.Storage = Storage;';
    vm.runInNewContext(code, context, { filename: 'js/core/storage.js' });
    return context.Storage;
}

async function testImportNormalizesScenesAndPreservesLocalApiKey() {
    const writes = [];
    const context = {
        console,
        State: {
            normalizeScene(scene) {
                if (!Array.isArray(scene.inventory)) scene.inventory = [];
                if (!scene.equipmentRefs) scene.equipmentRefs = { weapon: null, armor: null, accessory: null };
                if (!Array.isArray(scene.pendingExplorationRewards)) scene.pendingExplorationRewards = [];
                if (!scene.inputContext) scene.inputContext = { state: 'idle', prompt: '', suggestions: [], lastIntentId: '' };
                scene.normalizedByState = true;
                return scene;
            }
        }
    };
    const Storage = loadStorage(context);
    Storage.put = async (store, data) => writes.push({ store, data });
    Storage.getSettings = async () => ({ apiKey: 'local-key', model: 'local-model' });

    await Storage.importAll({
        scenes: [{
            id: 'old_scene',
            name: '旧备份',
            equipment: { weapon: '短剑' }
        }],
        settings: {
            apiKey: '',
            model: 'imported-model'
        }
    });

    const sceneWrite = writes.find(write => write.store === 'scenes');
    assert.ok(sceneWrite, 'scene should be imported');
    assert.strictEqual(sceneWrite.data.normalizedByState, true);
    assert.strictEqual(JSON.stringify(sceneWrite.data.equipmentRefs), JSON.stringify({ weapon: null, armor: null, accessory: null }));
    assert.strictEqual(JSON.stringify(sceneWrite.data.pendingExplorationRewards), JSON.stringify([]));
    assert.strictEqual(sceneWrite.data.inputContext.state, 'idle');

    const settingsWrite = writes.find(write => write.store === 'settings');
    assert.ok(settingsWrite, 'settings should be imported');
    assert.strictEqual(settingsWrite.data.value.apiKey, 'local-key', 'empty imported apiKey should not erase local key');
    assert.strictEqual(settingsWrite.data.value.model, 'imported-model');
}

async function testImportFallbackNormalizesWithoutState() {
    const writes = [];
    const Storage = loadStorage({ console });
    Storage.put = async (store, data) => writes.push({ store, data });
    Storage.getSettings = async () => ({});

    await Storage.importAll({
        scenes: [{ id: 'fallback_scene', name: '无 State 环境' }]
    });

    const scene = writes.find(write => write.store === 'scenes').data;
    assert.strictEqual(JSON.stringify(scene.equipmentRefs), JSON.stringify({ weapon: null, armor: null, accessory: null }));
    assert.strictEqual(JSON.stringify(scene.explorationRewardLog), JSON.stringify([]));
    assert.strictEqual(JSON.stringify(scene.pendingExplorationRewards), JSON.stringify([]));
    assert.strictEqual(scene.inputContext.state, 'idle');
    assert.strictEqual(scene.gameState, 'playing');
}

(async () => {
    await testImportNormalizesScenesAndPreservesLocalApiKey();
    await testImportFallbackNormalizesWithoutState();
    console.log('storage-import-normalization regression tests passed');
})().catch(err => {
    console.error(err);
    process.exit(1);
});
