import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'fs';
import { join } from 'path';

const bbPath = join(process.cwd(), 'bin', 'bb');

export async function POST(req: NextRequest) {
  const { witness } = await req.json();

  if (!witness || typeof witness !== 'string') {
    return NextResponse.json({ error: 'missing witness (base64)' }, { status: 400 });
  }

  const tmpDir = mkdtempSync('/tmp/zkpay-prove-');
  try {
    const witnessPath = join(tmpDir, 'witness.gz');
    writeFileSync(witnessPath, Buffer.from(witness, 'base64'));

    // Copy circuit to tmp dir so Next.js file watcher doesn't interfere with bb
    const circuitPath = join(process.cwd(), 'public', 'circuit.json');
    const circuitTmpPath = join(tmpDir, 'circuit.json');
    writeFileSync(circuitTmpPath, readFileSync(circuitPath));

    const outDir = join(tmpDir, 'out');

    execSync(
      `"${bbPath}" prove -s ultra_honk --oracle_hash keccak --output_format json -b "${circuitTmpPath}" -w "${witnessPath}" -o "${outDir}"`,
      { timeout: 300_000, stdio: 'pipe' },
    );

    const outFiles = readdirSync(outDir);
    console.log('[zkPay-prove] Output files:', outFiles);

    const proofFile = outFiles.find(f => f === 'proof.json');
    const piFile = outFiles.find(f => f === 'public_inputs.json');
    if (!proofFile || !piFile) {
      throw new Error(`Expected proof.json and public_inputs.json, got: ${outFiles.join(', ')}`);
    }

    // Parse JSON array of hex Fr strings → concatenated 32-byte BE field elements
    const fieldsToBytes = (data: string[]): Buffer =>
      Buffer.concat(
        data.map((f: string) => {
          const hex = f.startsWith('0x') ? f.slice(2) : f;
          return Buffer.from(hex.padStart(64, '0'), 'hex');
        })
      );

    const proofFields: string[] = JSON.parse(readFileSync(join(outDir, proofFile), 'utf8'));
    const piFields: string[] = JSON.parse(readFileSync(join(outDir, piFile), 'utf8'));

    // proof_fields.json = 456 Fr → 456 × 32 = 14,592 bytes = PROOF_BYTES
    const proof = fieldsToBytes(proofFields);

    // public_inputs includes pairing-point accumulator (16 Fr) after the user fields;
    // contract expects only the first 2 Fr (commitment + nullifier) = 64 bytes
    const publicInputs = fieldsToBytes(piFields.slice(0, 2));

    return NextResponse.json({
      proof: proof.toString('base64'),
      publicInputs: publicInputs.toString('base64'),
    });
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
}
