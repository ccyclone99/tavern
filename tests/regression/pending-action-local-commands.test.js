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
            canUseInventoryItem: item => item && item.type === 'consumable',
            resolveLocationReference(scene, ref) {
                const loc = (scene.locations || []).find(item => item.name === ref || item.id === ref);
                return { location: loc || null, reachable: !!loc };
            }
        }
    };
    return loadBrowserScript('js/features/intent-router.js', context, 'IntentRouter');
}

function makePendingActionScene() {
    return {
        gameState: 'playing',
        pendingAction: { id: 'action_1', intent: '潜入守卫室' },
        currentLocation: 'hall',
        locations: [
            { id: 'hall', name: '大厅', connections: ['alley'] },
            { id: 'alley', name: '后巷', connections: [] }
        ],
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
    assert.strictEqual(IntentRouter.route('去后巷', scene).kind, 'move_location');
}

function testPurchaseRoutesIncludeSpecializedTools() {
    const IntentRouter = loadRouter();
    const scene = makePendingActionScene();

    const disguise = IntentRouter.route('购买伪装工具包', scene);
    const tracker = IntentRouter.route('购买追踪工具包', scene);

    assert.strictEqual(disguise.kind, 'buy_supply');
    assert.strictEqual(disguise.meta.supplyType, 'disguise');
    assert.strictEqual(tracker.kind, 'buy_supply');
    assert.strictEqual(tracker.meta.supplyType, 'tracker');
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

async function testMoveRefreshesPendingActionPreview() {
    const scene = {
        gameState: 'playing',
        currentLocation: 'hall',
        pendingAction: {
            id: 'action_1',
            intent: '潜入守卫室',
            intentMeta: { origin: 'test' },
            risk: 30
        }
    };
    const context = {
        console,
        State: {
            scene,
            async saveCurrentSceneDebounced() {}
        },
        WorldEngine: {
            isScenePlaying: target => !!target && (!target.gameState || target.gameState === 'playing')
        },
        MapView: {
            async moveTo(locId) {
                scene.currentLocation = locId;
                return { ok: true, loc: { id: locId, name: '后巷' } };
            }
        },
        ActionPlanner: {
            create(targetScene, intent) {
                return {
                    id: 'new_action',
                    intent,
                    risk: targetScene.currentLocation === 'alley' ? 66 : 30
                };
            }
        },
        ActionBar: {
            rendered: 0,
            renderPendingAction() {
                this.rendered += 1;
            }
        }
    };
    const ChatUI = loadBrowserScript('js/ui/chat.js', context, 'ChatUI');
    ChatUI.inputEl = { value: '去后巷', style: { height: '1px' } };
    ChatUI._syncInputMode = () => {};

    const handled = await ChatUI._handleRoutedInput({
        kind: 'move_location',
        meta: { locationId: 'alley' }
    }, '去后巷', scene);

    assert.strictEqual(handled, true);
    assert.strictEqual(scene.currentLocation, 'alley');
    assert.strictEqual(scene.pendingAction.id, 'action_1');
    assert.strictEqual(scene.pendingAction.intent, '潜入守卫室');
    assert.strictEqual(scene.pendingAction.intentMeta.origin, 'test');
    assert.strictEqual(scene.pendingAction.risk, 66);
    assert.strictEqual(context.ActionBar.rendered, 1);
}

(async () => {
    testPendingActionAllowsLocalEquipmentCommand();
    testPendingActionAllowsLocalUseAndShopCommands();
    testPurchaseRoutesIncludeSpecializedTools();
    testPendingActionStillHandlesConfirmCancelAndExplain();
    testPendingCheckStillBlocksInventoryPrepButAllowsStatAllocation();
    await testMoveRefreshesPendingActionPreview();
    console.log('pending-action-local-commands regression tests passed');
})().catch(err => {
    console.error(err);
    process.exit(1);
});
