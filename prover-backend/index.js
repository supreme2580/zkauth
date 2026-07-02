import express from 'express';
import { execSync } from 'child_process';
import { existsSync, mkdtempSync, writeFileSync, readFileSync, readdirSync, rmSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const PORT = process.env.PORT || 3000;
const BB_PATH = process.env.BB_PATH || join(__dirname, 'bin', 'bb');

const app = express();
app.use(express.json({ limit: '50mb' }));

app.post('/prove', (req, res) => {
  const { witness } = req.body;

  if (!witness || typeof witness !== 'string') {
    return res.status(400).json({ error: 'missing witness (base64)' });
  }

  if (!existsSync(BB_PATH)) {
    return res.status(500).json({ error: `bb binary not found at ${BB_PATH}` });
  }

  const tmpDir = mkdtempSync('/tmp/zkpay-prove-');
  try {
    const witnessPath = join(tmpDir, 'witness.gz');
    writeFileSync(witnessPath, Buffer.from(witness, 'base64'));

    const circuitPath = join(__dirname, 'public', 'circuit.json');
    const circuitTmpPath = join(tmpDir, 'circuit.json');
    writeFileSync(circuitTmpPath, readFileSync(circuitPath));

    const outDir = join(tmpDir, 'out');

    execSync(
      `"${BB_PATH}" prove -s ultra_honk --oracle_hash keccak --honk_recursion 1 --output_format fields -b "${circuitTmpPath}" -w "${witnessPath}" -o "${outDir}"`,
      { timeout: 300_000, stdio: 'pipe' },
    );

    const outFiles = readdirSync(outDir);
    const proofFieldsFile = outFiles.find(f => f.startsWith('proof_') && f.endsWith('.json'));
    const piFieldsFile = outFiles.find(f => f.startsWith('public_inputs_') && f.endsWith('.json'));

    if (!proofFieldsFile || !piFieldsFile) {
      throw new Error(`Expected proof_fields.json and public_inputs_fields.json, got: ${outFiles.join(', ')}`);
    }

    const fieldsToBytes = (data) =>
      Buffer.concat(
        data.map((f) => {
          const hex = f.startsWith('0x') ? f.slice(2) : f;
          return Buffer.from(hex.padStart(64, '0'), 'hex');
        })
      );

    const proofFields = JSON.parse(readFileSync(join(outDir, proofFieldsFile), 'utf8'));
    const piFields = JSON.parse(readFileSync(join(outDir, piFieldsFile), 'utf8'));

    const proof = fieldsToBytes(proofFields);
    const publicInputs = fieldsToBytes(piFields.slice(0, 2));

    res.json({
      proof: proof.toString('base64'),
      publicInputs: publicInputs.toString('base64'),
    });
  } finally {
    rmSync(tmpDir, { recursive: true, force: true });
  }
});

app.get('/health', (_req, res) => {
  res.json({ status: 'ok', bb: existsSync(BB_PATH) });
});

app.listen(PORT, () => {
  console.log(`[prover-backend] listening on port ${PORT}`);
  console.log(`[prover-backend] bb at ${BB_PATH}: ${existsSync(BB_PATH) ? 'found' : 'not found'}`);
});
