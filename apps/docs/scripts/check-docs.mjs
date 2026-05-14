import { existsSync, readFileSync } from "node:fs";

const page = readFileSync(new URL("../app/page.tsx", import.meta.url), "utf8");
const styles = readFileSync(new URL("../app/styles.css", import.meta.url), "utf8");
const usagePage = new URL("../app/usage/page.tsx", import.meta.url);

const required = [
  "Let agents message Jackson at any time.",
  "npm i -g @dawnwin7/jackson-cli",
  "npx skills add https://github.com/dawnwin7/jackson-cli --skill ask-jackson",
  "https://github.com/dawnwin7/jackson-cli",
  "lucide-react",
  "Copy install command",
  "Copy agent skill command",
];

for (const text of required) {
  if (!page.includes(text)) {
    throw new Error(`landing page missing: ${text}`);
  }
}

if (existsSync(usagePage)) {
  throw new Error("docs app should only expose the home landing page");
}

for (const text of ["ui-monospace", "landing-shell", "hero", "github-link", "command-stack"]) {
  if (!styles.includes(text)) {
    throw new Error(`landing styles missing: ${text}`);
  }
}

console.log("landing checks passed");
