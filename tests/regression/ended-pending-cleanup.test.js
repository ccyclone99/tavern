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

function testWorldEngineClearsEndedPendingState() {
    const context = {
        console,
        State: { activeCharacters: [] }
    };
    const WorldEngine = loadBrowserScript('js/features/world-engine.js', context, 'WorldEngine');
    const scene = {
        gameState: 'defeated',
        pendingAction: { intent: '旧行动' },
        pendingCheck: { statName: '感知', dc: 14 },
        inputContext: { state: 'pending_check', prompt: '掷骰', suggestions: [], lastIntentId: '' },
        inventory: [],
        equipment: {},
        equipmentRefs: {}
    };

    WorldEngine.normalizeScene(scene);

    assert.strictEqual(scene.pendingAction, null);
    assert.strictEqual(scene.pendingCheck, null);
    assert.strictEqual(scene.inputContext.state, 'ended');
}

function testIntentRouterIgnoresEndedPendingState() {
    const context = {
        console,
        WorldEngine: {
            isScenePlaying: scene => !!scene && (!scene.gameState || scene.gameState === 'playing'),
            endedSceneMessage: () => '冒险已结束'
        }
    };
    const IntentRouter = loadBrowserScript('js/features/intent-router.js', context, 'IntentRouter');
    const scene = {
        gameState: 'victorious',
        pendingCheck: { statName: '感知', dc: 14 },
        pendingAction: { intent: '旧行动' }
    };

    assert.strictEqual(IntentRouter.route('帮助', scene).kind, 'help');
    assert.notStrictEqual(IntentRouter.route('掷骰', scene).kind, 'roll_check');
    const help = IntentRouter.buildHelpText('帮助', scene);
    assert.ok(help.includes('冒险已结束'));
    assert.ok(!help.includes('等待你完成'), 'ended help should not describe a stale pending check');
}

function fakeButton(mode = '') {
    return {
        dataset: { mode },
        classList: { toggle() {} },
        setAttribute() {}
    };
}

function testChatInputUsesEndedStateInsteadOfPendingState() {
    const scene = {
        gameState: 'defeated',
        pendingCheck: { statName: '感知', dc: 14 },
        inputContext: { state: 'pending_check', prompt: '', suggestions: [], lastIntentId: '' }
    };
    const context = {
        console,
        State: {
            scene,
            isOOC: false,
            inputMode: 'talk',
            isStreaming: false
        },
        WorldEngine: {
            isScenePlaying: target => !!target && (!target.gameState || target.gameState === 'playing')
        },
        Renderer: {
            escapeAttr: value => String(value || ''),
            escapeHtml: value => String(value || '')
        }
    };
    const ChatUI = loadBrowserScript('js/ui/chat.js', context, 'ChatUI');
    ChatUI.inputEl = { placeholder: '' };
    ChatUI.modeHintEl = { textContent: '' };
    ChatUI.suggestionHelpEl = { textContent: '' };
    ChatUI.suggestionChipsEl = { innerHTML: '' };
    ChatUI.sendBtn = { textContent: '', setAttribute() {} };
    ChatUI.talkBtn = fakeButton('talk');
    ChatUI.actionBtn = fakeButton('action');
    ChatUI.strategyBtn = fakeButton('strategy');
    ChatUI.oocBtn = fakeButton('ooc');

    ChatUI._syncInputMode();
    const chips = ChatUI._buildSuggestionChips(scene);

    assert.strictEqual(scene.inputContext.state, 'ended');
    assert.ok(ChatUI.inputEl.placeholder.includes('冒险已结束'));
    assert.strictEqual(JSON.stringify(chips.map(chip => chip.text)), JSON.stringify(['回顾', '失败记录', '帮助']));
    assert.ok(!ChatUI.suggestionChipsEl.innerHTML.includes('掷骰继续'));
}

testWorldEngineClearsEndedPendingState();
testIntentRouterIgnoresEndedPendingState();
testChatInputUsesEndedStateInsteadOfPendingState();
console.log('ended-pending-cleanup regression tests passed');
