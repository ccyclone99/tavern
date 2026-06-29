const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadTutorialHarness() {
    const scene = {
        gameState: 'playing',
        userName: '新人',
        messages: [],
        eventLog: [],
        inventory: [],
        quests: [{
            id: 'q_tutorial',
            name: '学会冒险的基本功',
            type: 'main',
            status: 'active',
            objectives: [
                { text: '直接输入一句话', completed: false },
                { text: '用 @ 指定对话对象', completed: false },
                { text: '描述一次有风险的行动', completed: false },
                { text: '确认行动并完成检定', completed: false },
                { text: '用文字移动到后院', completed: false }
            ],
            reward: ''
        }],
        currentSituation: { recentRisks: [], recommendedActions: [] }
    };
    const rendered = [];
    const context = {
        console,
        State: {
            scene,
            activeCharacters: [],
            saveCurrentSceneDebounced: () => Promise.resolve()
        },
        ChatUI: {
            onMessageAdded: msg => rendered.push(msg.content)
        },
        QuestTracker: {
            render() {}
        },
        SidebarRight: {
            renderQuests() {}
        },
        localStorage: {
            getItem: () => null,
            setItem() {}
        }
    };
    const worldEngineCode = fs.readFileSync(path.join(root, 'js/features/world-engine.js'), 'utf8') + '\nthis.WorldEngine = WorldEngine;';
    vm.runInNewContext(worldEngineCode, context, { filename: 'js/features/world-engine.js' });
    const tutorialCode = fs.readFileSync(path.join(root, 'js/features/tutorial.js'), 'utf8') + '\nthis.Tutorial = Tutorial;';
    vm.runInNewContext(tutorialCode, context, { filename: 'js/features/tutorial.js' });
    return { scene, rendered, Tutorial: context.Tutorial };
}

function testTutorialObjectivesEmitProgressAndCompletion() {
    const { scene, rendered, Tutorial } = loadTutorialHarness();

    Tutorial._markQuestObjective(0);
    assert.strictEqual(scene.quests[0].objectives[0].completed, true);
    assert.ok(scene.messages.some(msg => msg.content === '【任务进展：学会冒险的基本功】直接输入一句话'));
    assert.ok(rendered.includes('【任务进展：学会冒险的基本功】直接输入一句话'));

    for (let idx = 1; idx < scene.quests[0].objectives.length; idx += 1) {
        Tutorial._markQuestObjective(idx);
    }

    assert.strictEqual(scene.quests[0].status, 'completed');
    assert.strictEqual(scene.gameState, 'playing', 'tutorial completion notice should not force a victory lock');
    assert.ok(scene.messages.some(msg => msg.content === '【任务完成：学会冒险的基本功】'));
    assert.ok(rendered.includes('【任务完成：学会冒险的基本功】'));
}

testTutorialObjectivesEmitProgressAndCompletion();
console.log('tutorial-quest-feedback regression tests passed');
