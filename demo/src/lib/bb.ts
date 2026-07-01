import { existsSync, mkdirSync, chmodSync } from 'fs';
import { join } from 'path';
import { platform, arch } from 'os';
import { execSync } from 'child_process';

const BB_VERSION = process.env.BB_VERSION || '0.82.2';
const BB_DIR = join(process.cwd(), '.bb');

function getPlatformTag(): string {
  const p = platform();
  const a = arch();
  if (p === 'darwin' && a === 'arm64') return 'arm64-darwin';
  if (p === 'darwin' && a === 'x64') return 'x86_64-darwin';
  if (p === 'linux' && a === 'arm64') return 'arm64-linux';
  if (p === 'linux' && a === 'x64') return 'x86_64-linux';
  throw new Error(`Unsupported platform: ${p} ${a}`);
}

export function getBbPath(): string {
  // Allow explicit override
  if (process.env.BB_PATH) return process.env.BB_PATH;

  const binaryName = platform() === 'win32' ? 'bb.exe' : 'bb';
  return join(BB_DIR, getPlatformTag(), binaryName);
}

export function ensureBb(): string {
  const bbPath = getBbPath();
  if (existsSync(bbPath)) return bbPath;

  const plat = getPlatformTag();
  const url = `https://github.com/AztecProtocol/barretenberg/releases/download/v${BB_VERSION}/bb-${plat}.tar.gz`;
  const destDir = join(BB_DIR, plat);

  console.log(`[bb] downloading v${BB_VERSION} for ${plat}...`);
  mkdirSync(destDir, { recursive: true });

  execSync(`curl -sL "${url}" | tar xz -C "${destDir}"`, {
    stdio: 'pipe',
    timeout: 120_000,
  });

  chmodSync(bbPath, 0o755);
  console.log(`[bb] installed at ${bbPath}`);
  return bbPath;
}
