const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadCharacterCard(context) {
    const code = fs.readFileSync(path.join(root, 'js/features/character-card.js'), 'utf8') + '\nthis.CharacterCard = CharacterCard;';
    vm.runInNewContext(code, context, { filename: 'js/features/character-card.js' });
    return context.CharacterCard;
}

async function testDeletingNonSelectedCharacterKeepsCurrentSelection() {
    const events = [];
    const deleted = [];
    const context = {
        console,
        State: {
            currentCharacterId: 'char_keep',
            scene: { characters: ['char_keep', 'char_delete'] },
            characters: [
                { id: 'char_keep', name: '保留角色' },
                { id: 'char_delete', name: '删除角色' }
            ],
            removeCharacterFromScene(id) {
                this.scene.characters = this.scene.characters.filter(item => item !== id);
                return { ok: true };
            },
            emit(name, payload) {
                events.push({ name, payload });
            }
        },
        Storage: {
            async deleteCharacter(id) {
                deleted.push(id);
            }
        }
    };
    const CharacterCard = loadCharacterCard(context);

    await CharacterCard.delete('char_delete');

    assert.strictEqual(context.State.currentCharacterId, 'char_keep');
    assert.strictEqual(JSON.stringify(context.State.characters.map(c => c.id)), JSON.stringify(['char_keep']));
    assert.strictEqual(JSON.stringify(deleted), JSON.stringify(['char_delete']));
    assert.ok(events.some(event => event.name === 'charactersChanged'));
    assert.ok(!events.some(event => event.name === 'characterSelected' && event.payload === null));
}

async function testDeletingSelectedCharacterClearsSelection() {
    const events = [];
    const context = {
        console,
        State: {
            currentCharacterId: 'char_delete',
            scene: { characters: ['char_delete'] },
            characters: [{ id: 'char_delete', name: '删除角色' }],
            removeCharacterFromScene(id) {
                this.scene.characters = this.scene.characters.filter(item => item !== id);
                return { ok: true };
            },
            emit(name, payload) {
                events.push({ name, payload });
            }
        },
        Storage: {
            async deleteCharacter() {}
        }
    };
    const CharacterCard = loadCharacterCard(context);

    await CharacterCard.delete('char_delete');

    assert.strictEqual(context.State.currentCharacterId, null);
    assert.ok(events.some(event => event.name === 'characterSelected' && event.payload === null));
}

async function testEndedSceneBlocksDeletingReferencedCharacter() {
    const events = [];
    const deleted = [];
    let notice = '';
    const context = {
        console,
        WorldEngine: {
            isScenePlaying: scene => !!scene && (!scene.gameState || scene.gameState === 'playing')
        },
        State: {
            currentCharacterId: 'char_keep',
            scene: {
                gameState: 'victorious',
                characters: [],
                messages: [{ role: 'assistant', characterId: 'char_delete', content: '旧发言' }]
            },
            characters: [
                { id: 'char_keep', name: '保留角色' },
                { id: 'char_delete', name: '旧角色' }
            ],
            removeCharacterFromScene() {
                throw new Error('ended referenced delete should not mutate scene characters');
            },
            emit(name, payload) {
                events.push({ name, payload });
            }
        },
        Storage: {
            async deleteCharacter(id) {
                deleted.push(id);
            }
        },
        showToast(message) {
            notice = message;
        }
    };
    const CharacterCard = loadCharacterCard(context);

    await CharacterCard.delete('char_delete');

    assert.strictEqual(JSON.stringify(deleted), JSON.stringify([]));
    assert.strictEqual(context.State.characters.length, 2);
    assert.strictEqual(context.State.currentCharacterId, 'char_keep');
    assert.ok(notice.includes('回顾记录'));
    assert.strictEqual(events.length, 0);
}

(async () => {
    await testDeletingNonSelectedCharacterKeepsCurrentSelection();
    await testDeletingSelectedCharacterClearsSelection();
    await testEndedSceneBlocksDeletingReferencedCharacter();
    console.log('character-card-delete-selection regression tests passed');
})().catch(err => {
    console.error(err);
    process.exit(1);
});
