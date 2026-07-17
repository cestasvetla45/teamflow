import { NextRequest, NextResponse } from 'next/server'
import { createSOP, listSOPs, syncSOPToTelegram } from '@/lib/sops'

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url)

  try {
    const sops = await listSOPs({
      category: searchParams.get('category') ?? undefined,
      platform: searchParams.get('platform') ?? undefined,
      status: searchParams.get('status') ?? undefined,
    })
    return NextResponse.json(sops)
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to list SOPs' }, { status: 500 })
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json()

  if (!body.title || !body.content) {
    return NextResponse.json({ error: 'title and content are required' }, { status: 400 })
  }

  try {
    const sop = await createSOP({
      title: body.title,
      content: body.content,
      category: body.category,
      platform: body.platform ?? null,
      tags: body.tags ?? [],
      createdBy: body.created_by ?? null,
    })

    if (body.autoSync) {
      await syncSOPToTelegram(sop.id).catch((err) => console.error('Failed to sync new SOP to Telegram:', err))
    }

    return NextResponse.json(sop, { status: 201 })
  } catch (err) {
    return NextResponse.json({ error: err instanceof Error ? err.message : 'Failed to create SOP' }, { status: 500 })
  }
}
