const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadLorebook(context) {
    const code = fs.readFileSync(path.join(root, 'js/features/lorebook.js'), 'utf8') + '\nthis.Lorebook = Lorebook;';
    vm.runInNewContext(code, context, { filename: 'js/features/lorebook.js' });
    return context.Lorebook;
}

function createEndedContext(scene) {
    let notice = '';
    return {
        context: {
            console,
            State: {
                scene,
                settings: { apiKey: 'test-key' },
                async saveCurrentScene() {
                    throw new Error('ended lorebook should not save scene');
                }
            },
            WorldEngine: {
                isScenePlaying: target => !!target && (!target.gameState || target.gameState === 'playing'),
                endedSceneMessage: () => 'ended'
            },
            document: {
                createElement() {
                    throw new Error('ended lorebook should not create modal');
                },
                getElementById() {
                    throw new Error('ended lorebook should not read form controls');
                }
            },
            SidebarRight: {
                renderLorebook() {
                    throw new Error('ended lorebook should not rerender after mutation');
                }
            },
            showToast(message) {
                notice = message;
            }
        },
        getNotice: () => notice
    };
}

function testEndedSceneBlocksLorebookEditorOpen() {
    const scene = { gameState: 'defeated', lorebookEntries: [] };
    const { context, getNotice } = createEndedContext(scene);
    const Lorebook = loadLorebook(context);

    Lorebook.openEditor();

    assert.strictEqual(getNotice(), 'ended');
    assert.strictEqual(scene.lorebookEntries.length, 0);
}

async function testEndedSceneBlocksLorebookSave() {
    const scene = {
        gameState: 'victorious',
        lorebookEntries: [{ keys: ['旧'], content: '旧内容' }]
    };
    const { context, getNotice } = createEndedContext(scene);
    const Lorebook = loadLorebook(context);

    await Lorebook.saveEntry(0);

    assert.strictEqual(getNotice(), 'ended');
    assert.strictEqual(scene.lorebookEntries[0].content, '旧内容');
}

async function testEndedSceneBlocksLorebookDelete() {
    const scene = {
        gameState: 'defeated',
        lorebookEntries: [{ keys: ['旧'], content: '旧内容' }]
    };
    const { context, getNotice } = createEndedContext(scene);
    const Lorebook = loadLorebook(context);

    await Lorebook.deleteEntry(0);

    assert.strictEqual(getNotice(), 'ended');
    assert.strictEqual(scene.lorebookEntries.length, 1);
}

async function testEndedSceneBlocksLorebookBatchGenerate() {
    const scene = { gameState: 'victorious', lorebookEntries: [] };
    const { context, getNotice } = createEndedContext(scene);
    const Lorebook = loadLorebook(context);

    await Lorebook.generateBatch();

    assert.strictEqual(getNotice(), 'ended');
    assert.strictEqual(scene.lorebookEntries.length, 0);
}

(async () => {
    testEndedSceneBlocksLorebookEditorOpen();
    await testEndedSceneBlocksLorebookSave();
    await testEndedSceneBlocksLorebookDelete();
    await testEndedSceneBlocksLorebookBatchGenerate();
    console.log('lorebook-ending regression tests passed');
})().catch(err => {
    console.error(err);
    process.exit(1);
});
