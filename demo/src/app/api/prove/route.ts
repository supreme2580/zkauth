import { NextRequest, NextResponse } from 'next/server';
import { readFileSync } from 'fs';
import { resolve } from 'path';
import { gzipSync } from 'zlib';
import { Barretenberg, UltraHonkBackend } from '@aztec/bb.js';

const root = process.cwd();
const circuitPath = resolve(root, 'public', 'circuit.json');
const wasmPath = resolve(root, 'public/barretenberg-threads.wasm.gz');

export async function POST(req: NextRequest) {
  const { witness } = await req.json();

  if (!witness || typeof witness !== 'string') {
    return NextResponse.json({ error: 'missing witness (base64)' }, { status: 400 });
  }

  const { bytecode } = JSON.parse(readFileSync(circuitPath, 'utf8')) as { bytecode: string };
  const witnessRaw = Buffer.from(witness, 'base64');

  const api = await Barretenberg.new({ threads: 1, wasmPath });

  try {
    const backend = new UltraHonkBackend(bytecode, api);

    const result = await backend.generateProof(gzipSync(witnessRaw), {
      verifierTarget: 'evm-no-zk',
    });

    const piBytes = Buffer.concat(
      result.publicInputs.slice(0, 2).map((hex: string) => {
        const clean = hex.startsWith('0x') ? hex.slice(2) : hex;
        return Buffer.from(clean.padStart(64, '0'), 'hex');
      })
    );

    return NextResponse.json({
      proof: Buffer.from(result.proof).toString('base64'),
      publicInputs: piBytes.toString('base64'),
    });
  } finally {
    await api.destroy();
  }
}
