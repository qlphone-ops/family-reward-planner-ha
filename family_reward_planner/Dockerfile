ARG BUILD_FROM
FROM ${BUILD_FROM}

ENV LANG=C.UTF-8
ENV PORT=8099
ENV PLANNER_DATA_DIR=/data

RUN apk add --no-cache nodejs npm

WORKDIR /app
COPY package.json ./
COPY server.js index.html app.js styles.css ./
COPY run.sh /run.sh

RUN chmod a+x /run.sh

EXPOSE 8099
CMD ["/run.sh"]
