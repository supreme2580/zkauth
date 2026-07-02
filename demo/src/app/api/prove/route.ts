import { NextRequest, NextResponse } from 'next/server';
import { writeFileSync, readFileSync, unlinkSync } from 'fs';
import { join } from 'path';
import { spawnSync } from 'child_process';

const BB_PATH = join(process.cwd(), 'bin', 'bb');

export async function POST(req: NextRequest) {
  const { witness } = await req.json();

  if (!witness || typeof witness !== 'string') {
    return NextResponse.json({ error: 'missing witness (base64)' }, { status: 400 });
  }

  const tempDir = '/tmp';
  const witnessPath = join(tempDir, `witness_${Date.now()}.gz`);
  const proofPath = join(tempDir, `proof_${Date.now()}`);

  try {
    // Write witness to temp file
    const witnessBytes = Uint8Array.from(atob(witness), c => c.charCodeAt(0));
    writeFileSync(witnessPath, witnessBytes);

    // Call bb prove
    const circuitPath = join(process.cwd(), 'public', 'circuit.json');
    const result = spawnSync(BB_PATH, [
      'prove',
      '-s', 'ultra_honk',
      '--oracle_hash', 'keccak',
      '--honk_recursion', '1',
      '--output_format', 'fields',
      '-w', witnessPath,
      '-c', circuitPath,
      '-o', proofPath,
    ], {
      timeout: 60000,
      stdio: 'pipe',
    });

    if (result.error) {
      return NextResponse.json({ error: `bb prove failed: ${result.error.message}` }, { status: 500 });
    }

    if (result.status !== 0) {
      const stderr = result.stderr?.toString() || 'Unknown error';
      return NextResponse.json({ error: `bb prove failed (code ${result.status}): ${stderr}` }, { status: 500 });
    }

    // Read proof and public inputs
    const proofData = readFileSync(`${proofPath}.proof`);
    const publicInputsData = readFileSync(`${proofPath}.public`);

    return NextResponse.json({
      proof: Buffer.from(proofData).toString('base64'),
      publicInputs: Buffer.from(publicInputsData).toString('base64'),
    });
  } catch (e: any) {
    return NextResponse.json({ error: e.message || 'Proof generation failed' }, { status: 500 });
  } finally {
    // Cleanup temp files
    try { unlinkSync(witnessPath); } catch {}
    try { unlinkSync(`${proofPath}.proof`); } catch {}
    try { unlinkSync(`${proofPath}.public`); } catch {}
  }
}