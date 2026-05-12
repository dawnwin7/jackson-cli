"use client";

import { Check, Copy } from "lucide-react";
import { useState } from "react";

const installCommand = "npm i -g @dawnwin7/jackson-cli";

export default function HomePage() {
  const [copied, setCopied] = useState(false);

  async function copyInstallCommand() {
    await navigator.clipboard.writeText(installCommand);
    setCopied(true);
    window.setTimeout(() => setCopied(false), 1600);
  }

  return (
    <main className="landing-shell" aria-label="Jackson CLI landing page">
      <section className="hero" aria-labelledby="hero-title">
        <p className="eyebrow">Jackson CLI</p>
        <h1 id="hero-title">Let agents message Jackson at any time.</h1>
        <div className="install" aria-label="Install command">
          <code>{installCommand}</code>
          <button
            type="button"
            aria-label={copied ? "Install command copied" : "Copy install command"}
            onClick={copyInstallCommand}
          >
            {copied ? <Check aria-hidden="true" size={16} /> : <Copy aria-hidden="true" size={16} />}
          </button>
        </div>
      </section>
    </main>
  );
}
