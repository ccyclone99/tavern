const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadBrowserScript(file, context, exportName) {
    const code = fs.readFileSync(path.join(root, file), 'utf8') + `\nthis.${exportName} = ${exportName};`;
    vm.runInNewContext(code, context, { filename: file });
    return context[exportName];
}

function isScenePlaying(scene) {
    return !!scene && (!scene.gameState || scene.gameState === 'playing');
}

async function testLocationMoveKeepsMessagesCreatedByStateUpdate() {
    const scene = { gameState: 'playing', messages: [] };
    const context = {
        console,
        State: {
            isStreaming: false,
            scene,
            saveCurrentSceneDebounced: async () => {}
        },
        ChatUI: {
            _renderedCount: 0,
            setStreaming() {},
            appendStreamingMessage() {},
            updateStreamingContent() {},
            scrollToBottom() {},
            removeStreamingMessage() {},
            clearStreaming() {},
            finalizeStreamingMessage() {}
        },
        PromptBuilder: {
            buildDMNarration: () => ({ messages: [] })
        },
        API: {
            stream: async () => ({
                content: 'Arrived.\n<state_update>{"scene":{"worldTensionDelta":1}}</state_update>'
            })
        },
        Renderer: {
            stripStateUpdate: text => String(text || '').replace(/<state_update>[\s\S]*?<\/state_update>/gi, '').trim()
        },
        StrategyManager: {
            applyStateUpdate(update) {
                assert.strictEqual(update?.scene?.worldTensionDelta, 1);
                scene.messages.push({ id: 'ending-message', role: 'assistant', content: 'ending', type: 'victory' });
                scene.gameState = 'victorious';
            }
        },
        WorldEngine: {
            isScenePlaying,
            createVisibility: data => data
        },
        showToast() {}
    };
    const GroupChat = loadBrowserScript('js/features/group-chat.js', context, 'GroupChat');

    await GroupChat.handleLocationMove({ name: 'Vault' });

    assert.strictEqual(scene.messages.some(msg => msg.type === 'action'), false, 'temporary location prompt should be removed by id');
    assert.ok(scene.messages.some(msg => msg.id === 'ending-message'), 'state update message should be preserved');
    assert.ok(scene.messages.some(msg => msg.content === 'Arrived.'), 'clean narration should still be recorded');
}

async function testLocationMoveDoesNotStartAfterEnding() {
    const scene = { gameState: 'defeated', messages: [] };
    let streamed = false;
    let notice = '';
    const context = {
        console,
        State: { isStreaming: false, scene },
        ChatUI: { setStreaming() { throw new Error('streaming should not start'); } },
        API: { stream: async () => { streamed = true; } },
        WorldEngine: {
            isScenePlaying,
            endedSceneMessage: () => 'ended'
        },
        showToast(message) { notice = message; }
    };
    const GroupChat = loadBrowserScript('js/features/group-chat.js', context, 'GroupChat');

    await GroupChat.handleLocationMove({ name: 'Vault' });

    assert.strictEqual(streamed, false, 'ended scene should not request a location narration');
    assert.strictEqual(notice, 'ended');
    assert.deepStrictEqual(scene.messages, []);
}

async function testAsyncRelationshipUpdateStopsIfSceneEndsBeforeResponse() {
    const scene = {
        gameState: 'playing',
        userName: 'Tester',
        messages: [{ role: 'user', type: 'action_intent', content: 'hello' }]
    };
    const char = { id: 'char_1', name: 'NPC', _relations: {} };
    let saved = false;
    const context = {
        console,
        State: {
            scene,
            characters: [char],
            settings: { apiKey: 'test', model: 'test-model' },
            emit() {}
        },
        Storage: {
            saveCharacter: async () => { saved = true; }
        },
        API: {
            fetchWithRetry: async () => {
                scene.gameState = 'victorious';
                return {
                    json: async () => ({
                        choices: [{ message: { content: '{"affection_delta":5,"mood":"happy","reason":"done"}' } }]
                    })
                };
            }
        },
        AIGenerator: {
            _extractBalanced: text => text
        },
        WorldEngine: { isScenePlaying },
        showToast() {}
    };
    const Relationship = loadBrowserScript('js/features/relationship.js', context, 'Relationship');

    await Relationship.analyzeAndUpdate('char_1', scene.messages);

    const relation = char._relations.Tester;
    assert.ok(relation, 'relation shell may be initialized before the async request');
    assert.strictEqual(relation.affection, 0);
    assert.strictEqual(relation.history.length, 0);
    assert.strictEqual(saved, false, 'ended scene should not persist an async relationship mutation');
}

async function testStateUpdateStopsFieldsAfterFlowGraphEnding() {
    const scene = {
        gameState: 'playing',
        messages: [],
        strategies: [],
        inventory: [],
        flowGraph: { nodes: [], revelations: [] }
    };
    let granted = 0;
    const context = {
        console,
        State: {
            scene,
            saveCurrentSceneDebounced() {},
            addKnowledgeDiscovery: () => false,
            characters: [],
            settings: {}
        },
        WorldEngine: {
            isScenePlaying,
            endedSceneMessage: () => 'ended',
            applyFlowGraphUpdate() {
                scene.gameState = 'victorious';
                scene.messages.push({ id: 'victory', type: 'victory', content: 'done' });
                return true;
            },
            grantInventoryItem() {
                granted += 1;
                return { ok: true };
            }
        },
        SidebarRight: {
            renderStrategies() {},
            renderKnowledge() {},
            renderDetail() {},
            renderInventory() {},
            renderQuests() {},
            renderMap() {},
            renderSituation() {},
            markTabNew() {}
        },
        SidebarLeft: { render() {} },
        showToast() {}
    };
    const StrategyManager = loadBrowserScript('js/features/strategy-manager.js', context, 'StrategyManager');

    StrategyManager.applyStateUpdate({
        flowGraphUpdate: { nodes: [{ id: 'n1', title: 'ending node' }] },
        itemAdd: [{ name: 'Late Reward', quantity: 1 }]
    });

    assert.strictEqual(granted, 0, 'fields after an ending state update should be skipped');
    assert.strictEqual(scene.gameState, 'victorious');
}

async function testRuleBasedRelationshipUpdateStopsAfterEnding() {
    const scene = { gameState: 'defeated', userName: 'Tester', messages: [] };
    const char = { id: 'char_1', name: 'NPC', _relations: {} };
    const context = {
        console,
        State: {
            scene,
            characters: [char],
            emit() {}
        },
        Storage: {
            saveCharacter: async () => {}
        },
        WorldEngine: { isScenePlaying }
    };
    const Relationship = loadBrowserScript('js/features/relationship.js', context, 'Relationship');

    Relationship.ruleBasedUpdate('char_1', 'thanks');

    assert.deepStrictEqual(char._relations, {}, 'ended scene should not initialize or mutate relations');
}

(async () => {
    await testLocationMoveKeepsMessagesCreatedByStateUpdate();
    await testLocationMoveDoesNotStartAfterEnding();
    await testAsyncRelationshipUpdateStopsIfSceneEndsBeforeResponse();
    await testStateUpdateStopsFieldsAfterFlowGraphEnding();
    await testRuleBasedRelationshipUpdateStopsAfterEnding();
    console.log('ended-scene-guards regression tests passed');
})().catch(err => {
    console.error(err);
    process.exit(1);
});
