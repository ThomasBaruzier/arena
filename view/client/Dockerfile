FROM node:22-alpine AS dependencies

WORKDIR /app

COPY package*.json ./
RUN npm ci

FROM dependencies AS builder

COPY . .
RUN npm run build

FROM node:22-alpine AS production-dependencies

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

FROM dependencies AS development

RUN apk add --no-cache curl

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev", "--", "--host", "0.0.0.0", "--port", "3000"]

FROM node:22-alpine AS production

RUN apk add --no-cache curl

WORKDIR /app

COPY --from=production-dependencies /app/node_modules ./node_modules
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/server.js ./server.js
COPY --from=builder /app/package.json ./package.json

USER node

EXPOSE 3000

CMD ["node", "server.js"]
