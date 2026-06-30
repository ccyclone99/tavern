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

function testPhaseSummaryLinksEvidenceAndChecksThroughSupports() {
    const RunRecorder = loadRunRecorder();
    const scene = {
        id: 'scene_shelter',
        name: '第7区避难所',
        gameState: 'victorious',
        userName: '地表人',
        turnCount: 12,
        storyPhases: [{
            id: 'phase_vote',
            title: '委员会表决',
            status: 'completed',
            goal: '说服委员会启动迁徙方案',
            stakes: '证据不足只能获得试点许可'
        }],
        sceneChallenges: [{
            id: 'challenge_vote',
            phaseId: 'phase_vote',
            title: '迁徙方案表决',
            status: 'completed',
            progress: 3,
            targetProgress: 3,
            strain: 1,
            maxStrain: 3,
            checkCount: 1,
            supports: ['q_main:2'],
            coreRevelations: ['rev_new_home']
        }],
        quests: [{
            id: 'q_main',
            name: '寻找生存出路',
            type: 'main',
            status: 'completed',
            objectives: [
                { text: '获得委员会的信任授权', completed: true },
                { text: '说服委员会启动迁徙方案', completed: true }
            ]
        }],
        evidenceLedger: [{
            id: 'ev_capacity',
            title: '新伊甸容量记录',
            reliability: 'confirmed',
            visible: true,
            tags: ['capacity', 'new_home'],
            supports: ['rev_new_home']
        }],
        messages: [{
            id: 'check_1',
            role: 'user',
            type: 'check',
            content: '【魅力检定：D20=14 +2 = 16 vs DC15 → 成功】',
            timestamp: 100,
            checkData: {
                statName: '魅力',
                total: 16,
                dc: 15,
                resultLabel: '成功',
                intent: '公开新伊甸证据链',
                challengeContext: {
                    challengeId: 'challenge_vote'
                }
            }
        }, {
            id: 'victory_1',
            role: 'system',
            type: 'victory',
            content: '委员会批准第一批迁徙。',
            timestamp: 200
        }]
    };

    const record = RunRecorder.build(scene, 'victorious');
    const phase = record.phaseSummaries.find(item => item.id === 'phase_vote');

    assert.ok(phase, 'phase summary should be generated');
    assert.strictEqual(record.version, 13);
    assert.strictEqual(record.checks[0].challengeId, 'challenge_vote');
    assert.strictEqual(phase.checkCount, 1, 'phase should count check by challenge id even without challenge title');
    assert.ok(phase.evidence.includes('新伊甸容量记录'), 'phase should include evidence linked through core revelation support');
    assert.ok(phase.completedObjectives.includes('说服委员会启动迁徙方案'));
    assert.ok(phase.summary.includes('关键证据：新伊甸容量记录'));
    assert.ok((phase.excerpts || []).some(entry => entry.type === 'check'), 'phase excerpts should include matching check transcript');
}

testPhaseSummaryLinksEvidenceAndChecksThroughSupports();
console.log('run-recorder-phase-links regression tests passed');
