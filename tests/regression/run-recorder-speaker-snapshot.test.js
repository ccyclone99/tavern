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

function testTranscriptStripsAllProtocolMarkers() {
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
            characterName: '主持人',
            type: 'talk',
            content: '你获得钥匙[item_add:钥匙]，又失去旧钥匙[item_remove:旧钥匙]。[item_equip:短剑][item_unequip:护甲][new_char:陌生人|🙂][char_exit:陌生人|离开][move:大厅]',
            timestamp: 100
        }]
    };

    const record = RunRecorder.build(scene, 'victorious');

    assert.strictEqual(record.version, 13);
    assert.strictEqual(record.transcript[0].text, '你获得钥匙，又失去旧钥匙。');
}

function testArchivedTranscriptIsCleaned() {
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
        transcriptLog: [{
            index: 1,
            id: 'archived_1',
            role: 'assistant',
            type: 'talk',
            speaker: '主持人',
            text: '旧记录[item_remove:钥匙][item_equip:短剑]<state_update>{"scene":{"worldTensionDelta":1}}</state_update>',
            timestamp: 100,
            archived: true
        }],
        messages: []
    };

    const record = RunRecorder.build(scene, 'victorious');

    assert.strictEqual(record.transcript.length, 1);
    assert.strictEqual(record.transcript[0].text, '旧记录');
    assert.strictEqual(scene.transcriptLog[0].text.includes('[item_remove:'), true, 'archived source should not be mutated while building record');
}

testTranscriptUsesMessageSpeakerSnapshotWhenCharacterMissing();
testTranscriptFallsBackToGlobalCharacterName();
testTranscriptStripsAllProtocolMarkers();
testArchivedTranscriptIsCleaned();
console.log('run-recorder-speaker-snapshot regression tests passed');
