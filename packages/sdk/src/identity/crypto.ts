import { BarretenbergSync, Fr } from '@aztec/bb.js';
import { bytesToHex, hexToBytes } from './utils.js';

const BN254_FR_MODULUS = 0x30644e72e131a029b85045b68181585d2833e84879b9709143e1f593f0000001n;

let bbReady = false;

async function getBB(): Promise<BarretenbergSync> {
  if (!bbReady) {
    await BarretenbergSync.initSingleton();
    bbReady = true;
  }
  return BarretenbergSync.getSingleton();
}

function uint8ArrayToBigInt(bytes: Uint8Array): bigint {
  let val = 0n;
  for (const b of bytes) val = (val << 8n) | BigInt(b);
  return val;
}

function bytesToFr(bytes: Uint8Array): Fr {
  const val = uint8ArrayToBigInt(bytes) % BN254_FR_MODULUS;
  return new Fr(val);
}

export async function computeCommitment(secretBytes: Uint8Array, nonceBytes: Uint8Array): Promise<Uint8Array> {
  const api = await getBB();
  const secretFr = bytesToFr(secretBytes);
  const nonceFr = bytesToFr(nonceBytes);
  const result = api.pedersenHash([secretFr, nonceFr], 0);
  return result.toBuffer();
}

export async function computeNullifier(commitment: Uint8Array, secretBytes: Uint8Array, nonceBytes: Uint8Array): Promise<Uint8Array> {
  const api = await getBB();
  const commFr = bytesToFr(commitment);
  const secretFr = bytesToFr(secretBytes);
  const nonceFr = bytesToFr(nonceBytes);
  const result = api.pedersenHash([commFr, secretFr, nonceFr], 0);
  return result.toBuffer();
}

export function toFieldHex(bytes: Uint8Array): string {
  const val = uint8ArrayToBigInt(bytes) % BN254_FR_MODULUS;
  return '0x' + val.toString(16).padStart(64, '0');
}

export { bytesToHex, hexToBytes };
