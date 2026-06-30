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

function collectStrings(value, prefix = '') {
    if (typeof value === 'string') return [{ path: prefix || '<root>', text: value }];
    if (Array.isArray(value)) {
        return value.flatMap((item, idx) => collectStrings(item, `${prefix}[${idx}]`));
    }
    if (value && typeof value === 'object') {
        return Object.entries(value).flatMap(([key, item]) =>
            collectStrings(item, prefix ? `${prefix}.${key}` : key)
        );
    }
    return [];
}

function playerVisibleTemplateFields(WorldEngine, WorldGenerator, template) {
    const flowGraph = WorldEngine.normalizeFlowGraph(template.flowGraph || WorldGenerator._buildDefaultFlowGraph(template));
    return {
        description: template.description,
        scenario: template.scenario,
        openingNarrative: template.openingNarrative,
        locations: (template.locations || []).map(location => ({
            name: location.name,
            description: location.description
        })),
        quests: (template.quests || []).map(quest => ({
            name: quest.name,
            description: quest.description,
            objectives: (quest.objectives || []).map(objective => objective?.text || objective),
            reward: quest.reward
        })),
        storyPhases: (template.storyPhases || []).map(phase => ({
            title: phase.title,
            goal: phase.goal,
            stakes: phase.stakes,
            entry: phase.entry,
            exit: phase.exit,
            recommendedActions: phase.recommendedActions
        })),
        flowNodes: (flowGraph.nodes || []).map(node => ({
            title: node.title,
            visibleText: node.visibleText
        })),
        flowGuide: template.flowGuide,
        conflictSeeds: template.conflictSeeds,
        intel: template.intel,
        storyTexture: template.storyTexture ? {
            tone: template.storyTexture.tone,
            sensory: template.storyTexture.sensory,
            motifs: template.storyTexture.motifs,
            dramaticQuestions: template.storyTexture.dramaticQuestions,
            sceneRules: template.storyTexture.sceneRules
        } : null,
        characterPublicProfiles: (template.characters || []).map(character => ({
            name: character.name,
            tags: character.tags,
            firstImpression: WorldGenerator._buildCharacterProfile(character).public.firstImpression
        }))
    };
}

function privateCharacterEntries(character) {
    return [
        ...(character.motives || []).map(text => ({ kind: 'motives', text })),
        ...(character.fears || []).map(text => ({ kind: 'fears', text })),
        ...(character.secrets || []).map(text => ({ kind: 'secrets', text })),
        ...(character.leverage || []).map(text => ({ kind: 'leverage', text }))
    ]
        .map(entry => ({ kind: entry.kind, text: String(entry.text || '').trim() }))
        .filter(entry => entry.text.length >= 6);
}

function testPresetPrivateFactsDoNotAppearInPlayerVisibleFields(WorldEngine, WorldGenerator) {
    const leaks = [];
    WorldGenerator.templates.forEach(template => {
        const visibleStrings = collectStrings(playerVisibleTemplateFields(WorldEngine, WorldGenerator, template));
        (template.characters || []).forEach(character => {
            privateCharacterEntries(character).forEach(entry => {
                visibleStrings.forEach(field => {
                    if (field.text.includes(entry.text)) {
                        leaks.push(`${template.id}/${character.name}/${entry.kind}: "${entry.text}" in ${field.path}`);
                    }
                });
            });
        });
    });

    assert.deepStrictEqual(leaks, [], `NPC private entries leaked into player-visible scenario fields:\n${leaks.join('\n')}`);
}

const { WorldEngine, WorldGenerator } = loadTemplateContext();
testPresetPrivateFactsDoNotAppearInPlayerVisibleFields(WorldEngine, WorldGenerator);
console.log('scenario-private-field-leaks regression tests passed');
