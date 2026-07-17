# TASK 10: File Handling, SOP Versioning with Change Announcements, and Team Distribution

## Context
You are working on "TeamFlow" at `/Users/tomimiksa/Desktop/TeamFlow`. Next.js 14 + TypeScript + Supabase + Telegraf. The Telegram bot (@teamfloww_bot) is in a forum group "clout work" (chat_id: -1004437282900) with topics stored in `tf_telegram_topics`.

The bot uses Gemini 2.5 Flash for AI (in `src/lib/bot-ai.ts`). The bot has tools for task management and team management.

Existing:
- `src/lib/bot.ts` — Telegraf bot with commands + @mention middleware
- `src/lib/bot-ai.ts` — Gemini AI with function calling (reassign_task, complete_task, create_team, add_member_to_team, create_member, grant_topic_access)
- `src/lib/sops.ts` — SOP CRUD + Telegram sync
- `src/lib/telegram-topics.ts` — topic management (sendToTopic function)
- `src/lib/topic-access.ts` — access control
- `src/lib/supabase/admin.ts` — Supabase service role client
- `src/app/api/telegram/webhook/route.ts` — webhook handler
- Tables: `tf_sops`, `tf_sop_versions`, `tf_teams`, `tf_member_teams`, `tf_topic_team_access`, `tf_telegram_topics`

The Telegram group has topics:
- general:11, manager_chat:12, notifications:13, twitter:14, reddit:15, instagram:16, tiktok:17, youtube:18, testing:19, sops:20

## What to build

### 1. File download helper
Create `src/lib/telegram-files.ts`:

```typescript
const BOT_TOKEN = process.env.TELEGRAM_BOT_TOKEN!

// Download a file from Telegram by file_id
// Returns the file content as a Buffer and the filename
export async function downloadTelegramFile(fileId: string): Promise<{ buffer: Buffer; fileName: string; mimeType: string }>

// Get the file info (file path on Telegram servers) from a file_id
export async function getTelegramFileInfo(fileId: string): Promise<{ filePath: string; fileSize: number }>

// Download file content from Telegram's file URL
// Telegram file URL: https://api.telegram.org/file/bot{token}/{filePath}
```

Implementation:
1. Call `POST /bot{token}/getFile` with `file_id` to get the `file_path`
2. Download from `https://api.telegram.org/file/bot{token}/{file_path}`
3. Return the buffer + filename + mimeType

### 2. File content extraction
Create `src/lib/file-reader.ts`:

```typescript
// Extract text content from a file based on its MIME type
export async function extractFileContent(
  buffer: Buffer,
  fileName: string,
  mimeType: string
): Promise<string>
```

Supported file types:
- **Text files** (.txt, .md, .json, .csv, .yaml, .xml) — read as UTF-8 string
- **PDF files** (.pdf) — extract text using `pdf-parse` npm package
- **Images** (.png, .jpg, .jpeg, .webp, .gif) — return a special marker so Gemini can process the image directly
- **Word docs** (.docx) — extract text using `mammoth` npm package
- **For unsupported types** — return "Unable to extract text content from this file type."

Install dependencies:
```bash
npm install pdf-parse mammoth
```

### 3. File handling in bot
Update `src/lib/bot.ts`:

Add a handler for `document` and `photo` messages:

```typescript
bot.on(['document', 'photo'], async (ctx) => {
  // Only process in groups when @mentioned or replied to, or in private chat
  // (reuse the same group gating logic from the text middleware)
  
  // Get the file from the message
  const file = ctx.message.document || (ctx.message.photo && ctx.message.photo[ctx.message.photo.length - 1])
  if (!file) return
  
  const caption = ctx.message.caption || ''
  
  await ctx.sendChatAction('typing')
  
  // Download the file
  const { buffer, fileName, mimeType } = await downloadTelegramFile(file.file_id)
  
  // Extract text content
  const content = await extractFileContent(buffer, fileName, mimeType)
  
  // Check if this is an image — if so, send to Gemini vision
  const isImage = mimeType.startsWith('image/')
  
  // Build context for AI
  const sender = await getMemberByTelegramId(supabase, ctx.from.id)
  const admin = isAdminTelegramId(ctx.from.id)
  
  // Send to Gemini with the file content and the user's caption/instructions
  const aiResponse = await generateAIResponseWithFile(
    caption || 'What should I do with this file?',
    content,
    isImage ? buffer.toString('base64') : undefined,
    isImage ? mimeType : undefined,
    { sender, isAdmin: admin }
  )
  
  await reply(ctx, aiResponse)
})
```

### 4. AI file processing tools
Update `src/lib/bot-ai.ts`:

Add new function declarations to the Gemini tools:

```typescript
{
  name: 'create_sop_from_file',
  description: 'Create a new SOP from file content that was just uploaded. Use this when the admin sends a file and says to create an SOP from it, or move it to SOPs.',
  parameters: {
    type: 'object',
    properties: {
      title: { type: 'string', description: 'Title for the SOP' },
      content: { type: 'string', description: 'The full text content of the SOP (extracted from the file)' },
      category: { type: 'string', description: 'Category: general, twitter, reddit, instagram, tiktok, youtube, onboarding, va_guide' },
      platform: { type: 'string', description: 'Platform if applicable: twitter, reddit, instagram, tiktok, youtube, or null' },
      summary: { type: 'string', description: 'A brief summary of what changed vs the previous version (if updating an existing SOP)' },
    },
    required: ['title', 'content'],
  },
},
{
  name: 'distribute_to_team',
  description: 'Distribute a file or message to a specific team. The bot will post a message in the team platform topic (e.g. if team is "IG VAs", posts in the Instagram topic).',
  parameters: {
    type: 'object',
    properties: {
      team_name: { type: 'string', description: 'Name of the team to distribute to' },
      message: { type: 'string', description: 'The message to post in the team topic' },
      file_summary: { type: 'string', description: 'Summary of the file being distributed (if applicable)' },
    },
    required: ['team_name', 'message'],
  },
},
{
  name: 'announce_sop_change',
  description: 'Announce changes to an SOP by comparing the new version with the previous one. Posts an announcement in the relevant platform topic and the SOPs topic.',
  parameters: {
    type: 'object',
    properties: {
      sop_title: { type: 'string', description: 'Title of the SOP that was updated' },
      changes_summary: { type: 'string', description: 'Summary of what changed (new sections, removed sections, modified steps)' },
      platform: { type: 'string', description: 'Platform topic to announce in (twitter, instagram, etc.) or "general" for the general topic' },
    },
    required: ['sop_title', 'changes_summary'],
  },
},
{
  name: 'summarize_file',
  description: 'Summarize the content of a file. Returns a concise summary of the document.',
  parameters: {
    type: 'object',
    properties: {
      summary: { type: 'string', description: 'A concise summary of the file content' },
      key_points: { type: 'string', description: 'Key points from the file (comma-separated or newlines)' },
    },
    required: ['summary'],
  },
},
```

Add the tool execution handlers in `executeTool`:

For `create_sop_from_file`:
1. Check if an SOP with a similar title exists
2. If yes: create a version snapshot of the old one, update it, generate a change diff
3. If no: create a new SOP
4. Sync the SOP to the SOPs Telegram topic
5. If updating an existing SOP, also announce the changes in the relevant platform topic
6. Return confirmation with what was created/updated

For `distribute_to_team`:
1. Find the team in the database
2. Find which platform topic the team has access to
3. Post the message to that topic using `sendToTopic`
4. Return confirmation

For `announce_sop_change`:
1. Post an announcement message in the specified platform topic:
   ```
   📢 SOP Updated: "How to Post on Instagram"
   
   Changes from v1 → v2:
   • Added new section: "Hashtag Strategy"
   • Modified step 3: Now includes reel posting
   • Removed: Old bio optimization section
   
   Full SOP: [📋 SOPs topic]
   ```
2. Also post in the SOPs topic
3. Return confirmation

For `summarize_file`:
- Just return the summary (the AI already generates this, the tool just confirms it)

### 5. File processing AI function
Add to `src/lib/bot-ai.ts`:

```typescript
export async function generateAIResponseWithFile(
  message: string,
  fileContent: string,
  imageBase64?: string,
  imageMimeType?: string,
  opts: { sender: TfMember | null; isAdmin: boolean }
): Promise<string>
```

This function:
1. Builds the team context (same as `generateAIResponse`)
2. If it's an image: sends the image + message to Gemini's vision API
3. If it's text: includes the file content in the prompt context
4. The system prompt should explain: "The user has uploaded a file. The file content is provided. If the user asks to create an SOP from it, use the create_sop_from_file tool. If they ask to distribute it, use distribute_to_team. If they ask to summarize, use summarize_file. If they ask to announce changes, use announce_sop_change."
5. Has all the same tools available as the regular AI handler

### 6. SOP version diff
Update `src/lib/sops.ts`:

```typescript
// Compare two SOP versions and return a summary of changes
export async function generateSOPDiff(
  oldContent: string,
  newContent: string
): Promise<string>
```

Use Gemini to generate a natural language diff:
- What sections were added
- What sections were removed
- What steps were modified
- Summary of the overall change

Prompt: "Compare these two versions of an SOP. Summarize the key changes (additions, removals, modifications) in bullet points. Be concise."

### 7. Auto-distribution based on file type
When the admin sends a file with a caption like "distribute this to IG VAs":
1. Bot downloads and reads the file
2. AI identifies the intent (distribute)
3. AI identifies the target team (IG VAs)
4. AI calls `distribute_to_team` tool
5. Bot posts a formatted message in the Instagram topic with the file summary

When the admin sends a file with a caption like "create an SOP from this":
1. Bot downloads and reads the file
2. AI extracts the SOP content
3. AI calls `create_sop_from_file` tool
4. SOP is created in the database
5. SOP is synced to the SOPs topic
6. Bot confirms: "✅ Created SOP 'How to Post Reels' from your file. It's been posted in the 📋 SOPs topic."

When the admin sends a file that replaces an existing SOP:
1. AI recognizes it matches an existing SOP title
2. AI creates a version snapshot of the old one
3. AI updates the SOP
4. AI generates a change diff
5. AI calls `announce_sop_change` to post the diff in the relevant platform topic
6. Bot confirms with the change summary

### 8. Handle file captions as commands
The bot should understand natural language captions on files:
- "summarize this" → AI summarizes the file
- "create SOP" → AI creates an SOP from the file
- "send to IG team" → AI distributes to the IG VAs team topic
- "update the Instagram posting SOP" → AI finds the existing SOP, updates it, announces changes
- No caption → AI defaults to summarizing the file and asking what to do with it

### 9. Build and verify
```bash
cd /Users/tomimiksa/Desktop/TeamFlow && npm run build
```
Must pass with zero errors.

## Deliverables
- `src/lib/telegram-files.ts` — file download from Telegram
- `src/lib/file-reader.ts` — text extraction from PDF, DOCX, TXT, images
- Updated `src/lib/bot.ts` — document/photo handler
- Updated `src/lib/bot-ai.ts` — file processing AI with new tools (create_sop_from_file, distribute_to_team, announce_sop_change, summarize_file)
- Updated `src/lib/sops.ts` — SOP version diff generation
- `npm run build` passes
- All new tools functional via natural language
