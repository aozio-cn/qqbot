# QQBot AI 管理平台 · Docker 部署

使用 Docker 快速部署 QQBot AI 管理平台，免装 Node.js 环境。

## 环境要求

- 已安装 Docker 与 Docker Compose（`docker compose version` 可用）

## 快速部署

```bash
# 1. 克隆项目（或解压发布包后进入目录）
git clone https://github.com/aozio-cn/qqbot.git
cd qqbot

# 2. 创建运行时数据目录（聊天记录 / 机器人配置会持久化到这里）
mkdir -p data "chat history" public/music_cache

# 3. 构建并启动
docker compose up -d --build

# 4. 查看日志
docker compose logs -f
```

启动后访问 `http://服务器IP:3000/` 会跳转安装向导：

1. **欢迎页**：查看功能介绍
2. **基础配置**：设置管理员密码、服务端口
3. **完成安装**：可选设置默认系统提示词
4. 安装完成后用 `admin` + 你设置的密码登录后台

## 数据持久化

| 主机目录 | 容器目录 | 说明 |
|---|---|---|
| `./data` | `/app/data` | 机器人配置、签到、偏好、记忆 |
| `./chat history` | `/app/chat history` | 聊天记录 |
| `./public/music_cache` | `/app/public/music_cache` | 点歌音频缓存（播后即删） |

> **升级 / 备份**：直接备份主机上的 `data/` 与 `chat history/` 目录即可，容器重建不会丢失数据。

## 常用命令

```bash
# 查看状态
docker compose ps

# 重启
docker compose restart

# 停止
docker compose down

# 更新到新版本：拉取新代码后重新构建
git pull
docker compose up -d --build
```

## 手动构建镜像

不想用 compose 时，可单独构建运行：

```bash
docker build -t qqbot-ai-manager:20261006 .
docker run -d --name qqbot \
  -p 3000:3000 \
  -v "$PWD/data:/app/data" \
  -v "$PWD/chat history:/app/chat history" \
  qqbot-ai-manager:20261006
```
