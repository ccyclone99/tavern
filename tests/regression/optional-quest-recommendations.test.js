const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadWorldEngine() {
    const context = {
        console,
        State: {
            characters: [
                { id: 'ajie', name: '阿杰', firstImpression: '总抱着旧全息投影仪。' },
                { id: 'susan', name: '医生苏珊', firstImpression: '记录每一次异常体征。' }
            ],
            activeCharacters: [
                { id: 'ajie', name: '阿杰', firstImpression: '总抱着旧全息投影仪。' },
                { id: 'susan', name: '医生苏珊', firstImpression: '记录每一次异常体征。' }
            ],
            currentCharacterId: 'ajie'
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
        characters: ['ajie', 'susan'],
        currentLocation: 'shelter',
        locations: [{
            id: 'shelter',
            name: '第7区避难所',
            description: '公共大厅里堆着旧全息投影仪、医疗样本盒和地表地图。',
            connections: ['workshop']
        }, {
            id: 'workshop',
            name: '维修间',
            description: '能修复旧设备。',
            connections: ['shelter']
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
        quests: [
            {
                id: 'q_main',
                name: '寻找生存出路',
                type: 'main',
                status: 'active',
                objectives: [{ text: '说服委员会批准地表路线', completed: false }]
            },
            {
                id: 'q_side1',
                name: '阿杰的全息梦',
                type: 'side',
                status: 'active',
                giver: '阿杰',
                objectives: [
                    { text: '听阿杰展示全息投影', completed: false },
                    { text: '在探索中找到更多旧设备', completed: false }
                ]
            },
            {
                id: 'q_side2',
                name: '适应性变异研究',
                type: 'side',
                status: 'active',
                giver: '医生苏珊',
                objectives: [{ text: '让苏珊采集生物样本', completed: false }]
            }
        ],
        ...overrides
    };
}

function testOptionalQuestAppearsBeforeMainPressure(WorldEngine) {
    const scene = makeScene();
    const actions = WorldEngine.getCurrentSituation(scene).recommendedActions;
    const sideIndex = actions.findIndex(action => action.includes('支线可选') && action.includes('阿杰的全息梦'));
    const mainIndex = actions.findIndex(action => action.includes('推进主线'));

    assert.ok(sideIndex >= 0, 'side quest should be visible in recommended actions');
    assert.ok(mainIndex === -1 || sideIndex < mainIndex, 'side quest should not be buried after main objective');
}

function testEvidenceSortsRelevantSideQuestFirst(WorldEngine) {
    const scene = makeScene({
        evidenceLedger: [{
            id: 'ev_sample_ready',
            title: '可采集的低风险生物样本',
            text: '苏珊确认该样本足够安全，可以开始研究。',
            reliability: 'confirmed',
            visible: true,
            tags: ['medical', 'mutation_sample'],
            supports: ['q_side2:1']
        }]
    });

    const leads = WorldEngine.getOptionalQuestLeads(scene);
    const actions = WorldEngine.getCurrentSituation(scene).recommendedActions;

    assert.strictEqual(leads[0].questId, 'q_side2');
    assert.ok(actions.some(action => action.includes('支线可选') && action.includes('适应性变异研究')));
}

function testCompletedSideObjectivesAreSkipped(WorldEngine) {
    const scene = makeScene({
        quests: [
            {
                id: 'q_main',
                name: '寻找生存出路',
                type: 'main',
                status: 'active',
                objectives: [{ text: '说服委员会批准地表路线', completed: false }]
            },
            {
                id: 'q_side1',
                name: '阿杰的全息梦',
                type: 'side',
                status: 'active',
                giver: '阿杰',
                objectives: [
                    { text: '听阿杰展示全息投影', completed: true },
                    { text: '在探索中找到更多旧设备', completed: false }
                ]
            }
        ]
    });

    const actions = WorldEngine.getCurrentSituation(scene).recommendedActions;
    assert.ok(actions.some(action => action.includes('在探索中找到更多旧设备')));
    assert.ok(!actions.some(action => action.includes('听阿杰展示全息投影')));
}

function testPromptNoLongerForcesMainline() {
    const source = fs.readFileSync(path.join(root, 'js/core/prompt-builder.js'), 'utf8');
    assert.ok(!source.includes('拉回主线'));
    assert.ok(!source.includes('引导回主线'));
}

const WorldEngine = loadWorldEngine();
testOptionalQuestAppearsBeforeMainPressure(WorldEngine);
testEvidenceSortsRelevantSideQuestFirst(WorldEngine);
testCompletedSideObjectivesAreSkipped(WorldEngine);
testPromptNoLongerForcesMainline();

console.log('optional quest recommendation regression tests passed');
