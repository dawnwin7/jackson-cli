import { copyFileSync, chmodSync, mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(scriptDir, '..');
const isWindows = process.platform === 'win32';
const binaryName = isWindows ? 'jackson.exe' : 'jackson';

const build = spawnSync('cargo', ['build', '--release'], {
  cwd: packageRoot,
  stdio: 'inherit',
});

if (build.status !== 0) {
  process.exit(build.status ?? 1);
}

const source = join(packageRoot, 'target', 'release', binaryName);
const dist = join(packageRoot, 'dist');
const target = join(dist, binaryName);

mkdirSync(dist, { recursive: true });
copyFileSync(source, target);
if (!isWindows) {
  chmodSync(target, 0o755);
}
writeFileSync(
  join(dist, 'platform.json'),
  `${JSON.stringify({ platform: process.platform, arch: process.arch, binary: binaryName }, null, 2)}\n`,
);
