const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadRules() {
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
    for (const [file, exportName] of [
        ['js/features/world-engine.js', 'WorldEngine'],
        ['js/features/action-planner.js', 'ActionPlanner'],
        ['js/features/intent-router.js', 'IntentRouter']
    ]) {
        const code = fs.readFileSync(path.join(root, file), 'utf8') + `\nthis.${exportName} = ${exportName};`;
        vm.runInNewContext(code, context, { filename: file });
    }
    return {
        WorldEngine: context.WorldEngine,
        ActionPlanner: context.ActionPlanner,
        IntentRouter: context.IntentRouter
    };
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
        characters: [],
        currentLocation: 'lab',
        locations: [{
            id: 'lab',
            name: '旧实验室',
            description: '地面有凌乱足迹，墙边还有被拖动过的设备痕迹。',
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

function trackingKit() {
    return {
        id: 'tracking_1',
        name: '追踪工具包',
        type: 'misc',
        quantity: 1,
        equipped: true,
        tags: ['工具', '追踪', '路线'],
        effects: [
            { type: 'check_bonus', stat: 'wisdom', actionType: 'observe', value: 1, consume: false },
            { type: 'check_bonus', stat: 'dexterity', actionType: 'sneak', value: 1, consume: false }
        ]
    };
}

function scanner() {
    return {
        id: 'scanner_1',
        name: '便携扫描仪',
        type: 'misc',
        quantity: 1,
        equipped: true,
        tags: ['工具', '扫描', '观察'],
        effects: [{ type: 'check_bonus', stat: 'wisdom', actionType: 'observe', value: 1, consume: false }]
    };
}

function testTrackingLeadRoutesIntoFreeformOutcome(WorldEngine, ActionPlanner, IntentRouter) {
    const scene = makeScene({ inventory: [trackingKit()] });
    const lead = WorldEngine.getItemActionLeads(scene).find(item => item.itemName === '追踪工具包');

    assert.ok(lead, 'tracking tool should produce an action lead');
    assert.strictEqual(lead.action, '用追踪工具包追踪旧实验室的行动痕迹');

    const route = IntentRouter.route(lead.action, scene);
    assert.strictEqual(route.kind, 'talk');
    assert.strictEqual(route.meta.actionType, 'observe');
    assert.strictEqual(route.meta.needsPreview, false);

    const preview = ActionPlanner.create(scene, lead.action);
    assert.strictEqual(preview.type, 'observe');
    assert.ok(preview.modifiers.some(item => item.source === '物品：追踪工具包'), 'tracking action should receive tracking tool modifier');

    const outcome = WorldEngine.applyFreeformActionOutcome(scene, lead.action, route.meta, { messageId: 'msg_track' });
    assert.strictEqual(outcome.changed, true);
    assert.ok(scene.evidenceLedger.some(item => item.id === 'ev_free_loc_lab'), 'tracking freeform action should leave reviewable evidence');
    assert.ok(scene.knowledge.discoveries.some(item => item.id === 'disc_free_tool_tracking_1'), 'mentioned tracking tool should be recorded, not lost as plain chat');
}

function testMentionedUnequippedToolDoesNotFallBackToFirstContextTool(WorldEngine) {
    const scene = makeScene({ inventory: [scanner(), trackingKit()] });
    const outcome = WorldEngine.applyFreeformActionOutcome(
        scene,
        '我用追踪工具包追踪地面的足迹。',
        { actionType: 'observe' },
        { messageId: 'msg_named_tool' }
    );

    assert.strictEqual(outcome.changed, true);
    assert.ok(!scene.knowledge.discoveries.some(item => item.id === 'disc_free_tool_scanner_1'), 'named but unavailable tracking tool should not be replaced by the first contextual tool');
}

const { WorldEngine, ActionPlanner, IntentRouter } = loadRules();
testTrackingLeadRoutesIntoFreeformOutcome(WorldEngine, ActionPlanner, IntentRouter);
testMentionedUnequippedToolDoesNotFallBackToFirstContextTool(WorldEngine);
console.log('tool-action-routing regression tests passed');
