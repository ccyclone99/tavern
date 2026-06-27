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

function testCounterBatchStopsAfterEnding(WorldEngine) {
    const scene = {
        gameState: 'playing',
        userName: 'Tester',
        playerStats: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
        playerHp: 10,
        playerMaxHp: 10,
        messages: [],
        inventory: [],
        quests: [],
        locations: [],
        sceneChallenges: [],
        counterStrategies: [
            { id: 'hunter', title: '猎手追踪', status: 'active', visibility: 'known', progress: 90, exposure: 0 },
            { id: 'rival', title: '竞争者布局', status: 'active', visibility: 'known', progress: 10, exposure: 0 }
        ],
        failureStates: [{
            id: 'hunter_fail',
            title: '猎手追上玩家',
            status: 'armed',
            trigger: { type: 'counter', counterId: 'hunter', at: 100 },
            message: '追踪反制已经完成。',
            aftermath: '测试失败结局。'
        }]
    };

    const changed = WorldEngine.applyCounterStrategyUpdate(scene, [
        { id: 'hunter', progressDelta: 10 },
        { id: 'rival', progressDelta: 70 }
    ]);

    assert.strictEqual(changed, true);
    assert.strictEqual(scene.gameState, 'defeated');
    assert.strictEqual(scene.counterStrategies.find(counter => counter.id === 'hunter').progress, 100);
    assert.strictEqual(scene.counterStrategies.find(counter => counter.id === 'rival').progress, 10, 'later counter updates should stop after an ending');
    assert.ok(scene.messages.some(msg => msg.type === 'gameover'), 'failure ending message should be recorded');
}

const WorldEngine = loadWorldEngine();
testCounterBatchStopsAfterEnding(WorldEngine);
console.log('counter-update-ending regression tests passed');
