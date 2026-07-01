import { NextRequest, NextResponse } from 'next/server';
import { execSync } from 'child_process';
import { existsSync, mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'fs';
import { join, dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

function findProjectRoot(start: string): string {
  let current = start;
  while (current !== '/') {
    if (existsSync(join(current, 'package.json'))) {
      return current;
    }
    current = dirname(current);
  }
  return start;
}

const demoProjectRoot = findProjectRoot(__dirname);

const bbPath =
  process.env.BB_PATH || join(demoProjectRoot, 'bin', 'bb');

export async function POST(req: NextRequest) {
  const { witness } = await req.json();

  if (!witness || typeof witness !== 'string') {
    return NextResponse.json({ error: 'missing witness (base64)' }, { status: 400 });
  }

  console.log('[zkPay-prove] bbPath:', bbPath);
  console.log('[zkPay-prove] bbPath exists:', existsSync(bbPath));
  console.log('[zkPay-prove] demoProjectRoot:', demoProjectRoot);

  if (!existsSync(bbPath)) {
    return NextResponse.json({ error: `bb binary not found at ${bbPath}` }, { status: 500 });
  }

  const tmpDir = mkdtempSync('/tmp/zkpay-prove-');
  try {
    const witnessPath = join(tmpDir, 'witness.gz');
    writeFileSync(witnessPath, Buffer.from(witness, 'base64'));

    // Copy circuit to tmp dir so Next.js file watcher doesn't interfere with bb
    const circuitPath = join(demoProjectRoot, 'public', 'circuit.json');
    const circuitTmpPath = join(tmpDir, 'circuit.json');
    console.log('[zkPay-prove] circuitPath:', circuitPath);
    writeFileSync(circuitTmpPath, readFileSync(circuitPath));

    const outDir = join(tmpDir, 'out');

    // Use fields-only output to avoid bb's binary header getting in the way
    // bb writes proof_fields.json with 456 hex strings and public_inputs_fields.json with 18 hex strings
    execSync(
      `"${bbPath}" prove -s ultra_honk --oracle_hash keccak --honk_recursion 1 --output_format fields -b "${circuitTmpPath}" -w "${witnessPath}" -o "${outDir}"`,
      { timeout: 300_000, stdio: 'pipe' },
    );

    const outFiles = readdirSync(outDir);
    console.log('[zkPay-prove] Output files:', outFiles);

    const proofFieldsFile = outFiles.find(f => f.startsWith('proof_') && f.endsWith('.json'));
    const piFieldsFile = outFiles.find(f => f.startsWith('public_inputs_') && f.endsWith('.json'));
    if (!proofFieldsFile || !piFieldsFile) {
      throw new Error(`Expected proof_fields.json and public_inputs_fields.json, got: ${outFiles.join(', ')}`);
    }

    // Parse JSON array of hex Fr strings → concatenated 32-byte BE field elements
    const fieldsToBytes = (data: string[]): Buffer =>
      Buffer.concat(
        data.map((f: string) => {
          const hex = f.startsWith('0x') ? f.slice(2) : f;
          return Buffer.from(hex.padStart(64, '0'), 'hex');
        })
      );

    const proofFields: string[] = JSON.parse(readFileSync(join(outDir, proofFieldsFile), 'utf8'));
    const piFields: string[] = JSON.parse(readFileSync(join(outDir, piFieldsFile), 'utf8'));

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
