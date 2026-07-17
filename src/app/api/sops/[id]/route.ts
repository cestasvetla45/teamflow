import { NextRequest, NextResponse } from 'next/server'
import { archiveSOP, getSOP, syncSOPToTelegram, updateSOP } from '@/lib/sops'

export async function GET(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sop = await getSOP(params.id)
    return NextResponse.json(sop)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'SOP not found' }, { status: 404 })
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json()

  try {
    const sop = await updateSOP(params.id, {
      title: body.title,
      content: body.content,
      category: body.category,
      platform: body.platform,
      tags: body.tags,
      changeNote: body.change_note,
      editedBy: body.edited_by ?? null,
    })

    if (body.autoSync) {
      await syncSOPToTelegram(sop.id).catch((err) => console.error('Failed to sync updated SOP to Telegram:', err))
    }

    return NextResponse.json(sop)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to update SOP' }, { status: 500 })
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  try {
    await archiveSOP(params.id)
    return NextResponse.json({ success: true })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to archive SOP' }, { status: 500 })
  }
}
