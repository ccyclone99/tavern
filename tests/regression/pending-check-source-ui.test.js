const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadActionBar(scene) {
    const preview = {
        innerHTML: '',
        classList: {
            add() {},
            remove() {}
        },
        querySelectorAll() {
            return [];
        }
    };
    const buttons = {
        rollPendingCheckBtn: { onclick: null },
        cancelPendingCheckBtn: { onclick: null }
    };
    const context = {
        console,
        State: {
            scene,
            saveCurrentSceneDebounced() {}
        },
        Renderer: {
            escapeHtml: value => String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;'),
            escapeAttr: value => String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
        },
        Icons: {
            get() {
                return '<span class="test-icon"></span>';
            }
        },
        WorldEngine: {
            isScenePlaying: target => !!target && (!target.gameState || target.gameState === 'playing'),
            getCheckTotals: (target, check) => ({
                mod: Number(check.mod || 0),
                dc: Number(check.dc || 15),
                baseDc: Number(check.dc || 15),
                statMod: Number(check.statMod || 0),
                itemBonus: Number(check.itemBonus || 0),
                bonus: 0,
                dcDelta: 0,
                riskDelta: 0,
                itemModifiers: [],
                modifiers: []
            }),
            getAvailableCheckItems: () => [],
            getAvailableCompanionResources: () => []
        },
        GroupChat: {
            rollPendingCheck() {},
            cancelPendingCheck() {}
        },
        document: {
            getElementById(id) {
                if (id === 'pendingCheckPreview') return preview;
                return buttons[id] || null;
            }
        }
    };
    const code = fs.readFileSync(path.join(root, 'js/ui/action-bar.js'), 'utf8') + '\nthis.ActionBar = ActionBar;';
    vm.runInNewContext(code, context, { filename: 'js/ui/action-bar.js' });
    return { ActionBar: context.ActionBar, preview };
}

function makeScene(pendingCheck) {
    return {
        gameState: 'playing',
        pendingCheck
    };
}

function testAiCheckSourceIsVisible() {
    const scene = makeScene({
        statName: '力量',
        key: 'strength',
        statMod: 0,
        itemBonus: 0,
        mod: 0,
        dc: 13,
        source: 'AI 要求检定',
        adjudicationSource: 'ai',
        intent: '我试着搬开倒塌的柜子。',
        risks: [],
        selectedItemModifierIds: [],
        selectedCompanionResourceIds: []
    });
    const { ActionBar, preview } = loadActionBar(scene);

    ActionBar.renderPendingCheck();

    assert.ok(preview.innerHTML.includes('AI 要求检定'));
    assert.ok(preview.innerHTML.includes('行动：我试着搬开倒塌的柜子。'));
    assert.ok(!preview.innerHTML.includes('来自行动：'), 'source wording should not hide the adjudication origin');
}

function testLocalCheckSourceIsVisible() {
    const scene = makeScene({
        statName: '敏捷',
        key: 'dexterity',
        statMod: 2,
        itemBonus: 0,
        mod: 2,
        dc: 16,
        source: '本地行动裁决',
        adjudicationSource: 'local',
        intent: '我趁守卫转身潜入档案室。',
        risks: [],
        selectedItemModifierIds: [],
        selectedCompanionResourceIds: []
    });
    const { ActionBar, preview } = loadActionBar(scene);

    ActionBar.renderPendingCheck();

    assert.ok(preview.innerHTML.includes('本地行动裁决'));
    assert.ok(preview.innerHTML.includes('行动：我趁守卫转身潜入档案室。'));
}

testAiCheckSourceIsVisible();
testLocalCheckSourceIsVisible();
console.log('pending-check-source-ui regression tests passed');
