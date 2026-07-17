# TASK 6: Telegram Bot Group Chat + @mention Support

## Context
You are working on "TeamFlow" at `/Users/tomimiksa/Desktop/TeamFlow`. This is a Next.js 14 (App Router) + TypeScript + Supabase + Telegraf project. The Telegram bot (@teamfloww_bot) is already deployed and working in private chat. Now we need to make it work in GROUP chats where the admin @mentions the bot to trigger it.

## Existing files
- `src/lib/bot.ts` — Telegraf bot instance with all commands
- `src/lib/bot-ai.ts` — Gemini 2.5 Flash conversational AI
- `src/lib/bot-init.ts` — webhook setup
- `src/app/api/telegram/webhook/route.ts` — webhook handler
- `src/lib/supabase/admin.ts` — Supabase service role client
- `src/lib/teamflow-db.ts` — DB utility functions (has `ensureMemberExists`, `getMemberByTelegramId`)
- `src/types/teamflow.ts` — type definitions

The bot token is `8507540015:AAEM-4NH9gcVpB_sbpI9udOzbRKMojNXzFI` (in env var `TELEGRAM_BOT_TOKEN`).
Admin Telegram ID is `5055800282` (in env var `ADMIN_TELEGRAM_ID`).

## What to build

### 1. Group chat @mention handling
Update `src/lib/bot.ts`:

The bot is currently in a group chat. It should ONLY respond when:
1. The message starts with `/command` (standard commands work in groups if bot is admin or privacy mode is off)
2. The message @mentions the bot (contains `@teamfloww_bot`)
3. The message is a reply to the bot's own message

For non-command messages that @mention the bot, route them to the conversational AI (`generateAIResponse`).

**Implementation:**
- Add a middleware that checks if the message is in a group chat
- If group chat: check if bot is @mentioned (message text contains `@teamfloww_bot` or message is a reply to the bot)
- If NOT mentioned in a group: ignore the message silently
- If mentioned: strip the `@teamfloww_bot` from the message text, then process normally (command or AI)
- In private chat: continue to respond to everything (no change)

```typescript
// Middleware: only process group messages when bot is @mentioned
bot.use(async (ctx, next) => {
  // Private chat: always respond
  if (ctx.chat?.type === 'private') {
    return next()
  }
  
  // Group/supergroup: only respond if @mentioned or replied to
  const text = ctx.message?.text || ''
  const isMentioned = text.includes('@teamfloww_bot')
  const isReplyToBot = ctx.message?.reply_to_message?.from?.username === 'teamfloww_bot'
  const isCommand = text.startsWith('/')
  
  if (isMentioned || isReplyToBot || isCommand) {
    // Strip the @mention from the text for processing
    if (ctx.message && 'text' in ctx.message) {
      ctx.message.text = ctx.message.text.replace(/@teamfloww_bot/g, '').trim()
    }
    return next()
  }
  
  // Not mentioned — ignore silently
  return
})
```

### 2. Group-aware command responses
When the bot responds in a group:
- Use `reply_to_message_id` to reply to the original message (so it's clear who the bot is responding to)
- Keep responses shorter in groups (less verbose than private chat)

Update each command handler to use `ctx.reply(message, { reply_to_message_id: ctx.message?.message_id })` when in a group context.

Create a helper:
```typescript
function reply(ctx: Context, text: string) {
  const isInGroup = ctx.chat?.type !== 'private'
  return ctx.reply(text, isInGroup ? { reply_to_message_id: ctx.message?.message_id } : {})
}
```

Use `reply(ctx, ...)` instead of `ctx.reply(...)` in all command handlers.

### 3. Group member auto-registration
When someone sends a message in the group (and the bot is @mentioned), auto-register them as a member if they don't exist:

```typescript
// In the main message handler, before processing:
if (ctx.from && ctx.from.id !== Number(process.env.ADMIN_TELEGRAM_ID)) {
  await ensureMemberExists(supabase, {
    telegram_id: ctx.from.id,
    telegram_username: ctx.from.username,
    name: ctx.from.first_name + (ctx.from.last_name ? ' ' + ctx.from.last_name : ''),
  })
}
```

### 4. Group-specific commands
Add these group-friendly commands:

#### `/mine` — My tasks
Shows the sender's own tasks (looks up member by their telegram_id):
```
📋 Your tasks:

🔄 In Progress (2):
  • "Design landing page" — due Jul 20
  • "Write API docs" — due Jul 22

📌 To Do (1):
  • "Review competitor sites" — no due date

✅ Done this week: 3
```

#### `/myworkload` — My workload
Shows the sender's current workload and capacity.

### 5. Bot setup instructions
Create `src/app/api/telegram/setup/route.ts` (update existing):
- Add a GET endpoint that returns setup instructions for the admin
- Include the steps to add the bot to a group:
  1. Add @teamfloww_bot to the group
  2. Make it an admin (so it can read all messages) OR disable privacy mode
  3. @mention it to use: "@teamfloww_bot who has free time?"

### 6. Privacy mode
The bot needs privacy mode DISABLED to read all messages in a group (so it can detect @mentions). 

Add a setup endpoint that calls the Telegram API to disable privacy mode:
```typescript
// This can't be done via API — it's a BotFather setting
// Instead, document that the admin must run /setprivacy → Disable in @BotFather
```

Just add clear instructions in the /start command response:
```
To use me in a group:
1. Add me to the group
2. In @BotFather, run /setprivacy, select me, choose "Disable"
3. Make me an admin in the group
4. @mention me: "@teamfloww_bot who has free time?"
```

### 7. Build and verify
```bash
cd /Users/tomimiksa/Desktop/TeamFlow && npm run build
```
Must pass with zero errors.

## Deliverables
- Bot responds in group chats when @mentioned
- Bot ignores non-mentioned messages in groups
- Bot replies to the sender's message in groups
- `/mine` and `/myworkload` commands added
- Group members auto-registered
- Build passes
