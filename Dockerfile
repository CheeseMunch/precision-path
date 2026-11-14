FROM node:22-alpine

WORKDIR /app

# Copy workspace manifests first for optimal Docker layer caching
COPY package.json ./
COPY server/package.json ./server/
COPY client/package.json ./client/

# Install server and client dependencies
RUN npm install --prefix server && npm install --prefix client

# Copy shared types/config, client source, and server source
COPY shared ./shared
COPY client ./client
COPY server ./server

# Build the production React + Vite bundle into /app/client/dist
RUN npm run build --prefix client

WORKDIR /app/server

ENV NODE_ENV=production
ENV PORT=4000

EXPOSE 4000

CMD ["npx", "tsx", "src/server.ts"]
