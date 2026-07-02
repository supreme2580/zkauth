import React, { useState, useEffect, useRef, useCallback } from 'react';
import { computeCommitment, computeNullifier, bytesToHex, hexToBytes } from '../identity';
import { generateProof } from '../identity/circuit';
import { deriveSecretFromSeed, deriveSecretFromKey } from '../seed';
import { submitDeposit, submitWithdraw } from '../contract/client';
import { setConnected, setDisconnected, setBalance, addDeposit, claimDeposit } from '../state';
import { useZkAuth } from '../hooks/useZkAuth';

type ModalView = 'seed' | 'main' | 'activate' | 'deposit-input' | 'deposit-wait' | 'deposit-progress' | 'withdraw-input' | 'withdraw-progress' | 'success';

async function checkAccountBalance(address: string): Promise<number> {
  try {
    const resp = await fetch(`https://horizon-testnet.stellar.org/accounts/${address}`);
    if (resp.status === 404) return 0;
    if (!resp.ok) throw new Error(`Horizon ${resp.status}`);
    const data = await resp.json();
    const xlm = data.balances?.find((b: any) => b.asset_type === 'native');
    return parseFloat(xlm?.balance || '0');
  } catch {
    return 0;
  }
}

export interface ZkAuthButtonProps {
  privateKey?: Uint8Array;
}

export function ZkAuthButton({ privateKey: rawPrivateKey }: ZkAuthButtonProps) {
  const zkAuth = useZkAuth();

  const [modalOpen, setModalOpen] = useState(false);
  const [modalView, setModalView] = useState<ModalView>('seed');
  const [seedInput, setSeedInput] = useState('');
  const [identityBalance, setIdentityBalance] = useState<number>(0);
  const [depositAmount, setDepositAmount] = useState('');
  const [withdrawAmount, setWithdrawAmount] = useState('');
  const [recipientAddress, setRecipientAddress] = useState('');
  const [statusMsg, setStatusMsg] = useState('');
  const [statusLog, setStatusLog] = useState<string[]>([]);
  const [progress, setProgress] = useState(0);
  const [lastTxUrl, setLastTxUrl] = useState<string | null>(null);
  const [connecting, setConnecting] = useState(false);
  const [copied, setCopied] = useState(false);
  const [privateKeyCopied, setPrivateKeyCopied] = useState(false);
  const [showPrivateKey, setShowPrivateKey] = useState(false);
  const pollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const depositTargetRef = useRef(0);
  const depositAmountRef = useRef(0);
  const isDepositingRef = useRef(false);

  const addLog = useCallback((msg: string) => {
    setStatusLog(p => [...p, `[${new Date().toLocaleTimeString()}] ${msg}`]);
  }, []);

  const refreshBalance = useCallback(async () => {
    if (zkAuth.identityAddress) {
      const bal = await checkAccountBalance(zkAuth.identityAddress);
      setIdentityBalance(bal);
    }
  }, [zkAuth.identityAddress]);

  const clearPolling = useCallback(() => {
    if (pollingRef.current) {
      clearInterval(pollingRef.current);
      pollingRef.current = null;
    }
  }, []);

  useEffect(() => {
    if (rawPrivateKey) {
      (async () => {
        try {
          const secret = await deriveSecretFromKey(rawPrivateKey);
          setConnected(null, secret);
          addLog('Connected with raw private key');
        } catch (err) {
          console.error('[zkAuth] Init error:', err);
          addLog(`Init error: ${err instanceof Error ? err.message : String(err)}`);
        }
      })();
    }
  }, [rawPrivateKey]);

  useEffect(() => {
    if (!modalOpen) {
      setModalView(zkAuth.connected ? 'main' : 'seed');
      setSeedInput('');
      setIdentityBalance(0);
      setStatusMsg('');
      setStatusLog([]);
      setProgress(0);
      setLastTxUrl(null);
      setCopied(false);
      clearPolling();
      isDepositingRef.current = false;
      depositTargetRef.current = 0;
    }
  }, [modalOpen, zkAuth.connected]);

  useEffect(() => {
    if (modalOpen && (modalView === 'main' || modalView === 'deposit-input') && zkAuth.identityAddress) {
      checkAccountBalance(zkAuth.identityAddress).then(b => setIdentityBalance(b));
    }
  }, [modalOpen, modalView, zkAuth.identityAddress]);

  useEffect(() => {
    if (!modalOpen || modalView !== 'main' || !zkAuth.identityAddress) return;
    const id = setInterval(() => {
      checkAccountBalance(zkAuth.identityAddress!).then(b => setIdentityBalance(b));
    }, 4000);
    return () => clearInterval(id);
  }, [modalOpen, modalView, zkAuth.identityAddress]);

  const getSecret = useCallback(async (): Promise<Uint8Array> => {
    if (zkAuth.secret) return zkAuth.secret;
    if (rawPrivateKey) return deriveSecretFromKey(rawPrivateKey);
    throw new Error('Not connected');
  }, [zkAuth.secret, rawPrivateKey]);

  // --- Handlers ---

  const handleConnect = async () => {
    const seed = seedInput.trim();
    if (!seed) return;
    setConnecting(true);
    addLog('Deriving identity from seed phrase…');
    try {
      const secret = await deriveSecretFromSeed(seed);
      setConnected(null, secret);
      addLog('Identity derived');
      setModalView('main');
    } catch (err) {
      addLog(`Error: ${err instanceof Error ? err.message : String(err)}`);
    } finally {
      setConnecting(false);
    }
  };

  const handleRandomSeed = () => {
    const random = crypto.getRandomValues(new Uint8Array(16));
    const hex = Array.from(random).map(b => b.toString(16).padStart(2, '0')).join('');
    setSeedInput(hex);
  };

  const handleCopy = () => {
    if (!zkAuth.identityAddress) return;
    navigator.clipboard.writeText(zkAuth.identityAddress);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleDisconnect = () => {
    setDisconnected();
    setModalOpen(false);
  };

  const handleActivate = () => {
    setModalView('activate');
    setStatusMsg('Send at least 2 XLM to activate.');

    clearPolling();
    pollingRef.current = setInterval(async () => {
      if (!zkAuth.identityAddress) return;
      const bal = await checkAccountBalance(zkAuth.identityAddress);
      setIdentityBalance(bal);
      if (bal >= 1) {
        clearPolling();
        addLog(`Account activated! Balance: ${bal.toFixed(4)} XLM`);
        setModalView('main');
      }
    }, 4000);
  };

  const handleDeposit = useCallback(async () => {
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0 || !zkAuth.identitySecretKey) return;

    isDepositingRef.current = true;
    setModalView('deposit-progress');
    setProgress(10);
    setStatusMsg('Preparing deposit…');

    try {
      const secret = await getSecret();
      const stroops = BigInt(Math.floor(amount * 1e7));

      addLog('Generating commitment…');
      const nonce = crypto.getRandomValues(new Uint8Array(32));
      const commitment = await computeCommitment(secret, nonce);
      addLog(`Commitment: ${bytesToHex(commitment).slice(0, 16)}…`);

      setProgress(50);
      setStatusMsg('Submitting deposit…');
      const txResult = await submitDeposit(zkAuth.identitySecretKey, commitment, stroops);
      addLog(`Deposit tx: ${txResult.url}`);
      setLastTxUrl(txResult.url);
      if (txResult.status === 'ERROR') throw new Error('Deposit rejected');

      addDeposit({
        commitment: bytesToHex(commitment),
        amount: stroops,
        nonce: bytesToHex(nonce),
        claimed: false,
      });
      setBalance(zkAuth.balance + stroops);
      setProgress(100);
      setStatusMsg('Deposit complete!');
      addLog('Commitment recorded on-chain');
      setDepositAmount('');
      refreshBalance();
      setModalView('success');
    } catch (e: any) {
      addLog(`Deposit error: ${e.message}`);
      setStatusMsg(`Failed: ${e.message}`);
    } finally {
      isDepositingRef.current = false;
    }
  }, [depositAmount, zkAuth.identitySecretKey, zkAuth.balance, getSecret, addLog, refreshBalance]);

  const handleDepositIntent = () => {
    const amount = parseFloat(depositAmount);
    if (!amount || amount <= 0) return;

    depositAmountRef.current = amount;
    if (identityBalance >= amount) {
      handleDeposit();
    } else {
      depositTargetRef.current = amount;
      setModalView('deposit-wait');

      clearPolling();
      pollingRef.current = setInterval(async () => {
        if (!zkAuth.identityAddress || isDepositingRef.current) return;
        const bal = await checkAccountBalance(zkAuth.identityAddress);
        setIdentityBalance(bal);
        if (bal >= depositTargetRef.current) {
          clearPolling();
          handleDeposit();
        }
      }, 3000);
    }
  };

  const handleWithdraw = async () => {
    const amount = parseFloat(withdrawAmount);
    if (!amount || amount <= 0 || !recipientAddress || !zkAuth.identitySecretKey) return;

    setModalView('withdraw-progress');
    setProgress(10);
    setStatusMsg('Generating ZK proof…');
    addLog('Generating identity proof…');

    try {
      const secret = await getSecret();

      const unclaimed = [...zkAuth.deposits].reverse().find(d => !d.claimed);
      if (!unclaimed) {
        throw new Error('No unclaimed deposit found. Deposit first.');
      }
      const nonce = hexToBytes(unclaimed.nonce);
      const commitmentBytes = hexToBytes(unclaimed.commitment);
      addLog(`Using prior deposit commitment: ${unclaimed.commitment.slice(0, 16)}…`);

      const nullifierBytes = await computeNullifier(commitmentBytes, secret, nonce);

      addLog('Proving with UltraHonk (30-60s)…');
      setProgress(40);
      setStatusMsg('Running UltraHonk prover…');

      const result = await generateProof(commitmentBytes, nullifierBytes, secret, nonce, (msg) => {
        addLog(msg);
      });

      setProgress(75);
      setStatusMsg('Submitting withdraw transaction…');
      addLog(`Proof generated: ${result.proof.length} bytes`);

      const txResult = await submitWithdraw(result.proof, result.publicInputs, recipientAddress, zkAuth.identitySecretKey);
      addLog(`Withdraw tx: ${txResult.url}`);
      setLastTxUrl(txResult.url);
      addLog(`Withdrew ${amount} XLM → ${recipientAddress}`);

      claimDeposit(unclaimed.commitment);
      setBalance(zkAuth.balance - BigInt(Math.floor(amount * 1e7)));
      setWithdrawAmount('');
      setRecipientAddress('');
      refreshBalance();
      setProgress(100);
      setStatusMsg('Withdrawal complete!');
      setModalView('success');
    } catch (e: any) {
      setStatusMsg(`Error: ${e.message}`);
      addLog(`ERROR: ${e.message}`);
    }
  };

  const isConnected = zkAuth.connected || (rawPrivateKey !== undefined);
  const needsActivation = identityBalance < 1;
  const poolBalance = Number(zkAuth.balance) / 1e7;

  // --- Render ---

  return (
    <>
      <button onClick={() => setModalOpen(true)} className={`zkauth-btn ${isConnected ? 'zkauth-btn-connected' : 'zkauth-btn-login'}`}>
        {isConnected ? 'zkAuth' : 'Connect with zkAuth'}
      </button>

      {modalOpen && (
        <div className="zkauth-overlay" onClick={() => setModalOpen(false)}>
          <div className="zkauth-modal" onClick={e => e.stopPropagation()}>
            <div className="zkauth-modal-inner">

              {/* Connect */}
              {modalView === 'seed' && (
                <>
                  <div className="zkauth-modal-header">
                    <h2>Connect with zkAuth</h2>
                    <button onClick={() => setModalOpen(false)} className="zkauth-close">✕</button>
                  </div>
                  <p className="zkauth-description">
                    Enter a password to derive your private identity.
                    It can be whatever you like, as long as you remember it.
                  </p>
                  <div className="zkauth-input-wrap">
                    <label className="zkauth-input-label">Password</label>
                    <input
                      type="text"
                      placeholder="Enter your password…"
                      value={seedInput}
                      onChange={e => setSeedInput(e.target.value)}
                      className="zkauth-input zkauth-input-masked"
                      onKeyDown={e => { if (e.key === 'Enter') handleConnect(); }}
                      autoFocus
                      autoComplete="off"
                    />
                  </div>
                  <div className="zkauth-spacer" />
                  <button onClick={handleConnect} className="zkauth-action-btn zkauth-action-deposit" style={{ width: '100%' }} disabled={!seedInput.trim() || connecting}>
                    {connecting ? 'Connecting…' : 'Connect'}
                  </button>
                  <div className="zkauth-flex-center" style={{ marginTop: 10 }}>
                    <button onClick={handleRandomSeed} className="zkauth-btn-link">Generate random password</button>
                  </div>
                </>
              )}

              {/* Main */}
              {modalView === 'main' && (
                <>
                  <div className="zkauth-modal-header">
                    <h2>zkAuth</h2>
                    <button onClick={() => setModalOpen(false)} className="zkauth-close">✕</button>
                  </div>

                  <div className="zkauth-balances">
                    <div className="zkauth-balance-card wallet">
                      <span className="zkauth-balance-card-label">Wallet</span>
                      <span className="zkauth-balance-card-value">{identityBalance.toFixed(4)}</span>
                      <span className="zkauth-balance-card-sub">Stellar identity account</span>
                    </div>
                    <div className="zkauth-balance-card pool">
                      <span className="zkauth-balance-card-label">Pool</span>
                      <span className="zkauth-balance-card-value">{poolBalance.toFixed(4)}</span>
                      <span className="zkauth-balance-card-sub">zkPay contract balance</span>
                    </div>
                  </div>

                  {needsActivation ? (
                    <>
                      <p className="zkauth-description">
                        Your identity account needs a minimum of <strong>1 XLM</strong>.
                        Send at least 2 XLM to activate — 1 for reserve, 1 for fees.
                      </p>
                      <button onClick={handleActivate} className="zkauth-action-btn zkauth-action-deposit" style={{ width: '100%', marginBottom: 16 }}>
                        Activate Account
                      </button>
                    </>
                  ) : (
                    <div className="zkauth-actions">
                      <button onClick={() => setModalView('deposit-input')} className="zkauth-action-btn zkauth-action-deposit">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="5" x2="12" y2="19"/><polyline points="19 12 12 19 5 12"/></svg>
                        Deposit
                      </button>
                      <button onClick={() => setModalView('withdraw-input')} className="zkauth-action-btn zkauth-action-withdraw">
                        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><line x1="12" y1="19" x2="12" y2="5"/><polyline points="5 12 12 5 19 12"/></svg>
                        Withdraw
                      </button>
                    </div>
                  )}
                  <button onClick={handleDisconnect} className="zkauth-btn-logout" style={{ marginTop: 4 }}>Disconnect</button>

                  {zkAuth.identitySecretKey && (
                    <div style={{ marginTop: 16, borderTop: '1px solid rgba(255,255,255,0.08)', paddingTop: 12 }}>
                      <button onClick={() => setShowPrivateKey(p => !p)} className="zkauth-btn-link" style={{ fontSize: 12 }}>
                        {showPrivateKey ? 'Hide' : 'Show'} Private Key
                      </button>
                      {showPrivateKey && (
                        <div style={{ marginTop: 8, display: 'flex', gap: 6, alignItems: 'center' }}>
                          <code style={{
                            flex: 1, fontSize: 11, padding: '6px 8px', borderRadius: 6,
                            background: 'rgba(0,0,0,0.3)', color: '#e0e0e0', wordBreak: 'break-all',
                            fontFamily: 'monospace', lineHeight: 1.4,
                          }}>
                            {zkAuth.identitySecretKey}
                          </code>
                          <button onClick={() => {
                            navigator.clipboard.writeText(zkAuth.identitySecretKey!);
                            setPrivateKeyCopied(true);
                            setTimeout(() => setPrivateKeyCopied(false), 2000);
                          }} className="zkauth-copy-btn-sm" style={{ flexShrink: 0 }}>
                            {privateKeyCopied ? 'Copied!' : 'Copy'}
                          </button>
                        </div>
                      )}
                    </div>
                  )}
                </>
              )}

              {/* Activate */}
              {modalView === 'activate' && (
                <>
                  <div className="zkauth-modal-header">
                    <h2>Activate Account</h2>
                    <button onClick={() => { clearPolling(); setModalView('main'); }} className="zkauth-close">✕</button>
                  </div>
                  <p className="zkauth-description">
                    Send at least <strong>2 XLM</strong> to activate your identity account and start using zkAuth.
                  </p>
                  {zkAuth.identityAddress && (
                    <code className="zkauth-wait-address">{zkAuth.identityAddress}</code>
                  )}
                  <div className="zkauth-flex-center">
                    <button onClick={handleCopy} className="zkauth-copy-btn-sm">
                      {copied ? 'Copied!' : 'Copy Address'}
                    </button>
                  </div>
                  <div className="zkauth-progress-section">
                    <div className="zkauth-progress-bar"><div className="zkauth-progress-fill" style={{ width: `${Math.min(identityBalance * 50, 100)}%` }} /></div>
                    <p className="zkauth-status-msg">{identityBalance >= 1 ? 'Activated!' : `Waiting for payment… ${identityBalance.toFixed(4)} XLM received`}</p>
                  </div>
                </>
              )}

              {/* Deposit Input */}
              {modalView === 'deposit-input' && (
                <>
                  <div className="zkauth-modal-header">
                    <h2>Deposit XLM</h2>
                    <button onClick={() => setModalView('main')} className="zkauth-close">✕</button>
                  </div>
                  <p className="zkauth-description">
                    Available: <strong>{identityBalance.toFixed(4)} XLM</strong>
                  </p>
                  <div className="zkauth-input-wrap">
                    <label className="zkauth-input-label">Amount</label>
                    <input type="number" placeholder="0.00" step="0.0001" min="0" value={depositAmount}
                      onChange={e => setDepositAmount(e.target.value)} className="zkauth-input" autoFocus />
                  </div>
                  <div className="zkauth-spacer" />
                  <button onClick={handleDepositIntent} className="zkauth-action-btn zkauth-action-deposit" style={{ width: '100%' }} disabled={!depositAmount}>
                    Deposit to Pool
                  </button>
                  <div className="zkauth-flex-center" style={{ marginTop: 10 }}>
                    <button onClick={() => setModalView('main')} className="zkauth-btn-link">← Back</button>
                  </div>
                </>
              )}

              {/* Deposit Wait */}
              {modalView === 'deposit-wait' && (
                <>
                  {(() => {
                    const target = depositTargetRef.current;
                    const deposit = depositAmountRef.current;
                    return (
                      <>
                        <div className="zkauth-modal-header">
                          <h2>Deposit {deposit.toFixed(1)} XLM</h2>
                          <button onClick={() => { clearPolling(); setModalView('main'); }} className="zkauth-close">✕</button>
                        </div>
                        <p className="zkauth-description">
                          Send <strong>{target.toFixed(1)} XLM</strong> to your identity address to fund this deposit.
                        </p>
                        {zkAuth.identityAddress && (
                          <code className="zkauth-wait-address">{zkAuth.identityAddress}</code>
                        )}
                        <div className="zkauth-flex-center">
                          <button onClick={handleCopy} className="zkauth-copy-btn-sm">
                            {copied ? 'Copied!' : 'Copy Address'}
                          </button>
                        </div>
                        <div className="zkauth-wait-amount">
                          <div className="zkauth-wait-amount-value">{target.toFixed(1)}</div>
                          <div className="zkauth-wait-amount-label">XLM needed</div>
                        </div>
                        <div className="zkauth-progress-section">
                          <div className="zkauth-progress-bar"><div className="zkauth-progress-fill" style={{ width: `${Math.min((identityBalance / target) * 100, 100)}%` }} /></div>
                          <p className="zkauth-status-msg">{identityBalance >= target ? 'Processing…' : 'Waiting for incoming payment…'}</p>
                        </div>
                      </>
                    );
                  })()}
                </>
              )}

              {/* Deposit Progress */}
              {modalView === 'deposit-progress' && (
                <>
                  <div className="zkauth-modal-header">
                    <h2>Depositing</h2>
                    <button onClick={() => setModalOpen(false)} className="zkauth-close">✕</button>
                  </div>
                  <div className="zkauth-progress-section">
                    <div className="zkauth-progress-bar"><div className="zkauth-progress-fill" style={{ width: `${progress}%` }} /></div>
                    <p className="zkauth-status-msg">{statusMsg}</p>
                  </div>
                  <div className="zkauth-log">{statusLog.map((l, i) => <div key={i} className="zkauth-log-line">{l}</div>)}</div>
                </>
              )}

              {/* Withdraw Input */}
              {modalView === 'withdraw-input' && (
                <>
                  <div className="zkauth-modal-header">
                    <h2>Withdraw XLM</h2>
                    <button onClick={() => setModalView('main')} className="zkauth-close">✕</button>
                  </div>
                  <p className="zkauth-description">
                    Pool balance: <strong>{poolBalance.toFixed(4)} XLM</strong>
                  </p>
                  <div className="zkauth-input-wrap">
                    <label className="zkauth-input-label">Amount</label>
                    <input type="number" placeholder="0.00" step="0.0001" min="0" value={withdrawAmount}
                      onChange={e => setWithdrawAmount(e.target.value)} className="zkauth-input" autoFocus />
                  </div>
                  <div className="zkauth-input-wrap">
                    <label className="zkauth-input-label">Recipient</label>
                    <input type="text" placeholder="G…" value={recipientAddress}
                      onChange={e => setRecipientAddress(e.target.value)} className="zkauth-input" />
                  </div>
                  <button onClick={handleWithdraw} className="zkauth-action-btn zkauth-action-withdraw"
                    style={{ width: '100%' }}
                    disabled={!withdrawAmount || !recipientAddress}>
                    Generate Proof &amp; Withdraw
                  </button>
                  <div className="zkauth-flex-center" style={{ marginTop: 10 }}>
                    <button onClick={() => setModalView('main')} className="zkauth-btn-link">← Back</button>
                  </div>
                </>
              )}

              {/* Withdraw Progress */}
              {modalView === 'withdraw-progress' && (
                <>
                  <div className="zkauth-modal-header">
                    <h2>Withdrawing</h2>
                    <button onClick={() => setModalOpen(false)} className="zkauth-close">✕</button>
                  </div>
                  <div className="zkauth-progress-section">
                    <div className="zkauth-progress-bar"><div className="zkauth-progress-fill" style={{ width: `${progress}%` }} /></div>
                    <p className="zkauth-status-msg">{statusMsg}</p>
                  </div>
                  <div className="zkauth-log">{statusLog.map((l, i) => <div key={i} className="zkauth-log-line">{l}</div>)}</div>
                </>
              )}

              {/* Success */}
              {modalView === 'success' && (
                <>
                  <div className="zkauth-modal-header">
                    <h2>Complete</h2>
                    <button onClick={() => setModalOpen(false)} className="zkauth-close">✕</button>
                  </div>
                  <div className="zkauth-progress-section">
                    <div className="zkauth-progress-bar"><div className="zkauth-progress-fill" style={{ width: '100%' }} /></div>
                    <p className="zkauth-status-msg">{statusMsg}</p>
                  </div>
                  {lastTxUrl && (
                    <div className="zkauth-tx-link-section">
                      <a href={lastTxUrl} target="_blank" rel="noopener noreferrer" className="zkauth-tx-link">
                        View on Stellar Expert ↗
                      </a>
                    </div>
                  )}
                  <div className="zkauth-log">{statusLog.map((l, i) => <div key={i} className="zkauth-log-line">{l}</div>)}</div>
                  <button onClick={() => setModalOpen(false)} className="zkauth-action-btn zkauth-action-deposit" style={{ marginTop: 14, width: '100%' }}>Done</button>
                </>
              )}

            </div>
          </div>
        </div>
      )}
    </>
  );
}
