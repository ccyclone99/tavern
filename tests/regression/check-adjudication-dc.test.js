const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadGroupChat(scene, warnings = []) {
    const calls = [];
    const context = {
        console: {
            ...console,
            warn(...args) {
                warnings.push(args);
            }
        },
        State: {
            scene,
            saveCurrentSceneDebounced() {
                scene.saved = true;
            }
        },
        WorldEngine: {
            isScenePlaying: value => !!value && (!value.gameState || value.gameState === 'playing'),
            getCheckItemBonus(targetScene, checkContext) {
                calls.push({ fn: 'getCheckItemBonus', checkContext });
                if (checkContext?.actionType === 'observe') {
                    return {
                        bonus: 1,
                        modifiers: [{ source: '便携扫描仪', label: '+1 检定', value: 1, consume: false }]
                    };
                }
                return { bonus: 0, modifiers: [] };
            },
            getAvailableCheckItems(targetScene, checkContext) {
                calls.push({ fn: 'getAvailableCheckItems', checkContext });
                if (checkContext?.actionType === 'observe') {
                    return [{ id: 'item:scan_pack', source: '探测电池', value: 2 }];
                }
                return [];
            },
            getAvailableCompanionResources(targetScene, checkContext) {
                calls.push({ fn: 'getAvailableCompanionResources', checkContext });
                return [];
            }
        }
    };
    const code = fs.readFileSync(path.join(root, 'js/features/group-chat.js'), 'utf8') + '\nthis.GroupChat = GroupChat;';
    vm.runInNewContext(code, context, { filename: 'js/features/group-chat.js' });
    context.GroupChat._testCalls = calls;
    return context.GroupChat;
}

function makeScene(messages = []) {
    return {
        gameState: 'playing',
        userName: '测试玩家',
        playerStats: {
            strength: 10,
            dexterity: 14,
            constitution: 10,
            intelligence: 10,
            wisdom: 10,
            charisma: 10
        },
        messages,
        pendingCheck: null
    };
}

function actionIntentMessage() {
    return {
        id: 'msg_action',
        role: 'user',
        type: 'action_intent',
        content: '我趁守卫转身潜入档案室',
        timestamp: 100,
        actionData: {
            type: 'sneak',
            intent: '我趁守卫转身潜入档案室',
            risk: 58,
            stakes: '被发现会提高警觉',
            suggestedCheck: {
                stat: 'dexterity',
                statName: '敏捷',
                dc: 16
            },
            adjudication: {
                source: 'local',
                stat: 'dexterity',
                statName: '敏捷',
                dc: 16,
                risk: 58,
                reason: '潜入存在失败代价，使用本地风险预览统一 DC。'
            }
        }
    };
}

function testLocalAdjudicationOverridesConflictingAiCheck() {
    const warnings = [];
    const scene = makeScene([actionIntentMessage()]);
    const GroupChat = loadGroupChat(scene, warnings);

    const pending = GroupChat._createPendingCheck('力量|DC5', 'assistant_reply');

    assert.ok(pending, 'conflicting AI check should still create one pending check');
    assert.strictEqual(scene.pendingCheck.key, 'dexterity');
    assert.strictEqual(scene.pendingCheck.statName, '敏捷');
    assert.strictEqual(scene.pendingCheck.dc, 16);
    assert.strictEqual(scene.pendingCheck.source, '本地行动裁决');
    assert.strictEqual(scene.pendingCheck.adjudicationSource, 'local');
    assert.ok(scene.pendingCheck.adjudicationReason.includes('统一 DC'));
    assert.ok(scene.saved, 'creating pending check should save scene');
    assert.ok(warnings.some(args => String(args[0] || '').includes('AI 检定与本地裁决冲突')));
}

function testAiCheckIsUsedWhenNoLocalAdjudicationExists() {
    const scene = makeScene([{
        id: 'msg_talk',
        role: 'user',
        type: 'talk',
        content: '我试着搬开倒塌的柜子',
        timestamp: 100
    }]);
    const GroupChat = loadGroupChat(scene);

    const pending = GroupChat._createPendingCheck('力量|DC13', 'assistant_reply');

    assert.ok(pending, 'AI check should create pending check without local adjudication');
    assert.strictEqual(scene.pendingCheck.key, 'strength');
    assert.strictEqual(scene.pendingCheck.statName, '力量');
    assert.strictEqual(scene.pendingCheck.dc, 13);
    assert.strictEqual(scene.pendingCheck.source, 'AI 要求检定');
    assert.strictEqual(scene.pendingCheck.adjudicationSource, 'ai');
}

function testOrdinaryTalkCheckUsesSavedIntentMetaForItems() {
    const scene = makeScene([{
        id: 'msg_talk_scan',
        role: 'user',
        type: 'talk',
        content: '我用扫描仪扫描墙壁。',
        timestamp: 100,
        intentMeta: {
            kind: 'talk',
            actionType: 'observe',
            confidence: 0.65
        }
    }]);
    const GroupChat = loadGroupChat(scene);

    const pending = GroupChat._createPendingCheck('感知|DC13', 'assistant_reply');

    assert.ok(pending, 'AI check from ordinary talk should create a pending check');
    assert.strictEqual(scene.pendingCheck.key, 'wisdom');
    assert.strictEqual(scene.pendingCheck.actionType, 'observe');
    assert.strictEqual(scene.pendingCheck.intent, '我用扫描仪扫描墙壁。');
    assert.strictEqual(scene.pendingCheck.itemBonus, 1);
    assert.ok(scene.pendingCheck.itemModifiers.some(item => item.source === '便携扫描仪'));
    assert.ok(scene.pendingCheck.availableItemModifiers.some(item => item.source === '探测电池'));
    assert.ok(GroupChat._testCalls.some(call =>
        call.fn === 'getCheckItemBonus' &&
        call.checkContext.actionType === 'observe' &&
        call.checkContext.intent === '我用扫描仪扫描墙壁。'
    ));
}

testLocalAdjudicationOverridesConflictingAiCheck();
testAiCheckIsUsedWhenNoLocalAdjudicationExists();
testOrdinaryTalkCheckUsesSavedIntentMetaForItems();
console.log('check-adjudication-dc regression tests passed');
