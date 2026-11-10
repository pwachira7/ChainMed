FROM node:22-bookworm-slim

RUN apt-get update \
  && apt-get install -y --no-install-recommends openssl ca-certificates \
  && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci
COPY . .
RUN npm run db:generate && npm run build

ENV NODE_ENV=production
ENV HOST=0.0.0.0
ENV PORT=4000
EXPOSE 4000
CMD ["node", "backend/dist/src/server.js"]
