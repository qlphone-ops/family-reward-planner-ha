ARG BUILD_FROM
FROM ${BUILD_FROM}

ENV LANG=C.UTF-8
ENV PORT=8098

RUN apk add --no-cache nodejs

WORKDIR /app
COPY server.js ./
COPY rootfs /

RUN chmod a+x /etc/services.d/family-reward-planner-parent/run

EXPOSE 8098
