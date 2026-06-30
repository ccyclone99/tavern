const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadSidebar(context) {
    const code = fs.readFileSync(path.join(root, 'js/ui/sidebar-right.js'), 'utf8') + '\nthis.SidebarRight = SidebarRight;';
    vm.runInNewContext(code, context, { filename: 'js/ui/sidebar-right.js' });
    return context.SidebarRight;
}

function createClassList() {
    const items = new Set();
    return {
        add(name) { items.add(name); },
        remove(name) { items.delete(name); },
        toggle(name, force) {
            if (force) items.add(name);
            else items.delete(name);
        },
        contains(name) { return items.has(name); }
    };
}

function testSituationPrioritizesLiveDecisionSurface() {
    const scene = {
        gameState: 'playing',
        turnCount: 7,
        runRecord: {
            id: 'current_record',
            outcome: 'neutral',
            title: '旧回顾',
            summary: '这段记录不能压在当前行动前面。',
            events: [{ category: 'resource', title: '消耗补给', text: '应急医疗包已使用', turn: 6 }],
            transcript: [{ speaker: '玩家', text: '旧对话' }]
        },
        runHistory: [{
            id: 'old_record',
            outcome: 'defeated',
            title: '上一次尝试',
            summary: '玩家曾经失败，但记录应保留。',
            turns: 11,
            completedAt: 100,
            events: [{ category: 'failure', title: '失败', text: '局势失控' }],
            checks: [{ statName: '魅力' }],
            evidence: [{ title: '旧证据' }],
            transcriptCount: 20
        }, {
            id: 'current_record',
            outcome: 'neutral',
            title: '当前记录',
            summary: '当前记录不应在历史尝试里重复。'
        }]
    };
    const summaryEl = { innerHTML: '', onclick: null, classList: createClassList() };
    const roomStatus = { textContent: '' };
    const situationEl = {
        innerHTML: '',
        querySelectorAll() {
            return [];
        }
    };
    const context = {
        console,
        State: { scene },
        Renderer: {
            escapeAttr: value => String(value ?? '').replace(/"/g, '&quot;'),
            escapeHtml: value => String(value ?? '')
        },
        document: {
            getElementById(id) {
                if (id === 'statusSummary') return summaryEl;
                if (id === 'roomStatus') return roomStatus;
                return null;
            }
        },
        WorldEngine: {
            isScenePlaying: () => true,
            getPreparationHints: () => [],
            getUnlockedCompanionResources: () => [],
            getActiveConsequences: () => [],
            getEventLog: () => [{
                category: 'check',
                title: '玩家掷骰',
                text: '检定结果已经记录',
                turn: 7
            }],
            getCurrentSituation: () => ({
                location: { name: '大厅', description: '玩家正在这里决定下一步。' },
                activeQuest: {
                    name: '主线',
                    description: '找出真相',
                    objectives: [{ text: '先决定从谁开始询问', completed: false }]
                },
                clocks: [{ name: '警戒', value: 1, max: 6, description: '守卫正在留意玩家。' }],
                hiddenPressure: 0,
                counterStrategies: [{ title: '守卫巡逻', progress: 20, hint: '巡逻路线正在收紧。' }],
                recentRisks: ['守卫开始记住你的脸'],
                availableClues: [{ title: '湿脚印' }],
                recommendedActions: ['询问门卫', '观察湿脚印', '绕到后门', '制定一个计划'],
                knownUnknowns: [{ title: '谁放走了犯人', text: '还需要证词。', actions: ['询问门卫'] }],
                failureWarnings: [],
                challengeEvidence: [],
                visibleEvidence: [{ title: '门口泥痕', reliability: 'partial', tags: ['现场'] }],
                activeChallenge: null,
                storyPhase: { title: '初步调查', goal: '找到第一条可靠线索', stakes: '拖延会让守卫戒备。' }
            })
        }
    };
    const SidebarRight = loadSidebar(context);
    SidebarRight.situationEl = situationEl;

    SidebarRight.renderSituation();

    const html = situationEl.innerHTML;
    assert.ok(html.includes('situation-now'), 'live situation card should render');
    assert.ok(html.includes('现在可尝试'), 'primary actions should be visible near top');
    assert.ok(html.includes('记录与回顾'), 'record fold should still be available');
    assert.ok(html.includes('situation-record-fold'), 'records should be in a dedicated fold');
    assert.ok(html.includes('situation-pressure-fold'), 'pressure details should be folded');
    assert.ok(html.includes('situation-knowledge-fold'), 'knowledge details should be folded');
    assert.ok(html.indexOf('现在可尝试') < html.indexOf('记录与回顾'), 'actions should come before record fold');
    assert.ok(html.indexOf('冒险回顾') > html.indexOf('记录与回顾'), 'run record should live inside the record fold');
    assert.ok(html.indexOf('关键状态变化') > html.indexOf('记录与回顾'), 'run record event snapshot should live inside the record fold');
    assert.ok(html.indexOf('历史尝试') > html.indexOf('记录与回顾'), 'run history should live inside the record fold');
    assert.ok(html.includes('上一次尝试'), 'previous run history should render');
    assert.ok(!html.includes('当前记录不应在历史尝试里重复。'), 'current run record should not duplicate in history list');
    assert.ok(html.indexOf('玩家掷骰') > html.indexOf('记录与回顾'), 'event log should live inside the record fold');
}

testSituationPrioritizesLiveDecisionSurface();
console.log('sidebar-situation-density regression tests passed');
