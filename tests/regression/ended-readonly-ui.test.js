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

function createClassList() {
    const items = new Set();
    return {
        add(name) { items.add(name); },
        remove(name) { items.delete(name); },
        toggle(name, force) {
            if (force) items.add(name);
            else items.delete(name);
        },
        contains(name) { return items.has(name); }
    };
}

const Renderer = {
    escapeAttr: value => String(value ?? '').replace(/"/g, '&quot;'),
    escapeHtml: value => String(value ?? '')
};

function isScenePlaying(scene) {
    return !!scene && (!scene.gameState || scene.gameState === 'playing');
}

async function testEndedMapRendersReadonlyAndBlocksMove() {
    const scene = {
        gameState: 'victorious',
        currentLocation: 'loc_a',
        locations: [
            { id: 'loc_a', name: '大厅', description: '结局后的大厅', connections: ['loc_b'] },
            { id: 'loc_b', name: '后巷', description: '已经不能前往', connections: [] }
        ]
    };
    let moved = false;
    let notice = '';
    const context = {
        console,
        State: { scene, isStreaming: false },
        Renderer,
        WorldEngine: {
            isScenePlaying,
            endedSceneMessage: () => 'ended',
            moveToLocation() {
                moved = true;
                return { ok: true };
            }
        },
        showToast(message) {
            notice = message;
        }
    };
    const MapView = loadBrowserScript('js/ui/map-view.js', context, 'MapView');
    const bindSelectors = [];
    MapView.el = {
        innerHTML: '',
        querySelectorAll(selector) {
            bindSelectors.push(selector);
            return [];
        }
    };

    MapView.render();
    await MapView.moveTo('loc_b');

    assert.ok(MapView.el.innerHTML.includes('map-node current readonly'));
    assert.ok(MapView.el.innerHTML.includes('aria-disabled="true"'));
    assert.ok(!MapView.el.innerHTML.includes('data-move-to='));
    assert.ok(MapView.el.innerHTML.includes('地图仅供回顾'));
    assert.deepStrictEqual(bindSelectors, ['[data-move-to]']);
    assert.strictEqual(moved, false, 'ended map should not call WorldEngine.moveToLocation');
    assert.strictEqual(notice, 'ended');
}

function createSidebarContext(scene) {
    const addLoreBtn = {
        disabled: false,
        title: '',
        attrs: {},
        classList: createClassList(),
        setAttribute(name, value) { this.attrs[name] = value; }
    };
    const aiBatchLoreBtn = {
        disabled: false,
        title: '',
        attrs: {},
        classList: createClassList(),
        setAttribute(name, value) { this.attrs[name] = value; }
    };
    const summaryEl = {
        innerHTML: '',
        onclick: null,
        classList: createClassList()
    };
    const roomStatus = { textContent: '' };
    const bindSelectors = [];
    const situationEl = {
        innerHTML: '',
        querySelectorAll(selector) {
            bindSelectors.push(selector);
            return [];
        }
    };
    const loreListEl = { innerHTML: '' };
    const context = {
        console,
        State: { scene },
        Renderer,
        document: {
            getElementById(id) {
                if (id === 'addLoreEntryBtn') return addLoreBtn;
                if (id === 'aiBatchLoreBtn') return aiBatchLoreBtn;
                if (id === 'statusSummary') return summaryEl;
                if (id === 'roomStatus') return roomStatus;
                return null;
            }
        },
        WorldEngine: {
            isScenePlaying,
            endedSceneMessage: () => 'ended',
            getPreparationHints: () => [{
                kind: 'equipment',
                title: '可用准备',
                detail: '保留为回顾文本',
                command: '使用旧道具',
                label: '旧道具'
            }],
            getUnlockedCompanionResources: () => [],
            getActiveConsequences: () => [],
            getEventLog: () => [],
            getCurrentSituation: () => ({
                location: { name: '终点', description: '结局后的地点' },
                activeQuest: {
                    name: '主线',
                    description: '已经结束',
                    objectives: [{ text: '回顾最后一步', completed: false }]
                },
                clocks: [],
                hiddenPressure: 0,
                counterStrategies: [],
                recentRisks: [],
                availableClues: [],
                recommendedActions: ['回顾旅程'],
                knownUnknowns: [{
                    title: '旧谜题',
                    text: '只作为记录展示',
                    actions: ['继续追查']
                }],
                failureWarnings: [],
                challengeEvidence: [],
                visibleEvidence: [{
                    title: '终局证据',
                    text: '这条证据只用于回顾展示',
                    reliability: 'confirmed',
                    tags: ['结局', '证据']
                }],
                activeChallenge: {
                    title: '终局挑战',
                    goal: '已经结束',
                    progress: 1,
                    targetProgress: 2,
                    strain: 0,
                    maxStrain: 2,
                    checkCount: 1,
                    checkBudget: { min: 2 },
                    approaches: [{ label: '继续尝试', statName: '感知', dc: 14 }]
                }
            })
        }
    };
    return { context, addLoreBtn, aiBatchLoreBtn, situationEl, loreListEl, bindSelectors };
}

function testEndedSituationActionsRenderReadonly() {
    const scene = { gameState: 'defeated', turnCount: 8 };
    const { context, situationEl, bindSelectors } = createSidebarContext(scene);
    const SidebarRight = loadBrowserScript('js/ui/sidebar-right.js', context, 'SidebarRight');
    SidebarRight.situationEl = situationEl;

    SidebarRight.renderSituation();

    assert.ok(situationEl.innerHTML.includes('aria-disabled="true"'));
    assert.ok(situationEl.innerHTML.includes('situation-action readonly'));
    assert.ok(!situationEl.innerHTML.includes('<button class="situation-action'));
    assert.ok(situationEl.innerHTML.includes('最近证据'));
    assert.ok(situationEl.innerHTML.includes('终局证据'));
    assert.ok(situationEl.innerHTML.includes('已确认'));
    assert.deepStrictEqual(bindSelectors, ['button.situation-action']);
}

function testLorebookHeaderControlsFollowEndedState() {
    const scene = { gameState: 'victorious', lorebookEntries: [] };
    const { context, addLoreBtn, aiBatchLoreBtn, loreListEl } = createSidebarContext(scene);
    const SidebarRight = loadBrowserScript('js/ui/sidebar-right.js', context, 'SidebarRight');
    SidebarRight.loreListEl = loreListEl;

    SidebarRight.renderLorebook();
    assert.strictEqual(addLoreBtn.disabled, true);
    assert.strictEqual(aiBatchLoreBtn.disabled, true);
    assert.strictEqual(addLoreBtn.attrs['aria-disabled'], 'true');
    assert.strictEqual(aiBatchLoreBtn.attrs['aria-disabled'], 'true');
    assert.ok(addLoreBtn.classList.contains('readonly'));
    assert.ok(aiBatchLoreBtn.title.includes('仅供回顾'));

    context.State.scene = { gameState: 'playing', lorebookEntries: [] };
    SidebarRight.renderLorebook();
    assert.strictEqual(addLoreBtn.disabled, false);
    assert.strictEqual(aiBatchLoreBtn.disabled, false);
    assert.strictEqual(addLoreBtn.attrs['aria-disabled'], 'false');
    assert.strictEqual(aiBatchLoreBtn.attrs['aria-disabled'], 'false');
    assert.strictEqual(addLoreBtn.classList.contains('readonly'), false);
}

(async () => {
    await testEndedMapRendersReadonlyAndBlocksMove();
    testEndedSituationActionsRenderReadonly();
    testLorebookHeaderControlsFollowEndedState();
    console.log('ended-readonly-ui regression tests passed');
})().catch(err => {
    console.error(err);
    process.exit(1);
});
