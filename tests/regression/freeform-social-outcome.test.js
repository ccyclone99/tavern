const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadWorldEngine() {
    const context = {
        console,
        State: {
            currentCharacterId: 'guide',
            characters: [{ id: 'guide', name: '向导', _relations: {} }],
            activeCharacters: [{ id: 'guide', name: '向导', _relations: {} }],
            emit() {}
        },
        SidebarRight: {
            markTabNew() {},
            renderDetail() {},
            renderSituation() {}
        }
    };
    context.State.activeCharacters = context.State.characters;
    const code = fs.readFileSync(path.join(root, 'js/features/world-engine.js'), 'utf8') + '\nthis.WorldEngine = WorldEngine;';
    vm.runInNewContext(code, context, { filename: 'js/features/world-engine.js' });
    return { WorldEngine: context.WorldEngine, State: context.State };
}

function makeScene(overrides = {}) {
    return {
        gameState: 'playing',
        userName: '旅人',
        turnCount: 3,
        playerStats: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
        playerHp: 10,
        playerMaxHp: 10,
        level: 1,
        exp: 0,
        attrPoints: 0,
        gold: 0,
        messages: [],
        eventLog: [],
        inventory: [],
        quests: [],
        characters: ['guide'],
        currentLocation: 'road',
        locations: [{ id: 'road', name: '旧路口', description: '通向几个方向', connections: [] }],
        currentSituation: { recentRisks: [], recommendedActions: [] },
        storyPhases: [],
        storyArcs: [],
        sceneChallenges: [],
        clocks: [],
        counterStrategies: [],
        clueGraph: [],
        evidenceLedger: [],
        failureStates: [],
        knowledge: { discoveries: [] },
        flowGraph: { nodes: [], revelations: [] },
        ...overrides
    };
}

function testAskCreatesSmallTrustOutcome(WorldEngine, State) {
    const scene = makeScene();
    const result = WorldEngine.applyFreeformActionOutcome(
        scene,
        '我请教向导这里以前发生过什么。',
        { actionType: 'ask' },
        { messageId: 'msg_user_1' }
    );
    const relation = State.characters[0]._relations['旅人'];

    assert.strictEqual(result.changed, true);
    assert.ok(result.socialOutcome);
    assert.strictEqual(result.socialOutcome.trustDelta, 1);
    assert.strictEqual(result.socialOutcome.affectionDelta, 1);
    assert.strictEqual(relation.trust, 1);
    assert.strictEqual(relation.affection, 1);
    assert.strictEqual(scene.socialActionLog.length, 1);
    assert.ok(scene.eventLog.some(event =>
        event.category === 'social' &&
        event.title === '社交推进' &&
        event.messageId === 'msg_user_1'
    ));
    assert.ok(scene.messages.some(msg => msg.content.includes('【社交推进：向导】好感 +1，信任 +1')));
}

function testRepeatedSameSocialActionDoesNotFarmRelation(WorldEngine, State) {
    const scene = makeScene();
    WorldEngine.applyFreeformActionOutcome(scene, '我请教向导这里以前发生过什么。', { actionType: 'ask' });
    const second = WorldEngine.applyFreeformActionOutcome(scene, '我请教向导这里以前发生过什么。', { actionType: 'ask' });
    const relation = State.characters[0]._relations['旅人'];

    assert.strictEqual(second.socialOutcome, null);
    assert.strictEqual(relation.trust, 1);
    assert.strictEqual(relation.affection, 1);
    assert.strictEqual(scene.socialActionLog.length, 1);
}

function testProbeRaisesSuspicion(WorldEngine, State) {
    const scene = makeScene();
    const result = WorldEngine.applyFreeformActionOutcome(
        scene,
        '我旁敲侧击地试探向导是不是隐瞒了什么。',
        { actionType: 'probe' }
    );
    const relation = State.characters[0]._relations['旅人'];

    assert.ok(result.socialOutcome);
    assert.strictEqual(result.socialOutcome.suspicionDelta, 2);
    assert.strictEqual(relation.suspicion, 2);
    assert.strictEqual(relation.mood, '警觉');
}

{
    const { WorldEngine, State } = loadWorldEngine();
    testAskCreatesSmallTrustOutcome(WorldEngine, State);
}
{
    const { WorldEngine, State } = loadWorldEngine();
    testRepeatedSameSocialActionDoesNotFarmRelation(WorldEngine, State);
}
{
    const { WorldEngine, State } = loadWorldEngine();
    testProbeRaisesSuspicion(WorldEngine, State);
}
console.log('freeform-social-outcome regression tests passed');
