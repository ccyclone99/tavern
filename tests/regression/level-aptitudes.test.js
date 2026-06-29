const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadRules() {
    const context = {
        console,
        State: { activeCharacters: [], characters: [], currentCharacterId: '' },
        SidebarRight: {
            markTabNew() {},
            renderDetail() {},
            renderSituation() {}
        },
        ActionBar: {
            renderStatsDisplay() {}
        }
    };
    const worldCode = fs.readFileSync(path.join(root, 'js/features/world-engine.js'), 'utf8') + '\nthis.WorldEngine = WorldEngine;';
    vm.runInNewContext(worldCode, context, { filename: 'js/features/world-engine.js' });
    const plannerCode = fs.readFileSync(path.join(root, 'js/features/action-planner.js'), 'utf8') + '\nthis.ActionPlanner = ActionPlanner;';
    vm.runInNewContext(plannerCode, context, { filename: 'js/features/action-planner.js' });
    return { WorldEngine: context.WorldEngine, ActionPlanner: context.ActionPlanner };
}

function makeScene(overrides = {}) {
    return {
        gameState: 'playing',
        userName: '旅人',
        turnCount: 1,
        playerStats: { strength: 10, dexterity: 10, constitution: 10, intelligence: 16, wisdom: 12, charisma: 8 },
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
        locations: [{ id: 'lab', name: '旧实验室', description: '锁住的终端还在闪烁。', connections: [] }],
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

function testLevelOneHasNoAptitude(WorldEngine) {
    const scene = makeScene();
    assert.strictEqual(WorldEngine.getPlayerAptitudes(scene).length, 0);
}

function testLevelUpUnlocksAptitude(WorldEngine) {
    const scene = makeScene({ exp: 95 });
    const result = WorldEngine.addExperience(scene, 10, { source: '测试奖励', silent: true });
    const aptitudes = WorldEngine.getPlayerAptitudes(scene);

    assert.strictEqual(result.ok, true);
    assert.strictEqual(scene.level, 2);
    assert.strictEqual(scene.attrPoints, 2);
    assert.strictEqual(aptitudes.length, 1);
    assert.strictEqual(aptitudes[0].id, 'technical_inquiry');
}

function testAptitudeAppearsInPreparationHints(WorldEngine) {
    const scene = makeScene({ level: 2 });
    const hints = WorldEngine.getPreparationHints(scene, { limit: 6 });
    const aptitude = hints.find(hint => hint.kind === 'aptitude');

    assert.ok(aptitude, 'level 2 character should surface an aptitude hint');
    assert.strictEqual(aptitude.title, '行动倾向：技术调查');
    assert.strictEqual(aptitude.command, '分析当前线索或设备');
}

function testAptitudeModifiesActionPreview(WorldEngine, ActionPlanner) {
    const lowLevel = makeScene({ level: 1 });
    const highLevel = makeScene({ level: 2 });

    const before = ActionPlanner.create(lowLevel, '我调查旧终端的记录。');
    const after = ActionPlanner.create(highLevel, '我调查旧终端的记录。');

    assert.ok(!before.modifiers.some(item => item.source === '行动倾向：技术调查'));
    assert.ok(after.modifiers.some(item =>
        item.source === '行动倾向：技术调查' &&
        item.riskDelta === -6 &&
        item.dcDelta === -1
    ));
    assert.ok(after.risk < before.risk, 'aptitude should reduce preview risk');
    assert.ok(after.suggestedCheck.dc < before.suggestedCheck.dc, 'aptitude should reduce preview DC');
}

const { WorldEngine, ActionPlanner } = loadRules();
testLevelOneHasNoAptitude(WorldEngine);
testLevelUpUnlocksAptitude(WorldEngine);
testAptitudeAppearsInPreparationHints(WorldEngine);
testAptitudeModifiesActionPreview(WorldEngine, ActionPlanner);

console.log('level-aptitudes regression tests passed');
