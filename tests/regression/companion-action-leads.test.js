const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadWorldEngine() {
    const context = {
        console,
        State: {
            scene: null,
            activeCharacters: [],
            characters: [{ id: 'susan', name: '苏珊', _relations: {} }],
            currentCharacterId: '',
            emit() {}
        },
        Storage: {
            async saveCharacter() {}
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

function susanCombatCover(overrides = {}) {
    return susanBacking({
        id: 'susan_combat_cover',
        name: '苏珊的火力掩护',
        effect: {
            checkBonus: 2,
            actionType: 'combat'
        },
        tags: ['combat', 'cover'],
        risk: '苏珊会暴露自己的防卫位置。',
        ...overrides
    });
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

function testInvalidCompanionCharacterIdCannotUnlock(WorldEngine, State) {
    State.characters[0]._relations = {};
    const scene = makeScene({
        companionResources: [susanBacking({
            characterId: 'ghost_helper',
            name: '匿名医学背书',
            unlock: { immediate: true }
        })]
    });
    const availability = WorldEngine.getCompanionResourceAvailability(scene, scene.companionResources[0]);
    const check = { stat: 'charisma', actionType: 'persuade', intent: '公开证据链' };

    assert.strictEqual(availability.ok, false);
    assert.strictEqual(availability.reason, '协助角色不存在');
    assert.strictEqual(WorldEngine.getCompanionActionLeads(scene).length, 0);
    assert.strictEqual(WorldEngine.getAvailableCompanionResources(scene, check).length, 0);
}

function testUnboundCompanionResourceCannotUnlockWhenAmbiguous(WorldEngine, State) {
    State.characters = [
        { id: 'susan', name: '苏珊', _relations: {} },
        { id: 'wang', name: '老王', _relations: {} }
    ];
    State.activeCharacters = State.characters;
    const scene = makeScene({
        characters: ['susan', 'wang'],
        companionResources: [susanBacking({
            characterId: '',
            name: '匿名协助',
            unlock: { immediate: true }
        })]
    });
    const availability = WorldEngine.getCompanionResourceAvailability(scene, scene.companionResources[0]);

    assert.strictEqual(availability.ok, false);
    assert.strictEqual(availability.reason, '协助资源未绑定角色');
    assert.strictEqual(WorldEngine.getCompanionActionLeads(scene).length, 0);
}

function testExplicitCharacterNameRepairsCompanionBinding(WorldEngine, State) {
    State.characters = [
        { id: 'susan', name: '苏珊', _relations: {} },
        { id: 'wang', name: '老王', _relations: {} }
    ];
    State.activeCharacters = State.characters;
    const scene = makeScene({
        characters: ['susan', 'wang'],
        companionResources: [susanBacking({
            characterId: '',
            characterName: '苏珊',
            name: '医学背书',
            unlock: { immediate: true }
        })]
    });
    const leads = WorldEngine.getCompanionActionLeads(scene);

    assert.ok(leads.some(lead => lead.resourceId === 'susan_medical_backing' && lead.characterId === 'susan'));
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

function testSuspectedRevelationDoesNotUnlockCompanionByDefault(WorldEngine, State) {
    State.characters[0]._relations = {};
    const scene = makeScene({
        companionResources: [susanBacking({ unlock: { revelationIds: ['rev_medical_truth'] } })],
        flowGraph: {
            nodes: [],
            revelations: [{
                id: 'rev_medical_truth',
                conclusion: '苏珊确认玩家不是传染源。',
                status: 'suspected',
                core: true,
                clueIds: []
            }]
        }
    });
    const availability = WorldEngine.getCompanionResourceAvailability(scene, scene.companionResources[0]);

    assert.strictEqual(availability.ok, false);
    assert.strictEqual(availability.requiredRevelationStatus, 'confirmed');
    assert.ok(availability.reason.includes('缺少确认关键结论'));
    assert.strictEqual(WorldEngine.getCompanionActionLeads(scene).length, 0);
}

function testExplicitSuspectedRevelationCanUnlockCompanion(WorldEngine, State) {
    State.characters[0]._relations = {};
    const scene = makeScene({
        companionResources: [susanBacking({ unlock: { revelationIds: ['rev_medical_truth'], revelationStatus: 'suspected' } })],
        flowGraph: {
            nodes: [],
            revelations: [{
                id: 'rev_medical_truth',
                conclusion: '苏珊确认玩家不是传染源。',
                status: 'suspected',
                core: true,
                clueIds: []
            }]
        }
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

function testExplicitPresenceLocationOverridesSceneRoster(WorldEngine, State) {
    setSusanTrust(State, 12);
    State.activeCharacters = State.characters;
    const scene = makeScene({
        characters: ['susan'],
        locations: [
            { id: 'clinic', name: '临时诊所', description: '', connections: ['bridge'] },
            { id: 'bridge', name: '舰桥', description: '', connections: ['clinic'] }
        ],
        characterPresence: {
            susan: { characterId: 'susan', locationId: 'bridge', status: 'present', contact: 'none' }
        },
        companionResources: [susanBacking({ scope: 'present' })]
    });
    const availability = WorldEngine.getCompanionResourceAvailability(scene, scene.companionResources[0]);

    assert.strictEqual(WorldEngine.getCompanionActionLeads(scene).length, 0);
    assert.strictEqual(availability.ok, false);
    assert.ok(availability.reason.includes('舰桥'));
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

function testPresentCompanionFallsBackToActiveRoster(WorldEngine, State) {
    setSusanTrust(State, 12);
    State.activeCharacters = State.characters;
    const scene = makeScene({
        characters: [],
        companionResources: [susanBacking({ scope: 'present' })]
    });
    const availability = WorldEngine.getCompanionResourceAvailability(scene, scene.companionResources[0]);

    assert.strictEqual(availability.ok, true);
    assert.strictEqual(availability.presence.inActiveRoster, true);
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

function testRemoteCompanionCanBeBlockedByPresenceContact(WorldEngine, State) {
    setSusanTrust(State, 12);
    State.activeCharacters = State.characters;
    const scene = makeScene({
        characterPresence: {
            susan: { characterId: 'susan', locationId: 'bridge', status: 'away', contact: 'none', canContact: false }
        },
        companionResources: [susanBacking({ scope: 'remote' })]
    });
    const availability = WorldEngine.getCompanionResourceAvailability(scene, scene.companionResources[0]);

    assert.strictEqual(availability.ok, false);
    assert.strictEqual(availability.reason, '暂时无法联系同伴');
    assert.strictEqual(WorldEngine.getCompanionActionLeads(scene).length, 0);
}

function testRemoteCompanionAwayWithoutContactDoesNotSurface(WorldEngine, State) {
    setSusanTrust(State, 12);
    State.activeCharacters = State.characters;
    const scene = makeScene({
        locations: [
            { id: 'clinic', name: '临时诊所', description: '', connections: ['bridge'] },
            { id: 'bridge', name: '舰桥', description: '', connections: ['clinic'] }
        ],
        characterPresence: {
            susan: { characterId: 'susan', locationId: 'bridge', status: 'away' }
        },
        companionResources: [susanBacking({ scope: 'remote' })]
    });
    const availability = WorldEngine.getCompanionResourceAvailability(scene, scene.companionResources[0]);

    assert.strictEqual(availability.ok, false);
    assert.strictEqual(availability.reason, '暂时无法联系同伴');
    assert.strictEqual(WorldEngine.getCompanionActionLeads(scene).length, 0);
}

function testRemoteCompanionAwayWithContactCanSurface(WorldEngine, State) {
    setSusanTrust(State, 12);
    State.activeCharacters = State.characters;
    const scene = makeScene({
        locations: [
            { id: 'clinic', name: '临时诊所', description: '', connections: ['bridge'] },
            { id: 'bridge', name: '舰桥', description: '', connections: ['clinic'] }
        ],
        characterPresence: {
            susan: { characterId: 'susan', locationId: 'bridge', status: 'away', contact: 'message', canContact: true }
        },
        companionResources: [susanBacking({ scope: 'remote' })]
    });
    const availability = WorldEngine.getCompanionResourceAvailability(scene, scene.companionResources[0]);

    assert.strictEqual(availability.ok, true);
    assert.ok(availability.presence.canRemote);
    assert.ok(WorldEngine.getCompanionActionLeads(scene).some(lead => lead.resourceId === 'susan_medical_backing'));
}

function testRemoteCompanionDoesNotAffectPhysicalActions(WorldEngine, State) {
    setSusanTrust(State, 12);
    State.activeCharacters = [];
    const scene = makeScene({
        characters: [],
        sceneChallenges: [{
            id: 'challenge_locked_gate',
            title: '冲突中的封锁门',
            status: 'active',
            approaches: [{
                id: 'fight_through',
                label: '冲破封锁门前的守卫',
                stat: 'strength',
                dc: 15,
                actionType: 'combat',
                tags: ['combat', 'cover'],
                keywords: ['火力', '掩护', '守卫']
            }]
        }],
        companionResources: [susanCombatCover({ scope: 'remote' })]
    });
    const check = { stat: 'strength', actionType: 'combat', intent: '冲破守卫封锁' };

    assert.strictEqual(WorldEngine.getCompanionActionLeads(scene).length, 0);
    assert.strictEqual(WorldEngine.getAvailableCompanionResources(scene, check).length, 0);
}

function testPresentCompanionCanAffectPhysicalActions(WorldEngine, State) {
    setSusanTrust(State, 12);
    State.activeCharacters = State.characters;
    const scene = makeScene({
        sceneChallenges: [{
            id: 'challenge_locked_gate',
            title: '冲突中的封锁门',
            status: 'active',
            approaches: [{
                id: 'fight_through',
                label: '冲破封锁门前的守卫',
                stat: 'strength',
                dc: 15,
                actionType: 'combat',
                tags: ['combat', 'cover'],
                keywords: ['火力', '掩护', '守卫']
            }]
        }],
        companionResources: [susanCombatCover({ scope: 'present' })]
    });
    const check = { stat: 'strength', actionType: 'combat', intent: '冲破守卫封锁' };

    assert.ok(WorldEngine.getCompanionActionLeads(scene).some(lead => lead.resourceId === 'susan_combat_cover'));
    assert.ok(WorldEngine.getAvailableCompanionResources(scene, check).some(resource => resource.resourceId === 'susan_combat_cover'));
}

function testNpcAgendaUpdateWritesPresence(WorldEngine, State) {
    const scene = makeScene({
        locations: [
            { id: 'clinic', name: '临时诊所', description: '', connections: ['bridge'] },
            { id: 'bridge', name: '舰桥', description: '', connections: ['clinic'] }
        ],
        characterPresence: {}
    });
    State.scene = scene;

    const changed = WorldEngine.applyNpcAgendaUpdate([{
        characterId: 'susan',
        currentPlan: '转移到舰桥监听公开频道',
        locationId: 'bridge',
        status: 'remote',
        contact: 'message',
        canContact: true,
        presenceNote: '只接受文字联络'
    }]);
    const presence = WorldEngine.getCharacterPresence(scene, 'susan');

    assert.strictEqual(changed, true);
    assert.strictEqual(State.characters[0].agenda.currentPlan, '转移到舰桥监听公开频道');
    assert.strictEqual(presence.locationName, '舰桥');
    assert.strictEqual(presence.status, 'remote');
    assert.strictEqual(presence.contact, 'message');
    assert.strictEqual(presence.canRemote, true);
    assert.strictEqual(presence.note, '只接受文字联络');
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
    testInvalidCompanionCharacterIdCannotUnlock(WorldEngine, State);
}
{
    const { WorldEngine, State } = loadWorldEngine();
    testUnboundCompanionResourceCannotUnlockWhenAmbiguous(WorldEngine, State);
}
{
    const { WorldEngine, State } = loadWorldEngine();
    testExplicitCharacterNameRepairsCompanionBinding(WorldEngine, State);
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
    testSuspectedRevelationDoesNotUnlockCompanionByDefault(WorldEngine, State);
}
{
    const { WorldEngine, State } = loadWorldEngine();
    testExplicitSuspectedRevelationCanUnlockCompanion(WorldEngine, State);
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
    testExplicitPresenceLocationOverridesSceneRoster(WorldEngine, State);
}
{
    const { WorldEngine, State } = loadWorldEngine();
    testPresentCompanionSurfacesWhenActive(WorldEngine, State);
}
{
    const { WorldEngine, State } = loadWorldEngine();
    testPresentCompanionFallsBackToActiveRoster(WorldEngine, State);
}
{
    const { WorldEngine, State } = loadWorldEngine();
    testRemoteCompanionCanSurfaceOffscreen(WorldEngine, State);
}
{
    const { WorldEngine, State } = loadWorldEngine();
    testRemoteCompanionCanBeBlockedByPresenceContact(WorldEngine, State);
}
{
    const { WorldEngine, State } = loadWorldEngine();
    testRemoteCompanionAwayWithoutContactDoesNotSurface(WorldEngine, State);
}
{
    const { WorldEngine, State } = loadWorldEngine();
    testRemoteCompanionAwayWithContactCanSurface(WorldEngine, State);
}
{
    const { WorldEngine, State } = loadWorldEngine();
    testRemoteCompanionDoesNotAffectPhysicalActions(WorldEngine, State);
}
{
    const { WorldEngine, State } = loadWorldEngine();
    testPresentCompanionCanAffectPhysicalActions(WorldEngine, State);
}
{
    const { WorldEngine, State } = loadWorldEngine();
    testNpcAgendaUpdateWritesPresence(WorldEngine, State);
}

console.log('companion-action-leads regression tests passed');
