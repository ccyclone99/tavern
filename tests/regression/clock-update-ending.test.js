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

function testClockBatchStopsAfterEnding(WorldEngine) {
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
        clocks: [
            { id: 'alarm', name: '警戒封锁', status: 'active', visibility: 'known', value: 2, max: 3 },
            { id: 'ritual', name: '仪式倒计时', status: 'active', visibility: 'known', value: 0, max: 3 }
        ],
        failureStates: [{
            id: 'alarm_fail',
            title: '警戒封锁',
            status: 'armed',
            trigger: { type: 'clock', clockId: 'alarm', at: 'max' },
            message: '警戒封锁完成。',
            aftermath: '测试失败结局。'
        }]
    };

    const result = WorldEngine.applyClockUpdate(scene, [
        { id: 'alarm', delta: 1, reason: '测试推进' },
        { id: 'ritual', delta: 2, reason: '不应继续推进' }
    ]);

    assert.strictEqual(result.changed, true);
    assert.strictEqual(scene.gameState, 'defeated');
    assert.strictEqual(scene.clocks.find(clock => clock.id === 'alarm').value, 3);
    assert.strictEqual(scene.clocks.find(clock => clock.id === 'ritual').value, 0, 'later clock updates should stop after an ending');
    assert.ok(scene.messages.some(msg => msg.type === 'gameover'), 'failure ending message should be recorded');
}

const WorldEngine = loadWorldEngine();
testClockBatchStopsAfterEnding(WorldEngine);
console.log('clock-update-ending regression tests passed');
