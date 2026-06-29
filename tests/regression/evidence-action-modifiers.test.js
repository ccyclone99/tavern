const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadEngines() {
    const context = {
        console,
        State: {
            currentCharacterId: '',
            characters: [],
            activeCharacters: []
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
    const worldCode = fs.readFileSync(path.join(root, 'js/features/world-engine.js'), 'utf8') + '\nthis.WorldEngine = WorldEngine;';
    const plannerCode = fs.readFileSync(path.join(root, 'js/features/action-planner.js'), 'utf8') + '\nthis.ActionPlanner = ActionPlanner;';
    vm.runInNewContext(worldCode, context, { filename: 'js/features/world-engine.js' });
    vm.runInNewContext(plannerCode, context, { filename: 'js/features/action-planner.js' });
    return { WorldEngine: context.WorldEngine, ActionPlanner: context.ActionPlanner };
}

function makeScene(overrides = {}) {
    return {
        gameState: 'playing',
        userName: '旅人',
        currentLocation: 'cargo',
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
        locations: [{ id: 'cargo', name: '下层货舱', description: '旧航线标记散落在墙面', connections: [] }],
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

function testPartialEvidenceLowersRelevantInvestigationRisk(ActionPlanner) {
    const scene = makeScene({
        evidenceLedger: [{
            id: 'ev_free_loc_cargo',
            title: '下层货舱可利用细节',
            text: '墙面旧航线标记能帮助继续调查。',
            tags: ['freeform', 'investigate', 'location', 'cargo'],
            sourceNodeId: 'cargo',
            reliability: 'partial',
            visible: true,
            supports: ['cargo']
        }]
    });

    const action = ActionPlanner.create(scene, '我调查货舱墙面的旧航线标记');
    const evidenceModifier = action.modifiers.find(item => item.source === '相关证据');

    assert.ok(evidenceModifier, 'relevant partial evidence should appear in action modifiers');
    assert.strictEqual(evidenceModifier.riskDelta, -3);
    assert.strictEqual(evidenceModifier.dcDelta, 0);
    assert.ok(action.risk < 36, 'partial evidence should lower investigation risk');
}

function testConfirmedEvidenceLowersSocialDc(ActionPlanner) {
    const scene = makeScene({
        evidenceLedger: [{
            id: 'ev_route_reading',
            title: '地表路线和辐射读数',
            text: '路线数据可以支撑委员会授权。',
            tags: ['route', 'permission', 'persuade'],
            sourceNodeId: 'cargo',
            reliability: 'confirmed',
            visible: true,
            supports: ['permission']
        }]
    });

    const action = ActionPlanner.create(scene, '我说服委员会接受路线方案');
    const evidenceModifier = action.modifiers.find(item => item.source === '相关证据');

    assert.ok(evidenceModifier, 'confirmed evidence should appear in social action modifiers');
    assert.strictEqual(evidenceModifier.riskDelta, -5);
    assert.strictEqual(evidenceModifier.dcDelta, -1);
    assert.ok(action.suggestedCheck.dc < 14, 'confirmed evidence should lower social DC');
}

function testIrrelevantEvidenceDoesNotModifyCombat(ActionPlanner) {
    const scene = makeScene({
        evidenceLedger: [{
            id: 'ev_route_reading',
            title: '地表路线和辐射读数',
            text: '路线数据可以支撑委员会授权。',
            tags: ['route', 'permission', 'persuade'],
            sourceNodeId: 'cargo',
            reliability: 'confirmed',
            visible: true,
            supports: ['permission']
        }]
    });

    const action = ActionPlanner.create(scene, '我攻击守卫');

    assert.ok(!action.modifiers.some(item => item.source === '相关证据'));
}

const { ActionPlanner } = loadEngines();
testPartialEvidenceLowersRelevantInvestigationRisk(ActionPlanner);
testConfirmedEvidenceLowersSocialDc(ActionPlanner);
testIrrelevantEvidenceDoesNotModifyCombat(ActionPlanner);
console.log('evidence-action-modifiers regression tests passed');
