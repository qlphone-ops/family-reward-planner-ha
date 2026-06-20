ARG BUILD_FROM
FROM ${BUILD_FROM}

ENV LANG=C.UTF-8
ENV PORT=8099
ENV PLANNER_DATA_DIR=/data

RUN apk add --no-cache nodejs npm

WORKDIR /app
COPY package.json ./
COPY server.js index.html app.js styles.css ./
COPY assets ./assets
COPY rootfs /

RUN chmod a+x /etc/services.d/family-reward-planner/run

EXPOSE 8099
