const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadRunRecorder() {
    const context = {
        console,
        State: { characters: [] }
    };
    const code = fs.readFileSync(path.join(root, 'js/features/run-recorder.js'), 'utf8') + '\nthis.RunRecorder = RunRecorder;';
    vm.runInNewContext(code, context, { filename: 'js/features/run-recorder.js' });
    return context.RunRecorder;
}

function testRunRecordKeepsEventLogSnapshot() {
    const RunRecorder = loadRunRecorder();
    const scene = {
        id: 'scene_event',
        name: '事件记录测试',
        gameState: 'victorious',
        userName: '玩家',
        eventLog: [{
            category: 'resource',
            title: '资源消耗',
            text: '投入应急医疗包[item_remove:应急医疗包]<state_update>{"scene":{"worldTensionDelta":1}}</state_update>',
            turn: 4,
            timestamp: 100,
            refId: 'kit_1'
        }, {
            category: 'movement',
            title: '移动',
            text: '前往旧商场深处',
            turn: 5,
            timestamp: 120
        }, {
            category: 'movement',
            title: '移动',
            text: '前往旧商场深处',
            turn: 5,
            timestamp: 121
        }],
        messages: [{
            id: 'victory',
            role: 'system',
            type: 'victory',
            content: '通关。',
            timestamp: 200
        }]
    };

    const record = RunRecorder.build(scene, 'victorious');

    assert.strictEqual(record.version, 13);
    assert.strictEqual(record.events.length, 2, 'duplicate adjacent events should be deduped in record snapshot');
    assert.deepStrictEqual(record.events.map(event => event.category), ['resource', 'movement']);
    assert.strictEqual(record.events[0].title, '资源消耗');
    assert.strictEqual(record.events[0].text, '投入应急医疗包');
    assert.strictEqual(record.events[0].turn, 4);
    assert.strictEqual(record.events[0].refId, 'kit_1');
    assert.ok(scene.eventLog[0].text.includes('[item_remove:'), 'source event log should not be mutated');
}

testRunRecordKeepsEventLogSnapshot();
console.log('run-recorder-event-log regression tests passed');
