// Identity
export { computeCommitment, computeNullifier, bytesToHex, hexToBytes, generateProof, verifyProof } from './identity/index.js';
export type { ProofResult, IdentityProof, DepositData } from './identity/index.js';

// State
export { getZkAuthState, subscribeToZkAuth, setBalance } from './state.js';
export type { ZkAuthState, DepositInfo } from './state.js';

// Hooks & Provider
export { ZkAuthProvider, useZkAuth } from './hooks/index.js';
export type { UseZkAuthOptions, UseZkAuthReturn } from './hooks/index.js';

// Components
export { ZkAuthButton } from './components/index.js';
export type { ZkAuthButtonProps } from './components/index.js';

// Contract
export { submitDeposit, submitWithdraw, checkNullifierUsed, checkCommitmentExists, getContractConfig } from './contract/index.js';
export type { TxResult, ContractConfig } from './contract/index.js';

// Seed phrase
export { deriveSecretFromSeed, deriveSecretFromKey, clearCachedSecret } from './seed.js';

// Banker
export { generateBurner, deriveKeypair } from './banker.js';
export type { BurnerWallet } from './banker.js';
