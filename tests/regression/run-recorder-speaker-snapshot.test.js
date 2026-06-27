const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadRunRecorder(context) {
    const code = fs.readFileSync(path.join(root, 'js/features/run-recorder.js'), 'utf8') + '\nthis.RunRecorder = RunRecorder;';
    vm.runInNewContext(code, context, { filename: 'js/features/run-recorder.js' });
    return context.RunRecorder;
}

function testTranscriptUsesMessageSpeakerSnapshotWhenCharacterMissing() {
    const context = {
        console,
        State: { characters: [] }
    };
    const RunRecorder = loadRunRecorder(context);
    const scene = {
        id: 'scene_1',
        name: '测试副本',
        gameState: 'victorious',
        userName: '玩家',
        messages: [{
            id: 'msg_1',
            role: 'assistant',
            characterId: 'char_missing',
            characterName: '旧角色名',
            type: 'talk',
            content: '这是旧角色说过的话。',
            timestamp: 100
        }]
    };

    const record = RunRecorder.build(scene, 'victorious');

    assert.strictEqual(record.transcript.length, 1);
    assert.strictEqual(record.transcript[0].speaker, '旧角色名');
    assert.strictEqual(record.transcript[0].characterId, 'char_missing');
}

function testTranscriptFallsBackToGlobalCharacterName() {
    const context = {
        console,
        State: { characters: [{ id: 'char_known', name: '全局角色名' }] }
    };
    const RunRecorder = loadRunRecorder(context);
    const scene = {
        id: 'scene_1',
        name: '测试副本',
        gameState: 'victorious',
        userName: '玩家',
        messages: [{
            id: 'msg_1',
            role: 'assistant',
            characterId: 'char_known',
            type: 'talk',
            content: '这是角色说过的话。',
            timestamp: 100
        }]
    };

    const record = RunRecorder.build(scene, 'victorious');

    assert.strictEqual(record.transcript[0].speaker, '全局角色名');
    assert.strictEqual(record.transcript[0].characterId, 'char_known');
}

testTranscriptUsesMessageSpeakerSnapshotWhenCharacterMissing();
testTranscriptFallsBackToGlobalCharacterName();
console.log('run-recorder-speaker-snapshot regression tests passed');
