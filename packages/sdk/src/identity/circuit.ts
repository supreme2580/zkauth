import { Noir, type CompiledCircuit } from '@noir-lang/noir_js';
import { Barretenberg, UltraHonkBackend } from '@aztec/bb.js';
import pako from 'pako';
import { toFieldHex } from './crypto';
import circuitData from '../../circuits/identity.json' with { type: 'json' };

const circuitJson = circuitData as CompiledCircuit;
const bytecode = (circuitData as any).bytecode as string;

export interface ProofResult {
  proof: Uint8Array;
  publicInputs: Uint8Array;
}

let bbPromise: Promise<Barretenberg> | null = null;
let backendPromise: Promise<UltraHonkBackend> | null = null;

async function getBackend(): Promise<UltraHonkBackend> {
  if (backendPromise) return backendPromise;
  backendPromise = (async () => {
    if (!bbPromise) {
      bbPromise = Barretenberg.new();
    }
    const bb = await bbPromise;
    return new UltraHonkBackend(bytecode, bb);
  })();
  return backendPromise;
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

  onProgress?.('Generating UltraHonk proof (local)…');

  const witnessBuf = new Uint8Array(witness);
  const compressedWitness = pako.gzip(witnessBuf);

  const backend = await getBackend();
  const { proof, publicInputs } = await backend.generateProof(compressedWitness, {
    verifierTarget: 'evm',
  });

  const pubBytes = new Uint8Array(publicInputs.length * 32);
  for (let i = 0; i < publicInputs.length; i++) {
    const hex = publicInputs[i].startsWith('0x') ? publicInputs[i].slice(2) : publicInputs[i];
    const bytes = hex.match(/.{1,2}/g)?.map(b => parseInt(b, 16)) ?? [];
    for (let j = 0; j < 32; j++) {
      pubBytes[i * 32 + j] = bytes[j] ?? 0;
    }
  }

  onProgress?.('Proof generated');
  return { proof, publicInputs: pubBytes };
}

export { circuitJson };
