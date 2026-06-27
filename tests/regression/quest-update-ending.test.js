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

function baseScene(overrides = {}) {
    return {
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
        ...overrides
    };
}

function testQuestBatchStopsAfterFailureEnding(WorldEngine) {
    const scene = baseScene({
        quests: [
            { id: 'bad_quest', name: '守住入口', type: 'main', status: 'active', objectives: [{ text: '不能失守', completed: false }], reward: '' },
            { id: 'late_quest', name: '后续奖励', type: 'side', status: 'active', objectives: [{ text: '稍后处理', completed: false }], reward: '' }
        ],
        failureStates: [{
            id: 'quest_fail',
            title: '入口失守',
            status: 'armed',
            trigger: { type: 'quest', questId: 'bad_quest', status: 'failed' },
            message: '入口已经失守。',
            aftermath: '测试失败结局。'
        }]
    });

    const result = WorldEngine.applyQuestUpdates(scene, [
        { questId: 'bad_quest', status: 'failed' },
        { questId: 'late_quest', status: 'completed' }
    ], { stateUpdate: true });

    assert.strictEqual(result.changed, true);
    assert.strictEqual(scene.gameState, 'defeated');
    assert.strictEqual(scene.quests.find(quest => quest.id === 'bad_quest').status, 'failed');
    assert.strictEqual(scene.quests.find(quest => quest.id === 'late_quest').status, 'active', 'later quest updates should stop after an ending');
    assert.ok(scene.messages.some(msg => msg.type === 'gameover'), 'failure ending message should be recorded');
}

function testQuestBatchStopsAfterVictoryEnding(WorldEngine) {
    const scene = baseScene({
        quests: [
            { id: 'main_quest', name: '完成主线', type: 'main', status: 'active', objectives: [{ text: '完成结局目标', completed: true }], reward: '' },
            { id: 'late_quest', name: '后续任务', type: 'side', status: 'active', objectives: [{ text: '不应改变', completed: false }], reward: '' }
        ],
        failureStates: []
    });

    WorldEngine.applyQuestUpdates(scene, [
        { questId: 'main_quest', status: 'completed' },
        { questId: 'late_quest', status: 'failed' }
    ], { stateUpdate: true });

    assert.strictEqual(scene.gameState, 'victorious');
    assert.strictEqual(scene.quests.find(quest => quest.id === 'main_quest').status, 'completed');
    assert.strictEqual(scene.quests.find(quest => quest.id === 'late_quest').status, 'active', 'later quest updates should stop after victory');
    assert.ok(scene.messages.some(msg => msg.type === 'victory'), 'victory message should be recorded');
}

const WorldEngine = loadWorldEngine();
testQuestBatchStopsAfterFailureEnding(WorldEngine);
testQuestBatchStopsAfterVictoryEnding(WorldEngine);
console.log('quest-update-ending regression tests passed');
