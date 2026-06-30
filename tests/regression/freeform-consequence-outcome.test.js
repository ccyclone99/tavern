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
            currentCharacterId: ''
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
        turnCount: 5,
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
        locations: [{ id: 'hall', name: '大厅', description: '人群仍在旁观。', connections: [] }],
        currentSituation: { recentRisks: ['艾拉关系紧张'], recommendedActions: [] },
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
        consequenceLedger: [],
        ...overrides
    };
}

function testFreeformRepairCanResolveLowConsequence(WorldEngine) {
    const scene = makeScene({
        consequenceLedger: [{
            id: 'cons_ela_relation',
            title: '艾拉关系紧张',
            cause: '玩家刚才当众质疑了艾拉。',
            effect: '艾拉暂时不愿提供灵能协助。',
            severity: 'low',
            status: 'active',
            category: 'social',
            tags: ['艾拉', '关系', '道歉'],
            turn: 4,
            createdAt: 100
        }]
    });

    const result = WorldEngine.applyFreeformActionOutcome(
        scene,
        '我向艾拉解释刚才的冒犯，并认真道歉。',
        { actionType: 'ask' },
        { messageId: 'msg_repair_1' }
    );

    assert.strictEqual(result.changed, true);
    assert.strictEqual(result.resolvedConsequences.length, 1);
    assert.strictEqual(result.resolvedConsequences[0].id, 'cons_ela_relation');
    assert.strictEqual(scene.consequenceLedger[0].status, 'resolved');
    assert.strictEqual(scene.consequenceLedger[0].resolvedBy, 'msg_repair_1');
    assert.ok(scene.eventLog.some(event => event.title === '后果解除' && event.refId === 'cons_ela_relation'));
    assert.ok(scene.currentSituation.recentRisks.includes('后果解除：艾拉关系紧张'));
    assert.ok(scene.messages.some(msg => String(msg.content || '').includes('【后果解除】艾拉关系紧张')));
}

function testFreeformRepairDoesNotBypassHighConsequence(WorldEngine) {
    const scene = makeScene({
        consequenceLedger: [{
            id: 'cons_public_alarm',
            title: '公开警报',
            cause: '玩家触发了安全系统。',
            effect: '守卫正在封锁出口。',
            severity: 'high',
            status: 'active',
            category: 'exploration',
            tags: ['警报', '出口', '清理'],
            turn: 4,
            createdAt: 100
        }]
    });

    const result = WorldEngine.applyFreeformActionOutcome(
        scene,
        '我清理警报痕迹，想办法解决出口封锁。',
        { actionType: 'investigate' },
        { messageId: 'msg_repair_high' }
    );

    assert.strictEqual(result.changed, true);
    assert.strictEqual(result.resolvedConsequences.length, 0);
    assert.strictEqual(scene.consequenceLedger[0].status, 'active');
    assert.ok(!scene.eventLog.some(event => event.title === '后果解除'));
}

function testFreeformMentionWithoutRepairIntentDoesNotResolve(WorldEngine) {
    const scene = makeScene({
        consequenceLedger: [{
            id: 'cons_supply_mess',
            title: '补给散乱',
            cause: '之前的仓促搜索弄乱了补给架。',
            effect: '继续搜索会更耗时。',
            severity: 'medium',
            status: 'active',
            category: 'exploration',
            tags: ['补给', '搜索'],
            turn: 4,
            createdAt: 100
        }]
    });

    const result = WorldEngine.applyFreeformActionOutcome(
        scene,
        '我看看补给架现在是什么样。',
        { actionType: 'observe' },
        { messageId: 'msg_observe_1' }
    );

    assert.strictEqual(result.resolvedConsequences.length, 0);
    assert.strictEqual(scene.consequenceLedger[0].status, 'active');
}

const WorldEngine = loadWorldEngine();
testFreeformRepairCanResolveLowConsequence(WorldEngine);
testFreeformRepairDoesNotBypassHighConsequence(WorldEngine);
testFreeformMentionWithoutRepairIntentDoesNotResolve(WorldEngine);
console.log('freeform-consequence-outcome regression tests passed');
