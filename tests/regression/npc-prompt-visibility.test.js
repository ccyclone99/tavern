const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadPromptBuilder(context) {
    const code = fs.readFileSync(path.join(root, 'js/core/prompt-builder.js'), 'utf8') + '\nthis.PromptBuilder = PromptBuilder;';
    vm.runInNewContext(code, context, { filename: 'js/core/prompt-builder.js' });
    return context.PromptBuilder;
}

function makeContext(scene, activeChallenge) {
    return {
        console,
        State: {
            settings: { model: 'test-model', thinkingEnabled: false },
            scene
        },
        WorldEngine: {
            filterMessagesForCharacter(messages) {
                return messages;
            },
            getKnownUnknowns() {
                return [{
                    title: 'VISIBLE_CLUE_TITLE',
                    status: 'hinted',
                    text: 'VISIBLE_CLUE_TEXT',
                    source: '玩家观察',
                    actions: ['VISIBLE_CLUE_ACTION'],
                    evidenceCount: 0
                }];
            },
            getFailureWarnings() {
                return [{
                    title: 'VISIBLE_FAILURE_TITLE',
                    text: 'VISIBLE_FAILURE_TEXT',
                    sourceName: 'VISIBLE_CLOCK',
                    value: 2,
                    max: 3,
                    actions: ['VISIBLE_MITIGATION']
                }];
            },
            getActiveChallenge() {
                return activeChallenge;
            },
            getCurrentSituation() {
                return { recommendedActions: ['VISIBLE_RECOMMENDED_ACTION'] };
            }
        }
    };
}

function makeScene() {
    const activeChallenge = {
        id: 'active_challenge',
        title: 'VISIBLE_ACTIVE_CHALLENGE',
        status: 'active',
        goal: '取得公开证词',
        stakes: '公开风险会上升',
        targetProgress: 3,
        progress: 1,
        approaches: [{ id: 'talk', label: 'VISIBLE_APPROACH', stat: 'charisma', dc: 14 }],
        failForward: ['留下可见代价']
    };
    return {
        activeChallenge,
        scene: {
            userName: '嫌疑人',
            name: '审讯厅',
            playerStats: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
            playerHp: 10,
            playerMaxHp: 10,
            level: 1,
            exp: 0,
            gold: 0,
            messages: [],
            lorebookEntries: [],
            inventory: [],
            quests: [],
            locations: [{ id: 'room', name: '审讯厅', description: '灯光刺眼。', connections: [] }],
            currentLocation: 'room',
            knowledge: {
                discoveries: [{
                    subjectType: 'character',
                    subjectId: 'silas',
                    level: 'hint',
                    reliability: 'unverified',
                    text: 'KNOWN_PLAYER_HINT',
                    source: '观察'
                }]
            },
            clueGraph: [{
                id: 'clue_secret',
                title: '可疑影子',
                status: 'hinted',
                truth: 'SECRET_CLUE_TRUTH',
                currentStage: 0,
                stages: [{
                    text: 'VISIBLE_CLUE_STAGE',
                    source: '现场',
                    actions: ['继续观察'],
                    onFailure: 'SECRET_ON_FAILURE'
                }]
            }],
            failureStates: [{
                id: 'bad_end',
                title: 'SECRET_FAILURE_TITLE',
                status: 'armed',
                hint: 'SECRET_FAILURE_HINT',
                trigger: { type: 'clock', clockId: 'hidden_clock', at: 'max' }
            }],
            clocks: [
                { id: 'hidden_clock', name: 'SECRET_HIDDEN_CLOCK', visibility: 'hidden', value: 2, max: 3 },
                { id: 'public_clock', name: 'VISIBLE_CLOCK', visibility: 'known', value: 2, max: 3 }
            ],
            counterStrategies: [],
            gameplayProfile: { checkDensity: { targetPerRun: [8, 12], minPerMainPhase: 1, maxAutoQuestAdvances: 2 } },
            flowGraph: {
                revelations: [
                    { id: 'rev_secret', conclusion: 'SECRET_REVELATION', status: 'unknown', core: true, clueIds: ['clue_secret'] },
                    { id: 'rev_visible', conclusion: 'VISIBLE_REVELATION', status: 'suspected', core: true, clueIds: ['clue_secret'] }
                ]
            },
            sceneChallenges: [
                activeChallenge,
                {
                    id: 'locked_challenge',
                    title: 'SECRET_LOCKED_CHALLENGE',
                    status: 'locked',
                    goal: '未来阶段',
                    approaches: [{ id: 'future', label: 'SECRET_LOCKED_APPROACH', stat: 'wisdom', dc: 18 }]
                }
            ],
            storyArcs: [{
                title: 'SECRET_ARC_TITLE',
                phase: 'intro',
                synopsis: 'SECRET_ARC_SYNOPSIS',
                currentBeat: 0,
                beats: [{ condition: 'SECRET_BEAT_CONDITION', action: 'SECRET_BEAT_ACTION' }]
            }]
        }
    };
}

function testNpcPromptOnlyReceivesVisibleGlobalContext() {
    const { scene, activeChallenge } = makeScene();
    const currentChar = {
        id: 'silas',
        name: '塞拉斯',
        description: '冷峻的审判官。',
        profile: {
            hiddenFacts: [{
                id: 'self_secret',
                title: '本人秘密',
                hint: 'SELF_HINT',
                truth: 'SECRET_SELF_TRUTH'
            }]
        },
        secrets: ['SECRET_SELF_SECRET']
    };
    const otherChar = {
        id: 'ela',
        name: '艾拉',
        profile: {
            hiddenFacts: [{
                id: 'other_secret',
                title: '他人秘密',
                hint: 'OTHER_HINT',
                truth: 'SECRET_OTHER_TRUTH'
            }]
        },
        secrets: ['SECRET_OTHER_SECRET']
    };
    const context = makeContext(scene, activeChallenge);
    const PromptBuilder = loadPromptBuilder(context);
    const body = PromptBuilder.buildGroup(currentChar, scene, [], [currentChar, otherChar]);
    const system = body.messages[0].content;

    assert.ok(system.includes('KNOWN_PLAYER_HINT'), 'NPC prompt should include player-known knowledge');
    assert.ok(system.includes('VISIBLE_CLUE_TEXT'), 'NPC prompt should include visible clue surface');
    assert.ok(system.includes('VISIBLE_FAILURE_TEXT'), 'NPC prompt should include visible failure warning');
    assert.ok(system.includes('VISIBLE_ACTIVE_CHALLENGE'), 'NPC prompt should include active challenge');
    assert.ok(system.includes('SECRET_SELF_TRUTH'), 'current NPC still receives its own private roleplay facts');

    [
        'SECRET_OTHER_TRUTH',
        'SECRET_OTHER_SECRET',
        'SECRET_CLUE_TRUTH',
        'SECRET_ON_FAILURE',
        'SECRET_FAILURE_TITLE',
        'SECRET_FAILURE_HINT',
        'SECRET_HIDDEN_CLOCK',
        'SECRET_REVELATION',
        'SECRET_LOCKED_CHALLENGE',
        'SECRET_LOCKED_APPROACH',
        'SECRET_ARC_TITLE',
        'SECRET_ARC_SYNOPSIS',
        'SECRET_BEAT_CONDITION',
        'SECRET_BEAT_ACTION'
    ].forEach(secret => {
        assert.ok(!system.includes(secret), `${secret} should not enter normal NPC prompt`);
    });
}

function testDmPromptKeepsPrivateStructureAndPlayerKnowledge() {
    const { scene, activeChallenge } = makeScene();
    const context = makeContext(scene, activeChallenge);
    const PromptBuilder = loadPromptBuilder(context);
    const body = PromptBuilder.buildDMNarration(scene, []);
    const system = body.messages[0].content;

    assert.ok(system.includes('KNOWN_PLAYER_HINT'), 'DM prompt should still know what the player has discovered');
    assert.ok(system.includes('SECRET_CLUE_TRUTH'), 'DM prompt should keep private clue truth');
    assert.ok(system.includes('SECRET_FAILURE_TITLE'), 'DM prompt should keep private failure structure');
    assert.ok(system.includes('SECRET_REVELATION'), 'DM prompt should keep private revelation structure');
    assert.ok(system.includes('SECRET_BEAT_ACTION'), 'DM prompt should keep private story beats');
}

testNpcPromptOnlyReceivesVisibleGlobalContext();
testDmPromptKeepsPrivateStructureAndPlayerKnowledge();
console.log('npc-prompt-visibility regression tests passed');
