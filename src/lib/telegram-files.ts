const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!
const API_BASE = `https://api.telegram.org/bot${BOT_TOKEN}`
const FILE_BASE = `https://api.telegram.org/file/bot${BOT_TOKEN}`

const MIME_TYPES: Record<string, string> = {
  pdf: 'application/pdf',
  docx: 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  doc: 'application/msword',
  txt: 'text/plain',
  md: 'text/markdown',
  json: 'application/json',
  csv: 'text/csv',
  yaml: 'application/x-yaml',
  yml: 'application/x-yaml',
  xml: 'application/xml',
  png: 'image/png',
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  webp: 'image/webp',
  gif: 'image/gif',
}

function guessMimeType(fileName: string): string {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''
  return MIME_TYPES[ext] ?? 'application/octet-stream'
}

export async function getTelegramFileInfo(fileId: string): Promise<{ filePath: string; fileSize: number }> {
  const res = await fetch(`${API_BASE}/getFile`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ file_id: fileId }),
  })
  const data = await res.json()
  if (!data.ok) throw new Error(`Telegram getFile failed: ${data.description ?? 'unknown error'}`)

  return { filePath: data.result.file_path, fileSize: data.result.file_size ?? 0 }
}

export async function downloadTelegramFile(
  fileId: string
): Promise<{ buffer: Buffer; fileName: string; mimeType: string }> {
  const { filePath } = await getTelegramFileInfo(fileId)

  const res = await fetch(`${FILE_BASE}/${filePath}`)
  if (!res.ok) throw new Error(`Failed to download Telegram file: ${res.status}`)

  const arrayBuffer = await res.arrayBuffer()
  const fileName = filePath.split('/').pop() ?? fileId

  return { buffer: Buffer.from(arrayBuffer), fileName, mimeType: guessMimeType(fileName) }
}
