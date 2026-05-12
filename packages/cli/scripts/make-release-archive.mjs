import { mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { platformForTarget } from './platforms.mjs';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}
const target = args.get('--target');
const version = args.get('--version');
if (!target || !version) {
  console.error('usage: node packages/cli/scripts/make-release-archive.mjs --target <rust-target> --version <semver>');
  process.exit(1);
}
const platform = platformForTarget(target);
const packageDir = platform.packageDir;
const outDir = 'release-assets';
mkdirSync(outDir, { recursive: true });
const baseName = `${platform.assetName}-v${version}`;
const binaryPath = join(packageDir, 'dist', platform.binaryName);

const result = platform.os === 'win32'
  ? spawnSync('powershell', ['-NoProfile', '-Command', `Compress-Archive -Path '${binaryPath}' -DestinationPath '${join(outDir, `${baseName}.zip`)}' -Force`], { stdio: 'inherit' })
  : spawnSync('tar', ['-czf', join(outDir, `${baseName}.tar.gz`), '-C', join(packageDir, 'dist'), platform.binaryName], { stdio: 'inherit' });

if (result.status !== 0) {
  process.exit(result.status ?? 1);
}
