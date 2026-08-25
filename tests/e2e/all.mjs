/**
 * Run every e2e file in sequence and print one scoreboard.
 *
 * Each file is standalone (`node smoke.mjs`, `node windows.mjs`, ...) and owns
 * a unique debugging port and HTTP port, so they never collide.
 *
 *   node all.mjs
 */
import { spawn } from 'node:child_process';

const FILES = ['smoke.mjs', 'detach.mjs', 'restricted.mjs', 'windows.mjs', 'tabs.mjs', 'actions.mjs', 'worker.mjs', 'menus.mjs'];
const results = [];

for (const file of FILES) {
    const started = Date.now();
    const code = await new Promise((resolve) => {
        const p = spawn(process.execPath, [file], { stdio: 'inherit', cwd: import.meta.dirname });
        p.on('exit', resolve);
    });
    results.push({ file, code, secs: Math.round((Date.now() - started) / 1000) });
}

console.log('\n================ SUITE ================');
for (const r of results) console.log(`  ${r.code === 0 ? 'PASS' : 'FAIL'}  ${r.file.padEnd(16)} ${r.secs}s`);
process.exit(results.some((r) => r.code !== 0) ? 1 : 0);
