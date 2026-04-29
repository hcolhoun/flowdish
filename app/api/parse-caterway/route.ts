import { NextResponse } from 'next/server'
import { parseCaterway } from '@/lib/parsers/caterway'

export async function POST(req: Request) {
  const body = await req.json()

  const data = parseCaterway(body.text)

  return NextResponse.json(data)
}