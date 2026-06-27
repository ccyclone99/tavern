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

function loadRouter() {
    const context = {
        console,
        WorldEngine: {
            isScenePlaying: scene => !!scene && (!scene.gameState || scene.gameState === 'playing'),
            canEquipInventoryItem: item => item && item.type !== 'consumable',
            canUseInventoryItem: item => item && item.type === 'consumable'
        }
    };
    return loadBrowserScript('js/features/intent-router.js', context, 'IntentRouter');
}

function makePendingActionScene() {
    return {
        gameState: 'playing',
        pendingAction: { id: 'action_1', intent: '潜入守卫室' },
        inventory: [
            { id: 'sword_1', name: '短剑', type: 'weapon', quantity: 1 },
            { id: 'kit_1', name: '应急医疗包', type: 'consumable', quantity: 1, uses: 1 }
        ]
    };
}

function testPendingActionAllowsLocalEquipmentCommand() {
    const IntentRouter = loadRouter();
    const route = IntentRouter.route('装备短剑', makePendingActionScene());

    assert.strictEqual(route.kind, 'equip_inventory_item');
    assert.strictEqual(route.meta.itemName, '短剑');
}

function testPendingActionAllowsLocalUseAndShopCommands() {
    const IntentRouter = loadRouter();
    const scene = makePendingActionScene();

    assert.strictEqual(IntentRouter.route('使用应急医疗包', scene).kind, 'use_inventory_item');
    assert.strictEqual(IntentRouter.route('商店', scene).kind, 'shop_catalog');
    assert.strictEqual(IntentRouter.route('整理背包', scene).kind, 'inventory_cleanup');
}

function testPendingActionStillHandlesConfirmCancelAndExplain() {
    const IntentRouter = loadRouter();
    const scene = makePendingActionScene();

    assert.strictEqual(IntentRouter.route('执行', scene).kind, 'confirm_action');
    assert.strictEqual(IntentRouter.route('取消', scene).kind, 'cancel_action');
    assert.strictEqual(IntentRouter.route('为什么', scene).kind, 'explain_action');
}

function testPendingCheckStillBlocksInventoryPrepButAllowsStatAllocation() {
    const IntentRouter = loadRouter();
    const scene = {
        gameState: 'playing',
        pendingCheck: { key: 'dexterity', statName: '敏捷', dc: 15 },
        inventory: [{ id: 'sword_1', name: '短剑', type: 'weapon', quantity: 1 }]
    };

    assert.strictEqual(IntentRouter.route('装备短剑', scene).kind, 'blocked_by_check');
    assert.strictEqual(IntentRouter.route('加一点敏捷', scene).kind, 'allocate_stat_point');
}

testPendingActionAllowsLocalEquipmentCommand();
testPendingActionAllowsLocalUseAndShopCommands();
testPendingActionStillHandlesConfirmCancelAndExplain();
testPendingCheckStillBlocksInventoryPrepButAllowsStatAllocation();
console.log('pending-action-local-commands regression tests passed');
