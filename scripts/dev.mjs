import { spawn } from 'node:child_process';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.dirname(path.dirname(fileURLToPath(import.meta.url)));
const node = process.execPath;

function runNode(args, options = {}) {
  return spawn(node, args, { stdio: 'inherit', cwd: root, ...options });
}

const processes = [
  runNode(['node_modules/tsx/dist/cli.mjs', 'server/index.ts']),
  runNode(['node_modules/vite/bin/vite.js'], { cwd: path.join(root, 'ui') }),
];

let shuttingDown = false;

function stopAll(code = 0) {
  if (shuttingDown) return;
  shuttingDown = true;

  for (const child of processes) {
    if (!child.killed) child.kill();
  }

  process.exit(code);
}

for (const child of processes) {
  child.on('exit', (code) => {
    if (!shuttingDown && code !== 0) {
      stopAll(code ?? 1);
    }
  });
}

process.on('SIGINT', () => stopAll(0));
process.on('SIGTERM', () => stopAll(0));
