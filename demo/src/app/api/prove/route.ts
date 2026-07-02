import { NextRequest, NextResponse } from 'next/server';

export async function POST(_req: NextRequest) {
  return NextResponse.json(
    { error: 'Proving has moved client-side. Use generateProof() from @supreme2580/zkauth directly.' },
    { status: 410 },
  );
}
