const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadWorldEngine() {
    const context = {
        console,
        State: { activeCharacters: [] }
    };
    const code = fs.readFileSync(path.join(root, 'js/features/world-engine.js'), 'utf8') + '\nthis.WorldEngine = WorldEngine;';
    vm.runInNewContext(code, context, { filename: 'js/features/world-engine.js' });
    return context.WorldEngine;
}

function makeScene(overrides = {}) {
    return {
        gameState: 'playing',
        playerStats: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
        playerHp: 4,
        playerMaxHp: 10,
        level: 1,
        attrPoints: 0,
        gold: 0,
        inventory: [],
        quests: [],
        locations: [],
        sceneChallenges: [],
        pendingExplorationRewards: [],
        ...overrides
    };
}

function medicalKit(id) {
    return {
        id,
        name: '应急医疗包',
        type: 'consumable',
        quantity: 1,
        uses: 1,
        effects: [{ type: 'heal', value: 4, consume: true }]
    };
}

function junk(id) {
    return {
        id,
        name: '破烂零件',
        type: 'misc',
        quantity: 1,
        value: 1
    };
}

function commands(hints) {
    return hints.map(hint => hint.command).filter(Boolean);
}

function testAmbiguousHealingItemIsNotSuggestedAsCommand(WorldEngine) {
    const scene = makeScene({
        inventory: [medicalKit('kit_a'), medicalKit('kit_b')]
    });

    const hints = WorldEngine.getPreparationHints(scene, { limit: 5 });
    const commandList = commands(hints);

    assert.ok(!commandList.includes('使用应急医疗包'), 'ambiguous healing item should not be suggested as a natural command');
    assert.ok(commandList.includes('休息一下'), 'rest should remain available when no unique healing command is safe');
}

function testUniqueEquipmentStillSuggested(WorldEngine) {
    const scene = makeScene({
        playerHp: 10,
        inventory: [
            medicalKit('kit_a'),
            medicalKit('kit_b'),
            {
                id: 'sword_1',
                name: '短剑',
                type: 'weapon',
                quantity: 1,
                effects: [{ type: 'check_bonus', actionType: 'combat', value: 1, consume: false }]
            }
        ]
    });

    const hints = WorldEngine.getPreparationHints(scene, { limit: 5 });

    assert.ok(commands(hints).includes('装备短剑'), 'unique equipment should still be suggested');
}

function testPendingRewardCleanupFallsBackWhenCandidateNameAmbiguous(WorldEngine) {
    const scene = makeScene({
        playerHp: 10,
        inventory: [junk('junk_a'), junk('junk_b')],
        pendingExplorationRewards: [{
            id: 'reward_1',
            item: { name: '线索工具', type: 'consumable', quantity: 1, uses: 1 },
            source: '测试'
        }]
    });

    const hint = WorldEngine.getPreparationHints(scene, { limit: 5 }).find(item => item.kind === 'pending_reward');

    assert.ok(hint, 'pending exploration reward should still produce a preparation hint');
    assert.strictEqual(hint.command, '整理背包');
}

const WorldEngine = loadWorldEngine();
testAmbiguousHealingItemIsNotSuggestedAsCommand(WorldEngine);
testUniqueEquipmentStillSuggested(WorldEngine);
testPendingRewardCleanupFallsBackWhenCandidateNameAmbiguous(WorldEngine);
console.log('preparation-hints regression tests passed');
