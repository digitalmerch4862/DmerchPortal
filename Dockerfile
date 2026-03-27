# Stage 1: Build the Vite frontend
FROM node:20.18.0-slim AS builder

WORKDIR /app

# Install system dependencies (for building native modules like better-sqlite3)
RUN apt-get update && apt-get install -y \
    python3 \
    make \
    g++ \
    && rm -rf /var/lib/apt/lists/*

# Copy package management files
COPY package*.json ./

# Install all dependencies (including devDependencies for build)
RUN npm install

# Copy source code (as defined in .dockerignore)
COPY . .

# Build the project (generates /dist folder)
RUN npm run build


# Stage 2: Production Server
FROM node:20.18.0-slim

WORKDIR /app

# Copy built assets and necessary files for runtime
# We need the 'api/' directory because the server dynamic-imports handlers
COPY --from=builder /app/dist ./dist
COPY --from=builder /app/api ./api
COPY --from=builder /app/package*.json ./
COPY --from=builder /app/server.ts ./
COPY --from=builder /app/tsconfig.json ./

# Install only production dependencies
RUN npm install --omit=dev

# Install 'tsx' to handle TypeScript files in API handlers at runtime
RUN npm install -g tsx

# Default environment variables (can be overridden in docker-compose)
ENV NODE_ENV=production
ENV PORT=8080

# Expose the defined port
EXPOSE 8080

# Run the project
CMD ["tsx", "server.ts"]
