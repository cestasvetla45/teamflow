import { NextRequest, NextResponse } from 'next/server'
import { syncSOPToTelegram } from '@/lib/sops'

export async function POST(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await syncSOPToTelegram(params.id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to sync SOP' }, { status: 500 })
  }
}
