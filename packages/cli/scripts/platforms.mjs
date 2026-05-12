export const platforms = [
  {
    target: 'x86_64-unknown-linux-gnu',
    runner: 'ubuntu-latest',
    npmName: '@dawnwin7/jackson-cli-linux-x64-gnu',
    npmTag: 'linux-x64-gnu',
    packageDir: 'packages/cli-linux-x64-gnu',
    os: 'linux',
    cpu: 'x64',
    libc: 'glibc',
    binaryName: 'jackson',
    assetName: 'jackson-linux-x64-gnu',
  },
  {
    target: 'aarch64-unknown-linux-gnu',
    runner: 'ubuntu-24.04-arm',
    npmName: '@dawnwin7/jackson-cli-linux-arm64-gnu',
    npmTag: 'linux-arm64-gnu',
    packageDir: 'packages/cli-linux-arm64-gnu',
    os: 'linux',
    cpu: 'arm64',
    libc: 'glibc',
    binaryName: 'jackson',
    assetName: 'jackson-linux-arm64-gnu',
  },
  {
    target: 'x86_64-apple-darwin',
    runner: 'macos-15-intel',
    npmName: '@dawnwin7/jackson-cli-darwin-x64',
    npmTag: 'darwin-x64',
    packageDir: 'packages/cli-darwin-x64',
    os: 'darwin',
    cpu: 'x64',
    binaryName: 'jackson',
    assetName: 'jackson-darwin-x64',
  },
  {
    target: 'aarch64-apple-darwin',
    runner: 'macos-latest',
    npmName: '@dawnwin7/jackson-cli-darwin-arm64',
    npmTag: 'darwin-arm64',
    packageDir: 'packages/cli-darwin-arm64',
    os: 'darwin',
    cpu: 'arm64',
    binaryName: 'jackson',
    assetName: 'jackson-darwin-arm64',
  },
  {
    target: 'x86_64-pc-windows-msvc',
    runner: 'windows-latest',
    npmName: '@dawnwin7/jackson-cli-win32-x64-msvc',
    npmTag: 'win32-x64-msvc',
    packageDir: 'packages/cli-win32-x64-msvc',
    os: 'win32',
    cpu: 'x64',
    binaryName: 'jackson.exe',
    assetName: 'jackson-win32-x64-msvc.exe',
  },
];

export function platformForTarget(target) {
  const platform = platforms.find((candidate) => candidate.target === target);
  if (!platform) {
    throw new Error(`Unsupported Rust target: ${target}`);
  }
  return platform;
}
