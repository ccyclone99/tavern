const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadWorldEngine() {
    const context = {
        console,
        State: {
            activeCharacters: [],
            characters: [{ id: 'susan', name: '苏珊', _relations: {} }],
            currentCharacterId: ''
        },
        SidebarRight: {
            markTabNew() {},
            renderSituation() {}
        }
    };
    context.State.activeCharacters = context.State.characters;
    const code = fs.readFileSync(path.join(root, 'js/features/world-engine.js'), 'utf8') + '\nthis.WorldEngine = WorldEngine;';
    vm.runInNewContext(code, context, { filename: 'js/features/world-engine.js' });
    return { WorldEngine: context.WorldEngine, State: context.State };
}

function setSusanTrust(State, trust) {
    State.characters[0]._relations['测试玩家'] = {
        affection: trust,
        trust,
        suspicion: 0,
        fear: 0,
        debt: 0,
        leverage: [],
        mood: '平静',
        memories: [],
        history: []
    };
}

function makeScene(overrides = {}) {
    return {
        gameState: 'playing',
        userName: '测试玩家',
        turnCount: 4,
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
        characters: ['susan'],
        currentLocation: 'clinic',
        locations: [{
            id: 'clinic',
            name: '临时诊所',
            description: '墙上贴着体检记录，门外有人等待表态。',
            connections: []
        }],
        currentSituation: { recentRisks: [], recommendedActions: [] },
        storyPhases: [],
        storyArcs: [],
        sceneChallenges: [{
            id: 'challenge_public_case',
            title: '公开证据链',
            status: 'active',
            targetProgress: 3,
            progress: 0,
            maxStrain: 3,
            strain: 0,
            approaches: [
                {
                    id: 'public_medical_case',
                    label: '公开新伊甸证据链',
                    stat: 'charisma',
                    dc: 14,
                    actionType: 'persuade',
                    tags: ['medical', 'evidence'],
                    keywords: ['苏珊', '医学', '背书', '证据']
                }
            ]
        }],
        clocks: [],
        counterStrategies: [],
        clueGraph: [],
        evidenceLedger: [],
        companionResources: [],
        failureStates: [],
        ...overrides
    };
}

function susanBacking(overrides = {}) {
    return {
        id: 'susan_medical_backing',
        characterId: 'susan',
        name: '苏珊的医学背书',
        uses: 1,
        cost: { trust: 5, time: 10 },
        effect: {
            checkBonus: 2,
            actionType: 'persuade',
            evidenceReliability: 'confirmed'
        },
        tags: ['medical', 'evidence', 'persuade'],
        risk: '苏珊会承受保守派压力。',
        ...overrides
    };
}

function testUnlockedCompanionCreatesActionLead(WorldEngine, State) {
    setSusanTrust(State, 12);
    const scene = makeScene({ companionResources: [susanBacking()] });
    const leads = WorldEngine.getCompanionActionLeads(scene);
    const situation = WorldEngine.getCurrentSituation(scene);
    const hints = WorldEngine.getPreparationHints(scene, { limit: 8 });

    assert.ok(leads.some(lead => lead.action === '请苏珊的医学背书协助公开新伊甸证据链'));
    assert.ok(situation.companionActionLeads.some(lead => lead.name === '苏珊的医学背书'));
    assert.ok(situation.recommendedActions.includes('请苏珊的医学背书协助公开新伊甸证据链'));
    assert.ok(
        situation.recommendedActions.indexOf('请苏珊的医学背书协助公开新伊甸证据链') <
        situation.recommendedActions.indexOf('公开新伊甸证据链'),
        'companion-enabled action should appear before the raw challenge approach'
    );
    assert.ok(hints.some(hint =>
        hint.kind === 'companion' &&
        hint.command === '请苏珊的医学背书协助公开新伊甸证据链'
    ));
}

function testBareCompanionWithoutRelationshipDoesNotLeak(WorldEngine, State) {
    State.characters[0]._relations = {};
    const scene = makeScene({ companionResources: [susanBacking()] });
    const check = { stat: 'charisma', actionType: 'persuade', intent: '公开证据链' };

    assert.strictEqual(WorldEngine.getCompanionActionLeads(scene).length, 0);
    assert.strictEqual(WorldEngine.getAvailableCompanionResources(scene, check).length, 0);
}

function testImmediateCompanionCanBeExplicitlyUnlocked(WorldEngine, State) {
    State.characters[0]._relations = {};
    const scene = makeScene({ companionResources: [susanBacking({ unlock: { immediate: true } })] });
    const leads = WorldEngine.getCompanionActionLeads(scene);

    assert.ok(leads.some(lead => lead.resourceId === 'susan_medical_backing'));
}

function testInvalidUnlockFallsBackToRelationshipGate(WorldEngine, State) {
    State.characters[0]._relations = {};
    const scene = makeScene({ companionResources: [susanBacking({ unlock: { immediate: false, note: '占位字段' } })] });

    assert.strictEqual(WorldEngine.getCompanionActionLeads(scene).length, 0);
}

function testLockedCompanionDoesNotLeak(WorldEngine, State) {
    State.characters[0]._relations = {};
    const scene = makeScene({
        companionResources: [susanBacking({ unlock: { evidenceTags: ['medical'] } })],
        evidenceLedger: [{ id: 'hidden_report', title: '隐藏体检报告', visible: false, tags: ['medical'] }]
    });
    const leads = WorldEngine.getCompanionActionLeads(scene);
    const hints = WorldEngine.getPreparationHints(scene, { limit: 8 });

    assert.strictEqual(leads.length, 0);
    assert.ok(!hints.some(hint => hint.kind === 'companion'));
}

function testEvidenceUnlockSurfacesCompanion(WorldEngine, State) {
    State.characters[0]._relations = {};
    const scene = makeScene({
        companionResources: [susanBacking({ unlock: { evidenceTags: ['medical'] } })],
        evidenceLedger: [{ id: 'public_report', title: '公开体检报告', visible: true, tags: ['medical'] }]
    });
    const leads = WorldEngine.getCompanionActionLeads(scene);

    assert.ok(leads.some(lead => lead.resourceId === 'susan_medical_backing'));
}

function testSpentCompanionDoesNotCreateLead(WorldEngine, State) {
    setSusanTrust(State, 12);
    const scene = makeScene({
        companionResources: [susanBacking({ uses: 0 })]
    });

    assert.strictEqual(WorldEngine.getCompanionActionLeads(scene).length, 0);
}

function testPresentCompanionRequiresActivePresence(WorldEngine, State) {
    setSusanTrust(State, 12);
    State.activeCharacters = [];
    const scene = makeScene({
        characters: [],
        companionResources: [susanBacking({ scope: 'present' })]
    });

    assert.strictEqual(WorldEngine.getCompanionActionLeads(scene).length, 0);
    assert.strictEqual(
        WorldEngine.getCompanionResourceAvailability(scene, scene.companionResources[0]).reason,
        '需要同伴在场'
    );
}

function testPresentCompanionSurfacesWhenActive(WorldEngine, State) {
    setSusanTrust(State, 12);
    State.activeCharacters = State.characters;
    const scene = makeScene({ companionResources: [susanBacking({ scope: 'present' })] });
    const leads = WorldEngine.getCompanionActionLeads(scene);
    const check = { stat: 'charisma', actionType: 'persuade', intent: '公开证据链' };
    const resources = WorldEngine.getAvailableCompanionResources(scene, check);

    assert.ok(leads.some(lead => lead.resourceId === 'susan_medical_backing' && lead.scope === 'present'));
    assert.ok(resources.some(resource => resource.scope === 'present' && resource.scopeLabel === '在场'));
}

function testRemoteCompanionCanSurfaceOffscreen(WorldEngine, State) {
    setSusanTrust(State, 12);
    State.activeCharacters = [];
    const scene = makeScene({
        characters: [],
        companionResources: [susanBacking({ scope: 'remote' })]
    });
    const leads = WorldEngine.getCompanionActionLeads(scene);

    assert.ok(leads.some(lead => lead.resourceId === 'susan_medical_backing' && lead.scopeLabel === '远程'));
}

{
    const { WorldEngine, State } = loadWorldEngine();
    testUnlockedCompanionCreatesActionLead(WorldEngine, State);
}
{
    const { WorldEngine, State } = loadWorldEngine();
    testBareCompanionWithoutRelationshipDoesNotLeak(WorldEngine, State);
}
{
    const { WorldEngine, State } = loadWorldEngine();
    testImmediateCompanionCanBeExplicitlyUnlocked(WorldEngine, State);
}
{
    const { WorldEngine, State } = loadWorldEngine();
    testInvalidUnlockFallsBackToRelationshipGate(WorldEngine, State);
}
{
    const { WorldEngine, State } = loadWorldEngine();
    testLockedCompanionDoesNotLeak(WorldEngine, State);
}
{
    const { WorldEngine, State } = loadWorldEngine();
    testEvidenceUnlockSurfacesCompanion(WorldEngine, State);
}
{
    const { WorldEngine, State } = loadWorldEngine();
    testSpentCompanionDoesNotCreateLead(WorldEngine, State);
}
{
    const { WorldEngine, State } = loadWorldEngine();
    testPresentCompanionRequiresActivePresence(WorldEngine, State);
}
{
    const { WorldEngine, State } = loadWorldEngine();
    testPresentCompanionSurfacesWhenActive(WorldEngine, State);
}
{
    const { WorldEngine, State } = loadWorldEngine();
    testRemoteCompanionCanSurfaceOffscreen(WorldEngine, State);
}

console.log('companion-action-leads regression tests passed');
