# QQBot AI 管理平台 - Docker 镜像
# 构建: docker build -t qqbot-ai-manager:20261006 .
FROM node:18-alpine

WORKDIR /app

# 先装依赖（利用层缓存）
COPY package*.json ./
RUN npm install --production --registry=https://registry.npmjs.org

# 复制程序本体（data/ 等运行时数据通过 volume 挂载，不入镜像）
COPY server.js bot-manager.js ai-client.js ./
COPY public ./public

ENV NODE_ENV=production
ENV PORT=3000

EXPOSE 3000

# 运行时数据挂载点
VOLUME ["/app/data", "/app/chat history"]

CMD ["node", "server.js"]
