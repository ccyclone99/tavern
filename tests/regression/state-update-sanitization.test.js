const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadPromptGuard() {
    const context = { console };
    const code = fs.readFileSync(path.join(root, 'js/features/prompt-guard.js'), 'utf8') + '\nthis.PromptGuard = PromptGuard;';
    vm.runInNewContext(code, context, { filename: 'js/features/prompt-guard.js' });
    return context.PromptGuard;
}

function loadStrategyContext(PromptGuard) {
    const captured = { locationUpdates: null };
    const scene = {
        id: 'scene_state_update_sanitize',
        gameState: 'playing',
        strategies: [],
        activeStrategyId: null
    };
    const context = {
        console,
        PromptGuard,
        State: {
            scene,
            characters: [],
            settings: { userName: '旅人', apiKey: 'local-key' },
            saveCurrentSceneDebounced() {},
            emit() {},
            addKnowledgeDiscovery() { return null; }
        },
        Storage: {
            saveCharacter() { return Promise.resolve(); }
        },
        SidebarRight: {
            renderStrategies() {},
            renderKnowledge() {},
            renderDetail() {},
            renderInventory() {},
            renderQuests() {},
            renderMap() {},
            renderSituation() {},
            markTabNew() {}
        },
        SidebarLeft: { render() {} },
        WorldEngine: {
            isScenePlaying(targetScene) {
                return !targetScene.gameState || targetScene.gameState === 'playing';
            },
            applyLocationUpdates(targetScene, updates) {
                captured.locationUpdates = updates;
                return { changed: true };
            }
        }
    };
    const code = fs.readFileSync(path.join(root, 'js/features/strategy-manager.js'), 'utf8') + '\nthis.StrategyManager = StrategyManager;';
    vm.runInNewContext(code, context, { filename: 'js/features/strategy-manager.js' });
    return { StrategyManager: context.StrategyManager, captured, scene };
}

function testPromptGuardDropsSensitiveAndPrototypeKeys(PromptGuard) {
    const pollutedBefore = Object.prototype.polluted;
    const update = JSON.parse(`{
        "settings": { "apiKey": "leak" },
        "api.key": "leak",
        "localStorage": "leak",
        "unknownTopLevel": true,
        "scene": {
            "worldTensionDelta": 2,
            "gold": 999,
            "api/key": "leak"
        },
        "knowledgeAdd": [{
            "title": "公开线索",
            "text": "可见内容",
            "api.key": "leak",
            "localStorage": "leak",
            "__proto__": { "polluted": true }
        }],
        "locationUpdate": [{
            "id": "lab",
            "name": "实验室",
            "constructor": { "prototype": { "polluted": true } },
            "sessionStorage": "leak"
        }]
    }`);

    const clean = PromptGuard.sanitizeStateUpdate(update);

    assert.strictEqual(clean.settings, undefined);
    assert.strictEqual(clean['api.key'], undefined);
    assert.strictEqual(clean.localStorage, undefined);
    assert.strictEqual(clean.unknownTopLevel, undefined);
    assert.deepStrictEqual(Object.keys(clean.scene), ['worldTensionDelta']);
    assert.strictEqual(clean.knowledgeAdd[0].title, '公开线索');
    assert.strictEqual(clean.knowledgeAdd[0]['api.key'], undefined);
    assert.strictEqual(clean.knowledgeAdd[0].localStorage, undefined);
    assert.strictEqual(clean.knowledgeAdd[0].__proto__, undefined);
    assert.strictEqual(clean.locationUpdate[0].sessionStorage, undefined);
    assert.strictEqual(clean.locationUpdate[0].constructor, undefined);
    assert.strictEqual(Object.prototype.polluted, pollutedBefore);
}

function testStrategyManagerSanitizesDirectStateUpdate(PromptGuard) {
    const { StrategyManager, captured } = loadStrategyContext(PromptGuard);

    StrategyManager.applyStateUpdate(JSON.parse(`{
        "locationUpdate": [{
            "id": "lab",
            "name": "实验室",
            "api.key": "leak",
            "localStorage": "leak",
            "__proto__": { "polluted": true }
        }]
    }`));

    assert.ok(Array.isArray(captured.locationUpdates));
    assert.strictEqual(captured.locationUpdates[0].id, 'lab');
    assert.strictEqual(captured.locationUpdates[0]['api.key'], undefined);
    assert.strictEqual(captured.locationUpdates[0].localStorage, undefined);
    assert.strictEqual(captured.locationUpdates[0].__proto__, undefined);
}

const PromptGuard = loadPromptGuard();
testPromptGuardDropsSensitiveAndPrototypeKeys(PromptGuard);
testStrategyManagerSanitizesDirectStateUpdate(PromptGuard);
console.log('state-update-sanitization regression tests passed');
