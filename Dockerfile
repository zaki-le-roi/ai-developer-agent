FROM node:22-bookworm-slim
WORKDIR /app

COPY backend/package.json backend/package-lock.json* ./backend/
COPY shared ./shared
COPY backend ./backend

RUN cd backend && npm install && npm run build && npx playwright install --with-deps chromium

ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000

CMD ["node","backend/dist/backend/src/server.js"]
