const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadWorldEngine() {
    const context = {
        console,
        State: { activeCharacters: [], characters: [], currentCharacterId: '' },
        SidebarRight: {
            markTabNew() {},
            renderDetail() {},
            renderInventory() {},
            renderSituation() {}
        },
        ActionBar: {
            renderStatsDisplay() {}
        }
    };
    const code = fs.readFileSync(path.join(root, 'js/features/world-engine.js'), 'utf8') + '\nthis.WorldEngine = WorldEngine;';
    vm.runInNewContext(code, context, { filename: 'js/features/world-engine.js' });
    return context.WorldEngine;
}

function makeScene(overrides = {}) {
    return {
        gameState: 'playing',
        userName: '测试玩家',
        turnCount: 1,
        playerStats: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
        playerHp: 5,
        playerMaxHp: 10,
        level: 1,
        exp: 0,
        attrPoints: 0,
        gold: 0,
        messages: [],
        eventLog: [],
        inventory: [],
        quests: [],
        characters: [],
        currentLocation: 'hall',
        locations: [{ id: 'hall', name: '大厅', connections: [] }],
        currentSituation: { recentRisks: [], recommendedActions: [] },
        storyPhases: [],
        storyArcs: [],
        sceneChallenges: [],
        clocks: [],
        counterStrategies: [],
        clueGraph: [],
        evidenceLedger: [],
        failureStates: [],
        ...overrides
    };
}

function testGrantQuestItemRecordsHowToUse(WorldEngine) {
    const scene = makeScene();
    const result = WorldEngine.grantInventoryItem(scene, {
        id: 'case_notes',
        name: '污染手札',
        type: 'quest',
        quantity: 1,
        description: '记着失踪者最后一次清醒时写下的断句。',
        tags: ['线索', '调查']
    }, { source: '探索收获' });

    assert.strictEqual(result.ok, true);
    assert.ok(scene.eventLog.some(event =>
        event.title === '获得物品' &&
        event.text.includes('剧情关键物') &&
        event.text.includes('查看污染手札')
    ));
}

function testEquipItemExplainsRelevantAction(WorldEngine) {
    const scene = makeScene({
        inventory: [{
            id: 'sword_1',
            name: '短剑',
            type: 'weapon',
            quantity: 1,
            effects: [{ type: 'check_bonus', actionType: 'combat', value: 1, consume: false }]
        }]
    });

    const result = WorldEngine.equipInventoryItem(scene, 'sword_1');
    const content = scene.messages.at(-1)?.content || '';

    assert.strictEqual(result.ok, true);
    assert.ok(content.includes('当前效果：检定 +1'));
    assert.ok(content.includes('适合冲突时使用'));
}

function testUseItemExplainsSettlement(WorldEngine) {
    const scene = makeScene({
        inventory: [{
            id: 'kit_1',
            name: '应急医疗包',
            type: 'consumable',
            quantity: 1,
            uses: 1,
            effects: [{ type: 'heal', value: 4, consume: true }]
        }]
    });

    const result = WorldEngine.useInventoryItem(scene, 'kit_1');
    const content = scene.messages.at(-1)?.content || '';

    assert.strictEqual(result.ok, true);
    assert.ok(content.includes('【使用物品：应急医疗包】生命 +4'));
    assert.ok(content.includes('效果已结算'));
}

const WorldEngine = loadWorldEngine();
testGrantQuestItemRecordsHowToUse(WorldEngine);
testEquipItemExplainsRelevantAction(WorldEngine);
testUseItemExplainsSettlement(WorldEngine);
console.log('item-narrative-feedback regression tests passed');
