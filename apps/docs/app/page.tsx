"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

const installCommand = "npm i -g @dawnwin7/jackson-cli";
const skillCommand = "npx skills add https://github.com/dawnwin7/jackson-cli --skill ask-jackson";
const githubUrl = "https://github.com/dawnwin7/jackson-cli";

const commands = [
  {
    id: "install",
    label: "INSTALL",
    command: installCommand,
    copyLabel: "Copy install command",
    copiedLabel: "Install command copied",
  },
  {
    id: "skill",
    label: "Agent skill",
    command: skillCommand,
    copyLabel: "Copy agent skill command",
    copiedLabel: "Agent skill command copied",
  },
] as const;

type CommandItem = (typeof commands)[number];
type CommandId = CommandItem["id"];

function GitHubMark() {
  return (
    <svg className="github-mark" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="currentColor"
        d="M12 2C6.48 2 2 6.59 2 12.25c0 4.53 2.87 8.37 6.85 9.73.5.1.68-.22.68-.49v-1.72c-2.78.62-3.37-1.37-3.37-1.37-.45-1.18-1.11-1.5-1.11-1.5-.91-.64.07-.63.07-.63 1 .07 1.53 1.06 1.53 1.06.9 1.57 2.35 1.12 2.93.86.09-.67.35-1.12.63-1.38-2.22-.26-4.56-1.14-4.56-5.07 0-1.12.39-2.04 1.03-2.75-.1-.26-.45-1.31.1-2.72 0 0 .84-.28 2.75 1.05A9.34 9.34 0 0 1 12 6.97c.85 0 1.69.12 2.49.35 1.9-1.33 2.74-1.05 2.74-1.05.55 1.41.2 2.46.1 2.72.64.71 1.03 1.63 1.03 2.75 0 3.94-2.34 4.81-4.57 5.07.36.32.68.94.68 1.9v2.78c0 .27.18.59.69.49A10.22 10.22 0 0 0 22 12.25C22 6.59 17.52 2 12 2Z"
      />
    </svg>
  );
}

export default function HomePage() {
  const [copiedCommand, setCopiedCommand] = useState<CommandId | null>(null);

  async function copyCommand(item: CommandItem) {
    await navigator.clipboard.writeText(item.command);
    setCopiedCommand(item.id);
    window.setTimeout(() => setCopiedCommand(null), 1600);
  }

  return (
    <main className="landing-shell" aria-label="Jackson CLI landing page">
      <a className="github-link" href={githubUrl} target="_blank" rel="noreferrer" aria-label="Open jackson-cli on GitHub">
        <GitHubMark />
      </a>
      <section className="hero" aria-labelledby="hero-title">
        <p className="eyebrow">Jackson CLI</p>
        <h1 id="hero-title">Let agents message Jackson at any time.</h1>

        <div className="command-stack" aria-label="Setup commands">
          {commands.map((item) => {
            const copied = copiedCommand === item.id;

            return (
              <div className="command-row" key={item.id}>
                <span className="command-label">{item.label}</span>
                <code>{item.command}</code>
                <button
                  className="command-copy"
                  type="button"
                  aria-label={copied ? item.copiedLabel : item.copyLabel}
                  onClick={() => copyCommand(item)}
                >
                  {copied ? <Check aria-hidden="true" size={16} /> : <Copy aria-hidden="true" size={16} />}
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </main>
  );
}
