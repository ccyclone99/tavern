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

function assertLocationGraphIsPlayable(template, locations) {
    const label = `${template.id} ${template.name}`;
    const locationIds = new Set();
    locations.forEach((location, idx) => {
        assert.ok(location && location.id, `${label} location ${idx} should have an id`);
        assert.ok(!locationIds.has(location.id), `${label} location ${location.id} should be unique`);
        locationIds.add(location.id);
    });

    locations.forEach(location => {
        const connections = Array.isArray(location.connections) ? location.connections : [];
        connections.forEach(targetId => {
            assert.ok(locationIds.has(targetId), `${label} location ${location.id} connects to missing location ${targetId}`);
            const target = locations.find(item => item.id === targetId);
            const back = Array.isArray(target?.connections) ? target.connections : [];
            assert.ok(back.includes(location.id), `${label} connection ${location.id} -> ${targetId} should be bidirectional`);
        });
    });

    const startId = locations[0]?.id;
    const seen = new Set();
    const queue = startId ? [startId] : [];
    while (queue.length > 0) {
        const id = queue.shift();
        if (!id || seen.has(id)) continue;
        seen.add(id);
        const location = locations.find(item => item.id === id);
        (location?.connections || []).forEach(nextId => {
            if (!seen.has(nextId)) queue.push(nextId);
        });
    }
    assert.strictEqual(seen.size, locations.length, `${label} location map should be fully reachable from the starting location`);
}

function assertFlowGraphRoutesResolve(WorldEngine, template, runtime) {
    const label = `${template.id} ${template.name}`;
    const scene = {
        locations: runtime.locations,
        currentLocation: runtime.locations[0]?.id || '',
        flowGraph: runtime.flowGraph
    };
    const nodeIds = new Set();
    runtime.flowGraph.nodes.forEach(node => {
        assert.ok(node && node.id, `${label} flow node should have an id`);
        assert.ok(!nodeIds.has(node.id), `${label} flow node ${node.id} should be unique`);
        nodeIds.add(node.id);
    });

    const locationNodeIds = new Set();
    runtime.flowGraph.nodes.forEach(node => {
        const location = WorldEngine._locationForFlowNode(scene, node);
        if (location?.id) locationNodeIds.add(location.id);
    });
    runtime.locations.forEach(location => {
        assert.ok(locationNodeIds.has(location.id), `${label} location ${location.id} should resolve from a flow node`);
    });

    const normalize = value => WorldEngine._normalizeQuestText(value || '');
    const nodeByRef = new Map();
    runtime.flowGraph.nodes.forEach(node => {
        [node.id, node.title].map(normalize).filter(Boolean).forEach(key => nodeByRef.set(key, node));
    });

    runtime.flowGraph.nodes.forEach(node => {
        (node.exits || []).forEach(exitRef => {
            const targetNode = nodeByRef.get(normalize(exitRef));
            const targetLocation = targetNode
                ? WorldEngine._locationForFlowNode(scene, targetNode)
                : WorldEngine.resolveLocationReference(scene, { id: exitRef, name: exitRef }, { withStatus: true })?.location;
            assert.ok(targetNode || targetLocation, `${label} flow node ${node.id} exit ${exitRef} should resolve to a node or location`);
        });
    });
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
        assertLocationGraphIsPlayable(template, runtime.locations);
        assertFlowGraphRoutesResolve(WorldEngine, template, runtime);

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
