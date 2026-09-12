// server.js - QQ机器人管理平台 Express服务器
const express = require('express');
const path = require('path');
const fs = require('fs');
const crypto = require('crypto');
const { BotManager } = require('./bot-manager');

const app = express();
const PORT = process.env.PORT || 3000;
const DATA_DIR = path.join(__dirname, 'data');
const BOTS_FILE = path.join(DATA_DIR, 'bots.json');
const CONFIG_FILE = path.join(DATA_DIR, 'config.json');

if (!fs.existsSync(DATA_DIR)) fs.mkdirSync(DATA_DIR, { recursive: true });

// ========== 配置管理 ==========
const DEFAULT_CONFIG = {
  adminPassword: '',
  sessionSecret: crypto.randomBytes(32).toString('hex'),
  installed: false,
  port: 3000
};

function loadConfig() {
  if (fs.existsSync(CONFIG_FILE)) {
    try {
      const cfg = JSON.parse(fs.readFileSync(CONFIG_FILE, 'utf-8'));
      // 兼容旧版本：有adminPassword但没有installed标记的，视为已安装
      if (cfg.adminPassword && cfg.installed === undefined) {
        cfg.installed = true;
        fs.writeFileSync(CONFIG_FILE, JSON.stringify(cfg, null, 2));
      }
      return { ...DEFAULT_CONFIG, ...cfg };
    }
    catch (e) {}
  }
  fs.writeFileSync(CONFIG_FILE, JSON.stringify(DEFAULT_CONFIG, null, 2));
  return DEFAULT_CONFIG;
}

const isInstalled = () => config.installed === true;

const config = loadConfig();

function loadBots() {
  if (fs.existsSync(BOTS_FILE)) {
    try { return JSON.parse(fs.readFileSync(BOTS_FILE, 'utf-8')); } catch (e) {}
  }
  return [];
}

function saveBots(bots) {
  fs.writeFileSync(BOTS_FILE, JSON.stringify(bots, null, 2));
}

// ========== 认证 ==========
const tokens = new Set();

function authMiddleware(req, res, next) {
  const token = req.headers['x-auth-token'] || (req.headers.cookie || '').match(/token=([^;]+)/)?.[1] || (req.cookies && req.cookies.token);
  if (token && tokens.has(token)) {
    next();
  } else {
    res.status(401).json({ error: '未登录' });
  }
}

// ========== 机器人管理 ==========
const botManager = new BotManager();
let botsConfig = loadBots();

// 启动时加载所有机器人
for (const botConfig of botsConfig) {
  botManager.addBot(botConfig);
}

// ========== 中间件 ==========
app.use(express.json({ limit: '1mb' }));

// 安装API（无需登录）
app.post('/api/install', (req, res) => {
  if (isInstalled()) {
    return res.status(400).json({ error: '系统已安装，如需重新安装请删除 data/config.json' });
  }
  const { adminPassword, port, defaultPrompt } = req.body;
  if (!adminPassword || adminPassword.length < 6) {
    return res.status(400).json({ error: '管理员密码至少6位' });
  }
  const newConfig = {
    adminPassword: adminPassword,
    sessionSecret: crypto.randomBytes(32).toString('hex'),
    installed: true,
    port: parseInt(port) || 3000
  };
  try {
    fs.writeFileSync(CONFIG_FILE, JSON.stringify(newConfig, null, 2));
    // 写入默认提示词
    if (defaultPrompt && defaultPrompt.trim()) {
      const promptFile = path.join(DATA_DIR, 'default-prompt.txt');
      fs.writeFileSync(promptFile, defaultPrompt.trim());
    }
    res.json({ success: true, port: newConfig.port });
  } catch (e) {
    res.status(500).json({ error: '写入配置失败: ' + e.message });
  }
});

// 未安装时，访问根目录跳转到安装页
app.use((req, res, next) => {
  if (!isInstalled() && req.path === '/') {
    return res.redirect('/install.html');
  }
  next();
});

app.use(express.static(path.join(__dirname, 'public')));

// ========== API路由 ==========

// 登录
app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  if (username === 'admin' && password === config.adminPassword) {
    const token = crypto.randomBytes(32).toString('hex');
    tokens.add(token);
    res.setHeader('Set-Cookie', 'token=' + token + '; Path=/; Max-Age=86400; HttpOnly');
    res.json({ success: true, token });
  } else {
    res.status(401).json({ error: '用户名或密码错误' });
  }
});

// 登出
app.post('/api/logout', authMiddleware, (req, res) => {
  const token = req.headers['x-auth-token'];
  tokens.delete(token);
  res.json({ success: true });
});

// 获取机器人列表
app.get('/api/bots', authMiddleware, (req, res) => {
  const info = botManager.getAllInfo();
  // 合并配置信息
  const result = info.map(i => {
    const cfg = botsConfig.find(b => b.id === i.id) || {};
    return { ...i, apiUrl: cfg.apiUrl, model: cfg.model, systemPrompt: cfg.systemPrompt ? cfg.systemPrompt.substring(0, 100) + '...' : '' };
  });
  res.json({ bots: result });
});

// 获取单个机器人完整配置
app.get('/api/bots/:id', authMiddleware, (req, res) => {
  const cfg = botsConfig.find(b => b.id === req.params.id);
  if (!cfg) return res.status(404).json({ error: '机器人不存在' });
  res.json({ bot: cfg });
});

// 添加机器人
app.post('/api/bots', authMiddleware, (req, res) => {
  const { name, appId, appSecret, systemPrompt, apiUrl, apiKey, model } = req.body;
  if (!name || !appId || !appSecret) {
    return res.status(400).json({ error: '名称、AppID、AppSecret必填' });
  }
  const id = crypto.randomBytes(8).toString('hex');
  const newBot = {
    id, name, appId, appSecret,
    systemPrompt: systemPrompt || '你是一个友好的AI助手。',
    apiUrl: apiUrl || 'https://aapi.aozio.cn/api/relay.php',
    apiKey: apiKey || 'sk-aapi-5d0e4cf82f7e4ac6e887ec8b3b1c4bb0',
    model: model || 'acu/deepseek-v4-flash',
    createdAt: new Date().toISOString()
  };
  botsConfig.push(newBot);
  saveBots(botsConfig);
  botManager.addBot(newBot);
  res.json({ success: true, bot: newBot });
});

// 更新机器人
app.put('/api/bots/:id', authMiddleware, (req, res) => {
  const idx = botsConfig.findIndex(b => b.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '机器人不存在' });
  const updated = { ...botsConfig[idx], ...req.body, id: req.params.id };
  botsConfig[idx] = updated;
  saveBots(botsConfig);
  botManager.updateBot(req.params.id, updated);
  res.json({ success: true, bot: updated });
});

// 删除机器人
app.delete('/api/bots/:id', authMiddleware, (req, res) => {
  const idx = botsConfig.findIndex(b => b.id === req.params.id);
  if (idx === -1) return res.status(404).json({ error: '机器人不存在' });
  botsConfig.splice(idx, 1);
  saveBots(botsConfig);
  botManager.removeBot(req.params.id);
  res.json({ success: true });
});

// 重连机器人
app.post('/api/bots/:id/reconnect', authMiddleware, (req, res) => {
  const bot = botManager.getBot(req.params.id);
  if (!bot) return res.status(404).json({ error: '机器人不存在' });
  bot.disconnect();
  setTimeout(() => bot.connect(), 300);
  res.json({ success: true });
});

// 健康检查
// 聊天记录列表
app.get('/api/bots/:id/chats', authMiddleware, (req, res) => {
  const type = req.query.type || 'private';
  const chats = botManager.listChats(req.params.id, type);
  res.json({ chats });
});

// 聊天记录详情
app.get('/api/bots/:id/chats/:key', authMiddleware, (req, res) => {
  const type = req.query.type || 'private';
  const messages = botManager.getChatDetail(req.params.id, type, req.params.key);
  res.json({ messages });
});

app.get('/api/health', (req, res) => {
  res.json({ status: 'ok', bots: botManager.getAllInfo().length });
});


// ========== 备份与恢复 ==========
const { execSync } = require('child_process');
const os = require('os');

// 下载备份
app.get('/api/backup', authMiddleware, (req, res) => {
  const tmpFile = path.join(os.tmpdir(), 'qqbot_backup_' + Date.now() + '.zip');
  try {
    execSync('cd ' + path.join(__dirname, 'data') + ' && zip -r ' + tmpFile + ' . -x "*.tmp"');
    const stat = fs.statSync(tmpFile);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=qqbot_backup_' + new Date().toISOString().slice(0,10) + '.zip');
    res.setHeader('Content-Length', stat.size);
    const fileStream = fs.createReadStream(tmpFile);
    fileStream.pipe(res);
    fileStream.on('end', () => { try { fs.unlinkSync(tmpFile); } catch(e){} });
  } catch (e) {
    res.status(500).json({ error: '备份失败: ' + e.message });
  }
});

// 恢复备份
app.post('/api/restore', authMiddleware, express.raw({ type: 'application/zip', limit: '100mb' }), (req, res) => {
  const tmpZip = path.join(os.tmpdir(), 'qqbot_restore_' + Date.now() + '.zip');
  const tmpDir = path.join(os.tmpdir(), 'qqbot_restore_' + Date.now());
  try {
    fs.writeFileSync(tmpZip, req.body);
    execSync('mkdir -p ' + tmpDir + ' && unzip -o ' + tmpZip + ' -d ' + tmpDir);
    // 备份当前data
    const dataDir = path.join(__dirname, 'data');
    const backupOld = dataDir + '.bak_' + Date.now();
    execSync('cp -r ' + dataDir + ' ' + backupOld);
    // 清空data并复制恢复
    execSync('rm -rf ' + dataDir + '/*');
    execSync('cp -r ' + tmpDir + '/* ' + dataDir + '/');
    execSync('rm -rf ' + tmpDir + ' ' + tmpZip);
    res.json({ success: true, message: '恢复成功，重启服务后生效' });
  } catch (e) {
    try { fs.unlinkSync(tmpZip); } catch(e2){}
    try { execSync('rm -rf ' + tmpDir); } catch(e2){}
    res.status(500).json({ error: '恢复失败: ' + e.message });
  }
});

// ========== 启动 ==========
const listenPort = config.port || PORT;
app.listen(listenPort, '127.0.0.1', () => {
  console.log(`QQ机器人管理平台已启动: http://127.0.0.1:${listenPort}`);
  if (isInstalled()) {
    console.log(`已加载 ${botsConfig.length} 个机器人`);
  } else {
    console.log(`未安装，请访问 http://127.0.0.1:${listenPort}/install.html 完成安装`);
  }
});
