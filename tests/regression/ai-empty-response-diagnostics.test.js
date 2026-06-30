const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadContext() {
    const scene = {
        gameState: 'playing',
        turnCount: 4,
        currentLocation: 'hall',
        messages: [{ id: 'u1', role: 'user', content: '我看看周围。', type: 'talk', timestamp: 1 }],
        eventLog: [],
        aiDiagnostics: {},
        currentSituation: { recentRisks: [], recommendedActions: [] }
    };
    const context = {
        console,
        requestAnimationFrame: cb => cb(),
        showToast() {},
        State: {
            scene,
            activeCharacters: [{ id: 'guide', name: '向导' }],
            currentCharacterId: 'guide',
            isStreaming: false,
            async saveCurrentSceneDebounced() {}
        },
        ChatUI: {
            removed: 0,
            finalized: 0,
            appended: [],
            appendStreamingMessage() {},
            updateStreamingContent() {},
            scrollToBottom() {},
            setStreaming() {},
            clearStreaming() {},
            removeStreamingMessage() { this.removed += 1; },
            finalizeStreamingMessage() { this.finalized += 1; },
            onMessageAdded(msg) { this.appended.push(msg); },
            _syncInputMode() {}
        },
        API: {
            getErrorInfo: err => ({ message: err.message || 'err' }),
            stream: async () => ({ content: '   ', reasoningContent: '', usage: null })
        },
        PromptBuilder: {
            build: () => ({ messages: [] }),
            buildGroup: () => ({ messages: [] }),
            buildDMNarration: () => ({ messages: [] })
        },
        Renderer: {
            stripStateUpdate: text => String(text || ''),
            parseMessageType: text => ({ type: 'talk', content: text })
        },
        StrategyManager: { applyStateUpdate() {} },
        PromptGuard: { sanitizeMarkers: markers => markers },
        ActionBar: { renderPendingCheck() {} },
        TutorialWorld: { isCurrentScene: () => false },
        Tutorial: { afterPlayerMessage() {} }
    };
    const worldCode = fs.readFileSync(path.join(root, 'js/features/world-engine.js'), 'utf8') + '\nthis.WorldEngine = WorldEngine;';
    vm.runInNewContext(worldCode, context, { filename: 'js/features/world-engine.js' });
    const groupCode = fs.readFileSync(path.join(root, 'js/features/group-chat.js'), 'utf8') + '\nthis.GroupChat = GroupChat;';
    vm.runInNewContext(groupCode, context, { filename: 'js/features/group-chat.js' });
    return context;
}

async function testEmptyCharacterReplyRecordsDiagnostics() {
    const context = loadContext();
    const before = context.State.scene.messages.length;
    const result = await context.GroupChat.replyAs({ id: 'guide', name: '向导' });
    const scene = context.State.scene;

    assert.strictEqual(result.ok, false);
    assert.strictEqual(result.empty, true);
    assert.strictEqual(context.ChatUI.finalized, 0, 'empty content should not finalize a blank streaming bubble');
    assert.strictEqual(context.ChatUI.removed, 1, 'empty streaming bubble should be removed');
    assert.strictEqual(scene.messages.length, before + 1, 'only a system notice should be added');
    assert.ok(scene.messages.at(-1).content.includes('【AI空回复】角色回复（向导）'));
    assert.ok(!scene.messages.some(msg => msg.characterId === 'guide' && String(msg.content || '').trim() === ''));
    assert.strictEqual(scene.aiDiagnostics.emptyResponses, 1);
    assert.strictEqual(scene.aiDiagnostics.lastEmptyResponse.source, '角色回复');
    assert.strictEqual(scene.aiDiagnostics.lastEmptyResponse.characterId, 'guide');
    assert.ok(scene.eventLog.some(event => event.title === 'AI空回复' && event.text.includes('向导')));
}

async function testEmptyDmNarrationRecordsDiagnostics() {
    const context = loadContext();
    await context.GroupChat._dmNarrate({ trigger: 'check_result' });
    const scene = context.State.scene;

    assert.strictEqual(context.ChatUI.finalized, 0);
    assert.strictEqual(context.ChatUI.removed, 1);
    assert.strictEqual(scene.aiDiagnostics.emptyResponses, 1);
    assert.strictEqual(scene.aiDiagnostics.lastEmptyResponse.source, 'DM续写');
    assert.strictEqual(scene.aiDiagnostics.lastEmptyResponse.trigger, 'check_result');
    assert.ok(scene.messages.at(-1).content.includes('【AI空回复】DM续写'));
}

(async () => {
    await testEmptyCharacterReplyRecordsDiagnostics();
    await testEmptyDmNarrationRecordsDiagnostics();
    console.log('ai-empty-response-diagnostics regression tests passed');
})().catch(err => {
    console.error(err);
    process.exit(1);
});
