const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadWorldEngine() {
    const context = {
        console,
        State: {
            saveCurrentSceneDebounced() {}
        },
        ChatUI: {
            onMessageAdded() {}
        },
        SidebarRight: {
            renderQuests() {},
            renderSituation() {},
            markTabNew() {}
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
        inventory: [],
        messages: [],
        eventLog: [],
        currentSituation: { recentRisks: [], recommendedActions: [] },
        gameplayProfile: {
            checkDensity: {
                targetPerRun: [8, 12],
                minPerMainPhase: 1,
                maxAutoQuestAdvances: 1
            }
        },
        questProgressGuards: { autoAdvanceStreak: 0, lastAdvancedAt: 0 },
        sceneChallenges: [{
            id: 'completed_context',
            title: '已完成的背景挑战',
            status: 'completed',
            supports: []
        }],
        evidenceLedger: [],
        flowGraph: { nodes: [], revelations: [] },
        quests: [{
            id: 'q_main',
            name: '迁徙许可',
            type: 'main',
            status: 'active',
            objectives: [
                { id: 'permission', text: '获得委员会授权', completed: false },
                { id: 'capacity', text: '确认新家园容量', completed: false }
            ],
            reward: ''
        }],
        ...overrides
    };
}

function testNarrativeAutoAdvanceStopsAtConfiguredCap(WorldEngine) {
    const scene = makeScene();
    const msg = {
        id: 'msg_ai',
        role: 'assistant',
        type: 'narrate',
        content: '委员会全票通过，正式认可玩家，并批准授权。随后又确认新家园容量记录可用，证明迁徙路线成立。'
    };

    const result = WorldEngine.reconcileQuestProgressFromNarrative(scene, msg);

    assert.strictEqual(result.changed, true);
    assert.strictEqual(result.completedObjectives.length, 1, 'only one objective should auto-complete at cap 1');
    assert.strictEqual(scene.quests[0].objectives[0].completed, true);
    assert.strictEqual(scene.quests[0].objectives[1].completed, false);
    assert.strictEqual(scene.questProgressGuards.autoAdvanceStreak, 1);
}

function testExplicitQuestUpdateCannotBypassStructuredGate(WorldEngine) {
    const scene = makeScene();

    const result = WorldEngine.applyQuestUpdates(scene, [{
        questId: 'q_main',
        objectiveIdx: 0,
        reason: 'AI标记'
    }], {
        stateUpdate: true,
        explicitMarker: true
    });

    assert.strictEqual(result.changed, false);
    assert.strictEqual(result.results.length, 1);
    assert.strictEqual(result.results[0].blocked, true);
    assert.strictEqual(scene.quests[0].objectives[0].completed, false);
    assert.ok(scene.messages.some(msg => String(msg.content || '').includes('任务进展待确认')));
}

const WorldEngine = loadWorldEngine();
testNarrativeAutoAdvanceStopsAtConfiguredCap(WorldEngine);
testExplicitQuestUpdateCannotBypassStructuredGate(WorldEngine);
console.log('quest-auto-advance-guard regression tests passed');
