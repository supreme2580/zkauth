import { NextRequest, NextResponse } from 'next/server';

const BACKEND_URL = process.env.PROVER_BACKEND_URL;

export async function POST(req: NextRequest) {
  const { witness } = await req.json();

  if (!witness || typeof witness !== 'string') {
    return NextResponse.json({ error: 'missing witness (base64)' }, { status: 400 });
  }

  if (!BACKEND_URL) {
    return NextResponse.json(
      { error: 'PROVER_BACKEND_URL not configured' },
      { status: 500 },
    );
  }

  const res = await fetch(`${BACKEND_URL}/prove`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({ witness }),
    signal: AbortSignal.timeout(310_000),
  });

  if (!res.ok) {
    const text = await res.text();
    console.error('[zkPay-prove] backend error:', res.status, text);
    return NextResponse.json(
      { error: `prover backend returned ${res.status}` },
      { status: 502 },
    );
  }

  const data = await res.json();
  return NextResponse.json(data);
}
