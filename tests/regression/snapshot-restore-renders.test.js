const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadSceneManager(context) {
    const code = fs.readFileSync(path.join(root, 'js/features/scene-manager.js'), 'utf8') + '\nthis.SceneManager = SceneManager;';
    vm.runInNewContext(code, context, { filename: 'js/features/scene-manager.js' });
    return context.SceneManager;
}

async function testLoadSnapshotRendersRestoredSidebarTabs() {
    const calls = [];
    const scene = {
        id: 'scene_1',
        snapshots: [{
            name: '测试存档',
            state: {
                messages: [{ role: 'assistant', content: '旧线索恢复' }],
                knowledge: { discoveries: [{ title: '恢复后的线索' }] },
                lorebookEntries: [{ title: '恢复后的世界书' }],
                locations: [{ id: 'loc_a', name: '恢复后的地点' }],
                currentLocation: 'loc_a',
                inventory: [],
                equipmentRefs: { weapon: null, armor: null, accessory: null },
                inputContext: { state: 'idle', prompt: '', suggestions: [], lastIntentId: '' }
            }
        }]
    };
    const context = {
        console,
        confirm: () => true,
        document: {
            querySelectorAll() {
                return [];
            }
        },
        State: {
            scene,
            normalizeScene(target) {
                target.normalized = true;
                return target;
            },
            async saveCurrentScene() {
                calls.push('saveCurrentScene');
            }
        },
        ChatUI: { render: () => calls.push('chat') },
        SidebarLeft: { render: () => calls.push('left') },
        SidebarRight: {
            renderDetail: () => calls.push('detail'),
            renderSituation: () => calls.push('situation'),
            renderKnowledge: () => calls.push('knowledge'),
            renderLorebook: () => calls.push('lorebook'),
            renderMap: () => calls.push('map'),
            renderQuests: () => calls.push('quests'),
            renderInventory: () => calls.push('inventory'),
            renderStrategies: () => calls.push('strategies')
        },
        ActionBar: { renderStatsDisplay: () => calls.push('stats') },
        applyBackground: () => calls.push('background'),
        showToast: message => calls.push(`toast:${message}`)
    };
    const SceneManager = loadSceneManager(context);

    await SceneManager.loadSnapshot(0);

    assert.strictEqual(scene.normalized, true);
    ['chat', 'left', 'detail', 'situation', 'knowledge', 'lorebook', 'map', 'quests', 'inventory', 'strategies', 'stats'].forEach(name => {
        assert.ok(calls.includes(name), `${name} should render after snapshot restore`);
    });
    assert.strictEqual(scene.currentLocation, 'loc_a');
    assert.strictEqual(scene.knowledge.discoveries[0].title, '恢复后的线索');
}

testLoadSnapshotRendersRestoredSidebarTabs()
    .then(() => console.log('snapshot-restore-renders regression tests passed'))
    .catch(err => {
        console.error(err);
        process.exit(1);
    });
