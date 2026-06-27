const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadCharacterEditor(context) {
    const code = fs.readFileSync(path.join(root, 'js/ui/character-editor.js'), 'utf8') + '\nthis.CharacterEditor = CharacterEditor;';
    vm.runInNewContext(code, context, { filename: 'js/ui/character-editor.js' });
    return context.CharacterEditor;
}

function testEndedSceneBlocksNewCharacterEditor() {
    let notice = '';
    const context = {
        console,
        State: {
            scene: { gameState: 'victorious' },
            editingCharacterId: 'stale',
            characters: []
        },
        WorldEngine: {
            isScenePlaying: scene => !!scene && (!scene.gameState || scene.gameState === 'playing'),
            endedSceneMessage: () => 'ended'
        },
        showToast(message) {
            notice = message;
        }
    };
    const CharacterEditor = loadCharacterEditor(context);
    CharacterEditor.titleEl = {
        set textContent(_) {
            throw new Error('ended new character editor should not render title');
        }
    };
    CharacterEditor.modal = {
        classList: {
            add() {
                throw new Error('ended new character editor should not open modal');
            }
        }
    };

    CharacterEditor.open();

    assert.strictEqual(context.State.editingCharacterId, null);
    assert.strictEqual(notice, 'ended');
}

function testEndedSceneStillAllowsExistingCharacterEditor() {
    let opened = false;
    const context = {
        console,
        State: {
            scene: { gameState: 'defeated' },
            editingCharacterId: null,
            characters: [{ id: 'char_1', name: '旧角色' }]
        },
        WorldEngine: {
            isScenePlaying: scene => !!scene && (!scene.gameState || scene.gameState === 'playing')
        },
        Renderer: {
            safeUrl: () => '',
            escapeAttr: value => String(value || ''),
            escapeHtml: value => String(value || '')
        },
        document: {
            getElementById() {
                return { onclick: null, onchange: null, value: '', style: {}, files: [] };
            }
        },
        FileReader: function FakeFileReader() {}
    };
    const CharacterEditor = loadCharacterEditor(context);
    CharacterEditor.titleEl = { textContent: '' };
    CharacterEditor.modal = {
        classList: {
            add(name) {
                if (name === 'show') opened = true;
            }
        },
        addEventListener() {}
    };
    CharacterEditor.bodyEl = {
        innerHTML: '',
        querySelectorAll: () => [],
        querySelector: () => ({ classList: { add() {}, remove() {} } })
    };

    CharacterEditor.open('char_1');

    assert.strictEqual(opened, true);
    assert.strictEqual(context.State.editingCharacterId, 'char_1');
}

testEndedSceneBlocksNewCharacterEditor();
testEndedSceneStillAllowsExistingCharacterEditor();
console.log('character-editor-ending regression tests passed');
