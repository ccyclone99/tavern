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

function loadWorldEngine() {
    const context = {
        console,
        State: { activeCharacters: [] }
    };
    return loadBrowserScript('js/features/world-engine.js', context, 'WorldEngine');
}

function testGeneratedItemSanitizerClampsUntrustedTemplateItem() {
    const WorldEngine = loadWorldEngine();
    const item = WorldEngine.normalizeGeneratedInventoryItem({
        id: 'unsafe_item',
        name: '  过载补给  ',
        description: 'x'.repeat(260),
        type: 'evidence',
        quantity: 999,
        uses: 999,
        tags: Array.from({ length: 30 }, (_, idx) => `tag_${idx}`),
        effects: [
            { type: 'check_bonus', value: 999, consume: true },
            { type: 'gold', value: 99999, consume: true }
        ]
    });

    assert.strictEqual(item.name, '过载补给');
    assert.strictEqual(item.type, 'misc');
    assert.strictEqual(item.uses, 20);
    assert.strictEqual(item.quantity, 1);
    assert.strictEqual(item.tags.length, 12);
    assert.strictEqual(item.description.length, 180);
    assert.strictEqual(item.effects[0].value, 10);
    assert.strictEqual(item.effects[1].value, 500);
}

async function testWorldGeneratorAppliesGeneratedInventorySanitizer() {
    const WorldEngine = loadWorldEngine();
    const scene = {
        id: 'scene_1',
        name: '测试世界',
        characters: [],
        lorebookEntries: [],
        inventory: [],
        equipment: { weapon: null, armor: null, accessory: null },
        equipmentRefs: { weapon: null, armor: null, accessory: null },
        messages: []
    };
    const context = {
        console,
        WorldEngine,
        State: {
            scene,
            characters: [],
            async createScene(name) {
                scene.name = name;
                this.scene = scene;
                return scene;
            },
            normalizeKnowledge(target) {
                if (!target.knowledge) target.knowledge = { discoveries: [] };
            },
            async saveCurrentScene() {},
            emit() {}
        },
        Storage: {
            async saveCharacter() {}
        }
    };
    const WorldGenerator = loadBrowserScript('js/features/world-generator.js', context, 'WorldGenerator');

    const applied = await WorldGenerator.applyTemplate({
        name: '生成物品测试',
        inventory: [
            {
                name: '无限药剂',
                type: 'consumable',
                quantity: 999,
                uses: 999,
                effects: [{ type: 'heal', value: 999, consume: true }]
            },
            {
                name: '无限零件',
                type: 'misc',
                quantity: 999,
                effects: [{ type: 'check_bonus', value: 999, consume: false }]
            }
        ],
        characters: []
    });

    assert.strictEqual(applied.inventory.length, 2);
    assert.strictEqual(applied.inventory[0].uses, 20);
    assert.strictEqual(applied.inventory[0].quantity, 1);
    assert.strictEqual(applied.inventory[0].effects[0].value, 50);
    assert.strictEqual(applied.inventory[1].quantity, 20);
    assert.strictEqual(applied.inventory[1].effects[0].value, 10);
}

(async () => {
    testGeneratedItemSanitizerClampsUntrustedTemplateItem();
    await testWorldGeneratorAppliesGeneratedInventorySanitizer();
    console.log('generated-inventory-sanitization regression tests passed');
})().catch(err => {
    console.error(err);
    process.exit(1);
});
