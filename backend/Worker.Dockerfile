FROM node:22-bookworm-slim
WORKDIR /app
COPY backend/package*.json ./backend/
COPY shared ./shared
RUN cd backend && npm install && npm run build && npx playwright install --with-deps chromium
COPY backend ./backend
CMD ["npm","--prefix","backend","run","worker"]