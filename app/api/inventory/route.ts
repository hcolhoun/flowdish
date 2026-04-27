import { NextResponse } from 'next/server'
import { getInventorySummary } from '@/lib/inventory'

export async function GET() {
  const summary = await getInventorySummary()
  return NextResponse.json(summary)
}