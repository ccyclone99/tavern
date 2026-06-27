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

function testFailureStateBatchStopsAfterManualEnding(WorldEngine) {
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
        failureStates: [
            {
                id: 'manual_fail',
                title: '主动失败',
                status: 'armed',
                trigger: { type: 'manual' },
                message: '手动触发失败。',
                aftermath: '测试失败结局。'
            },
            {
                id: 'later_fail',
                title: '后续失败条件',
                status: 'armed',
                trigger: { type: 'manual' },
                message: '不应被改写。'
            }
        ]
    };

    const changed = WorldEngine.applyFailureStateUpdate(scene, [
        { id: 'manual_fail', triggerNow: true, reason: '测试触发' },
        { id: 'later_fail', status: 'disabled', message: '不应执行' }
    ]);

    assert.strictEqual(changed, true);
    assert.strictEqual(scene.gameState, 'defeated');
    assert.strictEqual(scene.failureStates.find(failure => failure.id === 'manual_fail').status, 'triggered');
    assert.strictEqual(scene.failureStates.find(failure => failure.id === 'later_fail').status, 'armed', 'later failure-state updates should stop after an ending');
    assert.strictEqual(scene.failureStates.find(failure => failure.id === 'later_fail').message, '不应被改写。');
    assert.ok(scene.messages.some(msg => msg.type === 'gameover'), 'failure ending message should be recorded');
}

const WorldEngine = loadWorldEngine();
testFailureStateBatchStopsAfterManualEnding(WorldEngine);
console.log('failure-state-update-ending regression tests passed');
