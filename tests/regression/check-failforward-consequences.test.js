const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadContext(scene) {
    const context = {
        console,
        State: {
            scene,
            characters: [],
            activeCharacters: [],
            currentCharacterId: ''
        },
        SidebarRight: {
            markTabNew() {},
            renderSituation() {}
        }
    };
    const worldCode = fs.readFileSync(path.join(root, 'js/features/world-engine.js'), 'utf8') + '\nthis.WorldEngine = WorldEngine;';
    vm.runInNewContext(worldCode, context, { filename: 'js/features/world-engine.js' });
    const groupCode = fs.readFileSync(path.join(root, 'js/features/group-chat.js'), 'utf8') + '\nthis.GroupChat = GroupChat;';
    vm.runInNewContext(groupCode, context, { filename: 'js/features/group-chat.js' });
    return context;
}

function makeScene(overrides = {}) {
    return {
        gameState: 'playing',
        userName: '测试玩家',
        messages: [],
        eventLog: [],
        currentSituation: { recentRisks: [], recommendedActions: [] },
        quests: [],
        characters: [],
        locations: [],
        currentLocation: '',
        storyPhases: [],
        sceneChallenges: [{
            id: 'challenge_trust',
            title: '最低限度信任',
            status: 'active',
            goal: '取得一次受控调查许可',
            targetProgress: 3,
            progress: 0,
            maxStrain: 3,
            strain: 0,
            approaches: [],
            failForward: ['审判庭怀疑上升，但给出更明确的审讯问题']
        }],
        clueGraph: [],
        evidenceLedger: [],
        clocks: [],
        counterStrategies: [],
        failureStates: [],
        flowGuide: {
            openingMoves: [],
            sessionGoals: [],
            stalledPrompts: [],
            failForward: ['船上时钟推进，货舱遗物低语增强'],
            completedMoves: [],
            lastProgressTurn: 0,
            lastSoftMoveTurn: 0
        },
        ...overrides
    };
}

function testCheckConsequencesUseScenarioFailForward() {
    const scene = makeScene();
    const { GroupChat } = loadContext(scene);
    const check = {
        statName: '魅力',
        key: 'charisma',
        intent: '说服审判官给我一次受控调查许可',
        challengeContext: {
            challengeId: 'challenge_trust',
            challengeTitle: '最低限度信任'
        },
        risks: ['塞拉斯怀疑你在撒谎']
    };

    const fail = GroupChat._buildCheckConsequences('fail', check, scene);
    const partial = GroupChat._buildCheckConsequences('partial', check, scene);

    assert.strictEqual(fail[0], '审判庭怀疑上升，但给出更明确的审讯问题');
    assert.ok(fail.includes('船上时钟推进，货舱遗物低语增强'));
    assert.strictEqual(partial[0], '审判庭怀疑上升，但给出更明确的审讯问题');
    assert.ok(partial.some(item => item.includes('达成部分目标')));
}

function testClueFailureCanProvideConcreteOnFailure() {
    const scene = makeScene({
        sceneChallenges: [],
        flowGuide: {
            openingMoves: [],
            sessionGoals: [],
            stalledPrompts: [],
            failForward: [],
            completedMoves: []
        },
        clueGraph: [{
            id: 'clue_cargo',
            title: '货舱残响',
            status: 'hinted',
            currentStage: 0,
            stages: [{
                id: 'stage_log',
                actions: ['核对货舱看守调离记录'],
                onFailure: '看守怀疑玩家偷看禁档，审判庭怀疑时钟推进。'
            }]
        }]
    });
    const { WorldEngine } = loadContext(scene);
    const options = WorldEngine.getFailForwardConsequences(scene, {
        intent: '我核对货舱看守调离记录',
        actionType: 'investigate'
    }, 'fail');

    assert.strictEqual(options[0], '看守怀疑玩家偷看禁档，审判庭怀疑时钟推进。');
}

testCheckConsequencesUseScenarioFailForward();
testClueFailureCanProvideConcreteOnFailure();
console.log('check-failforward-consequences regression tests passed');
