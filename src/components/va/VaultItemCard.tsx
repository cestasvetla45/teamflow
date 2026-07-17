'use client'

import { useState } from 'react'
import { Check, ChevronDown, Copy, Eye, EyeOff } from 'lucide-react'
import { cn } from '@/lib/utils'
import { VAULT_ITEM_TYPES } from '@/types'
import type { VaultItem } from '@/types'

function CopyButton({ value }: { value: string }) {
  const [copied, setCopied] = useState(false)
  async function copy() {
    await navigator.clipboard.writeText(value)
    setCopied(true)
    setTimeout(() => setCopied(false), 1500)
  }
  return (
    <button onClick={copy} className="shrink-0 text-slate-400 hover:text-slate-200" type="button">
      {copied ? <Check size={14} className="text-emerald-400" /> : <Copy size={14} />}
    </button>
  )
}

function CopyableField({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
        <p className="truncate text-sm text-slate-200">{value}</p>
      </div>
      <CopyButton value={value} />
    </div>
  )
}

function SecretField({ label, value }: { label: string; value: string }) {
  const [visible, setVisible] = useState(false)
  return (
    <div className="flex items-center justify-between gap-2 rounded-lg bg-surface px-3 py-2">
      <div className="min-w-0">
        <p className="text-[11px] uppercase tracking-wide text-slate-500">{label}</p>
        <p className="truncate font-mono text-sm text-slate-200">{visible ? value : '••••••••••'}</p>
      </div>
      <div className="flex shrink-0 items-center gap-2">
        <button
          type="button"
          onClick={() => setVisible((v) => !v)}
          className="text-slate-400 hover:text-slate-200"
        >
          {visible ? <EyeOff size={14} /> : <Eye size={14} />}
        </button>
        <CopyButton value={value} />
      </div>
    </div>
  )
}

export function VaultItemCard({
  item,
  actions,
}: {
  item: VaultItem
  actions?: React.ReactNode
}) {
  const [open, setOpen] = useState(false)
  const typeMeta = VAULT_ITEM_TYPES.find((t) => t.key === item.item_type) ?? VAULT_ITEM_TYPES[0]

  return (
    <div className="rounded-xl border border-border bg-surface-raised p-4">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className="flex w-full items-center justify-between gap-3 text-left"
      >
        <span className="flex items-center gap-2.5">
          <span className="text-lg leading-none">{typeMeta.icon}</span>
          <span>
            <span className="block text-sm font-medium text-slate-100">{item.name}</span>
            <span className="block text-xs text-slate-500">{typeMeta.label}</span>
          </span>
        </span>
        <ChevronDown
          size={16}
          className={cn('shrink-0 text-slate-500 transition-transform', open && 'rotate-180')}
        />
      </button>

      {open && (
        <div className="mt-3 flex flex-col gap-2">
          {item.url && <CopyableField label="URL" value={item.url} />}
          {item.username && <CopyableField label="Username" value={item.username} />}
          {item.password && <SecretField label="Password" value={item.password} />}
          {item.api_key && <SecretField label="API Key" value={item.api_key} />}
          {item.proxy_address && <CopyableField label="Proxy address" value={item.proxy_address} />}
          {item.proxy_port && <CopyableField label="Proxy port" value={item.proxy_port} />}
          {item.proxy_username && (
            <CopyableField label="Proxy username" value={item.proxy_username} />
          )}
          {item.proxy_password && (
            <SecretField label="Proxy password" value={item.proxy_password} />
          )}
          {item.notes && (
            <div className="rounded-lg bg-surface px-3 py-2">
              <p className="text-[11px] uppercase tracking-wide text-slate-500">Notes</p>
              <p className="whitespace-pre-wrap text-sm text-slate-300">{item.notes}</p>
            </div>
          )}
          {actions && <div className="mt-1 flex justify-end gap-2">{actions}</div>}
        </div>
      )}
    </div>
  )
}
