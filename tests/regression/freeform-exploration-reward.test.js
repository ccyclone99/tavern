const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadWorldEngine() {
    const context = {
        console,
        State: {
            characters: [{ id: 'guide', name: '向导' }],
            activeCharacters: [{ id: 'guide', name: '向导' }],
            currentCharacterId: 'guide'
        },
        SidebarRight: {
            markTabNew() {},
            renderDetail() {},
            renderInventory() {},
            renderSituation() {}
        },
        ActionBar: {
            renderStatsDisplay() {}
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
        turnCount: 2,
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
        currentLocation: 'cargo',
        locations: [{
            id: 'cargo',
            name: '下层货舱',
            description: '昏暗货舱里散落着旧航线标记和可拆下的记录片。',
            connections: []
        }],
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

function testFreeformExplorationCreatesEvidenceRewardAndLinksKnowledge(WorldEngine) {
    const scene = makeScene();
    const result = WorldEngine.applyFreeformActionOutcome(
        scene,
        '我先翻找周围有没有能用的东西。',
        { actionType: 'investigate' },
        { messageId: 'msg_user_1' }
    );

    assert.strictEqual(result.changed, true);
    assert.strictEqual(JSON.stringify(result.evidenceIds), JSON.stringify(['ev_free_loc_cargo']));
    assert.ok(scene.evidenceLedger.some(item =>
        item.id === 'ev_free_loc_cargo' &&
        item.tags.includes('freeform') &&
        item.supports.includes('cargo')
    ));
    assert.ok(scene.knowledge.discoveries.some(item =>
        item.id === 'disc_free_loc_cargo' &&
        item.evidenceIds.includes('ev_free_loc_cargo')
    ));
    assert.strictEqual(scene.exp, 4);
    assert.ok(scene.inventory.some(item => item.name === '现场线索便签'));
    assert.ok(scene.messages.some(msg => msg.content.includes('【探索收获：下层货舱可利用细节】')));
}

function testRepeatedFreeformExplorationDoesNotFarmReward(WorldEngine) {
    const scene = makeScene();
    WorldEngine.applyFreeformActionOutcome(scene, '我观察四周。', { actionType: 'observe' });
    const expAfterFirst = scene.exp;
    const inventoryAfterFirst = scene.inventory.length;
    const logAfterFirst = scene.explorationRewardLog.length;

    WorldEngine.applyFreeformActionOutcome(scene, '我再观察一下四周。', { actionType: 'observe' });

    assert.strictEqual(scene.exp, expAfterFirst);
    assert.strictEqual(scene.inventory.length, inventoryAfterFirst);
    assert.strictEqual(scene.explorationRewardLog.length, logAfterFirst);
    assert.strictEqual(scene.evidenceLedger.filter(item => item.id === 'ev_free_loc_cargo').length, 1);
}

function testSocialFreeformDoesNotCreateExplorationReward(WorldEngine) {
    const scene = makeScene();
    const result = WorldEngine.applyFreeformActionOutcome(
        scene,
        '我问问向导这里以前发生过什么。',
        { actionType: 'ask' }
    );

    assert.strictEqual(result.changed, true);
    assert.strictEqual(JSON.stringify(result.evidenceIds), JSON.stringify([]));
    assert.strictEqual(scene.evidenceLedger.length, 0);
    assert.strictEqual(scene.exp, 0);
    assert.strictEqual(scene.inventory.length, 0);
}

const WorldEngine = loadWorldEngine();
testFreeformExplorationCreatesEvidenceRewardAndLinksKnowledge(WorldEngine);
testRepeatedFreeformExplorationDoesNotFarmReward(WorldEngine);
testSocialFreeformDoesNotCreateExplorationReward(WorldEngine);
console.log('freeform-exploration-reward regression tests passed');
