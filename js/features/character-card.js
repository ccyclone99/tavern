/**
 * 角色卡管理
 */
const CharacterCard = {
    async importFile(file) {
        const char = await PNGMetadata.importFile(file);
        const previousCharacterId = State.currentCharacterId;

        await Storage.saveCharacter(char);
        State.characters.push(char);
        State.setCurrentCharacter(char.id);

        let addedToScene = false;
        if (State.scene) {
            const result = State.addCharacterToScene(char.id);
            addedToScene = !!result?.ok;
            if (!addedToScene) {
                await Storage.deleteCharacter(char.id);
                State.characters = State.characters.filter(item => item.id !== char.id);
                State.setCurrentCharacter(previousCharacterId || null);
                State.emit('charactersChanged', State.characters);
                throw new Error(result?.message || '角色未加入当前场景，已取消导入。');
            }
        }
        State.emit('charactersChanged', State.characters);

        // 如果导入的角色卡有嵌入式世界书，仅在角色成功加入当前场景后合并
        if (addedToScene && char.character_book && char.character_book.entries && State.scene) {
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
        return char;
    },

    async delete(id) {
        const scene = State.scene;
        if (scene && Array.isArray(scene.characters) && scene.characters.includes(id)) {
            const result = State.removeCharacterFromScene(id);
            if (result && !result.ok) {
                if (typeof showToast !== 'undefined') showToast(result.message || '角色仍在当前场景，无法删除。');
                return;
            }
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
