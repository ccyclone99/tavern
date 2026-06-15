/**
 * 角色卡管理
 */
const CharacterCard = {
    async importFile(file) {
        const char = await PNGMetadata.importFile(file);

        // 如果导入的角色卡有嵌入式世界书，合并到当前场景
        if (char.character_book && char.character_book.entries && State.scene) {
            const existingKeys = new Set(State.scene.lorebookEntries.map(e => e.keys.join(',')));
            for (const entry of char.character_book.entries) {
                const keyStr = (entry.keys || []).join(',');
                if (!existingKeys.has(keyStr)) {
                    State.scene.lorebookEntries.push({
                        keys: entry.keys || [],
                        secondary_keys: entry.secondary_keys || [],
                        content: entry.content || '',
                        enabled: entry.enabled !== false,
                        insertion_order: entry.insertion_order || 0,
                        priority: entry.priority || 0,
                        selective: entry.selective || false,
                        constant: entry.constant || false,
                        position: entry.position || 'before_char',
                        comment: entry.comment || ''
                    });
                }
            }
            await State.saveCurrentScene();
        }

        await Storage.saveCharacter(char);
        State.characters.push(char);
        State.emit('charactersChanged', State.characters);
        State.setCurrentCharacter(char.id);
        if (State.scene) {
            State.addCharacterToScene(char.id);
        }
        return char;
    },

    async delete(id) {
        const scene = State.scene;
        if (scene) {
            State.removeCharacterFromScene(id);
        }
        await Storage.deleteCharacter(id);
        State.characters = State.characters.filter(c => c.id !== id);
        if (State.currentCharacterId === id) {
            State.currentCharacterId = null;
        }
        State.emit('charactersChanged', State.characters);
        State.emit('characterSelected', null);
    }
};
