import { existsSync, readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';

const scriptDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = join(scriptDir, '..');
const isWindows = process.platform === 'win32';
const binaryName = isWindows ? 'jackson.exe' : 'jackson';
const binary = join(packageRoot, 'dist', binaryName);
const platformFile = join(packageRoot, 'dist', 'platform.json');

function packagedBinaryMatchesCurrentPlatform() {
  if (!existsSync(binary) || !existsSync(platformFile)) {
    return false;
  }
  try {
    const platform = JSON.parse(readFileSync(platformFile, 'utf8'));
    return platform.platform === process.platform && platform.arch === process.arch && platform.binary === binaryName;
  } catch {
    return false;
  }
}

if (packagedBinaryMatchesCurrentPlatform()) {
  process.exit(0);
}

const cargo = spawnSync('cargo', ['--version'], { stdio: 'ignore' });
if (cargo.status !== 0) {
  console.error('error: @dawnwin7/jackson-cli needs a matching prebuilt binary or a Rust toolchain with cargo to build during install');
  process.exit(1);
}

const build = spawnSync(process.execPath, [join(scriptDir, 'build-npm.mjs')], {
  cwd: packageRoot,
  stdio: 'inherit',
});
process.exit(build.status ?? 1);
