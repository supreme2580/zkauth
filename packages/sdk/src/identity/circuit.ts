import { Noir, type CompiledCircuit } from '@noir-lang/noir_js';
import { Barretenberg, UltraHonkBackend } from '@aztec/bb.js';
import pako from 'pako';
import { toFieldHex } from './crypto';
import circuitData from '../../circuits/identity.json' with { type: 'json' };

const circuitJson = circuitData as CompiledCircuit;

export interface ProofResult {
  proof: Uint8Array;
  publicInputs: Uint8Array;
}

export async function generateProof(
  commitment: Uint8Array,
  nullifier: Uint8Array,
  secret: Uint8Array,
  nonce: Uint8Array,
  onProgress?: (msg: string) => void,
): Promise<ProofResult> {
  onProgress?.('Executing circuit…');
  const noir = new Noir(circuitJson);
  const { witness } = await noir.execute({
    commitment: toFieldHex(commitment),
    nullifier: toFieldHex(nullifier),
    secret: toFieldHex(secret),
    nonce: toFieldHex(nonce),
  });

  onProgress?.('Downloading proving parameters (one-time)…');
  const api = await Barretenberg.initSingleton({ threads: 1 });

  onProgress?.('Generating UltraHonk proof…');
  const backend = new UltraHonkBackend(circuitJson.bytecode, api);
  const witnessRaw = new Uint8Array(witness);
  const result = await backend.generateProof(pako.gzip(witnessRaw), {
    verifierTarget: 'evm-no-zk',
  });

  const piBytes = new Uint8Array(64);
  for (let i = 0; i < 2 && i < result.publicInputs.length; i++) {
    const clean = result.publicInputs[i].startsWith('0x')
      ? result.publicInputs[i].slice(2)
      : result.publicInputs[i];
    const fr = clean.padStart(64, '0');
    for (let j = 0; j < 32; j++) {
      piBytes[i * 32 + j] = parseInt(fr.substring(j * 2, j * 2 + 2), 16);
    }
  }

  onProgress?.('Proof generated');
  return { proof: result.proof, publicInputs: piBytes };
}

export { circuitJson };
