// Gemini API client implementing the correct multi-turn function-calling protocol.
//
// Protocol (per spec):
// - systemInstruction carries ONLY the system prompt — never duplicated into contents.
// - contents = [...history, {role:'user', parts:[{text}]}].
// - When a response contains functionCall parts: append {role:'model', parts:<verbatim>}
//   to contents, execute each tool, then append a SINGLE {role:'user', parts:[...]} turn
//   with one functionResponse part per call (in call order), then call Gemini again with
//   the full contents. Never inject synthetic "continue" text.
// - Max 6 tool-calling rounds.

const GEMINI_MODEL = 'gemini-2.5-flash'
const GEMINI_API_URL = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_MODEL}:generateContent`
const MAX_TOOL_ROUNDS = 6

export interface GeminiPart {
  text?: string
  functionCall?: { name: string; args: Record<string, unknown> }
  functionResponse?: { name: string; response: Record<string, unknown> }
  inlineData?: { mimeType: string; data: string }
}

export interface GeminiContent {
  role: 'user' | 'model'
  parts: GeminiPart[]
}

export interface FunctionDeclaration {
  name: string
  description: string
  parameters: {
    type: 'object'
    properties: Record<string, { type: string; description?: string; enum?: string[] }>
    required?: string[]
  }
}

export interface GeminiFunctionCall {
  name: string
  args: Record<string, unknown>
}

interface RawGeminiResponse {
  candidates?: { content?: { role?: string; parts?: GeminiPart[] } }[]
}

export const GEMINI_UNCONFIGURED_MESSAGE = "I can't process that right now (GEMINI_API_KEY isn't configured)."

interface CallGeminiResult {
  modelContent: GeminiContent | null
  text: string
  functionCalls: GeminiFunctionCall[]
}

async function callGemini(params: {
  systemInstruction: string
  contents: GeminiContent[]
  tools?: FunctionDeclaration[]
  temperature?: number
  maxOutputTokens?: number
}): Promise<CallGeminiResult> {
  const apiKey = process.env.GEMINI_API_KEY
  if (!apiKey) {
    return { modelContent: null, text: GEMINI_UNCONFIGURED_MESSAGE, functionCalls: [] }
  }

  const body: Record<string, unknown> = {
    contents: params.contents,
    systemInstruction: { parts: [{ text: params.systemInstruction }] },
    generationConfig: {
      temperature: params.temperature ?? 0.4,
      maxOutputTokens: params.maxOutputTokens ?? 2048,
    },
  }
  if (params.tools && params.tools.length > 0) {
    body.tools = [{ functionDeclarations: params.tools }]
  }

  let res: Response
  try {
    res = await fetch(`${GEMINI_API_URL}?key=${apiKey}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(body),
    })
  } catch (err) {
    console.error('Gemini fetch failed:', err)
    return { modelContent: null, text: 'Sorry, I had trouble reaching the AI backend. Try again.', functionCalls: [] }
  }

  if (!res.ok) {
    const errText = await res.text()
    console.error('Gemini API error:', res.status, errText)
    return { modelContent: null, text: 'Sorry, I had trouble processing that. Try again.', functionCalls: [] }
  }

  const data = (await res.json()) as RawGeminiResponse
  const candidate = data.candidates?.[0]
  const parts = candidate?.content?.parts ?? []
  if (parts.length === 0) {
    return { modelContent: null, text: "I'm not sure how to respond to that.", functionCalls: [] }
  }

  const textParts: string[] = []
  const functionCalls: GeminiFunctionCall[] = []
  for (const part of parts) {
    if (part.text) textParts.push(part.text)
    if (part.functionCall) functionCalls.push({ name: part.functionCall.name, args: part.functionCall.args ?? {} })
  }

  return {
    modelContent: { role: 'model', parts },
    text: textParts.join(' ').trim(),
    functionCalls,
  }
}

/**
 * Runs the full function-calling loop: sends `contents`, and whenever Gemini
 * responds with functionCall parts, executes them via `executeTool` and feeds
 * the results back until Gemini stops calling tools (or MAX_TOOL_ROUNDS hits).
 * Returns the final text plus the complete updated `contents` array (for
 * persisting to conversation memory).
 */
export async function runGeminiWithTools(params: {
  systemInstruction: string
  contents: GeminiContent[]
  tools: FunctionDeclaration[]
  executeTool: (name: string, args: Record<string, unknown>) => Promise<string>
  temperature?: number
  maxOutputTokens?: number
}): Promise<{ text: string; contents: GeminiContent[] }> {
  const contents = [...params.contents]

  let result = await callGemini({
    systemInstruction: params.systemInstruction,
    contents,
    tools: params.tools,
    temperature: params.temperature,
    maxOutputTokens: params.maxOutputTokens,
  })

  let rounds = 0
  while (result.functionCalls.length > 0 && rounds < MAX_TOOL_ROUNDS) {
    rounds += 1

    // Append the model's function-call turn verbatim (exact parts Gemini returned).
    if (result.modelContent) contents.push(result.modelContent)

    // Execute every requested call, then append ONE user turn carrying all the
    // functionResponse parts, one per call, in the same order.
    const responseParts: GeminiPart[] = []
    for (const call of result.functionCalls) {
      let toolResult: string
      try {
        toolResult = await params.executeTool(call.name, call.args)
      } catch (err) {
        console.error(`Tool "${call.name}" threw:`, err)
        toolResult = `Tool "${call.name}" failed: ${err instanceof Error ? err.message : String(err)}`
      }
      responseParts.push({ functionResponse: { name: call.name, response: { result: toolResult } } })
    }
    contents.push({ role: 'user', parts: responseParts })

    result = await callGemini({
      systemInstruction: params.systemInstruction,
      contents,
      tools: params.tools,
      temperature: params.temperature,
      maxOutputTokens: params.maxOutputTokens,
    })
  }

  // Record the final model turn so history stays coherent for the next request.
  if (result.modelContent) contents.push(result.modelContent)
  else if (result.text) contents.push({ role: 'model', parts: [{ text: result.text }] })

  return { text: result.text || "I'm not sure how to respond to that.", contents }
}
