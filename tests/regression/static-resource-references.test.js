const assert = require('assert');
const fs = require('fs');
const path = require('path');

const root = path.resolve(__dirname, '..', '..');
const indexHtml = fs.readFileSync(path.join(root, 'index.html'), 'utf8');

function parseAttributes(html, tagName, attrName) {
    const pattern = new RegExp(`<${tagName}\\b[^>]*\\s${attrName}=["']([^"']+)["'][^>]*>`, 'gi');
    const out = [];
    let match;
    while ((match = pattern.exec(html)) !== null) {
        out.push(match[1]);
    }
    return out;
}

function isExternal(ref) {
    return /^(?:https?:|data:|mailto:|tel:|#)/i.test(ref);
}

function stripQueryAndHash(ref) {
    return String(ref || '').split('#')[0].split('?')[0];
}

function testLocalStaticReferencesExist() {
    const refs = [
        ...parseAttributes(indexHtml, 'script', 'src'),
        ...parseAttributes(indexHtml, 'link', 'href'),
        ...parseAttributes(indexHtml, 'a', 'href')
    ];
    const localRefs = refs.filter(ref => ref && !isExternal(ref));
    assert.ok(localRefs.length > 0, 'expected local static references in index.html');

    const missing = [];
    localRefs.forEach(ref => {
        assert.ok(!ref.startsWith('..'), `local reference should not escape Pages artifact: ${ref}`);
        const cleanRef = stripQueryAndHash(ref);
        if (!cleanRef) return;
        const resolved = path.resolve(root, cleanRef);
        assert.ok(resolved.startsWith(root), `local reference should stay inside repo: ${ref}`);
        if (!fs.existsSync(resolved)) missing.push(ref);
    });
    assert.deepStrictEqual(missing, [], `missing local static references: ${missing.join(', ')}`);
}

function testAssetCacheVersionsAreConsistent() {
    const assetRefs = [
        ...parseAttributes(indexHtml, 'script', 'src'),
        ...parseAttributes(indexHtml, 'link', 'href')
    ].filter(ref => !isExternal(ref) && /\.(?:js|css)(?:\?|$)/.test(ref));

    const versions = assetRefs
        .map(ref => new URLSearchParams(String(ref).split('?')[1] || '').get('v'))
        .filter(Boolean);
    assert.ok(versions.length >= assetRefs.length - 1, 'local JS/CSS assets should use cache-busting versions');
    assert.strictEqual(new Set(versions).size, 1, `local JS/CSS cache versions should be consistent: ${versions.join(', ')}`);
}

testLocalStaticReferencesExist();
testAssetCacheVersionsAreConsistent();
console.log('static-resource-references regression tests passed');
