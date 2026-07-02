const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadWorldEngine() {
    const context = {
        console,
        State: {
            characters: [{ id: 'ela', name: '灵能者艾拉' }],
            activeCharacters: [{ id: 'ela', name: '灵能者艾拉' }],
            currentCharacterId: 'ela'
        },
        SidebarRight: {
            markTabNew() {},
            renderSituation() {}
        }
    };
    const code = fs.readFileSync(path.join(root, 'js/features/world-engine.js'), 'utf8') + '\nthis.WorldEngine = WorldEngine;';
    vm.runInNewContext(code, context, { filename: 'js/features/world-engine.js' });
    context.WorldEngine._testState = context.State;
    return context.WorldEngine;
}

function makeScene(overrides = {}) {
    return {
        gameState: 'playing',
        userName: '嫌疑人',
        turnCount: 4,
        playerStats: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
        playerHp: 10,
        playerMaxHp: 10,
        level: 1,
        exp: 0,
        attrPoints: 0,
        gold: 0,
        messages: [{
            role: 'assistant',
            type: 'system',
            content: '灵能者艾拉 好感 ↓ -8 · 生气：玩家当众挑衅了她的判断。',
            timestamp: 1
        }],
        eventLog: [],
        inventory: [],
        quests: [{
            id: 'q_main',
            name: '证明清白',
            type: 'main',
            status: 'active',
            objectives: [{ text: '证明玩家不是必须立即处决的污染源', completed: false }]
        }],
        characters: ['ela'],
        currentLocation: 'cargo',
        locations: [{ id: 'cargo', name: '下层货舱', connections: [] }],
        currentSituation: {
            recentRisks: ['强化审讯'],
            recommendedActions: []
        },
        storyPhases: [],
        storyArcs: [],
        sceneChallenges: [{
            id: 'ch_trust',
            title: '塞拉斯最低信任',
            status: 'active',
            goal: '证明玩家不是必须立即处决的污染源。',
            targetProgress: 3,
            progress: 0,
            approaches: [
                { id: 'trust_1', label: '提交污染星球经历', stat: 'charisma', dc: 14 },
                { id: 'trust_2', label: '接受血样与装备检测', stat: 'constitution', dc: 13 },
                { id: 'trust_3', label: '指出货舱遗物异常', stat: 'intelligence', dc: 14 }
            ]
        }],
        clocks: [],
        counterStrategies: [],
        clueGraph: [],
        evidenceLedger: [],
        failureStates: [],
        flowGuide: {
            openingMoves: ['提交污染星球经历', '接受血样与装备检测'],
            sessionGoals: ['证明玩家不是必须立即处决的污染源'],
            stalledPrompts: ['询问艾拉第三道影子在梦里出现的地点'],
            failForward: [],
            completedMoves: [],
            lastProgressTurn: 0,
            lastSoftMoveTurn: 0
        },
        ...overrides
    };
}

function testStalledSoftMoveStartsFromPlayerFreedom(WorldEngine) {
    const text = WorldEngine.formatSoftMove(makeScene(), { reason: 'stalled' });

    assert.ok(text.includes('【可选方向】先处理刚刚发生的后果'));
    assert.ok(text.includes('可选方向：'));
    assert.ok(text.includes('处理关系后果：向灵能者艾拉解释或道歉'));
    assert.ok(text.includes('观察下层货舱里被忽略的细节'));
    assert.ok(text.includes('提出一个自己的计划：我想...'));
    assert.ok(!text.includes('可以尝试：'), 'stalled prompt should not use imperative action wording');
    assert.ok(!text.includes('塞拉斯最低信任'), 'stalled prompt should not lead with the active challenge title');
    assert.ok(!text.includes('证明玩家不是必须立即处决的污染源'), 'main objective should not dominate stalled guidance');
}

function testRecommendedActionsAreNotOnlyChallengeApproaches(WorldEngine) {
    const scene = makeScene();
    const actions = WorldEngine.getCurrentSituation(scene).recommendedActions;

    assert.strictEqual(actions[0], '处理关系后果：向灵能者艾拉解释或道歉');
    assert.ok(actions.includes('处理最近风险：强化审讯'));
    assert.ok(actions.includes('观察下层货舱里被忽略的细节'));
    assert.ok(actions.includes('提出一个自己的计划：我想...'));
    assert.ok(actions.indexOf('提交污染星球经历') > actions.indexOf('提出一个自己的计划：我想...'), 'challenge approaches should appear after freeform choices');
}

function testFreedomActionsUseSceneContext(WorldEngine) {
    const scene = makeScene({
        messages: [],
        currentSituation: { recentRisks: [], recommendedActions: [] },
        locations: [
            { id: 'cargo', name: '下层货舱', description: '昏暗的货舱堆满被封存的异形文物和混沌遗物', connections: ['engine'] },
            { id: 'engine', name: '引擎室', description: '巨大的亚空间引擎发出低沉的轰鸣', connections: ['cargo'] }
        ],
        inventory: [{
            id: 'scanner_1',
            name: '便携扫描仪',
            type: 'misc',
            quantity: 1,
            tags: ['扫描', '观察'],
            effects: [{ type: 'check_bonus', stat: 'wisdom', actionType: 'observe', value: 1, consume: false }]
        }],
        clueGraph: [{
            id: 'clue_cargo',
            title: '货舱残响',
            status: 'hinted',
            currentStage: 0,
            stages: [{
                level: 'hint',
                text: '货舱里有不属于机械的低语。',
                locationId: 'cargo',
                actions: ['核对货舱看守调离记录']
            }]
        }]
    });

    const actions = WorldEngine.getCurrentSituation(scene).recommendedActions;

    assert.ok(actions.includes('细查下层货舱：昏暗的货舱堆满被封存的异形文物和混沌遗物'));
    assert.ok(actions.includes('前往引擎室看看能发现什么'));
    assert.ok(actions.includes('核对货舱看守调离记录'));
    assert.ok(actions.includes('用便携扫描仪检查当前环境'));
}

function testFreeformClueActionCreatesKnowledge(WorldEngine) {
    const scene = makeScene({
        messages: [],
        currentSituation: { recentRisks: [], recommendedActions: [] },
        clueGraph: [{
            id: 'clue_cargo',
            title: '货舱残响',
            subjectType: 'mystery',
            subjectName: '下层货舱',
            status: 'hinted',
            currentStage: 0,
            stages: [{
                id: 'stage_cargo_log',
                level: 'hint',
                title: '货舱残响记录',
                text: '货舱看守调离时间和低语记录能互相印证。',
                source: '机械仆从日志',
                locationId: 'cargo',
                actions: ['核对货舱看守调离记录']
            }]
        }]
    });

    const result = WorldEngine.applyFreeformActionOutcome(
        scene,
        '我核对货舱看守调离记录。',
        { actionType: 'investigate' },
        { messageId: 'msg_user_1' }
    );

    assert.strictEqual(result.changed, true);
    assert.ok(scene.knowledge.discoveries.some(item =>
        item.id === 'disc_free_clue_cargo_stage_cargo_log' &&
        item.title === '货舱残响记录' &&
        item.subjectId === 'clue_cargo'
    ));
    assert.ok(scene.eventLog.some(event =>
        event.category === 'exploration' &&
        event.title === '自由行动收获' &&
        event.messageId === 'msg_user_1'
    ));
}

function testFreeformClueActionAdvancesStageOnce(WorldEngine) {
    const scene = makeScene({
        messages: [],
        currentSituation: { recentRisks: [], recommendedActions: [] },
        clueGraph: [{
            id: 'clue_door',
            title: '门后的响动',
            subjectType: 'mystery',
            subjectName: '封锁门',
            status: 'hinted',
            currentStage: 0,
            stages: [
                {
                    id: 'dust',
                    level: 'hint',
                    title: '门缝灰痕',
                    text: '门缝下的灰尘被人从里面拨开过。',
                    source: '封锁门',
                    locationId: 'cargo',
                    actions: ['检查门缝灰痕']
                },
                {
                    id: 'listen',
                    level: 'hint',
                    title: '门后呼吸声',
                    text: '门后有很轻的呼吸声，可以继续确认里面是谁。',
                    source: '封锁门',
                    locationId: 'cargo',
                    actions: ['贴门听里面动静']
                }
            ]
        }]
    });

    const first = WorldEngine.applyFreeformActionOutcome(
        scene,
        '我检查门缝灰痕。',
        { actionType: 'investigate' },
        { messageId: 'msg_user_stage_1' }
    );
    const clue = scene.clueGraph[0];

    assert.ok(first.clueProgress);
    assert.strictEqual(first.clueProgress.advanced, true);
    assert.strictEqual(clue.currentStage, 1);
    assert.strictEqual(clue.status, 'suspected');
    assert.ok(scene.eventLog.some(event => event.title === '线索推进' && event.refId === 'clue_door'));
    assert.ok(scene.messages.some(msg => String(msg.content || '').includes('【线索推进：门后的响动】')));
    assert.ok(WorldEngine.getCurrentSituation(scene).knownUnknowns[0].actions.includes('贴门听里面动静'));

    WorldEngine.applyFreeformActionOutcome(
        scene,
        '我检查门缝灰痕。',
        { actionType: 'investigate' },
        { messageId: 'msg_user_stage_repeat' }
    );
    assert.strictEqual(clue.currentStage, 1, 'repeating the same freeform clue action should not farm stages');
}

function testFreeformLocationObservationDedupesKnowledge(WorldEngine) {
    const scene = makeScene({
        messages: [],
        currentSituation: { recentRisks: [], recommendedActions: [] },
        clueGraph: [],
        locations: [{
            id: 'cargo',
            name: '下层货舱',
            description: '昏暗的货舱堆满被封存的异形文物和混沌遗物',
            connections: []
        }]
    });

    const first = WorldEngine.applyFreeformActionOutcome(scene, '我观察四周。', { actionType: 'observe' });
    const second = WorldEngine.applyFreeformActionOutcome(scene, '我再观察一下四周。', { actionType: 'observe' });
    const locationDiscoveries = scene.knowledge.discoveries.filter(item => item.id === 'disc_free_loc_cargo');

    assert.strictEqual(first.changed, true);
    assert.strictEqual(second.changed, true);
    assert.strictEqual(locationDiscoveries.length, 1);
    assert.strictEqual(locationDiscoveries[0].title, '下层货舱可利用细节');
}

function testFreeformHiddenFactOnlyUnlocksHint(WorldEngine) {
    WorldEngine._testState.currentCharacterId = 'silas';
    WorldEngine._testState.characters = [{
        id: 'silas',
        name: '审判官塞拉斯',
        firstImpression: '机械义眼总在审讯记录前停顿。',
        profile: {
            public: { title: '审判官', firstImpression: '冷酷、权威、正在审视你。' },
            hiddenFacts: [{
                id: 'eye_record',
                type: 'secret',
                title: '机械义眼记录',
                hint: '他的机械义眼在提到前任助手时有异常延迟。',
                truth: 'SECRET_EYE_RECORDING'
            }]
        }
    }];
    const scene = makeScene({
        characters: ['silas'],
        currentSituation: { recentRisks: [], recommendedActions: [] },
        clueGraph: []
    });

    const result = WorldEngine.applyFreeformActionOutcome(
        scene,
        '我观察塞拉斯的机械义眼记录有没有异常。',
        { actionType: 'observe' }
    );

    assert.strictEqual(result.changed, true);
    assert.strictEqual(scene.discoveries.characters.silas.eye_record.state, 'hinted');
    assert.ok(scene.knowledge.discoveries.some(item =>
        item.id === 'disc_free_hidden_silas_eye_record' &&
        item.text.includes('异常延迟')
    ));
    assert.ok(!scene.knowledge.discoveries.some(item => String(item.text || '').includes('SECRET_EYE_RECORDING')));
}

function testFreeformNamedNpcOverridesCurrentFocus(WorldEngine) {
    WorldEngine._testState.currentCharacterId = 'silas';
    WorldEngine._testState.characters = [
        {
            id: 'silas',
            name: '审判官塞拉斯',
            firstImpression: '他正等着玩家解释。',
            profile: {
                hiddenFacts: [{
                    id: 'eye_record',
                    type: 'secret',
                    title: '机械义眼记录',
                    hint: '塞拉斯的义眼在特定名字前会延迟。',
                    truth: 'SECRET_SILAS_TRUTH'
                }]
            }
        },
        {
            id: 'ela',
            name: '灵能者艾拉',
            firstImpression: '她一直回避梦境话题。',
            profile: {
                hiddenFacts: [{
                    id: 'dream_shadow',
                    type: 'secret',
                    title: '梦里的第三道影子',
                    hint: '艾拉提到梦境时会下意识看向货舱方向。',
                    truth: 'SECRET_ELA_TRUTH'
                }]
            }
        }
    ];
    const scene = makeScene({
        characters: ['silas', 'ela'],
        currentSituation: { recentRisks: [], recommendedActions: [] },
        clueGraph: []
    });

    const result = WorldEngine.applyFreeformActionOutcome(
        scene,
        '我询问灵能者艾拉，她梦里的第三道影子到底和货舱有什么关系。',
        { actionType: 'ask' }
    );

    assert.strictEqual(result.changed, true);
    assert.strictEqual(scene.discoveries.characters.ela.dream_shadow.state, 'hinted');
    assert.ok(!scene.discoveries.characters.silas?.eye_record, 'named NPC action should not attach hidden fact to current selected NPC');
    assert.ok(scene.knowledge.discoveries.some(item =>
        item.subjectId === 'ela' &&
        item.id === 'disc_free_hidden_ela_dream_shadow' &&
        item.text.includes('货舱方向')
    ));
    assert.ok(!scene.knowledge.discoveries.some(item => String(item.text || '').includes('SECRET_ELA_TRUTH')));
}

function testAutomaticPromptWaitsLongerBeforeIntervening(WorldEngine) {
    const early = makeScene({ turnCount: 3 });
    assert.strictEqual(WorldEngine._maybeEmitStalledSoftMove(early), null);
    assert.strictEqual(early.messages.length, 1);

    const due = makeScene({ turnCount: 4 });
    const emitted = WorldEngine._maybeEmitStalledSoftMove(due);
    assert.ok(emitted.includes('【可选方向】'));
    assert.strictEqual(due.messages.length, 2);
    assert.ok(due.messages[1].content.includes('提出一个自己的计划：我想...'));
}

function testFlowGuideFallbackUsesNeutralWording(WorldEngine) {
    const scene = makeScene({
        flowGuide: {
            openingMoves: [],
            sessionGoals: ['证明玩家不是威胁'],
            stalledPrompts: [],
            failForward: [],
            completedMoves: []
        }
    });

    const actions = WorldEngine._buildFlowActions(scene);

    assert.ok(actions.includes('选择自己的切入点：证明玩家不是威胁'));
    assert.ok(!actions.some(action => action.startsWith('推进目标：')));
}

function testFlowMoveCompletionCoversStalledPrompts(WorldEngine) {
    const scene = makeScene({
        turnCount: 5,
        flowGuide: {
            openingMoves: [],
            sessionGoals: [],
            stalledPrompts: ['询问艾拉第三道影子在梦里出现的地点'],
            failForward: [],
            completedMoves: []
        }
    });

    assert.ok(WorldEngine._buildFlowActions(scene).includes('询问艾拉第三道影子在梦里出现的地点'));
    assert.strictEqual(WorldEngine.markFlowMoveCompleted(scene, '我询问艾拉第三道影子的地点。'), true);
    assert.ok(scene.flowGuide.completedMoves.includes('询问艾拉第三道影子在梦里出现的地点'));
    assert.ok(!WorldEngine._buildFlowActions(scene).includes('询问艾拉第三道影子在梦里出现的地点'));
}

function testFlowMoveCompletionFiltersStageAndChallengeActions(WorldEngine) {
    const stageScene = makeScene({
        messages: [],
        quests: [],
        currentSituation: { recentRisks: [], recommendedActions: [] },
        sceneChallenges: [],
        clueGraph: [],
        storyPhases: [{
            id: 'phase_ela',
            title: '验证梦境',
            status: 'active',
            goal: '确认第三道影子的来源',
            recommendedActions: ['询问艾拉第三道影子在梦里出现的地点']
        }],
        flowGuide: {
            openingMoves: [],
            sessionGoals: [],
            stalledPrompts: [],
            failForward: [],
            completedMoves: []
        }
    });
    const challengeScene = makeScene({
        messages: [],
        currentSituation: { recentRisks: [], recommendedActions: [] },
        flowGuide: {
            openingMoves: ['提交污染星球经历'],
            sessionGoals: [],
            stalledPrompts: [],
            failForward: [],
            completedMoves: []
        }
    });

    assert.ok(WorldEngine.getCurrentSituation(stageScene).recommendedActions.includes('询问艾拉第三道影子在梦里出现的地点'));
    assert.ok(WorldEngine.getCurrentSituation(challengeScene).recommendedActions.includes('提交污染星球经历'));

    WorldEngine.markFlowMoveCompleted(stageScene, '我询问艾拉第三道影子的地点。');
    WorldEngine.markFlowMoveCompleted(challengeScene, '我提交污染星球经历。');
    const stageActions = WorldEngine.getCurrentSituation(stageScene).recommendedActions;
    const challengeActions = WorldEngine.getCurrentSituation(challengeScene).recommendedActions;

    assert.ok(!stageActions.includes('询问艾拉第三道影子在梦里出现的地点'));
    assert.ok(!challengeActions.includes('提交污染星球经历'));
}

function testProgressEventCanCompleteFlowMove(WorldEngine) {
    const scene = makeScene({
        flowGuide: {
            openingMoves: ['接受血样与装备检测'],
            sessionGoals: [],
            stalledPrompts: [],
            failForward: [],
            completedMoves: []
        }
    });

    WorldEngine.recordEvent(scene, {
        category: 'check',
        title: '接受血样检测',
        text: '玩家配合克拉克斯完成血样与装备检测。'
    });

    assert.ok(scene.flowGuide.completedMoves.includes('接受血样与装备检测'));
}

const WorldEngine = loadWorldEngine();
testStalledSoftMoveStartsFromPlayerFreedom(WorldEngine);
testRecommendedActionsAreNotOnlyChallengeApproaches(WorldEngine);
testFreedomActionsUseSceneContext(WorldEngine);
testFreeformClueActionCreatesKnowledge(WorldEngine);
testFreeformClueActionAdvancesStageOnce(WorldEngine);
testFreeformLocationObservationDedupesKnowledge(WorldEngine);
testFreeformHiddenFactOnlyUnlocksHint(WorldEngine);
testFreeformNamedNpcOverridesCurrentFocus(WorldEngine);
testAutomaticPromptWaitsLongerBeforeIntervening(WorldEngine);
testFlowGuideFallbackUsesNeutralWording(WorldEngine);
testFlowMoveCompletionCoversStalledPrompts(WorldEngine);
testFlowMoveCompletionFiltersStageAndChallengeActions(WorldEngine);
testProgressEventCanCompleteFlowMove(WorldEngine);
console.log('freeform-guidance regression tests passed');
