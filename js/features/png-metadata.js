/**
 * PNG 角色卡元数据读写
 * SillyTavern V2 格式：PNG tEXt chunk，关键词 "chara"，内容为 base64(JSON)
 */
const PNGMetadata = {
    // CRC32 查找表：模块级别缓存，避免每次调用重新计算
    _crcTable: (() => {
        const table = new Uint32Array(256);
        for (let i = 0; i < 256; i++) {
            let c = i;
            for (let j = 0; j < 8; j++) {
                c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
            }
            table[i] = c >>> 0;
        }
        return table;
    })(),

    /** UTF-8 字符串 → Base64（替代废弃的 unescape 方案） */
    _toBase64(str) {
        const bytes = new TextEncoder().encode(str);
        const binary = Array.from(bytes, b => String.fromCharCode(b)).join('');
        return btoa(binary);
    },
    /**
     * 从 PNG 文件导入角色卡
     */
    async importFile(file) {
        const arrayBuffer = await file.arrayBuffer();
        const uint8 = new Uint8Array(arrayBuffer);

        // 尝试读取 tEXt chunk
        let jsonStr = null;
        let offset = 8; // 跳过 PNG signature

        while (offset < uint8.length) {
            const length = this.readUint32(uint8, offset);
            const type = this.readString(uint8, offset + 4, 4);

            if (type === 'tEXt') {
                const textData = this.readString(uint8, offset + 8, length);
                if (textData.startsWith('chara\0')) {
                    const base64Data = textData.slice(6); // 跳过 "chara\0"
                    try {
                        jsonStr = atob(base64Data);
                        break;
                    } catch (e) {}
                }
            }

            if (type === 'IEND') break;
            offset += 12 + length; // length(4) + type(4) + data(length) + CRC(4)
        }

        if (!jsonStr) {
            // 尝试作为纯 JSON 导入
            try {
                jsonStr = new TextDecoder().decode(uint8);
                const test = JSON.parse(jsonStr);
                if (!test.data && !test.name) throw new Error('不是有效的角色卡');
            } catch (e) {
                throw new Error('无法解析角色卡，请确保是 SillyTavern V2 PNG 格式');
            }
        }

        const card = JSON.parse(jsonStr);
        return this.parseCard(card, arrayBuffer);
    },

    /**
     * 导出角色卡为 PNG
     */
    async exportCharacter(char) {
        // 构造 V2 格式 JSON
        const v2 = {
            spec: 'chara_card_v2',
            spec_version: '2.0',
            data: {
                name: char.name,
                description: char.description || '',
                personality: char.personality || '',
                scenario: char.scenario || '',
                first_mes: char.first_mes || '',
                mes_example: char.mes_example || '',
                creator_notes: char.creator_notes || '',
                system_prompt: char.system_prompt || '',
                post_history_instructions: char.post_history_instructions || '',
                alternate_greetings: char.alternate_greetings || [],
                tags: char.tags || [],
                creator: char.creator || '',
                character_version: char.character_version || '1.0',
                character_book: char.character_book || { name: '', entries: [], extensions: {} },
                extensions: char.extensions || {}
            }
        };

        const jsonStr = JSON.stringify(v2);
        const base64Data = this._toBase64(jsonStr);
        const chunkText = 'chara\0' + base64Data;

        // 如果有avatar，以avatar为底图；否则生成纯色底图
        let imageBlob;
        if (char.avatar && char.avatar.startsWith('data:image')) {
            imageBlob = await fetch(char.avatar).then(r => r.blob());
        } else {
            imageBlob = await this.createPlaceholderImage(char.name);
        }

        const imgArrayBuffer = await imageBlob.arrayBuffer();
        return this.injectTextChunk(imgArrayBuffer, chunkText);
    },

    parseCard(card, imgBuffer) {
        // 兼容直接是 data 对象 或 包装了 spec/data 的完整格式
        const data = card.data || card;
        const char = {
            id: 'char_' + Date.now() + '_' + Math.random().toString(36).slice(2, 8),
            name: data.name || '未命名',
            description: data.description || '',
            personality: data.personality || '',
            scenario: data.scenario || '',
            first_mes: data.first_mes || '',
            mes_example: data.mes_example || '',
            creator_notes: data.creator_notes || '',
            system_prompt: data.system_prompt || '',
            post_history_instructions: data.post_history_instructions || '',
            alternate_greetings: data.alternate_greetings || [],
            tags: data.tags || [],
            creator: data.creator || '',
            character_version: data.character_version || '1.0',
            character_book: data.character_book || { name: '', entries: [], extensions: {} },
            extensions: data.extensions || {},
            _relations: {},
            _emotionTags: [],
            _talkativeness: 0.5,
            _priority: 0
        };

        // 提取图片作为avatar（使用 base64 data URL 避免 blob URL 泄漏）
        const bytes = new Uint8Array(imgBuffer);
        const binary = Array.from(bytes, b => String.fromCharCode(b)).join('');
        char.avatar = 'data:image/png;base64,' + btoa(binary);

        return char;
    },

    async createPlaceholderImage(name) {
        const canvas = document.createElement('canvas');
        canvas.width = 512;
        canvas.height = 512;
        const ctx = canvas.getContext('2d');
        ctx.fillStyle = '#2a2520';
        ctx.fillRect(0, 0, 512, 512);
        ctx.fillStyle = '#b45309';
        ctx.font = 'bold 120px serif';
        ctx.textAlign = 'center';
        ctx.textBaseline = 'middle';
        ctx.fillText(name[0] || '?', 256, 256);
        return new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
    },

    injectTextChunk(pngBuffer, text) {
        const uint8 = new Uint8Array(pngBuffer);
        const textBytes = new TextEncoder().encode(text);
        const chunkLength = textBytes.length;

        // 构造 tEXt chunk: length(4) + "tEXt"(4) + data(n) + CRC(4)
        const chunk = new Uint8Array(4 + 4 + chunkLength + 4);
        this.writeUint32(chunk, 0, chunkLength);
        const typeBytes = new TextEncoder().encode('tEXt');
        chunk.set(typeBytes, 4);
        chunk.set(textBytes, 8);
        const crc = this.crc32(chunk.slice(4, 8 + chunkLength));
        this.writeUint32(chunk, 8 + chunkLength, crc);

        // 插入到第一个 IDAT 之前
        let offset = 8;
        let insertPos = 8; // 默认在signature后
        while (offset < uint8.length) {
            const length = this.readUint32(uint8, offset);
            const type = this.readString(uint8, offset + 4, 4);
            if (type === 'IDAT') {
                insertPos = offset;
                break;
            }
            if (type === 'IEND') {
                insertPos = offset;
                break;
            }
            offset += 12 + length;
        }

        const result = new Uint8Array(uint8.length + chunk.length);
        result.set(uint8.slice(0, insertPos), 0);
        result.set(chunk, insertPos);
        result.set(uint8.slice(insertPos), insertPos + chunk.length);

        return new Blob([result], { type: 'image/png' });
    },

    readUint32(arr, offset) {
        return (arr[offset] << 24) | (arr[offset + 1] << 16) | (arr[offset + 2] << 8) | arr[offset + 3];
    },

    writeUint32(arr, offset, value) {
        arr[offset] = (value >>> 24) & 0xff;
        arr[offset + 1] = (value >>> 16) & 0xff;
        arr[offset + 2] = (value >>> 8) & 0xff;
        arr[offset + 3] = value & 0xff;
    },

    readString(arr, offset, length) {
        return new TextDecoder().decode(arr.slice(offset, offset + length));
    },

    crc32(bytes) {
        const table = this._crcTable;
        let crc = 0xffffffff;
        for (let i = 0; i < bytes.length; i++) {
            crc = table[(crc ^ bytes[i]) & 0xff] ^ (crc >>> 8);
        }
        return (crc ^ 0xffffffff) >>> 0;
    }
};
