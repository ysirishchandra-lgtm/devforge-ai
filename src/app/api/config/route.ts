import { NextResponse } from 'next/server';
import { getSafeConfigSummary } from '@/lib/config';

export async function GET() {
  const summary = getSafeConfigSummary();
  return NextResponse.json(summary);
}
