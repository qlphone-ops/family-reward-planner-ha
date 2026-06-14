ARG BUILD_FROM=ghcr.io/home-assistant/amd64-base:3.21
FROM ${BUILD_FROM}

ENV LANG=C.UTF-8
ENV PORT=8099
ENV PLANNER_DATA_DIR=/data

RUN apk add --no-cache nodejs npm

WORKDIR /app
COPY package.json ./
COPY server.js index.html app.js styles.css ./

EXPOSE 8099
CMD ["node", "/app/server.js"]
