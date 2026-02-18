# Use Node.js base image
FROM node:22.22.0-slim AS base

FROM base AS build

# Install system dependencies and Chromium
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/*

# Set Puppeteer to skip downloading Chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Set working directory
WORKDIR /appBuild

COPY package.json ./
COPY package-lock.json ./

# Install dependencies
RUN npm install --legacy-peer-deps

# Copy configuration files first
COPY . .

# Build the application
RUN npm run build

# PROD build
FROM base AS runner

WORKDIR /appRun

# Install system dependencies and Chromium
RUN apt-get update && apt-get install -y \
    chromium \
    fonts-liberation \
    libasound2 \
    libatk-bridge2.0-0 \
    libatk1.0-0 \
    libcups2 \
    libdbus-1-3 \
    libgdk-pixbuf2.0-0 \
    libnspr4 \
    libnss3 \
    libx11-xcb1 \
    libxcomposite1 \
    libxdamage1 \
    libxrandr2 \
    xdg-utils \
    --no-install-recommends && \
    apt-get clean && \
    rm -rf /var/lib/apt/lists/* && \
    groupadd -r appgroup && \
    useradd -r -g appgroup -d /appRun -s /bin/bash appuser && \
    chown -R appuser:appgroup /appRun

# Set Puppeteer to skip downloading Chromium
ENV PUPPETEER_SKIP_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# Copy standalone build output
COPY --chown=appuser:appgroup --from=build /appBuild/.next/standalone/appBuild ./
COPY --chown=appuser:appgroup --from=build /appBuild/.next/static ./.next/static
COPY --chown=appuser:appgroup --from=build /appBuild/public ./public

# Note: Standalone build already includes all necessary dependencies
# No need to install or copy package.json files


# Create necessary directories and set proper ownership
RUN mkdir -p /appRun/file-uploads && \
    chown -R appuser:appgroup /appRun/file-uploads

# Switch to non-root user
USER appuser

# Expose the port the app runs on
EXPOSE 3000

# Set environment variables for server binding
ENV HOSTNAME=0.0.0.0
ENV PORT=3000

# Start the application using standalone server
CMD ["node", "server.js"]