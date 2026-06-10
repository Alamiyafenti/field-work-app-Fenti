FROM node:20-alpine

WORKDIR /app

COPY package.json ./
COPY backend/package.json ./backend/
COPY frontend/package.json ./frontend/

RUN npm install

COPY . .

RUN npm run build

ENV NODE_ENV=production
ENV PORT=3000
ENV DB_PATH=/data/field_work.db

EXPOSE 3000

CMD ["npm", "start"]
