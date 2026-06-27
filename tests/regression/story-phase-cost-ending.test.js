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
            id: 'sigil',
            name: '封印符',
            type: 'consumable',
            quantity: 1,
            uses: 1
        }],
        quests: [],
        locations: [],
        sceneChallenges: [],
        storyPhases: [
            { id: 'phase_1', title: '入口调查', status: 'active', goal: '找到进入方式' },
            { id: 'phase_2', title: '核心大厅', status: 'locked', goal: '进入核心大厅' }
        ],
        consequenceLedger: [],
        pendingExplorationRewards: [{
            id: 'pending_reward',
            item: { name: '不该补领的阶段奖励', type: 'consumable', quantity: 1, uses: 1 },
            source: '测试'
        }],
        failureStates: [{
            id: 'tension_fail',
            title: '守卫全面封锁',
            status: 'armed',
            trigger: { type: 'worldTension', at: 100 },
            message: '警戒抵达极限。',
            aftermath: '测试失败结局。'
        }]
    };
}

function testPhaseActivationStopsAfterCostEnding(WorldEngine) {
    const scene = makeScene();

    const changed = WorldEngine.applyStoryPhaseUpdate(scene, [{
        id: 'phase_2',
        status: 'active',
        reason: '强行绕过入口调查',
        worldTensionDelta: 100,
        costs: [
            { type: 'item', itemName: '封印符', quantity: 1 },
            { type: 'consequence', text: '入口封印失衡' }
        ]
    }]);

    assert.strictEqual(changed, true);
    assert.strictEqual(scene.gameState, 'defeated');
    assert.strictEqual(scene.worldTension, 100);
    assert.strictEqual(scene.storyPhases.find(phase => phase.id === 'phase_1').status, 'active', 'current phase should not complete after an ending');
    assert.strictEqual(scene.storyPhases.find(phase => phase.id === 'phase_2').status, 'locked', 'next phase should not activate after an ending');
    assert.strictEqual(scene.inventory.length, 1, 'later item costs should not be consumed after an ending');
    assert.strictEqual(scene.inventory[0].id, 'sigil');
    assert.strictEqual(scene.consequenceLedger.length, 0, 'later consequences should not be written after an ending');
    assert.strictEqual(scene.pendingExplorationRewards.length, 1, 'pending rewards should not retry after an ending');
    assert.ok(scene.messages.some(msg => msg.type === 'gameover'), 'failure ending message should be recorded');
}

function testPhaseCompletionStopsAfterCostEnding(WorldEngine) {
    const scene = makeScene();

    WorldEngine.applyStoryPhaseUpdate(scene, [{
        id: 'phase_1',
        status: 'completed',
        reason: '以失控代价硬闯',
        worldTensionDelta: 100,
        costs: [{ type: 'item', itemName: '封印符', quantity: 1 }]
    }]);

    assert.strictEqual(scene.gameState, 'defeated');
    assert.strictEqual(scene.storyPhases.find(phase => phase.id === 'phase_1').status, 'active', 'active phase should not complete after an ending');
    assert.strictEqual(scene.inventory.length, 1, 'later item costs should not be consumed after an ending');
}

const WorldEngine = loadWorldEngine();
testPhaseActivationStopsAfterCostEnding(WorldEngine);
testPhaseCompletionStopsAfterCostEnding(WorldEngine);
console.log('story-phase-cost-ending regression tests passed');
