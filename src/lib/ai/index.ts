// Public interface for the TeamFlow AI assistant. All layers (Telegram bot,
// Discord worker, bot-ai.ts compatibility wrappers) code against runAssistant.

import type { TfMember } from '@/types/teamflow'
import { loadConversation, saveConversation } from './memory'
import { buildTeamContext } from './context'
import { getFunctionDeclarations, executeTool, resolveMemberRef } from './tools'
import { runGeminiWithTools, type GeminiContent, type GeminiPart } from './gemini'
import { todayLabel, TEAM_TIMEZONE } from './dates'

export { resolveMemberRef }

export interface AssistantInput {
  text: string
  channel: 'telegram' | 'discord'
  chatKey: string // stable per-conversation key, e.g. `tg:<chat_id>:<thread_id|dm>:<user_id>` or `dc:<channel_id>:<user_id>`
  sender: TfMember | null
  isAdmin: boolean
  fileContent?: string
  imageBase64?: string
  imageMimeType?: string
}

function buildSystemPrompt(input: AssistantInput, contextJson: string): string {
  return `You are TeamFlow Bot, the operational assistant for a social-media management agency. You act immediately using your tools — you never tell people to run a slash command instead of doing the thing yourself. If a request maps to a tool, call it right away; don't ask for confirmation on routine actions.

TIMEZONE: the team operates in ${TEAM_TIMEZONE}. Today is ${todayLabel()}. When a user gives a relative or natural date ("tomorrow", "friday", "in 2h", "next monday 3pm"), pass that phrase straight through as the due_date/date argument — the tools parse it themselves. Don't try to compute the ISO date yourself.

MEMBER REFERENCES: whenever the user writes "@someone" or a bare name to refer to a person (assignee, teammate, etc.), pass that string as-is into the relevant tool argument (assignee_name / member_name) — the tools resolve it against name, Telegram username, and Discord username, case-insensitively. Don't ask which platform they mean.

PERMISSIONS: current sender is ${input.sender?.name ?? 'an unregistered user'} (role: ${input.sender?.role ?? 'n/a'}, admin: ${input.isAdmin}). ${
    input.isAdmin
      ? 'They have access to every tool.'
      : "They only have self-service tools (their own tasks/workload, SOP lookup, vault, VA checklist, reel logging). If they ask for an admin-only action, briefly say only the admin can do that — don't call the tool."
  }

STYLE: be concise and direct — a sentence or a short list, not a report. Sparse emoji, only when it adds clarity (✅ 📌 ⚠️). Never mention internal tool names, JSON, or implementation details to the user.

CONVERSATION HISTORY: the prior turns in this chat are part of your context — use them to answer follow-up questions. If the user says "it", "that task", "the one you just mentioned", or otherwise refers back without naming something explicitly, resolve the reference from the conversation history (e.g. a task title or id you or they mentioned earlier) before asking what they mean. If a message starts with "[Replying to your earlier message: ...]", that quoted text is what the user is replying to — use it the same way.

HANDLING TOOL RESULTS: when a tool returns an empty result (no tasks, no members, no matches), state that concrete fact plainly — e.g. "Sahiboh has no active tasks" or "No tasks are overdue." Never say something vague like "I couldn't retrieve that at the moment" or "something went wrong" when the tool actually succeeded and just found nothing — that phrasing is only for genuine failures, and even then prefer to state the specific reason the tool gave you.

MULTI-PART REQUESTS: when a question has two parts (e.g. "what are X's tasks and are they free today"), call every tool needed to answer both parts in the same turn rather than answering only the first part or asking the user to split their request.

ACTING VS ASKING: prefer acting over asking a clarifying question whenever there's one reasonable interpretation of the request — make the sensible call and go, rather than bouncing the question back to the user. Only ask for clarification when the request is genuinely ambiguous between multiple plausible actions (e.g. two different people could match a name equally well).

TEAM CONTEXT (JSON — members, tasks, teams, boards, skills catalog, SOPs, topic access map, and the sender's own tasks under your_tasks):
${contextJson}`
}

function buildUserParts(input: AssistantInput): GeminiPart[] {
  const parts: GeminiPart[] = []

  if (input.fileContent && !input.imageBase64) {
    parts.push({ text: `${input.text}\n\n--- FILE CONTENT ---\n${input.fileContent}\n--- END FILE CONTENT ---` })
  } else {
    parts.push({ text: input.text || 'What should I do with this?' })
  }

  if (input.imageBase64 && input.imageMimeType) {
    parts.push({ inlineData: { mimeType: input.imageMimeType, data: input.imageBase64 } })
  }

  return parts
}

export async function runAssistant(input: AssistantInput): Promise<string> {
  const [history, context] = await Promise.all([
    loadConversation(input.channel, input.chatKey),
    buildTeamContext(input.sender?.id ?? null),
  ])

  const systemInstruction = buildSystemPrompt(input, JSON.stringify(context))
  const tools = getFunctionDeclarations(input.isAdmin)

  const userTurn: GeminiContent = { role: 'user', parts: buildUserParts(input) }
  const contents: GeminiContent[] = [...history, userTurn]

  const { text, contents: finalContents } = await runGeminiWithTools({
    systemInstruction,
    contents,
    tools,
    executeTool: (name, args) => executeTool(name, args, { isAdmin: input.isAdmin, sender: input.sender }),
  })

  await saveConversation(input.channel, input.chatKey, finalContents)

  return text
}
