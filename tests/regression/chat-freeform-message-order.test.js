const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadChatUI(context) {
    const code = fs.readFileSync(path.join(root, 'js/ui/chat.js'), 'utf8') + '\nthis.ChatUI = ChatUI;';
    vm.runInNewContext(code, context, { filename: 'js/ui/chat.js' });
    return context.ChatUI;
}

async function testUserMessageRendersBeforeFreeformSystemMessage() {
    const scene = {
        gameState: 'playing',
        userName: '旅人',
        messages: []
    };
    const rendered = [];
    const context = {
        console,
        State: {
            scene,
            isStreaming: false,
            isOOC: false,
            inputMode: 'talk',
            activeCharacters: [],
            currentCharacterId: '',
            async saveCurrentSceneDebounced() {},
            setCurrentCharacter() {}
        },
        IntentRouter: {
            route(text) {
                return { kind: 'talk', text, meta: { actionType: 'observe' }, reason: 'classified_observe' };
            }
        },
        PromptGuard: {
            inspectUserInput() {
                return { blocked: false };
            }
        },
        WorldEngine: {
            createVisibility() {
                return { public: true };
            },
            markFlowMoveCompleted() {},
            applyFreeformActionOutcome(targetScene) {
                const msg = {
                    id: 'msg_system',
                    role: 'assistant',
                    content: '【探索收获】记录证据',
                    type: 'system',
                    timestamp: Date.now()
                };
                targetScene.messages.push(msg);
                context.ChatUI.onMessageAdded(msg);
                return { changed: true, discoveries: [{ id: 'disc_1' }] };
            }
        },
        GroupChat: {
            async handleUserMessage() {}
        },
        showToast() {}
    };
    const ChatUI = loadChatUI(context);
    ChatUI.inputEl = { value: '我观察四周', style: { height: '12px' } };
    ChatUI.onMessageAdded = msg => rendered.push(msg.content);
    ChatUI._isSceneEnded = () => false;

    await ChatUI.onSend();

    assert.strictEqual(JSON.stringify(scene.messages.map(msg => msg.content)), JSON.stringify(['我观察四周', '【探索收获】记录证据']));
    assert.strictEqual(JSON.stringify(rendered), JSON.stringify(['我观察四周', '【探索收获】记录证据']));
}

testUserMessageRendersBeforeFreeformSystemMessage()
    .then(() => console.log('chat-freeform-message-order regression tests passed'))
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
