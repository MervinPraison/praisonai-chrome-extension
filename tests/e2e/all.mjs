/** Run every e2e suite sequentially and report a combined total. */
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const SUITES = [
    'install', 'smoke', 'reviewer-guide', 'step5', 'restricted',
    'windows', 'tabs', 'actions', 'worker', 'attachrace', 'detach', 'menus',
];

let pass = 0, fail = 0, unverified = 0;
const rows = [];

for (const name of SUITES) {
    const file = fileURLToPath(new URL(`./${name}.mjs`, import.meta.url));
    const r = spawnSync(process.execPath, [file], { encoding: 'utf8' });
    const out = (r.stdout || '') + (r.stderr || '');
    const p = (out.match(/^ {2}✓/gm) || []).length;
    const f = (out.match(/^ {2}✗/gm) || []).length;
    // Count the section header's declared total, not loose mentions of the
    // word, so rewording an item cannot drift the number.
    const m = out.match(/UNVERIFIED \((\d+)\)/);
    const u = m ? Number(m[1]) : 0;
    pass += p; fail += f; unverified += u;
    rows.push([name, p, f]);
    console.log(`${name.padEnd(16)} ${String(p).padStart(3)} pass  ${f} fail`);
    if (f) console.log(out.split('\n').filter(l => l.startsWith('  ✗')).join('\n'));
}

console.log('-'.repeat(40));
console.log(`TOTAL ${pass} pass, ${fail} fail` + (unverified ? `  (${unverified} explicitly unverified)` : ''));
process.exit(fail ? 1 : 0);
