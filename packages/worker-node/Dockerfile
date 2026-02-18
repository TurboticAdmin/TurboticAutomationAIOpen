# Use Node.js base image
FROM node:22-slim AS base

FROM base AS build

WORKDIR /app
ENV PATH=/app/node_modules/.bin:$PATH

COPY ./package.json ./package.json
COPY ./package-lock.json ./package-lock.json

RUN npm install

COPY ./ ./

RUN npm run build

RUN rm -Rf src


FROM base AS runner

WORKDIR /app

# Create non-root user and group
RUN groupadd -r appgroup && useradd -r -g appgroup appuser

# Copy the built application
COPY --chown=appuser:appgroup --from=build /app/build ./build
COPY --chown=appuser:appgroup --from=build /app/package.json ./package.json
COPY --chown=appuser:appgroup --from=build /app/package-lock.json ./package-lock.json
COPY --chown=appuser:appgroup --from=build /app/node_modules ./node_modules

# Switch to non-root user
USER appuser

CMD ["node", "./build/index.js"]