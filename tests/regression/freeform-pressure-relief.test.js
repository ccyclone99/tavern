const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadWorldEngine() {
    const context = {
        console,
        State: {
            characters: [],
            activeCharacters: [],
            currentCharacterId: '',
            addKnowledgeDiscovery() {}
        },
        SidebarRight: {
            markTabNew() {},
            renderSituation() {}
        }
    };
    const code = fs.readFileSync(path.join(root, 'js/features/world-engine.js'), 'utf8') + '\nthis.WorldEngine = WorldEngine;';
    vm.runInNewContext(code, context, { filename: 'js/features/world-engine.js' });
    return context.WorldEngine;
}

function makeScene(overrides = {}) {
    return {
        gameState: 'playing',
        userName: '旅人',
        turnCount: 6,
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
        characters: [],
        currentLocation: 'hall',
        locations: [{ id: 'hall', name: '大厅', description: '人群正在等待决定。', connections: [] }],
        currentSituation: { recentRisks: [], recommendedActions: [] },
        storyPhases: [],
        storyArcs: [],
        sceneChallenges: [],
        clocks: [],
        counterStrategies: [],
        clueGraph: [],
        evidenceLedger: [],
        companionResources: [],
        failureStates: [],
        knowledge: { discoveries: [] },
        flowGraph: { nodes: [], revelations: [] },
        freeformReliefLog: [],
        ...overrides
    };
}

function testFreeformCanRelieveVisibleClockOnce(WorldEngine) {
    const scene = makeScene({
        clocks: [{
            id: 'clock_ration',
            name: '配给压力',
            tag: 'ration',
            value: 5,
            max: 6,
            visibility: 'known'
        }]
    });

    const first = WorldEngine.applyFreeformActionOutcome(
        scene,
        '我先整理补给并公开说明分配计划，压低配给压力。',
        { actionType: 'ask' },
        { messageId: 'msg_relief_1' }
    );
    const second = WorldEngine.applyFreeformActionOutcome(
        scene,
        '我继续寻找补给，想再压低配给压力。',
        { actionType: 'ask' },
        { messageId: 'msg_relief_2' }
    );

    assert.strictEqual(first.changed, true);
    assert.ok(first.pressureRelief);
    assert.strictEqual(first.pressureRelief.kind, 'clock');
    assert.strictEqual(scene.clocks[0].value, 4);
    assert.ok(!second.pressureRelief);
    assert.strictEqual(scene.clocks[0].value, 4, 'same pressure category should not be farmed repeatedly');
    assert.strictEqual(scene.freeformReliefLog.length, 1);
    assert.ok(scene.eventLog.some(event => event.title === '压力缓解' && event.refId === 'clock_ration'));
    assert.ok(scene.messages.some(msg => String(msg.content || '').includes('【压力缓解】配给压力 -1')));
}

function testFreeformDoesNotRevealHiddenClock(WorldEngine) {
    const scene = makeScene({
        clocks: [{
            id: 'clock_secret',
            name: '隐藏倒计时',
            value: 5,
            max: 6,
            visibility: 'hidden'
        }]
    });

    const result = WorldEngine.applyFreeformActionOutcome(
        scene,
        '我想压低隐藏倒计时。',
        { actionType: 'ask' }
    );

    assert.strictEqual(result.changed, false);
    assert.strictEqual(scene.clocks[0].value, 5);
    assert.strictEqual(scene.freeformReliefLog.length, 0);
    assert.ok(!scene.messages.some(msg => String(msg.content || '').includes('隐藏倒计时')));
}

function testFreeformCanCoolWorldTension(WorldEngine) {
    const scene = makeScene({
        worldTension: 35
    });

    const result = WorldEngine.applyFreeformActionOutcome(
        scene,
        '我公开解释情况并安抚人群，先稳定局势。',
        { actionType: 'ask' },
        { messageId: 'msg_world_relief' }
    );

    assert.strictEqual(result.changed, true);
    assert.ok(result.pressureRelief);
    assert.strictEqual(result.pressureRelief.kind, 'worldTension');
    assert.strictEqual(scene.worldTension, 30);
    assert.ok(scene.eventLog.some(event => event.title === '压力缓解' && event.refId === 'world_tension'));
    assert.ok(scene.currentSituation.recentRisks.includes('压力缓解：世界紧张度 -5'));
}

function testFreeformWithoutReliefIntentDoesNotChangePressure(WorldEngine) {
    const scene = makeScene({
        clocks: [{
            id: 'clock_ration',
            name: '配给压力',
            value: 5,
            max: 6,
            visibility: 'known'
        }],
        worldTension: 35
    });

    const result = WorldEngine.applyFreeformActionOutcome(
        scene,
        '我问问现在局势怎么样。',
        { actionType: 'ask' }
    );

    assert.strictEqual(result.changed, false);
    assert.strictEqual(scene.clocks[0].value, 5);
    assert.strictEqual(scene.worldTension, 35);
}

function testGenericReliefDoesNotHitUnrelatedClock(WorldEngine) {
    const scene = makeScene({
        clocks: [{
            id: 'clock_storm',
            name: '风暴逼近',
            value: 5,
            max: 6,
            visibility: 'known'
        }]
    });

    const result = WorldEngine.applyFreeformActionOutcome(
        scene,
        '我先稳定一下自己的状态。',
        { actionType: 'ask' }
    );

    assert.strictEqual(result.changed, false);
    assert.strictEqual(scene.clocks[0].value, 5, 'unrelated visible clocks should not be relieved by urgency alone');
    assert.strictEqual(scene.freeformReliefLog.length, 0);
}

const WorldEngine = loadWorldEngine();
testFreeformCanRelieveVisibleClockOnce(WorldEngine);
testFreeformDoesNotRevealHiddenClock(WorldEngine);
testFreeformCanCoolWorldTension(WorldEngine);
testFreeformWithoutReliefIntentDoesNotChangePressure(WorldEngine);
testGenericReliefDoesNotHitUnrelatedClock(WorldEngine);
console.log('freeform-pressure-relief regression tests passed');
