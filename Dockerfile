FROM node:20-alpine

WORKDIR /app

# Install deps
COPY package*.json ./
RUN npm ci

# Copy source and build client
COPY . .
RUN npm run build

EXPOSE 3001

CMD ["node", "server/index.js"]
