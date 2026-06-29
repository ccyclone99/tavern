const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadWorldEngine() {
    const context = {
        console,
        State: { activeCharacters: [], characters: [], currentCharacterId: '' },
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
        characters: [],
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

function testUnlockedCompanionCreatesActionLead(WorldEngine) {
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

function testLockedCompanionDoesNotLeak(WorldEngine) {
    const scene = makeScene({
        companionResources: [susanBacking({ unlock: { evidenceTags: ['medical'] } })],
        evidenceLedger: [{ id: 'hidden_report', title: '隐藏体检报告', visible: false, tags: ['medical'] }]
    });
    const leads = WorldEngine.getCompanionActionLeads(scene);
    const hints = WorldEngine.getPreparationHints(scene, { limit: 8 });

    assert.strictEqual(leads.length, 0);
    assert.ok(!hints.some(hint => hint.kind === 'companion'));
}

function testEvidenceUnlockSurfacesCompanion(WorldEngine) {
    const scene = makeScene({
        companionResources: [susanBacking({ unlock: { evidenceTags: ['medical'] } })],
        evidenceLedger: [{ id: 'public_report', title: '公开体检报告', visible: true, tags: ['medical'] }]
    });
    const leads = WorldEngine.getCompanionActionLeads(scene);

    assert.ok(leads.some(lead => lead.resourceId === 'susan_medical_backing'));
}

function testSpentCompanionDoesNotCreateLead(WorldEngine) {
    const scene = makeScene({
        companionResources: [susanBacking({ uses: 0 })]
    });

    assert.strictEqual(WorldEngine.getCompanionActionLeads(scene).length, 0);
}

const WorldEngine = loadWorldEngine();
testUnlockedCompanionCreatesActionLead(WorldEngine);
testLockedCompanionDoesNotLeak(WorldEngine);
testEvidenceUnlockSurfacesCompanion(WorldEngine);
testSpentCompanionDoesNotCreateLead(WorldEngine);

console.log('companion-action-leads regression tests passed');
