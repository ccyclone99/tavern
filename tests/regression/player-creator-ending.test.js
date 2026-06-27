const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadPlayerCreator(context) {
    const code = fs.readFileSync(path.join(root, 'js/ui/player-creator.js'), 'utf8') + '\nthis.PlayerCreator = PlayerCreator;';
    vm.runInNewContext(code, context, { filename: 'js/ui/player-creator.js' });
    return context.PlayerCreator;
}

function testEndedSceneDoesNotOpenPlayerCreator() {
    let appended = false;
    let notice = '';
    const scene = { gameState: 'defeated', userName: '旧名', playerPersona: { name: '旧名' } };
    const context = {
        console,
        State: { scene },
        WorldEngine: {
            isScenePlaying: target => !!target && (!target.gameState || target.gameState === 'playing'),
            endedSceneMessage: () => 'ended'
        },
        document: {
            createElement() {
                throw new Error('ended scene should not create a player creator modal');
            },
            body: {
                appendChild() {
                    appended = true;
                }
            }
        },
        showToast(message) {
            notice = message;
        }
    };
    const PlayerCreator = loadPlayerCreator(context);

    PlayerCreator.open();

    assert.strictEqual(appended, false);
    assert.strictEqual(notice, 'ended');
}

async function testEndedSceneDoesNotSavePlayerPersona() {
    let saved = false;
    let opened = false;
    let notice = '';
    const scene = { gameState: 'victorious', userName: '旧名', playerPersona: { name: '旧名' } };
    const context = {
        console,
        State: {
            scene,
            async saveCurrentScene() {
                saved = true;
            }
        },
        WorldEngine: {
            isScenePlaying: target => !!target && (!target.gameState || target.gameState === 'playing'),
            endedSceneMessage: () => 'ended'
        },
        document: {
            getElementById() {
                throw new Error('ended scene should not read player creator form values');
            }
        },
        showToast(message) {
            notice = message;
        }
    };
    const PlayerCreator = loadPlayerCreator(context);
    PlayerCreator.playOpening = async () => {
        opened = true;
    };

    await PlayerCreator.save();

    assert.strictEqual(saved, false);
    assert.strictEqual(opened, false);
    assert.strictEqual(scene.userName, '旧名');
    assert.strictEqual(scene.playerPersona.name, '旧名');
    assert.strictEqual(notice, 'ended');
}

async function testPlayingSceneStillSavesPlayerPersona() {
    let saved = false;
    let opened = false;
    const values = {
        personaName: { value: '新人' },
        personaAppearance: { value: '黑色风衣' },
        personaBackground: { value: '来自废墟' },
        personaPersonality: { value: '谨慎' },
        personaGoal: { value: '找到答案' },
        personaCreed: { value: '真相优先' },
        personaAvatarPreview: { src: 'https://example.com/avatar.png', style: { display: 'none' } }
    };
    const scene = { gameState: 'playing', userName: '旧名', playerPersona: null };
    const context = {
        console,
        State: {
            scene,
            async saveCurrentScene() {
                saved = true;
            }
        },
        document: {
            getElementById(id) {
                return values[id] || { value: '', style: {} };
            }
        },
        Renderer: {
            safeUrl: value => String(value || '')
        },
        showToast() {}
    };
    const PlayerCreator = loadPlayerCreator(context);
    PlayerCreator.close = () => {};
    PlayerCreator.playOpening = async () => {
        opened = true;
    };

    await PlayerCreator.save();

    assert.strictEqual(saved, true);
    assert.strictEqual(opened, true);
    assert.strictEqual(scene.userName, '新人');
    assert.strictEqual(scene.playerPersona.name, '新人');
    assert.strictEqual(scene.playerPersona.creed, '真相优先');
}

(async () => {
    testEndedSceneDoesNotOpenPlayerCreator();
    await testEndedSceneDoesNotSavePlayerPersona();
    await testPlayingSceneStillSavesPlayerPersona();
    console.log('player-creator-ending regression tests passed');
})().catch(err => {
    console.error(err);
    process.exit(1);
});
