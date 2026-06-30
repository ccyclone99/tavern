const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadWorldEngine() {
    const context = {
        console,
        State: {
            activeCharacters: [],
            characters: [],
            saveCurrentSceneDebounced() {}
        },
        SidebarRight: {
            markTabNew() {},
            renderInventory() {},
            renderSituation() {}
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
        turnCount: 3,
        playerStats: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
        playerHp: 10,
        playerMaxHp: 10,
        level: 1,
        exp: 0,
        attrPoints: 0,
        gold: 0,
        messages: [],
        eventLog: [],
        inventory: [bufferItem()],
        quests: [],
        characters: [],
        currentLocation: 'hall',
        locations: [{ id: 'hall', name: '避难所大厅', description: '', connections: [] }],
        currentSituation: { recentRisks: [], recommendedActions: [] },
        storyPhases: [],
        storyArcs: [],
        sceneChallenges: [],
        clocks: [{
            id: 'clock_panic',
            name: '隔离恐慌',
            tag: 'panic',
            value: 4,
            max: 6,
            visibility: 'known',
            firedTriggers: []
        }],
        counterStrategies: [],
        clueGraph: [],
        evidenceLedger: [],
        failureStates: [],
        ...overrides
    };
}

function bufferItem() {
    return {
        id: 'calm_vial',
        name: '安抚药剂',
        type: 'consumable',
        quantity: 1,
        uses: 1,
        tags: ['恐慌', 'panic'],
        effects: [{ type: 'clock_resist', clockTag: 'panic', value: -1, consume: true }]
    };
}

function testFailureBufferAppearsAsCheckResource(WorldEngine) {
    const scene = makeScene();
    const modifiers = WorldEngine.getAvailableCheckItems(scene, {
        key: 'charisma',
        actionType: 'persuade',
        intent: '安抚大厅里恐慌的人群'
    });

    const buffer = modifiers.find(item => item.itemId === 'calm_vial');
    assert.ok(buffer, 'clock_resist consumable should be selectable in a check');
    assert.strictEqual(buffer.failureBuffer, true);
    assert.strictEqual(buffer.failureBufferOnly, true);
    assert.ok(buffer.label.includes('失败缓冲'));
}

function testFailureBufferAppliesAndConsumesOnFailure(WorldEngine) {
    const scene = makeScene();
    const modifier = WorldEngine.getAvailableCheckItems(scene, {
        key: 'charisma',
        actionType: 'persuade',
        intent: '安抚大厅里恐慌的人群'
    })[0];

    const result = WorldEngine.applyCheckFailureBuffers(scene, [modifier], {
        key: 'charisma',
        actionType: 'persuade',
        intent: '安抚大厅里恐慌的人群'
    }, { outcome: 'fail' });
    const consumed = WorldEngine.consumeCheckItems(scene, [modifier], {
        failureBufferMode: 'only-applied',
        appliedFailureBufferIds: result.appliedModifierIds
    });

    assert.strictEqual(scene.clocks[0].value, 3);
    assert.strictEqual(result.applied.length, 1);
    assert.strictEqual(consumed, true);
    assert.strictEqual(scene.inventory.length, 0);
    assert.ok(scene.messages.some(msg => String(msg.content || '').includes('【失败缓冲】')));
}

function testPureFailureBufferNotConsumedOnSuccess(WorldEngine) {
    const scene = makeScene();
    const modifier = WorldEngine.getAvailableCheckItems(scene, {
        key: 'charisma',
        actionType: 'persuade',
        intent: '安抚大厅里恐慌的人群'
    })[0];

    const result = WorldEngine.applyCheckFailureBuffers(scene, [modifier], {
        key: 'charisma',
        actionType: 'persuade',
        intent: '安抚大厅里恐慌的人群'
    }, { outcome: 'success' });
    const consumed = WorldEngine.consumeCheckItems(scene, [modifier], {
        outcome: 'success',
        failureBufferMode: 'exclude-only'
    });

    assert.strictEqual(result.applied.length, 0);
    assert.strictEqual(consumed, false);
    assert.strictEqual(scene.clocks[0].value, 4);
    assert.strictEqual(scene.inventory.length, 1);
}

const WorldEngine = loadWorldEngine();
testFailureBufferAppearsAsCheckResource(WorldEngine);
testFailureBufferAppliesAndConsumesOnFailure(WorldEngine);
testPureFailureBufferNotConsumedOnSuccess(WorldEngine);
console.log('check-failure-buffer-items regression tests passed');
