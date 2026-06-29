const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadUi() {
    const context = {
        console,
        State: {
            isStreaming: false,
            isOOC: false,
            currentCharacterId: 'ela',
            characters: [{ id: 'ela', name: '艾拉' }],
            activeCharacters: [{ id: 'ela', name: '艾拉' }],
            scene: null
        },
        SidebarRight: {
            markTabNew() {},
            renderDetail() {},
            renderInventory() {},
            renderSituation() {}
        },
        ActionBar: {
            renderStatsDisplay() {}
        },
        Renderer: {
            escapeHtml(value) { return String(value || ''); },
            escapeAttr(value) { return String(value || ''); }
        },
        Icons: { get() { return ''; } }
    };
    const engineCode = fs.readFileSync(path.join(root, 'js/features/world-engine.js'), 'utf8') + '\nthis.WorldEngine = WorldEngine;';
    vm.runInNewContext(engineCode, context, { filename: 'js/features/world-engine.js' });
    const chatCode = fs.readFileSync(path.join(root, 'js/ui/chat.js'), 'utf8') + '\nthis.ChatUI = ChatUI;';
    vm.runInNewContext(chatCode, context, { filename: 'js/ui/chat.js' });
    return { ChatUI: context.ChatUI, State: context.State, WorldEngine: context.WorldEngine };
}

function makeScene() {
    return {
        gameState: 'playing',
        userName: '测试玩家',
        turnCount: 5,
        playerStats: { strength: 10, dexterity: 10, constitution: 10, intelligence: 10, wisdom: 10, charisma: 10 },
        playerHp: 10,
        playerMaxHp: 10,
        level: 1,
        exp: 0,
        attrPoints: 0,
        gold: 0,
        messages: [],
        eventLog: [],
        inventory: [],
        quests: [{
            id: 'main',
            name: '证明清白',
            type: 'main',
            status: 'active',
            objectives: [{ text: '向审判庭证明清白', completed: false }]
        }],
        characters: ['ela'],
        currentLocation: 'cargo',
        locations: [{ id: 'cargo', name: '下层货舱', description: '堆着被封存的旧货箱。', connections: [] }],
        currentSituation: { recentRisks: ['审讯官开始怀疑你在拖延'], recommendedActions: [] },
        storyPhases: [],
        storyArcs: [],
        sceneChallenges: [{
            id: 'ch',
            title: '最低信任',
            status: 'active',
            targetProgress: 3,
            progress: 0,
            maxStrain: 3,
            strain: 0,
            approaches: [{ id: 'a', label: '提交污染星球经历', stat: 'charisma', dc: 14, actionType: 'persuade' }]
        }],
        clocks: [{ id: 'pressure', name: '审判庭耐心', tag: 'main', value: 5, max: 6, visibility: 'known' }],
        counterStrategies: [],
        clueGraph: [{
            id: 'u1',
            title: '第三道影子是谁',
            status: 'suspected',
            currentStage: 0,
            stages: [{ level: 1, title: '影子', text: '还缺来源。', actions: ['询问艾拉第三道影子'] }]
        }],
        evidenceLedger: [],
        companionResources: [],
        failureStates: []
    };
}

function testContextualSuggestionsFavorEditablePlayerIntent(ChatUI, State) {
    const scene = makeScene();
    State.scene = scene;
    const chips = ChatUI._buildSuggestionChips(scene);
    const labels = chips.map(chip => chip.label);
    const texts = chips.map(chip => chip.text);

    assert.ok(labels.includes('压低压力'), 'urgent pressure should appear as a freeform suggestion');
    assert.ok(labels.includes('换角度'), 'active challenge should offer a non-linear angle');
    assert.ok(labels.includes('追线索'), 'known unknowns should become a natural investigation prompt');
    assert.ok(texts.some(text => text.includes('审判庭耐心')));
    assert.ok(texts.some(text => text.includes('第三道影子是谁')));
    assert.ok(!texts.some(text => text.startsWith('如果想推进主线')), 'main quest prompt should not dominate the first suggestions');
    assert.ok(chips.every(chip => chip.behavior === 'fill'), 'idle suggestions should fill editable text');
}

const { ChatUI, State } = loadUi();
testContextualSuggestionsFavorEditablePlayerIntent(ChatUI, State);
console.log('input-suggestion-contextual regression tests passed');
