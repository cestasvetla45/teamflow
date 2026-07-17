#!/bin/bash
if [ -n "$DISCORD_WORKER" ]; then
  echo "Starting Discord worker..."
  node dist-worker/worker/discord-worker.js
else
  echo "Starting Next.js app..."
  npm run start
fi
