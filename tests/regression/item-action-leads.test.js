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
        turnCount: 3,
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
        currentLocation: 'lab',
        locations: [{
            id: 'lab',
            name: '旧实验室',
            description: '有空气循环系统、锁住的终端和一排老化的生命维持舱。',
            connections: []
        }],
        currentSituation: { recentRisks: [], recommendedActions: [] },
        storyPhases: [],
        storyArcs: [],
        sceneChallenges: [{
            id: 'challenge_lab_audit',
            title: '设施核验',
            status: 'active',
            targetProgress: 3,
            progress: 0,
            maxStrain: 3,
            strain: 0,
            approaches: [
                { id: 'audit_air', label: '检测空气循环系统', stat: 'intelligence', dc: 14, actionType: 'investigate', tags: ['air', 'scanner'], keywords: ['检测', '空气', '循环'] },
                { id: 'repair_support', label: '协助启动生命维持系统', stat: 'intelligence', dc: 15, actionType: 'use_item', tags: ['repair', '设备'], keywords: ['生命维持', '启动', '修复'] },
                { id: 'cross_locked', label: '开锁进入隔离区', stat: 'dexterity', dc: 14, actionType: 'sneak', tags: ['lock'], keywords: ['开锁', '隔离区'] }
            ]
        }],
        clocks: [],
        counterStrategies: [],
        clueGraph: [],
        evidenceLedger: [],
        failureStates: [],
        ...overrides
    };
}

function scanner() {
    return {
        id: 'scanner_1',
        name: '便携扫描仪',
        type: 'misc',
        quantity: 1,
        equipped: true,
        tags: ['工具', '扫描', '观察'],
        effects: [
            { type: 'check_bonus', stat: 'wisdom', actionType: 'observe', value: 1, consume: false },
            { type: 'check_bonus', stat: 'intelligence', actionType: 'investigate', value: 1, consume: false }
        ]
    };
}

function toolkit(equipped = false) {
    return {
        id: equipped ? 'toolkit_equipped' : 'toolkit_pack',
        name: '通用工具包',
        type: 'misc',
        quantity: 1,
        equipped,
        tags: ['工具', '修复', '开锁'],
        effects: [
            { type: 'check_bonus', stat: 'intelligence', actionType: 'use_item', value: 1, consume: false },
            { type: 'check_bonus', stat: 'dexterity', actionType: 'sneak', value: 1, consume: false }
        ]
    };
}

function partsPack() {
    return {
        id: 'parts_1',
        name: '备用零件包',
        type: 'consumable',
        quantity: 1,
        uses: 1,
        tags: ['零件', '修复', '设备'],
        effects: [{ type: 'check_bonus', stat: 'intelligence', actionType: 'use_item', value: 2, consume: true }]
    };
}

function fieldNotes() {
    return {
        id: 'notes_1',
        name: '现场记录册',
        type: 'quest',
        quantity: 1,
        tags: ['调查', '观察', '线索'],
        effects: [
            { type: 'check_bonus', actionType: 'investigate', value: 1, consume: false },
            { type: 'check_bonus', actionType: 'observe', value: 1, consume: false }
        ]
    };
}

function disguiseKit() {
    return {
        id: 'disguise_1',
        name: '伪装工具包',
        type: 'misc',
        quantity: 1,
        equipped: true,
        tags: ['工具', '伪装', '掩护'],
        effects: [
            { type: 'check_bonus', stat: 'charisma', actionType: 'lie', value: 1, consume: false },
            { type: 'risk_delta', actionType: 'lie', value: -4, consume: false }
        ]
    };
}

function trackingKit() {
    return {
        id: 'tracking_1',
        name: '追踪工具包',
        type: 'misc',
        quantity: 1,
        equipped: true,
        tags: ['工具', '追踪', '路线'],
        effects: [
            { type: 'check_bonus', stat: 'wisdom', actionType: 'observe', value: 1, consume: false },
            { type: 'check_bonus', stat: 'dexterity', actionType: 'sneak', value: 1, consume: false }
        ]
    };
}

function testSupplyCatalogIncludesDisguiseAndTrackingTools(WorldEngine) {
    const catalog = WorldEngine.getBasicSupplyCatalog();

    assert.ok(catalog.disguise, 'basic shop should sell disguise tools');
    assert.ok(catalog.tracker, 'basic shop should sell tracking tools');
    assert.ok(catalog.disguise.item.effects.some(effect => effect.actionType === 'lie'));
    assert.ok(catalog.tracker.item.effects.some(effect => effect.actionType === 'observe'));
}

function testEquippedToolCreatesChallengeAction(WorldEngine) {
    const scene = makeScene({ inventory: [scanner()] });
    const leads = WorldEngine.getItemActionLeads(scene);
    const situation = WorldEngine.getCurrentSituation(scene);

    assert.ok(leads.some(lead => lead.action === '用便携扫描仪检测空气循环系统'));
    assert.ok(situation.recommendedActions.includes('用便携扫描仪检测空气循环系统'));
    assert.ok(
        situation.recommendedActions.indexOf('用便携扫描仪检测空气循环系统') <
        situation.recommendedActions.indexOf('检测空气循环系统'),
        'item-enabled action should appear before the raw challenge approach'
    );
}

function testDisguiseToolCreatesLieChallengeAction(WorldEngine) {
    const scene = makeScene({
        inventory: [disguiseKit()],
        sceneChallenges: [{
            id: 'challenge_gate',
            title: '通过岗哨',
            status: 'active',
            targetProgress: 2,
            progress: 0,
            maxStrain: 3,
            strain: 0,
            approaches: [{
                id: 'pose_as_technician',
                label: '伪装成维修员通过岗哨',
                stat: 'charisma',
                dc: 14,
                actionType: 'lie',
                tags: ['伪装', '身份'],
                keywords: ['维修员', '岗哨']
            }]
        }]
    });
    const leads = WorldEngine.getItemActionLeads(scene);

    assert.ok(leads.some(lead =>
        lead.itemName === '伪装工具包' &&
        lead.actionType === 'lie' &&
        lead.action === '用伪装工具包伪装成维修员通过岗哨'
    ));
}

function testTrackingToolCreatesTrackingFallbackAction(WorldEngine) {
    const scene = makeScene({
        sceneChallenges: [],
        inventory: [trackingKit()]
    });
    const leads = WorldEngine.getItemActionLeads(scene);

    assert.ok(leads.some(lead =>
        lead.itemName === '追踪工具包' &&
        lead.action === '用追踪工具包追踪旧实验室的行动痕迹'
    ));
}

function testUnequippedToolDoesNotPretendToUnlockAction(WorldEngine) {
    const scene = makeScene({ inventory: [toolkit(false)] });
    const leads = WorldEngine.getItemActionLeads(scene);
    const hints = WorldEngine.getPreparationHints(scene, { limit: 6 });

    assert.ok(!leads.some(lead => lead.itemName === '通用工具包'));
    assert.ok(hints.some(hint => hint.command === '装备通用工具包'));
}

function testConsumableResourceCreatesActionLead(WorldEngine) {
    const scene = makeScene({ inventory: [partsPack()] });
    const actions = WorldEngine.getCurrentSituation(scene).recommendedActions;

    assert.ok(actions.includes('投入备用零件包启动生命维持系统'));
}

function testQuestToolStillCreatesFallbackAction(WorldEngine) {
    const scene = makeScene({
        sceneChallenges: [],
        inventory: [fieldNotes()]
    });
    const leads = WorldEngine.getItemActionLeads(scene);

    assert.ok(leads.some(lead => lead.action === '用现场记录册整理已知线索和矛盾点'));
}

const WorldEngine = loadWorldEngine();
testSupplyCatalogIncludesDisguiseAndTrackingTools(WorldEngine);
testEquippedToolCreatesChallengeAction(WorldEngine);
testDisguiseToolCreatesLieChallengeAction(WorldEngine);
testTrackingToolCreatesTrackingFallbackAction(WorldEngine);
testUnequippedToolDoesNotPretendToUnlockAction(WorldEngine);
testConsumableResourceCreatesActionLead(WorldEngine);
testQuestToolStillCreatesFallbackAction(WorldEngine);

console.log('item-action-leads regression tests passed');
