const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadWorldEngine() {
    const context = {
        console,
        State: {
            addKnowledgeDiscovery() {},
            characters: [],
            activeCharacters: []
        },
        SidebarRight: {
            markTabNew() {},
            renderSituation() {}
        }
    };
    const code = fs.readFileSync(path.join(root, 'js/features/world-engine.js'), 'utf8') + '\nthis.WorldEngine = WorldEngine;';
    vm.runInNewContext(code, context, { filename: 'js/features/world-engine.js' });
    return context.WorldEngine;
}

function makeScene(overrides = {}) {
    return {
        id: 'scene_location_update_routing',
        gameState: 'playing',
        userName: '旅人',
        turnCount: 1,
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
        quests: [],
        characters: [],
        currentLocation: 'hall',
        locations: [
            { id: 'hall', name: '大厅', description: '起点', connections: [] },
            { id: 'lab', name: '实验室', description: '终端还亮着', connections: [] }
        ],
        currentSituation: { recentRisks: [], recommendedActions: [] },
        storyPhases: [],
        storyArcs: [],
        sceneChallenges: [],
        clocks: [],
        counterStrategies: [],
        clueGraph: [],
        evidenceLedger: [],
        companionResources: [],
        failureStates: [],
        flowGraph: { nodes: [], revelations: [] },
        ...overrides
    };
}

function testLocationUpdateSanitizesAndSyncsRoutes(WorldEngine) {
    const scene = makeScene();
    const result = WorldEngine.applyLocationUpdates(scene, [
        { id: 'hall', connections: ['lab', 'ghost', 'hall'] },
        { id: 'roof', name: '屋顶平台', description: '能看到整片街区。', connections: ['hall', 'ghost'] }
    ]);
    const hall = scene.locations.find(location => location.id === 'hall');
    const lab = scene.locations.find(location => location.id === 'lab');
    const roof = scene.locations.find(location => location.id === 'roof');

    assert.strictEqual(result.changed, true);
    assert.strictEqual(result.added, 1);
    assert.ok(hall.connections.includes('lab'));
    assert.ok(hall.connections.includes('roof'));
    assert.ok(!hall.connections.includes('ghost'));
    assert.ok(!hall.connections.includes('hall'));
    assert.ok(lab.connections.includes('hall'), 'existing target should get a return route');
    assert.ok(roof.connections.includes('hall'), 'new location should keep valid declared route');
    assert.ok(!scene.locations.some(location => (location.connections || []).includes('ghost')));

    const moveToRoof = WorldEngine.moveToLocation(scene, 'roof');
    assert.strictEqual(moveToRoof.ok, true);
    assert.strictEqual(scene.currentLocation, 'roof');
    const moveBack = WorldEngine.moveToLocation(scene, 'hall');
    assert.strictEqual(moveBack.ok, true);
    assert.strictEqual(scene.currentLocation, 'hall');
}

function testLocationUpdateRepairsExistingOneWayRoute(WorldEngine) {
    const scene = makeScene({
        locations: [
            { id: 'hall', name: '大厅', description: '起点', connections: ['lab'] },
            { id: 'lab', name: '实验室', description: '终端还亮着', connections: [] }
        ]
    });
    const result = WorldEngine.applyLocationUpdates(scene, [
        { id: 'lab', alertLevel: 20 }
    ]);
    const lab = scene.locations.find(location => location.id === 'lab');

    assert.strictEqual(result.changed, true);
    assert.ok(lab.connections.includes('hall'), 'location updates should repair pre-existing one-way routes');
}

const WorldEngine = loadWorldEngine();
testLocationUpdateSanitizesAndSyncsRoutes(WorldEngine);
testLocationUpdateRepairsExistingOneWayRoute(WorldEngine);
console.log('location-update-routing regression tests passed');
