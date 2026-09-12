# QQBot AI 管理平台

一键接入自定义 AI 模型的 QQ 官方机器人管理平台，支持多机器人统一管理、群聊私聊上下文记忆。

## 功能特性

- 支持 QQ 官方机器人一键接入
- 自定义 AI 模型（兼容 OpenAI 格式 API）
- 群聊 + 私聊上下文记忆（群聊中识别多用户，私聊时延续群聊对话）
- 签到、抽奖等互动功能
- 黑白简约管理后台，兼容移动端
- 可视化安装向导，小白也能快速配置

## 环境要求

- Node.js >= 14.0.0
- 宝塔面板 / 1Panel / 任意支持 Node.js 的服务器
- QQ 官方机器人 AppID 和 AppSecret（在 [QQ开放平台](https://q.qq.com/) 申请）

## 快速部署

### 方法一：宝塔面板部署

1. 在宝塔面板安装 Node.js 版本管理器（推荐 Node 16+）
2. 上传项目文件到网站目录（如 `/www/wwwroot/qqbot`）
3. 在项目目录执行 `npm install` 安装依赖
4. 在宝塔面板「软件商店」安装「PM2管理器」
5. 在 PM2 管理器中添加项目：
   - 启动文件：`server.js`
   - 项目目录：项目根目录
   - 运行目录：项目根目录
6. 访问 `http://服务器IP:3000/install.html` 完成安装
7. 在宝塔「网站」中添加反向代理，将域名指向 `127.0.0.1:3000`

### 方法二：命令行部署

```bash
# 解压项目
unzip qqbot-ai-manager.zip
cd qqbot-ai-manager

# 安装依赖
npm install

# 启动（开发测试）
node server.js

# 生产环境推荐使用 PM2
npm install -g pm2
pm2 start server.js --name qqbot
pm2 save
pm2 startup
```

### 方法三：Systemd 服务（推荐）

创建 `/etc/systemd/system/qqbot.service`：

```ini
[Unit]
Description=QQBot AI Management Platform
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=/www/wwwroot/qqbot
ExecStart=/usr/bin/node server.js
Restart=always
RestartSec=5
Environment=NODE_ENV=production
Environment=PORT=3000

[Install]
WantedBy=multi-user.target
```

然后：
```bash
systemctl daemon-reload
systemctl enable qqbot
systemctl start qqbot
```

## 安装向导

首次访问 `http://你的IP:3000/` 会自动跳转到安装页面：

1. **欢迎页**：查看功能介绍
2. **基础配置**：设置管理员密码、服务端口
3. **完成安装**：可选设置默认系统提示词
4. 安装完成后使用 `admin` + 你设置的密码登录后台

## 后台使用

### 添加机器人

1. 登录后台，点击「添加机器人」
2. 填写机器人信息：
   - 名称：自定义名称
   - AppID：QQ开放平台获取
   - AppSecret：QQ开放平台获取
   - API地址：你的AI模型API地址（如 `https://aapi.aozio.cn/api/relay.php`）
   - API Key：你的AI模型密钥
   - 模型名称：如 `DeepSeek-R1-Distill-Qwen-14B`
   - 系统提示词：可选，不填使用默认
3. 保存后机器人自动连接

### 聊天记录

- 后台可查看所有用户的聊天记录
- 群聊记录按群分组，私聊记录按用户分组
- 支持查看对话详情

## 配置说明

### 数据目录

所有数据存储在 `data/` 目录：
- `config.json`：系统配置（管理员密码、端口等）
- `bots.json`：机器人配置列表
- `default-prompt.txt`：默认系统提示词
- `sessions/`：登录会话
- `checkins.json`：签到数据

### 聊天记录目录

`chat history/` 目录：
- `用户/`：按用户 openid 存储的个人聊天记录（群聊+私聊共享）
- `群聊上下文/`：按群存储的群聊所有用户对话
- `群聊/`：旧版群聊记录（兼容）

## 常见问题

**Q: 安装后忘记管理员密码怎么办？**
A: 删除 `data/config.json`，重新访问安装页面即可重新配置。

**Q: 机器人连接失败？**
A: 检查 AppID/AppSecret 是否正确，确认机器人已在 QQ 开放平台发布上线，检查服务器网络是否能访问 QQ 接口。

**Q: 如何绑定域名？**
A: 在宝塔/面板中添加反向代理，将域名指向 `127.0.0.1:3000`，同时在 QQ 开放平台配置回调地址。

**Q: AI 模型回复很慢？**
A: 检查上游 API 的响应速度，可在后台更换更快的模型或 API 地址。

**Q: 如何更新版本？**
A: 备份 `data/` 和 `chat history/` 目录，替换项目文件后重启服务即可，数据不会丢失。

## 技术栈

- 后端：Node.js + Express
- 前端：原生 HTML/CSS/JavaScript（黑白简约风格）
- 数据存储：JSON 文件（无需数据库）
- QQ 机器人：官方 WebSocket API

## 许可证

MIT License

## 致谢

感谢所有开源项目的贡献者。
