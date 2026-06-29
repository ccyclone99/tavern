const assert = require('assert');
const fs = require('fs');
const path = require('path');
const vm = require('vm');

const root = path.resolve(__dirname, '..', '..');

function loadSidebarRight(context) {
    const code = fs.readFileSync(path.join(root, 'js/ui/sidebar-right.js'), 'utf8') + '\nthis.SidebarRight = SidebarRight;';
    vm.runInNewContext(code, context, { filename: 'js/ui/sidebar-right.js' });
    return context.SidebarRight;
}

function makeContext({ debug = false } = {}) {
    const detailEl = { style: {}, innerHTML: '' };
    const placeholder = { style: {} };
    const editButton = { onclick: null };
    const char = {
        id: 'silas',
        name: '审判官塞拉斯',
        avatar: '',
        tags: ['审判官'],
        firstImpression: 'PUBLIC_IMPRESSION',
        description: 'SECRET_DESCRIPTION',
        personality: 'SECRET_PERSONALITY',
        motives: ['SECRET_MOTIVE'],
        fears: ['SECRET_FEAR'],
        secrets: ['SECRET_PRIVATE_SECRET'],
        leverage: ['SECRET_LEVERAGE'],
        creed: 'SECRET_CREED',
        values: 'SECRET_VALUES',
        redLines: ['SECRET_REDLINE'],
        scenario: 'SECRET_SCENARIO',
        profile: {
            hiddenFacts: [
                {
                    id: 'eye_record',
                    type: 'secret',
                    title: '义眼记录',
                    hint: 'HINT_EYE_DELAY',
                    truth: 'SECRET_EYE_TRUTH',
                    unlock: { trust: 30 }
                },
                {
                    id: 'private_grave',
                    type: 'fear',
                    title: '内心坟墓',
                    hint: 'HINT_GRAVE',
                    truth: 'SECRET_GRAVE_TRUTH',
                    unlock: { trust: 40 }
                }
            ]
        }
    };
    const scene = {
        userName: '嫌疑人',
        discoveries: {
            characters: {
                silas: {
                    eye_record: { state: 'hinted', evidence: ['观察义眼'] }
                }
            }
        },
        knowledge: {
            discoveries: [{
                subjectType: 'character',
                subjectId: 'silas',
                level: 'hint',
                reliability: 'unverified',
                title: '义眼延迟',
                text: 'HINT_FROM_KNOWLEDGE'
            }]
        }
    };
    const context = {
        console,
        State: {
            character: char,
            scene,
            canShowDebugSpoilers: () => debug
        },
        Renderer: {
            safeUrl: () => '',
            escapeHtml: value => String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;'),
            escapeAttr: value => String(value ?? '')
                .replace(/&/g, '&amp;')
                .replace(/"/g, '&quot;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;')
        },
        CharacterEditor: {
            open() {}
        },
        document: {
            getElementById(id) {
                return id === 'editCharBtn' ? editButton : null;
            }
        },
        detailEl,
        placeholder,
        editButton
    };
    return context;
}

function renderDetail(debug = false) {
    const context = makeContext({ debug });
    const SidebarRight = loadSidebarRight(context);
    SidebarRight.detailEl = context.detailEl;
    SidebarRight.detailPlaceholder = context.placeholder;
    SidebarRight.renderDetail();
    return context.detailEl.innerHTML;
}

function testDefaultNpcProfileDoesNotLeakPrivateFields() {
    const html = renderDetail(false);

    assert.ok(html.includes('PUBLIC_IMPRESSION'), 'public first impression should be visible');
    assert.ok(html.includes('HINT_EYE_DELAY'), 'hinted hidden fact hint should be visible');
    assert.ok(html.includes('HINT_FROM_KNOWLEDGE'), 'character knowledge should be visible');
    assert.ok(html.includes('已察觉'), 'hinted state should use player-facing wording');
    assert.ok(html.includes('???'), 'locked hidden fact should remain masked');

    [
        'SECRET_DESCRIPTION',
        'SECRET_PERSONALITY',
        'SECRET_MOTIVE',
        'SECRET_FEAR',
        'SECRET_PRIVATE_SECRET',
        'SECRET_LEVERAGE',
        'SECRET_CREED',
        'SECRET_VALUES',
        'SECRET_REDLINE',
        'SECRET_SCENARIO',
        'SECRET_EYE_TRUTH',
        'SECRET_GRAVE_TRUTH',
        '完整角色卡'
    ].forEach(secret => {
        assert.ok(!html.includes(secret), `${secret} should not be visible without debug spoilers`);
    });
}

function testDebugNpcProfileShowsSpoilerSection() {
    const html = renderDetail(true);

    assert.ok(html.includes('完整角色卡'));
    assert.ok(html.includes('SECRET_DESCRIPTION'));
    assert.ok(html.includes('SECRET_PERSONALITY'));
    assert.ok(html.includes('SECRET_PRIVATE_SECRET'));
    assert.ok(html.includes('SECRET_EYE_TRUTH'));
}

testDefaultNpcProfileDoesNotLeakPrivateFields();
testDebugNpcProfileShowsSpoilerSection();
console.log('npc-profile-visibility regression tests passed');
