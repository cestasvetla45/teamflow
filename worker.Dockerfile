FROM node:22-slim
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build:worker
CMD ["node", "dist-worker/worker/discord-worker.js"]
