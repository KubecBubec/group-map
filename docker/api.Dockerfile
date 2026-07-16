FROM node:22-alpine
WORKDIR /app

COPY package.json package-lock.json ./
COPY api ./api

RUN npm ci \
  && npm run prisma:generate -w api \
  && npm run build -w api

WORKDIR /app/api
ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000
CMD ["sh", "-c", "npx prisma db push && node dist/index.js"]
