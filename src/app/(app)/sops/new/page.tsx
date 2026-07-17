'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { SOPEditor, type SOPEditorValue } from '@/components/SOPEditor'

export default function NewSOPPage() {
  const router = useRouter()
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSave(value: SOPEditorValue & { autoSync: boolean }) {
    setSaving(true)
    setError(null)
    try {
      const res = await fetch('/api/sops', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(value),
      })
      if (!res.ok) {
        const data = await res.json().catch(() => ({}))
        throw new Error(data.error ?? 'Failed to create SOP')
      }
      const sop = await res.json()
      router.push(`/sops/${sop.id}`)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create SOP')
    } finally {
      setSaving(false)
    }
  }

  return (
    <div className="flex h-full flex-col p-5">
      <h1 className="mb-4 text-lg font-semibold text-slate-100">Create SOP</h1>
      <SOPEditor
        submitLabel="Create SOP"
        saving={saving}
        error={error}
        onSave={handleSave}
        onCancel={() => router.push('/sops')}
      />
    </div>
  )
}
