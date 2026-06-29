const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadRouter() {
    const context = {
        console,
        State: {
            currentCharacterId: '',
            characters: []
        },
        WorldEngine: {
            isScenePlaying: scene => !!scene && (!scene.gameState || scene.gameState === 'playing'),
            resolveLocationReference() {
                return { location: null, reachable: false };
            }
        },
        ActionPlanner: {
            create(scene, text) {
                const raw = String(text || '');
                if (raw.includes('关键证据')) {
                    return {
                        type: 'investigate',
                        risk: 36,
                        challengeContext: { challengeId: 'ch_main' }
                    };
                }
                if (raw.includes('警戒区')) return { type: 'observe', risk: 58 };
                if (raw.includes('破解')) return { type: 'investigate', risk: 36 };
                if (raw.includes('扫描仪')) return { type: 'use_item', risk: 36 };
                if (raw.includes('翻找')) return { type: 'investigate', risk: 36 };
                return { type: 'talk', risk: 12 };
            }
        }
    };
    const code = fs.readFileSync(path.join(root, 'js/features/intent-router.js'), 'utf8') + '\nthis.IntentRouter = IntentRouter;';
    vm.runInNewContext(code, context, { filename: 'js/features/intent-router.js' });
    return context.IntentRouter;
}

function makeScene() {
    return {
        gameState: 'playing',
        currentLocation: 'cargo',
        locations: [{ id: 'cargo', name: '货舱', connections: [] }],
        inventory: [{ id: 'scanner', name: '便携扫描仪', type: 'misc', quantity: 1 }]
    };
}

function testEverydaySearchDoesNotForcePreview(IntentRouter) {
    const route = IntentRouter.route('我先翻找周围有没有能用的东西', makeScene());

    assert.strictEqual(route.kind, 'talk');
    assert.strictEqual(route.meta.actionType, 'investigate');
    assert.strictEqual(route.meta.needsPreview, false);
}

function testToolCheckDoesNotForcePreview(IntentRouter) {
    const route = IntentRouter.route('我拿出扫描仪扫一下门缝', makeScene());

    assert.strictEqual(route.kind, 'talk');
    assert.strictEqual(route.meta.actionType, 'use_item');
    assert.strictEqual(route.meta.needsPreview, false);
}

function testInvasiveInvestigationStillPreviews(IntentRouter) {
    const route = IntentRouter.route('我破解终端看看里面的记录', makeScene());

    assert.strictEqual(route.kind, 'action_preview');
    assert.strictEqual(route.meta.actionType, 'investigate');
    assert.strictEqual(route.meta.needsPreview, true);
}

function testChallengeActionStillPreviews(IntentRouter) {
    const route = IntentRouter.route('我调查关键证据', makeScene());

    assert.strictEqual(route.kind, 'action_preview');
    assert.strictEqual(route.meta.actionType, 'investigate');
    assert.strictEqual(route.meta.needsPreview, true);
}

function testHighRiskObserveStillPreviews(IntentRouter) {
    const route = IntentRouter.route('我观察警戒区的巡逻空隙', makeScene());

    assert.strictEqual(route.kind, 'action_preview');
    assert.strictEqual(route.meta.actionType, 'observe');
    assert.strictEqual(route.meta.needsPreview, true);
}

const IntentRouter = loadRouter();
testEverydaySearchDoesNotForcePreview(IntentRouter);
testToolCheckDoesNotForcePreview(IntentRouter);
testInvasiveInvestigationStillPreviews(IntentRouter);
testChallengeActionStillPreviews(IntentRouter);
testHighRiskObserveStillPreviews(IntentRouter);
console.log('single-input-freeform regression tests passed');
