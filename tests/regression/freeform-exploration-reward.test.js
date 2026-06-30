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
    const rewardMessage = scene.messages.find(msg => msg.content.includes('【探索收获：下层货舱可利用细节】'));
    assert.ok(rewardMessage);
    assert.ok(rewardMessage.content.includes('记录证据：待验证'));
    assert.ok(rewardMessage.content.includes('现场线索便签（可在观察/调查检定中投入）'));
    assert.ok(rewardMessage.content.includes('右侧「局势/线索」'));
}

function testFreeformExplorationEvidenceBindsToActiveChallenge(WorldEngine) {
    const scene = makeScene({
        storyPhases: [{ id: 'phase_route', title: '路线勘查', status: 'active' }],
        sceneChallenges: [{
            id: 'challenge_cargo_route',
            phaseId: 'phase_route',
            title: '货舱路线勘查',
            status: 'active',
            goal: '确认下层货舱旧航线是否还能使用。',
            tags: ['route', 'cargo'],
            supports: ['q_main:1'],
            coreRevelations: ['rev_route_safe'],
            progress: 0,
            targetProgress: 3,
            strain: 0,
            maxStrain: 3,
            approaches: [{
                id: 'inspect_markers',
                label: '调查旧航线标记',
                stat: 'intelligence',
                dc: 14,
                actionType: 'investigate',
                tags: ['route', 'marker'],
                keywords: ['航线', '标记']
            }]
        }]
    });

    const result = WorldEngine.applyFreeformActionOutcome(
        scene,
        '我先调查墙上的旧航线标记，看看有没有能用的路线。',
        { actionType: 'investigate' }
    );

    assert.strictEqual(result.changed, true);
    const evidence = scene.evidenceLedger.find(item => item.id === 'ev_free_loc_cargo');
    assert.ok(evidence, 'freeform exploration should create evidence');
    assert.ok(evidence.supports.includes('challenge_cargo_route'), 'evidence should support the active challenge');
    assert.ok(evidence.supports.includes('rev_route_safe'), 'evidence should carry challenge revelation support');
    assert.ok(evidence.supports.includes('q_main:1'), 'evidence should carry challenge quest support');
    assert.ok(evidence.tags.includes('inspect_markers'), 'evidence should keep matched approach context');

    const challengeEvidence = WorldEngine.getEvidenceForChallenge(scene, scene.sceneChallenges[0]);
    assert.ok(challengeEvidence.some(item => item.id === evidence.id), 'challenge panel should be able to show the evidence');

    const modifier = WorldEngine.getEvidenceActionModifier(scene, {
        actionType: 'investigate',
        intent: '继续调查旧航线标记',
        challengeId: 'challenge_cargo_route',
        challengeTitle: '货舱路线勘查',
        approachTags: ['route', 'marker']
    });
    assert.ok(modifier, 'bound exploration evidence should modify later challenge actions');
    assert.ok(modifier.evidenceIds.includes(evidence.id));
    assert.ok(modifier.riskDelta < 0);
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
testFreeformExplorationEvidenceBindsToActiveChallenge(WorldEngine);
testRepeatedFreeformExplorationDoesNotFarmReward(WorldEngine);
testSocialFreeformDoesNotCreateExplorationReward(WorldEngine);
console.log('freeform-exploration-reward regression tests passed');
