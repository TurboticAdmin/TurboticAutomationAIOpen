# Use Node.js base image
FROM node:22-slim AS base

FROM base AS build

# Set working directory
WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies
RUN npm install

# Copy the rest of the application
COPY . .

# Build the application
RUN npm run build

FROM base AS runner

WORKDIR /app

RUN groupadd -r appgroup && \
    useradd -r -g appgroup -d /app -s /bin/bash appuser && \
    chown -R appuser:appgroup /app

# Copy the built application
COPY --chown=appuser:appgroup --from=build /app/build ./
COPY --chown=appuser:appgroup --from=build /app/package.json ./package.json
COPY --chown=appuser:appgroup --from=build /app/package-lock.json ./package-lock.json
COPY --chown=appuser:appgroup --from=build /app/node_modules ./node_modules

# Switch to non-root user
USER appuser

# Expose the port the app runs on
EXPOSE 3001

# Start the application
CMD ["node", "index.js"]
