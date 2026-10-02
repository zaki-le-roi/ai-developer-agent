FROM node:22-bookworm-slim
WORKDIR /app
COPY backend/package.json backend/package-lock.json* ./backend/
RUN cd backend && npm install --omit=dev
COPY backend ./backend
COPY shared ./shared
ENV NODE_ENV=production
ENV PORT=4000
EXPOSE 4000
CMD ["node","backend/dist/src/server.js"]
