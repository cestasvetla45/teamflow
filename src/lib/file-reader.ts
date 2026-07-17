import { PDFParse } from 'pdf-parse'
import mammoth from 'mammoth'

const TEXT_EXTENSIONS = ['txt', 'md', 'json', 'csv', 'yaml', 'yml', 'xml']

async function extractPdfText(buffer: Buffer): Promise<string> {
  const parser = new PDFParse({ data: buffer })
  try {
    const result = await parser.getText()
    return result.text
  } finally {
    await parser.destroy()
  }
}

export async function extractFileContent(buffer: Buffer, fileName: string, mimeType: string): Promise<string> {
  const ext = fileName.split('.').pop()?.toLowerCase() ?? ''

  if (mimeType.startsWith('image/')) {
    return '[IMAGE_FILE]'
  }

  if (mimeType === 'application/pdf' || ext === 'pdf') {
    return extractPdfText(buffer)
  }

  if (mimeType === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || ext === 'docx') {
    const result = await mammoth.extractRawText({ buffer })
    return result.value
  }

  if (mimeType.startsWith('text/') || TEXT_EXTENSIONS.includes(ext)) {
    return buffer.toString('utf-8')
  }

  return 'Unable to extract text content from this file type.'
}
