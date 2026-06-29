const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadWorldEngine() {
    const context = {
        console,
        State: { activeCharacters: [], characters: [], currentCharacterId: '' },
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
        failureStates: [],
        ...overrides
    };
}

function testClockFailureWarningUsesCounterplay(WorldEngine) {
    const scene = makeScene({
        clocks: [{
            id: 'clock_ration',
            name: '配给压力',
            tag: 'ration',
            value: 5,
            max: 6,
            visibility: 'known'
        }],
        counterStrategies: [{
            id: 'counter_supply_lock',
            title: '物资仓库封锁',
            target: '配给压力',
            status: 'active',
            visibility: 'known',
            progress: 30,
            exposure: 10,
            hint: '探索队补给被锁住。',
            counterplay: ['用旧商场地图换取试探性补给', '承诺带回净水设备作为抵押']
        }],
        failureStates: [{
            id: 'fail_ration',
            title: '配给崩溃',
            status: 'armed',
            trigger: { type: 'clock', clockId: 'clock_ration', at: 'max' }
        }]
    });

    const warning = WorldEngine.getFailureWarnings(scene)[0];
    const actions = WorldEngine.getCurrentSituation(scene).recommendedActions;

    assert.ok(warning, 'visible high clock should create a failure warning');
    assert.strictEqual(warning.action, '用旧商场地图换取试探性补给');
    assert.ok(actions.includes('用旧商场地图换取试探性补给'));
    assert.ok(!actions.includes('处理失败风险：配给崩溃'), 'recommendations should expose mitigation instead of only the failure title');
}

function testHiddenClockFailureDoesNotLeak(WorldEngine) {
    const scene = makeScene({
        clocks: [{
            id: 'clock_secret',
            name: '隐藏倒计时',
            value: 5,
            max: 6,
            visibility: 'hidden'
        }],
        failureStates: [{
            id: 'fail_secret',
            title: '隐藏坏结局',
            status: 'armed',
            trigger: { type: 'clock', clockId: 'clock_secret', at: 'max' }
        }]
    });

    assert.strictEqual(WorldEngine.getFailureWarnings(scene).length, 0);
}

function testCounterFailureWarningUsesCounterplay(WorldEngine) {
    const scene = makeScene({
        counterStrategies: [{
            id: 'counter_security',
            title: '安全协议回收小七',
            status: 'active',
            visibility: 'hinted',
            progress: 70,
            exposure: 20,
            hint: '日志被外部进程反复读取。',
            counterplay: ['切断小七的在线日志同步', '请器灵长老做离线诊断']
        }],
        failureStates: [{
            id: 'fail_security',
            title: '小七被回收',
            status: 'armed',
            hint: '安全协议正在逼近小七。',
            trigger: { type: 'counter', counterId: 'counter_security', at: 90 }
        }]
    });

    const warning = WorldEngine.getFailureWarnings(scene)[0];

    assert.ok(warning);
    assert.strictEqual(warning.triggerType, 'counter');
    assert.strictEqual(warning.action, '切断小七的在线日志同步');
}

function testWorldTensionFailureWarningGivesCoolingAction(WorldEngine) {
    const scene = makeScene({
        worldTension: 70,
        failureStates: [{
            id: 'fail_tension',
            title: '全面失控',
            status: 'armed',
            trigger: { type: 'worldTension', at: 100 }
        }]
    });

    const warning = WorldEngine.getFailureWarnings(scene)[0];

    assert.ok(warning);
    assert.strictEqual(warning.action, '先处理公开危机，降低世界紧张度');
}

const WorldEngine = loadWorldEngine();
testClockFailureWarningUsesCounterplay(WorldEngine);
testHiddenClockFailureDoesNotLeak(WorldEngine);
testCounterFailureWarningUsesCounterplay(WorldEngine);
testWorldTensionFailureWarningGivesCoolingAction(WorldEngine);

console.log('failure-warning-actions regression tests passed');
