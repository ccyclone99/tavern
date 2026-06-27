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

function testChallengeBatchStopsAfterVictory(WorldEngine) {
    const scene = {
        gameState: 'playing',
        userName: 'Tester',
        playerStats: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
        playerHp: 10,
        playerMaxHp: 10,
        level: 1,
        exp: 0,
        attrPoints: 0,
        messages: [],
        inventory: [],
        quests: [{
            id: 'main_quest',
            name: '完成核心目标',
            type: 'main',
            status: 'active',
            objectives: [{ text: '通过核心挑战', completed: false }],
            reward: ''
        }],
        locations: [],
        sceneChallenges: [
            {
                id: 'core_challenge',
                title: '核心挑战',
                status: 'active',
                progress: 0,
                targetProgress: 1,
                checkBudget: { min: 0, target: 0, max: 3 },
                checkCount: 0,
                supports: ['main_quest:1'],
                expReward: 0
            },
            {
                id: 'late_challenge',
                title: '后续挑战',
                status: 'active',
                progress: 0,
                targetProgress: 3,
                checkBudget: { min: 0, target: 0, max: 3 },
                checkCount: 0,
                supports: [],
                expReward: 0
            }
        ],
        failureStates: []
    };

    const changed = WorldEngine.applyChallengeUpdate(scene, [
        { id: 'core_challenge', progressDelta: 1, reason: '完成核心挑战' },
        { id: 'late_challenge', progressDelta: 2, reason: '不应继续推进' }
    ]);

    assert.strictEqual(changed, true);
    assert.strictEqual(scene.gameState, 'victorious');
    assert.strictEqual(scene.sceneChallenges.find(challenge => challenge.id === 'core_challenge').status, 'completed');
    assert.strictEqual(scene.sceneChallenges.find(challenge => challenge.id === 'late_challenge').progress, 0, 'later challenge updates should stop after victory');
    assert.strictEqual(scene.quests.find(quest => quest.id === 'main_quest').status, 'completed');
    assert.ok(scene.messages.some(msg => msg.type === 'victory'), 'victory message should be recorded');
}

const WorldEngine = loadWorldEngine();
testChallengeBatchStopsAfterVictory(WorldEngine);
console.log('challenge-update-ending regression tests passed');
