const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadTemplateContext() {
    const context = { console };
    const worldCode = fs.readFileSync(path.join(root, 'js/features/world-engine.js'), 'utf8') + '\nthis.WorldEngine = WorldEngine;';
    vm.runInNewContext(worldCode, context, { filename: 'js/features/world-engine.js' });
    const generatorCode = fs.readFileSync(path.join(root, 'js/features/world-generator.js'), 'utf8') + '\nthis.WorldGenerator = WorldGenerator;';
    vm.runInNewContext(generatorCode, context, { filename: 'js/features/world-generator.js' });
    return { WorldEngine: context.WorldEngine, WorldGenerator: context.WorldGenerator };
}

function getTemplateRuntime(WorldEngine, WorldGenerator, template) {
    return {
        locations: Array.isArray(template.locations) ? template.locations : [],
        phases: Array.isArray(template.storyPhases) ? template.storyPhases : [],
        clues: Array.isArray(template.clueGraph) ? template.clueGraph : [],
        flowGraph: WorldEngine.normalizeFlowGraph(template.flowGraph || WorldGenerator._buildDefaultFlowGraph(template)),
        challenges: Array.isArray(template.sceneChallenges) && template.sceneChallenges.length > 0
            ? template.sceneChallenges.map((item, idx) => WorldEngine.normalizeSceneChallenge(item, idx)).filter(Boolean)
            : WorldGenerator._buildDefaultSceneChallenges(template)
    };
}

function testTemplatesMeetScenarioStructureSpec(WorldEngine, WorldGenerator) {
    assert.ok(WorldGenerator.templates.length >= 3, 'expected multiple playable scenario templates');

    WorldGenerator.templates.forEach(template => {
        const runtime = getTemplateRuntime(WorldEngine, WorldGenerator, template);
        const label = `${template.id} ${template.name}`;

        assert.ok(runtime.locations.length >= 4, `${label} should have at least 4 locations`);
        assert.ok(runtime.flowGraph.nodes.length >= runtime.locations.length, `${label} should have flow nodes for locations`);
        assert.ok(runtime.phases.length >= 3, `${label} should have at least 3 story phases`);
        assert.ok(runtime.phases.some(phase => phase.status === 'active'), `${label} should start with an active phase`);
        assert.ok(runtime.flowGraph.revelations.length >= 3, `${label} should have at least 3 revelations`);
        assert.ok(runtime.challenges.length >= runtime.phases.length, `${label} should have enough challenges for phases`);

        const clueIds = new Set(runtime.clues.map(clue => clue.id).filter(Boolean));
        runtime.flowGraph.revelations
            .filter(rev => rev.core !== false)
            .forEach(rev => {
                assert.ok((rev.clueIds || []).length >= 3, `${label} revelation ${rev.id} should have at least 3 clue entries`);
                rev.clueIds.forEach(id => {
                    assert.ok(clueIds.has(id), `${label} revelation ${rev.id} references missing clue ${id}`);
                });
            });

        const phaseCounts = new Map();
        runtime.challenges.forEach(challenge => {
            if (!challenge.phaseId) return;
            phaseCounts.set(challenge.phaseId, (phaseCounts.get(challenge.phaseId) || 0) + 1);
        });
        runtime.phases.forEach(phase => {
            const count = phaseCounts.get(phase.id) || 0;
            assert.ok(count >= 1, `${label} phase ${phase.id} should have a playable challenge`);
            assert.ok(count <= 3, `${label} phase ${phase.id} should not be overloaded with challenges`);
        });

        const actionTypes = new Set(runtime.challenges.flatMap(challenge =>
            (challenge.approaches || []).map(approach => approach.actionType).filter(Boolean)
        ));
        assert.ok(['persuade', 'ask', 'probe'].some(type => actionTypes.has(type)), `${label} should support a social route`);
        assert.ok(['investigate', 'observe'].some(type => actionTypes.has(type)), `${label} should support an investigation route`);
        assert.ok(['use_item', 'force', 'sneak'].some(type => actionTypes.has(type)), `${label} should support a resource/cost route`);
    });
}

const { WorldEngine, WorldGenerator } = loadTemplateContext();
testTemplatesMeetScenarioStructureSpec(WorldEngine, WorldGenerator);
console.log('scenario-template-structure regression tests passed');
