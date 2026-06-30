const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadGroupChat(scene, warnings = []) {
    const context = {
        console: {
            ...console,
            warn(...args) {
                warnings.push(args);
            }
        },
        State: {
            scene,
            isStreaming: false,
            saveCurrentSceneDebounced: async () => {
                scene.saved = true;
            }
        },
        ChatUI: {
            setStreaming() {},
            appendStreamingMessage() {},
            updateStreamingContent(content) {
                scene.lastStreamingContent = content;
            },
            scrollToBottom() {},
            finalizeStreamingMessage(content) {
                scene.finalizedContent = content;
            },
            removeStreamingMessage() {},
            clearStreaming() {}
        },
        PromptBuilder: {
            buildDMNarration() {
                return [{ role: 'system', content: 'dm' }];
            }
        },
        API: {
            async stream(body, onChunk) {
                const content = '你稳住了局势。\n[check:力量|DC30]\n[gold:5]';
                onChunk(content);
                return { content };
            }
        },
        Renderer: {
            stripStateUpdate(content) {
                return String(content || '').replace(/<state_update>[\s\S]*?<\/state_update>/gi, '').trim();
            }
        },
        StrategyManager: {
            applyStateUpdate() {}
        },
        WorldEngine: {
            isScenePlaying: value => !!value && (!value.gameState || value.gameState === 'playing'),
            createVisibility: () => ({ public: true }),
            addGold(targetScene, amount) {
                targetScene.gold = Number(targetScene.gold || 0) + Number(amount || 0);
            }
        },
        showToast() {}
    };
    const code = fs.readFileSync(path.join(root, 'js/features/group-chat.js'), 'utf8') + '\nthis.GroupChat = GroupChat;';
    vm.runInNewContext(code, context, { filename: 'js/features/group-chat.js' });
    return context.GroupChat;
}

async function testCheckMarkersAreIgnoredDuringDmCheckContinuation() {
    const warnings = [];
    const scene = {
        gameState: 'playing',
        messages: [],
        pendingCheck: null,
        gold: 0
    };
    const GroupChat = loadGroupChat(scene, warnings);

    await GroupChat._dmNarrate({ trigger: 'check_outcome', focus: '检定后续' });

    assert.strictEqual(scene.pendingCheck, null, 'DM continuation check marker should not create a second pending check');
    assert.strictEqual(scene.messages.length, 1);
    assert.strictEqual(scene.messages[0].type, 'narrate');
    assert.strictEqual(scene.messages[0].content, '你稳住了局势。');
    assert.strictEqual(scene.finalizedContent, '你稳住了局势。');
    assert.strictEqual(scene.gold, 5, 'non-check markers should still be processed');
    assert.ok(scene.saved, 'DM narration should save the scene');
    assert.ok(warnings.some(args => String(args[0] || '').includes('DM 续写中忽略 check 标记')));
}

testCheckMarkersAreIgnoredDuringDmCheckContinuation()
    .then(() => console.log('check-continuation-marker-sanitization regression tests passed'))
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
