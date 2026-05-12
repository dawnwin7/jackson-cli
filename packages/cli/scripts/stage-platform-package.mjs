import { chmodSync, copyFileSync, mkdirSync, statSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { platformForTarget } from './platforms.mjs';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const target = args.get('--target');
if (!target) {
  console.error('usage: node packages/cli/scripts/stage-platform-package.mjs --target <rust-target> [--binary <path>]');
  process.exit(1);
}

const platform = platformForTarget(target);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const source = args.get('--binary') ?? join(repoRoot, 'packages', 'cli', 'target', target, 'release', platform.binaryName);
statSync(source);

const dist = join(repoRoot, platform.packageDir, 'dist');
const destination = join(dist, platform.binaryName);
mkdirSync(dist, { recursive: true });
copyFileSync(source, destination);
if (!platform.binaryName.endsWith('.exe')) {
  chmodSync(destination, 0o755);
}
console.log(`staged ${source} -> ${destination}`);
