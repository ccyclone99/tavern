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
            addKnowledgeDiscovery(scene, item) {
                if (!scene.knowledge) scene.knowledge = { discoveries: [] };
                if (!Array.isArray(scene.knowledge.discoveries)) scene.knowledge.discoveries = [];
                if (!scene.knowledge.discoveries.some(existing => existing.id === item.id)) {
                    scene.knowledge.discoveries.push(item);
                }
            }
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
        currentLocation: 'cargo',
        locations: [
            { id: 'cargo', name: '下层货舱', description: '封存货物的起点', connections: [] },
            { id: 'engine', name: '引擎室', description: '异常读数来自这里', connections: ['cargo'] }
        ],
        currentSituation: { recentRisks: [], recommendedActions: [] },
        storyPhases: [],
        storyArcs: [],
        sceneChallenges: [],
        clocks: [],
        counterStrategies: [],
        clueGraph: [{
            id: 'clue_engine',
            title: '引擎异常',
            subjectType: 'location',
            subjectName: '引擎室',
            status: 'hinted',
            currentStage: 0,
            stages: []
        }],
        evidenceLedger: [],
        failureStates: [],
        knowledge: { discoveries: [] },
        flowGraph: {
            nodes: [
                {
                    id: 'node_cargo',
                    type: 'location',
                    title: '下层货舱',
                    status: 'available',
                    visibleText: '玩家当前所在的封存货舱。',
                    exits: ['node_engine']
                },
                {
                    id: 'node_engine',
                    type: 'location',
                    title: '引擎室',
                    status: 'hidden',
                    visibleText: '引擎室传来间歇性的异常读数。',
                    privateTruth: 'SECRET_ENGINE_TRUTH',
                    clueIds: ['clue_engine'],
                    exits: []
                }
            ],
            revelations: []
        },
        ...overrides
    };
}

function testHintedClueDoesNotExposeHiddenRoute(WorldEngine) {
    const scene = makeScene();
    const situation = WorldEngine.getCurrentSituation(scene);

    assert.ok(!situation.flowNodes.some(node => node.id === 'node_engine'));
    assert.strictEqual(scene.flowGraph.nodes.find(node => node.id === 'node_engine').status, 'hidden');
    assert.ok(!situation.recommendedActions.some(action => action.includes('引擎室')));
}

function testKnowledgeDiscoveryUnlocksRoute(WorldEngine) {
    const scene = makeScene({
        knowledge: {
            discoveries: [{
                id: 'disc_engine_route',
                subjectType: 'location',
                subjectId: 'clue_engine',
                title: '引擎室入口',
                text: '货舱墙后的线路指向引擎室。',
                tags: ['clue_engine']
            }]
        }
    });
    const situation = WorldEngine.getCurrentSituation(scene);
    const route = scene.flowGraph.nodes.find(node => node.id === 'node_engine');

    assert.strictEqual(route.status, 'available');
    assert.ok(situation.flowNodes.some(node => node.id === 'node_engine'));
    assert.ok(situation.recommendedActions.some(action => action.includes('前往引擎室')));
    assert.strictEqual(situation.flowNodes.find(node => node.id === 'node_engine').privateTruth, undefined);
}

function testEvidenceAddRefreshesRouteRecommendations(WorldEngine) {
    const scene = makeScene();
    const changed = WorldEngine.applyEvidenceAdd(scene, [{
        id: 'ev_engine_ping',
        title: '引擎室异常读数',
        text: '读数和货舱墙后的线路一致。',
        reliability: 'partial',
        supports: ['clue_engine'],
        tags: ['engine']
    }]);
    const route = scene.flowGraph.nodes.find(node => node.id === 'node_engine');

    assert.strictEqual(changed, true);
    assert.strictEqual(route.status, 'available');
    assert.ok(scene.currentSituation.recommendedActions.some(action => action.includes('前往引擎室')));
}

const WorldEngine = loadWorldEngine();
testHintedClueDoesNotExposeHiddenRoute(WorldEngine);
testKnowledgeDiscoveryUnlocksRoute(WorldEngine);
testEvidenceAddRefreshesRouteRecommendations(WorldEngine);
console.log('flow-node-routing regression tests passed');
