import { chmodSync, copyFileSync, mkdirSync, rmSync, statSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { MAIN_NPM_PACKAGE, platformForTarget, platformStagingDir } from './platforms.mjs';

const args = new Map();
for (let index = 2; index < process.argv.length; index += 2) {
  args.set(process.argv[index], process.argv[index + 1]);
}

const target = args.get('--target');
const version = args.get('--version');
if (!target || !version) {
  console.error('usage: node packages/cli/scripts/stage-platform-package.mjs --target <rust-target> --version <semver> [--binary <path>]');
  process.exit(1);
}
if (!/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  console.error(`invalid semver: ${version}`);
  process.exit(1);
}

const platform = platformForTarget(target);
const repoRoot = join(dirname(fileURLToPath(import.meta.url)), '..', '..', '..');
const source = args.get('--binary') ?? join(repoRoot, 'packages', 'cli', 'target', target, 'release', platform.binaryName);
statSync(source);

const stagingDir = join(repoRoot, platformStagingDir(platform));
const dist = join(stagingDir, 'dist');
const destination = join(dist, platform.binaryName);
rmSync(stagingDir, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });
copyFileSync(source, destination);
if (!platform.binaryName.endsWith('.exe')) {
  chmodSync(destination, 0o755);
}

const packageJson = {
  name: MAIN_NPM_PACKAGE,
  version: `${version}-${platform.npmTag}`,
  description: `Platform binary for the Jackson CLI (${platform.npmTag})`,
  license: 'UNLICENSED',
  repository: {
    type: 'git',
    url: 'git+https://github.com/dawnwin7/jackson-cli.git',
  },
  os: [platform.os],
  cpu: [platform.cpu],
  files: [`dist/${platform.binaryName}`],
  publishConfig: {
    access: 'public',
  },
};
if (platform.libc) {
  packageJson.libc = [platform.libc];
}

writeFileSync(join(stagingDir, 'package.json'), `${JSON.stringify(packageJson, null, 2)}\n`);
writeFileSync(
  join(stagingDir, 'README.md'),
  `# ${MAIN_NPM_PACKAGE} ${platform.npmTag}\n\nPlatform-specific Jackson CLI binary package. Install \`${MAIN_NPM_PACKAGE}\` instead of this package directly.\n`,
);

console.log(`staged ${source} -> ${destination}`);
console.log(`package ${MAIN_NPM_PACKAGE}@${version}-${platform.npmTag} -> ${platformStagingDir(platform)}`);
