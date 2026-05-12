import { readFileSync, writeFileSync } from 'node:fs';
import { platforms, MAIN_NPM_PACKAGE } from './platforms.mjs';

const version = process.argv[2];
if (!version || !/^\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?$/.test(version)) {
  console.error('usage: node packages/cli/scripts/set-release-version.mjs <semver>');
  process.exit(1);
}

function updatePackageJson(path, update) {
  const packageJson = JSON.parse(readFileSync(path, 'utf8'));
  update(packageJson);
  writeFileSync(path, `${JSON.stringify(packageJson, null, 2)}\n`);
}

const mainPackage = 'packages/cli/package.json';
updatePackageJson(mainPackage, (packageJson) => {
  packageJson.name = MAIN_NPM_PACKAGE;
  packageJson.version = version;
  packageJson.optionalDependencies = Object.fromEntries(
    platforms.map((platform) => [
      platform.npmName,
      `npm:${MAIN_NPM_PACKAGE}@${version}-${platform.npmTag}`,
    ]),
  );
});

const cargoTomlPath = 'packages/cli/Cargo.toml';
const cargoToml = readFileSync(cargoTomlPath, 'utf8').replace(
  /^version = ".*"$/m,
  `version = "${version}"`,
);
writeFileSync(cargoTomlPath, cargoToml);
