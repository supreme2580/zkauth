import { Noir, type CompiledCircuit } from '@noir-lang/noir_js';
import { UltraHonkBackend } from '@aztec/bb.js';
import { toFieldHex } from './crypto.js';
import circuitData from '../../circuits/identity.json' with { type: 'json' };

const circuitJson = circuitData as unknown as CompiledCircuit;

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

  onProgress?.('Generating UltraHonk proof…');
  const backend = new UltraHonkBackend(circuitJson.bytecode);
  const result = await backend.generateProof(witness);

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

function bytesToHex(bytes: Uint8Array): string {
  let hex = '';
  for (const b of bytes) hex += b.toString(16).padStart(2, '0');
  return hex;
}

export async function verifyProof(proof: Uint8Array, publicInputs: Uint8Array): Promise<boolean> {
  const backend = new UltraHonkBackend(circuitJson.bytecode);

  const piHex: string[] = [];
  for (let i = 0; i < 2; i++) {
    const slice = publicInputs.slice(i * 32, (i + 1) * 32);
    const hex = bytesToHex(slice).replace(/^0+/, '') || '0';
    piHex.push('0x' + hex);
  }

  return await backend.verifyProof({ proof, publicInputs: piHex });
}

export { circuitJson };
