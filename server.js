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

// ===== 休眠状态 =====
const SLEEP_STATE_FILE = path.join(__dirname, 'data', 'sleep_state.json');
let sleeping = false;
try { sleeping = !!((JSON.parse(fs.readFileSync(SLEEP_STATE_FILE, 'utf8')) || {}).sleeping); } catch (e) { sleeping = false; }
function saveSleep() { try { fs.writeFileSync(SLEEP_STATE_FILE, JSON.stringify({ sleeping, since: sleeping ? Date.now() : null })); } catch (e) {} }
function isSleepBlocked(req) {
  if (!sleeping) return false;
  const p = req.path, m = req.method;
  if (m === 'GET') return false; // 读操作（含备份）放行
  if (p === '/api/wake' || p === '/api/sleep' || p === '/api/login' || p === '/api/restart') return false; // 唤醒/进入休眠/登录/重启放行
  return true; // 其余写操作休眠时拒绝（恢复备份是 POST，会被拒绝）
}
// 休眠时拦截写操作：设置不可更改，仅可备份（不能恢复备份）
app.use((req, res, next) => {
  if (isSleepBlocked(req)) return res.status(403).json({ error: '系统休眠中，设置不可更改，仅可备份' });
  next();
});

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
    return {
      ...i, apiUrl: cfg.apiUrl, model: cfg.model,
      systemPrompt: cfg.systemPrompt ? cfg.systemPrompt.substring(0, 100) + '...' : '',
      enableConversation: cfg.enableConversation !== false,
      enableQuickCommands: cfg.enableQuickCommands !== false,
      enableBottomCommands: cfg.enableBottomCommands !== false,
      allowKeywordWake: cfg.allowKeywordWake === true,
      aboutContent: cfg.aboutContent || '',
      commands: Object.assign({}, DEFAULT_COMMANDS, cfg.commands || {})
    };
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
const DEFAULT_COMMANDS = {
  '今日运势': true, '签到': true, '抽签': true, '笑话': true, '掷骰子': true,
  '时间': true, '整点报时': true, '关于': true, '清除上下文': true, 'ping': true,
  '入群欢迎': true
};
const DEFAULT_ABOUT =
  '🌸 关于xx 🌸\n我叫xx，是一个xxxxxx~\n生日：20xx年xx月xx日\n最喜欢的事：xxx\n性格：xxx\n很高兴认识你，有什么想聊的都可以跟我说~';
app.post('/api/bots', authMiddleware, (req, res) => {
  const { name, appId, appSecret, systemPrompt, apiUrl, apiKey, model, enableConversation, enableQuickCommands, enableBottomCommands, allowKeywordWake, aboutContent, commands, pingApiUrl, pingApiKey, botOpenidHex, autoReplyMode, autoReplyInterval, enableVisionModel, enableVoiceModel } = req.body;
  if (!name || !appId || !appSecret) {
    return res.status(400).json({ error: '名称、AppID、AppSecret必填' });
  }
  const id = crypto.randomBytes(8).toString('hex');
  const cmds = Object.assign({}, DEFAULT_COMMANDS, commands || {});
  let about = (aboutContent || '').trim();
  // 关于功能开启时，关于内容不可为空，自动填默认模板
  if (cmds['关于'] !== false && !about) about = DEFAULT_ABOUT;
  const newBot = {
    id, name, appId, appSecret,
    systemPrompt: systemPrompt || '你是一个友好的AI助手。',
    apiUrl: apiUrl || 'https://your-api.example.com/v1/chat/completions',
    apiKey: apiKey || '''',
    model: model || 'acu/deepseek-v4-flash',
    enableConversation: enableConversation !== false,
    enableQuickCommands: enableQuickCommands !== false,
    enableBottomCommands: enableBottomCommands !== false,
    allowKeywordWake: allowKeywordWake === true,
    enableVisionModel: enableVisionModel === true,
    enableVoiceModel: enableVoiceModel === true,
    aboutContent: about,
    commands: cmds,
    botOpenidHex: (botOpenidHex || '').trim(),
    pingApiUrl: (pingApiUrl || '').trim(),
    pingApiKey: (pingApiKey || '').trim(),
    autoReplyMode: (autoReplyMode === 'round') ? 'round' : 'interval',
    autoReplyInterval: (parseInt(autoReplyInterval, 10) > 0 ? parseInt(autoReplyInterval, 10) : 5),
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
  const cmds = Object.assign({}, DEFAULT_COMMANDS, updated.commands || {});
  updated.commands = cmds;
  // 关于功能开启时，关于内容不可为空，自动填默认模板
  if (cmds['关于'] !== false && (!updated.aboutContent || !String(updated.aboutContent).trim())) {
    updated.aboutContent = DEFAULT_ABOUT;
  }
  const cmdsChanged = JSON.stringify((botsConfig[idx].commands || {})) !== JSON.stringify(cmds);
  botsConfig[idx] = updated;
  saveBots(botsConfig);
  botManager.updateBot(req.params.id, updated);
  // 指令开关变化时，异步同步 QQ 官方菜单与指令面板（不影响保存响应）
  if (cmdsChanged) botManager.syncBotQQ(req.params.id);
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

// 断开机器人（不自动重连）
app.post('/api/bots/:id/disconnect', authMiddleware, (req, res) => {
  const bot = botManager.getBot(req.params.id);
  if (!bot) return res.status(404).json({ error: '机器人不存在' });
  bot.disconnect();
  res.json({ success: true });
});

// 生成6位随机标识码（后台"自动提取openid"第一步）
app.post('/api/bots/:id/pickopenid', authMiddleware, (req, res) => {
  const bot = botManager.getBot(req.params.id);
  if (!bot) return res.status(404).json({ error: '机器人不存在' });
  bot._pickToken = String(Math.floor(100000 + Math.random() * 900000));
  bot._pickAt = Date.now();
  res.json({ token: bot._pickToken });
});

// 按6位标识码确认并提取 openid（后台"自动提取openid"第二步）：检查机器人接收到的近10条消息
app.post('/api/bots/:id/confirmopenid', authMiddleware, (req, res) => {
  const bot = botManager.getBot(req.params.id);
  if (!bot) return res.status(404).json({ error: '机器人不存在' });
  const token = (req.body || {}).token;
  if (!token) return res.json({ openid: '' });
  const list = (bot.recentMessages || []).filter(m => m.time >= (bot._pickAt || 0) && (m.content || '').indexOf(token) !== -1 && m.atId);
  const hit = list.length ? list[list.length - 1] : null;
  if (hit && hit.atId) bot._pickToken = null; // 验证成功，清除验证码（恢复对该消息的正常处理）
  res.json({ openid: hit ? hit.atId : '' });
});

// 取消"自动提取openid"（清除验证码，恢复对匹配消息的正常处理）
app.post('/api/bots/:id/cancelopenid', authMiddleware, (req, res) => {
  const bot = botManager.getBot(req.params.id);
  if (!bot) return res.status(404).json({ error: '机器人不存在' });
  bot._pickToken = null;
  bot._pickAt = 0;
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

// 删除聊天记录
app.delete('/api/bots/:id/chats/:key', authMiddleware, (req, res) => {
  const ok = botManager.deleteChat(req.params.id, req.params.key);
  if (!ok) return res.status(404).json({ error: '聊天记录不存在' });
  res.json({ success: true });
});

app.get('/api/health', (req, res) => {
  const rt = botManager.getRuntime();
  res.json({ status: 'ok', bots: botManager.getAllInfo().length, uptime: rt.uptime, msgCount: rt.msgCount });
});

// 休眠状态查询
app.get('/api/status', authMiddleware, (req, res) => {
  res.json({ sleeping });
});

// 进入休眠：断开所有机器人连接，设置不可更改，仅可备份
app.post('/api/sleep', authMiddleware, (req, res) => {
  sleeping = true; saveSleep(); botManager.sleepAll();
  res.json({ success: true, sleeping: true });
});

// 唤醒：重连所有机器人，恢复可设置
app.post('/api/wake', authMiddleware, (req, res) => {
  sleeping = false; saveSleep(); botManager.wakeAll();
  res.json({ success: true, sleeping: false });
});

// 重启服务（首页"重启"按钮）
app.post('/api/restart', authMiddleware, (req, res) => {
  res.json({ success: true });
  exec('systemctl restart qqbot.service', (err) => { if (err) console.error('重启失败:', err.message); });
});


// ========== 备份与恢复 ==========
const { execSync, exec } = require('child_process');
const os = require('os');

// 下载备份
app.get('/api/backup', authMiddleware, (req, res) => {
  const tmpFile = path.join(os.tmpdir(), 'qqbot_backup_' + Date.now() + '.zip');
  const tmpDir = path.join(os.tmpdir(), 'qqbot_backup_' + Date.now());
  try {
    execSync('rm -rf ' + tmpDir + ' && mkdir -p "' + tmpDir + '/data" "' + tmpDir + '/chat history"');
    execSync('cp -r ' + path.join(__dirname, 'data') + '/. "' + tmpDir + '/data"');
    const chatDir = path.join(__dirname, 'chat history');
    if (fs.existsSync(chatDir)) execSync('cp -r "' + chatDir + '/." "' + tmpDir + '/chat history"');
    execSync('cd ' + tmpDir + ' && zip -r ' + tmpFile + ' . -x "*.tmp"');
    const stat = fs.statSync(tmpFile);
    res.setHeader('Content-Type', 'application/zip');
    res.setHeader('Content-Disposition', 'attachment; filename=qqbot_backup_' + new Date().toISOString().slice(0,10) + '.zip');
    res.setHeader('Content-Length', stat.size);
    const fileStream = fs.createReadStream(tmpFile);
    fileStream.pipe(res);
    fileStream.on('end', () => { try { fs.unlinkSync(tmpFile); execSync('rm -rf ' + tmpDir); } catch(e){} });
  } catch (e) {
    try { execSync('rm -rf ' + tmpDir + ' ' + tmpFile); } catch(e2){}
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
    // 清空data并复制恢复（zip 顶层含 data/ 与 chat history/ 两个目录）
    const srcData = tmpDir + '/data';
    const srcChat = tmpDir + '/chat history';
    execSync('rm -rf ' + dataDir + '/*');
    if (fs.existsSync(srcData)) execSync('cp -r ' + srcData + '/* ' + dataDir + '/');
    else execSync('cp -r ' + tmpDir + '/* ' + dataDir + '/'); // 兼容旧备份
    // 恢复聊天记录到应用目录 chat history（不在 data/ 下）
    const appChatDir = path.join(__dirname, 'chat history');
    if (fs.existsSync(srcChat)) {
      execSync('rm -rf "' + appChatDir + '" && mkdir -p "' + appChatDir + '" && cp -r "' + srcChat + '/." "' + appChatDir + '"');
    }
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
