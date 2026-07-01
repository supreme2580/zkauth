'use client';

import { ZkAuthButton } from '@supreme2580/zkauth';

const code = {
  install: `npm install @supreme2580/zkauth`,
  provider: `'use client';
import { ZkAuthProvider } from '@supreme2580/zkauth';

export function Providers({ children }) {
  return <ZkAuthProvider>{children}</ZkAuthProvider>;
}`,
  button: `'use client';
import { ZkAuthButton } from '@supreme2580/zkauth';

export default function Page() {
  return <ZkAuthButton />;
}`,
  hook: `const { balance, deposits, connect, disconnect } = useZkAuth();`,
  custom: `<ZkAuthButton privateKey={myUint8Array} />`,
};

function CodeBlock({ code: codeStr }: { code: string }) {
  return (
    <pre className="code-block">
      <code>{codeStr}</code>
    </pre>
  );
}

export default function Home() {
  return (
    <div className="page">
      {/* Hero */}
      <section className="hero">
        <div className="hero-badge">v0.1.1</div>
        <div className="hero-logo">Z</div>
        <h1 className="hero-title">
          <span className="hero-title-accent">zkAuth</span> SDK
        </h1>
        <p className="hero-subtitle">
          Zero-knowledge identity and private transactions on Stellar.
          <br />
          Shield your address with ZK proofs — no wallet connection needed.
        </p>
        <div className="hero-actions">
          <ZkAuthButton />
        </div>
      </section>

      {/* Quick Start */}
      <section className="section">
        <h2 className="section-title">Quick Start</h2>
        <p className="section-desc">
          One provider, one button. Drop it in and go.
        </p>
        <div className="steps">
          <div className="step">
            <div className="step-num">1</div>
            <div className="step-content">
              <h3>Install</h3>
              <CodeBlock code={code.install} />
            </div>
          </div>
          <div className="step">
            <div className="step-num">2</div>
            <div className="step-content">
              <h3>Wrap with Provider</h3>
              <CodeBlock code={code.provider} />
            </div>
          </div>
          <div className="step">
            <div className="step-num">3</div>
            <div className="step-content">
              <h3>Add the Button</h3>
              <CodeBlock code={code.button} />
            </div>
          </div>
        </div>
      </section>

      {/* Features */}
      <section className="section">
        <h2 className="section-title">Features</h2>
        <div className="features">
          <div className="feature-card">
            <div className="feature-icon">&#x1F512;</div>
            <h3>No Wallet Required</h3>
            <p>Users prove identity with a password — no MetaMask, no WalletConnect, no browser extension.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">&#x1F9EA;</div>
            <h3>ZK-Powered Privacy</h3>
            <p>Deposits and withdrawals are authorized by UltraHonk zero-knowledge proofs, not an on-chain address.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">&#x2601;&#xFE0F;</div>
            <h3>One-Line Setup</h3>
            <p>Wrap your app in <code className="inline-code">ZkAuthProvider</code>, drop in <code className="inline-code">ZkAuthButton</code>, done.</p>
          </div>
          <div className="feature-card">
            <div className="feature-icon">&#x26A1;</div>
            <h3>Stellar Native</h3>
            <p>Built on Soroban smart contracts. Compatible with any Stellar app.</p>
          </div>
        </div>
      </section>

      {/* Hooks */}
      <section className="section">
        <h2 className="section-title">React Hooks</h2>
        <p className="section-desc">
          Access identity state anywhere in your app.
        </p>
        <CodeBlock code={code.hook} />
        <p className="section-desc" style={{ marginTop: 16 }}>
          Returns <code className="inline-code">connected</code>, <code className="inline-code">secret</code>, <code className="inline-code">balance</code>, <code className="inline-code">deposits</code>, <code className="inline-code">connect</code>, <code className="inline-code">disconnect</code>, and more.
        </p>
      </section>

      {/* Custom Key */}
      <section className="section">
        <h2 className="section-title">Bring Your Own Key</h2>
        <p className="section-desc">
          Pass a raw private key instead of a seed phrase.
        </p>
        <CodeBlock code={code.custom} />
      </section>

      {/* Footer */}
      <footer className="footer">
        <p>
          Built on <a href="https://stellar.org" target="_blank" rel="noopener noreferrer">Stellar</a> {'&'}
          {' '}<a href="https://github.com/AztecProtocol/barretenberg" target="_blank" rel="noopener noreferrer">UltraHonk</a>.
        </p>
        <p className="footer-source">
          <a href="https://github.com/supreme2580/zkauth" target="_blank" rel="noopener noreferrer">View on GitHub</a>
        </p>
      </footer>
    </div>
  );
}
