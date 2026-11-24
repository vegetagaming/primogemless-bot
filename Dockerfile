FROM node:24-bookworm-slim

RUN apt-get update \
    && apt-get install -y --no-install-recommends ca-certificates fonts-dejavu-core fonts-liberation \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev --ignore-scripts && npm cache clean --force
COPY src ./src
COPY assets ./assets
COPY connect ./connect
COPY exporter ./exporter
COPY ops ./ops
COPY LICENSE THIRD_PARTY_NOTICES.md ./
RUN mkdir -p /data && chown node:node /data

ENV NODE_ENV=production \
    BOT_DATA_DIR=/data \
    BOT_DEPLOYMENT_MODE=hold
USER node:node
STOPSIGNAL SIGTERM
CMD ["node", "--disable-warning=ExperimentalWarning", "ops/cloud-start.mjs"]
