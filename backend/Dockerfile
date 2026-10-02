FROM node:22-bookworm-slim
WORKDIR /app
COPY backend/package*.json ./backend/
COPY shared ./shared
RUN cd backend && npm install
COPY backend ./backend
RUN cd backend && npm run build
ENV NODE_ENV=production
EXPOSE 4000
CMD ["node","backend/dist/backend/src/server.js"]