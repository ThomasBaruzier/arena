FROM node:22-alpine AS base
WORKDIR /app
COPY package.json .

FROM base AS deps
RUN npm install

FROM base AS production-deps
RUN npm install --omit=dev

FROM base AS builder
COPY --from=deps /app/node_modules ./node_modules
COPY . .
RUN npm run build

FROM base AS development
RUN apk add --no-cache curl
COPY --from=deps /app/node_modules ./node_modules
COPY . .
EXPOSE 3000
CMD ["npm", "run", "dev", "--", "--host", "--port", "3000"]

FROM node:22-alpine AS production
RUN apk add --no-cache curl
WORKDIR /app
USER node
COPY --from=production-deps /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.js ./
COPY --from=builder /app/package.json ./
EXPOSE 3000
CMD ["node", "server.js"]
