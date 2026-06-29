const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadGroupChat(context) {
    const code = fs.readFileSync(path.join(root, 'js/features/group-chat.js'), 'utf8') + '\nthis.GroupChat = GroupChat;';
    vm.runInNewContext(code, context, { filename: 'js/features/group-chat.js' });
    return context.GroupChat;
}

async function testRollRefreshesFinalCheckRecord() {
    const scene = {
        gameState: 'playing',
        pendingCheck: {
            statName: '敏捷',
            key: 'dexterity',
            dc: 1,
            mod: 0,
            statMod: 0,
            itemBonus: 0,
            intent: '悄悄藏起苹果派',
            actionType: 'sneak',
            challengeContext: {
                challengeId: 'tutorial_pie',
                challengeTitle: '苹果派练习',
                approachId: 'hide_pie'
            }
        },
        messages: [],
        eventLog: [],
        currentSituation: { recentRisks: [], recommendedActions: [] }
    };
    const refreshCalls = [];
    const context = {
        console,
        State: {
            scene,
            isStreaming: false,
            saveCurrentSceneDebounced: async () => {}
        },
        ChatUI: {
            onMessageAdded() {},
            refreshMessage(id, options) { refreshCalls.push({ id, options }); },
            _syncInputMode() {}
        },
        ActionBar: {
            renderPendingCheck() {}
        },
        TutorialWorld: {
            isCurrentScene: () => false
        },
        WorldEngine: {
            isScenePlaying: s => !!s && s.gameState === 'playing',
            createVisibility: () => ({ public: true }),
            getCheckTotals: () => ({
                mod: 0,
                dc: 1,
                baseDc: 1,
                statMod: 0,
                itemBonus: 0,
                itemModifiers: [],
                companionModifiers: [],
                modifiers: [],
                bonus: 0,
                dcDelta: 0,
                riskDelta: 0
            }),
            recordEvent(s, data) {
                s.eventLog.push(data);
                return data;
            },
            consumeCheckItems() {},
            resolveChallengeCheck() {
                return {
                    challenge: {
                        id: 'tutorial_pie',
                        title: '苹果派练习',
                        progress: 1,
                        targetProgress: 2,
                        strain: 0,
                        maxStrain: 3,
                        status: 'active'
                    },
                    progressDelta: 1,
                    strainDelta: 0,
                    outcome: 'success'
                };
            },
            resolveCounterStrategies: () => [],
            resolveRelevantConsequences: () => [],
            tickAfterPlayerTurn: async () => {}
        },
        showToast() {}
    };
    const GroupChat = loadGroupChat(context);
    GroupChat._dmNarrate = async () => {};

    await GroupChat.rollPendingCheck();

    assert.strictEqual(scene.pendingCheck, null);
    assert.strictEqual(scene.messages.length, 1);
    assert.strictEqual(scene.messages[0].type, 'check');
    assert.strictEqual(scene.messages[0].checkData.challengeProgress.challengeTitle, '苹果派练习');
    assert.strictEqual(scene.eventLog.length, 1);
    assert.strictEqual(scene.eventLog[0].category, 'check');
    assert.ok(scene.eventLog[0].text.includes('挑战「苹果派练习」'));
    assert.strictEqual(refreshCalls.length, 1);
    assert.strictEqual(refreshCalls[0].id, scene.messages[0].id);
    assert.strictEqual(refreshCalls[0].options.scroll, true);
}

testRollRefreshesFinalCheckRecord()
    .then(() => console.log('check-result-record-refresh regression tests passed'))
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
