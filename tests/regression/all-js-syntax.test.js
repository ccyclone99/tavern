const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { spawnSync } = require('child_process');

const root = path.resolve(__dirname, '..', '..');

function collectJsFiles(dir) {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    return entries.flatMap(entry => {
        const fullPath = path.join(dir, entry.name);
        if (entry.isDirectory()) return collectJsFiles(fullPath);
        return entry.isFile() && entry.name.endsWith('.js') ? [fullPath] : [];
    });
}

const files = [
    ...collectJsFiles(path.join(root, 'js')),
    ...collectJsFiles(path.join(root, 'tests', 'regression'))
].sort();

const failures = files.flatMap(file => {
    const result = spawnSync(process.execPath, ['--check', file], {
        cwd: root,
        encoding: 'utf8'
    });
    if (result.status === 0) return [];
    const relative = path.relative(root, file);
    const output = `${result.stdout || ''}${result.stderr || ''}`.trim();
    return [`${relative}\n${output}`];
});

assert.deepStrictEqual(failures, [], `JS syntax check failed:\n${failures.join('\n\n')}`);
console.log(`all-js-syntax regression tests passed (${files.length} files)`);
