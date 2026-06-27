const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadWorldEngine() {
    const context = {
        console,
        State: {
            activeCharacters: [],
            saveCurrentSceneDebounced() {}
        }
    };
    const code = fs.readFileSync(path.join(root, 'js/features/world-engine.js'), 'utf8') + '\nthis.WorldEngine = WorldEngine;';
    vm.runInNewContext(code, context, { filename: 'js/features/world-engine.js' });
    return context.WorldEngine;
}

function makeScene() {
    return {
        gameState: 'playing',
        userName: 'Tester',
        playerStats: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
        playerHp: 10,
        playerMaxHp: 10,
        level: 1,
        exp: 0,
        attrPoints: 0,
        gold: 0,
        worldTension: 0,
        messages: [],
        inventory: [{
            id: 'doom_bell',
            name: '末日铃',
            type: 'consumable',
            quantity: 1,
            uses: 1,
            effects: [
                { type: 'world_tension', value: 100, consume: true },
                { type: 'gold', value: 50, consume: true },
                { type: 'exp', value: 10, consume: true }
            ]
        }],
        quests: [],
        locations: [],
        sceneChallenges: [],
        pendingExplorationRewards: [{
            id: 'pending_reward',
            item: { name: '不该补领的奖励', type: 'consumable', quantity: 1, uses: 1 },
            source: '测试'
        }],
        failureStates: [{
            id: 'tension_fail',
            title: '局势失控',
            status: 'armed',
            trigger: { type: 'worldTension', at: 100 },
            message: '世界紧张度达到极限。',
            aftermath: '测试失败结局。'
        }]
    };
}

function testItemUseStopsAfterEnding(WorldEngine) {
    const scene = makeScene();

    const result = WorldEngine.useInventoryItem(scene, 'doom_bell');

    assert.strictEqual(result.ok, true);
    assert.strictEqual(result.ended, true);
    assert.strictEqual(scene.gameState, 'defeated');
    assert.strictEqual(scene.worldTension, 100);
    assert.strictEqual(scene.gold, 0, 'effects after the ending should not apply');
    assert.strictEqual(scene.exp, 0, 'later exp effects should not apply');
    assert.strictEqual(scene.inventory.length, 1, 'item should not be consumed after the ending lock');
    assert.strictEqual(scene.inventory[0].id, 'doom_bell');
    assert.strictEqual(scene.pendingExplorationRewards.length, 1, 'pending rewards should not retry after an ending');
    assert.ok(scene.messages.some(msg => msg.type === 'gameover'), 'failure ending message should be recorded');
}

const WorldEngine = loadWorldEngine();
testItemUseStopsAfterEnding(WorldEngine);
console.log('item-use-ending regression tests passed');
