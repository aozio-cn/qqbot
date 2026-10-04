var token=localStorage.getItem('token');
if(!token){location.href='/login.html';}

// “关于”默认模板（后台输入框默认预填，可自行修改）
var ABOUT_TEMPLATE='🌸 关于xx 🌸\n我叫xx，是一个xxxxxx~\n生日：20xx年xx月xx日\n最喜欢的事：xxx\n性格：xxx\n\n很高兴认识你，有什么想聊的都可以跟我说~';

var SLEEP=false; // 系统休眠状态（休眠时写操作仅备份/唤醒/重启/登录放行）
function api(path,opts){
  opts=opts||{};
  var m=(opts.method||'GET');
  if(SLEEP && m!=='GET'){
    var p=path.split('?')[0];
    if(['/sleep','/wake','/restart','/login'].indexOf(p)===-1){
      showToast('系统休眠中，设置不可更改，仅可备份','error');
      return Promise.resolve({ok:false,d:{error:'系统休眠中，设置不可更改，仅可备份'}});
    }
  }
  return fetch('/api'+path,Object.assign({},opts,{
    headers:Object.assign({'Content-Type':'application/json','X-Auth-Token':token},opts.headers||{})
  })).then(function(r){
    if(r.status===401){localStorage.removeItem('token');location.href='/login.html';throw new Error('未登录');}
    return r.json().then(function(d){return {ok:r.ok,d:d};});
  });
}

function showToast(msg,type){
  type=type||'success';
  var t=document.getElementById('toast');
  t.textContent=msg;t.className='toast '+type+' show';
  setTimeout(function(){t.className='toast';},2500);
}

function esc(s){if(!s)return'';var d=document.createElement('div');d.textContent=s;return d.innerHTML;}

function statusText(s){return {online:'在线',offline:'离线',connecting:'连接中',error:'错误'}[s]||s;}
function statusClass(s){return {online:'badge-success',offline:'badge-secondary',connecting:'badge-warning',error:'badge-danger'}[s]||'badge-secondary';}

function toggleSidebar(){
  var d=document.getElementById('sidebarDrawer');
  var o=document.getElementById('sidebarOverlay');
  if(d.className.indexOf('active')>=0){d.className='sidebar-drawer';o.className='sidebar-overlay';}
  else{d.className='sidebar-drawer active';o.className='sidebar-overlay active';}
}

function showPage(page){
  document.getElementById('page-backup').style.display = (page==='backup') ? '' : 'none';
  document.getElementById('page-bots').style.display=page==='bots'?'block':'none';
  document.getElementById('page-chats').style.display=page==='chats'?'block':'none';
  document.getElementById('page-commands').style.display=page==='commands'?'block':'none';
  document.getElementById('page-msgrecv').style.display=page==='msgrecv'?'block':'none';
  var links=document.querySelectorAll('.sidebar-menu a');
  for(var i=0;i<links.length;i++)links[i].className='';
  toggleSidebar();
  if(page==='chats')loadChatBots();
  if(page==='commands')loadCmdBots();
  if(page==='msgrecv')loadMsgRecvPage();
}

// 对话功能开关：未勾选时隐藏 api/key/模型/提示词，但保留已填内容
function toggleConvFields(){
  var on=document.getElementById('botEnableConversation').checked;
  document.getElementById('botConvFields').style.display=on?'':'none';
}

function fmtMsg(n){
  if(n===null||n===undefined)n=0;
  if(n<1000)return ''+n;
  if(n<10000)return (n/1000).toFixed(1).replace(/\.0$/,'')+'k';
  if(n<1000000)return (n/10000).toFixed(1).replace(/\.0$/,'')+'w';
  if(n<100000000)return (n/1000000).toFixed(1).replace(/\.0$/,'')+'M';
  return (n/100000000).toFixed(1).replace(/\.0$/,'')+'亿';
}
function fmtTime(sec){
  sec=sec||0;
  var d=Math.floor(sec/86400),h=Math.floor(sec%86400/3600),m=Math.floor(sec%3600/60),s=sec%60;
  var r='';
  if(d>0)r+=d+'天 ';
  if(h>0)r+=h+'时 ';
  if(m>0)r+=m+'分 ';
  r+=s+'秒';
  return r;
}
function restartService(){
  if(!window.confirm('要重启吗？重启期间机器人会短暂离线。'))return;
  if(!window.confirm('确认重启？'))return;
  api('/restart',{method:'POST'}).then(function(res){
    if(res.ok){showToast('正在重启，请稍候...');setTimeout(loadBots,9000);}
    else{showToast((res.d&&res.d.error)||'重启失败','error');}
  });
}
function sleepService(){
  if(!window.confirm('确认进入休眠？机器人将断开连接，所有设置不可更改，仅可备份。'))return;
  api('/sleep',{method:'POST'}).then(function(res){
    if(res.ok){SLEEP=true;showToast('已进入休眠');loadBots();}
    else showToast((res.d&&res.d.error)||'休眠失败','error');
  });
}
function wakeService(){
  if(!window.confirm('确认唤醒？机器人将重新连接。'))return;
  api('/wake',{method:'POST'}).then(function(res){
    if(res.ok){SLEEP=false;showToast('已唤醒');loadBots();}
    else showToast((res.d&&res.d.error)||'唤醒失败','error');
  });
}
function loadBots(){
  api('/status').then(function(s){ if(s.ok) SLEEP=!!s.d.sleeping; });
  api('/bots').then(function(res){
    if(!res.ok)return;
    var bots=res.d.bots||[];
    var online=bots.filter(function(b){return b.status==='online';}).length;
    var totalMsg=bots.reduce(function(s,b){return s+(b.msgCount||0);},0);
    api('/health').then(function(h){
      var uptime=(h&&h.ok)?(h.d.uptime||0):0;
      var runMsg=(h&&h.ok)?(h.d.msgCount||0):0;
      document.getElementById('stats').innerHTML=
        '<div style="display:flex;gap:10px;width:100%;margin-bottom:10px;">'+
          '<div class="stat-card"><div class="stat-num">'+bots.length+'</div><div class="stat-label">机器人总数</div></div>'+
          '<div class="stat-card"><div class="stat-num">'+online+'</div><div class="stat-label">在线</div></div>'+
          '<div class="stat-card"><div class="stat-num">'+fmtMsg(totalMsg)+'</div><div class="stat-label">累计消息</div></div>'+
        '</div>'+
        '<div style="display:flex;gap:10px;width:100%;margin-bottom:10px;">'+
          '<div class="stat-card"><div class="stat-num" style="font-size:15px;">'+fmtTime(uptime)+'</div><div class="stat-label">本次运行时间</div></div>'+
          '<div class="stat-card"><div class="stat-num">'+fmtMsg(runMsg)+'</div><div class="stat-label">本次接收消息</div></div>'+
          '<div class="stat-card"><button class="btn btn-warning btn-sm" onclick="restartService()">重启</button><div class="stat-label" style="margin-top:2px;">重启服务</div></div>'+
        '</div>'+
        '<div style="display:flex;gap:10px;width:100%;align-items:center;">'+
          (SLEEP
            ? '<div style="flex:1;padding:10px 12px;background:#fff3cd;border:1px solid #ffc107;border-radius:8px;font-size:12px;color:#856404;">🛌 系统休眠中：机器人已断开，设置不可更改，仅可备份。<button class="btn btn-primary btn-sm" style="margin-left:8px;" onclick="wakeService()">唤醒</button></div>'
            : '<div class="stat-card"><button class="btn btn-outline btn-sm" onclick="sleepService()">休眠</button><div class="stat-label" style="margin-top:2px;">进入休眠（断开机器人，仅可备份）</div></div>')+
        '</div>';
    });
    var list=document.getElementById('botList');
    if(bots.length===0){
      list.innerHTML='<div class="empty"><p>还没有添加机器人</p><button class="btn btn-primary btn-sm" onclick="openAddModal()">添加第一个机器人</button></div>';
      return;
    }
    list.innerHTML='<div class="bot-list">'+bots.map(function(b){
      return '<div class="bot-card">'+
        '<div class="bot-card-header"><div class="bot-card-name">'+esc(b.name)+'</div><span class="badge '+statusClass(b.status)+'">'+statusText(b.status)+'</span></div>'+
        '<div class="bot-card-info">'+
          '<div><span class="label">AppID:</span>'+esc(b.appId)+'</div>'+
          '<div><span class="label">模型:</span>'+esc(b.model||'-')+'</div>'+
          '<div><span class="label">消息:</span>'+(b.msgCount||0)+' 条 / '+(b.sessionCount||0)+' 会话</div>'+
          '<div><span class="label">功能:</span>对话'+(b.enableConversation!==false?'开':'关')+' · 快捷'+(b.enableQuickCommands!==false?'开':'关')+' · 底部'+(b.enableBottomCommands!==false?'开':'关')+' · 关键词唤醒'+(b.allowKeywordWake?'开':'关')+'</div>'+
          (b.errorMsg?'<div style="color:#dc3545;font-size:10px;margin-top:4px;">'+esc(b.errorMsg.substring(0,60))+'</div>':'')+
        '</div>'+
        '<div class="bot-card-actions">'+
          '<button class="btn btn-outline btn-sm" onclick="editBot(\''+b.id+'\')">编辑</button>'+
          '<button class="btn btn-warning btn-sm" onclick="reconnectBot(\''+b.id+'\')">重连</button>'+
          '<button class="btn btn-outline btn-sm" onclick="disconnectBot(\''+b.id+'\')">断开</button>'+
          '<button class="btn btn-danger btn-sm" onclick="deleteBot(\''+b.id+'\',\''+esc(b.name)+'\')">删除</button>'+
        '</div>'+
      '</div>';
    }).join('')+'</div>';
  });
}

function openAddModal(){
  document.getElementById('modalTitle').textContent='添加机器人';
  document.getElementById('botId').value='';
  document.getElementById('botName').value='';
  document.getElementById('botAppId').value='';
  document.getElementById('botAppSecret').value='';
  document.getElementById('botPrompt').value='你是一个友好的AI助手。';
  document.getElementById('botApiUrl').value='https://your-api.example.com/v1/chat/completions';
  document.getElementById('botApiKey').value='sk-aapi-5d0e4cf82f7e4ac6e887ec8b3b1c4bb0';
  document.getElementById('botModel').value='acu/deepseek-v4-flash';
  document.getElementById('botEnableConversation').checked=true;
  document.getElementById('botEnableQuickCommands').checked=true;
  document.getElementById('botEnableBottomCommands').checked=true;
  document.getElementById('botAllowKeywordWake').checked=false;
  document.getElementById('botEnableVisionModel').checked=false;
  document.getElementById('botEnableVoiceModel').checked=false;
  document.getElementById('botAboutContent').value=ABOUT_TEMPLATE;
  document.getElementById('modal').classList.add('active');
  toggleConvFields();
}

function editBot(id){
  api('/bots/'+id).then(function(res){
    if(!res.ok||!res.d.bot)return;
    var b=res.d.bot;
    document.getElementById('modalTitle').textContent='编辑机器人';
    document.getElementById('botId').value=b.id;
    document.getElementById('botName').value=b.name;
    document.getElementById('botAppId').value=b.appId;
    document.getElementById('botAppSecret').value=b.appSecret;
    document.getElementById('botPrompt').value=b.systemPrompt;
    document.getElementById('botApiUrl').value=b.apiUrl;
    document.getElementById('botApiKey').value=b.apiKey;
    document.getElementById('botModel').value=b.model;
    document.getElementById('botEnableConversation').checked=b.enableConversation!==false;
    document.getElementById('botEnableQuickCommands').checked=b.enableQuickCommands!==false;
    document.getElementById('botEnableBottomCommands').checked=b.enableBottomCommands!==false;
    document.getElementById('botAllowKeywordWake').checked=b.allowKeywordWake===true;
    document.getElementById('botEnableVisionModel').checked=b.enableVisionModel===true;
    document.getElementById('botEnableVoiceModel').checked=b.enableVoiceModel===true;
    document.getElementById('botAboutContent').value=b.aboutContent||ABOUT_TEMPLATE;
    document.getElementById('botOpenidHex').value=b.botOpenidHex||'';
    document.getElementById('modal').classList.add('active');
    toggleConvFields();
  });
}

function closeModal(){document.getElementById('modal').classList.remove('active');}

// 后台"自动提取"OpenID：网页内弹窗，服务端生成6位标识码，用户带该标识码去群里@本机器人发送，点确认后检查近10条接收消息提取openid
var _pickId='',_pickToken='';
function pickOpenid(){
  var id=document.getElementById('botId').value;
  if(!id){showToast('请先选择要编辑的机器人','error');return;}
  api('/bots/'+id+'/pickopenid',{method:'POST'}).then(function(res){
    if(!res.ok){showToast(res.d.error||'生成失败','error');return;}
    _pickId=id; _pickToken=res.d.token;
    document.getElementById('pickTokenText').textContent=res.d.token;
    document.getElementById('pickOpenidMask').style.display='flex';
  });
}
function pickOpenidConfirm(){
  api('/bots/'+_pickId+'/confirmopenid',{method:'POST',body:JSON.stringify({token:_pickToken})}).then(function(r){
    if(!r.ok){showToast(r.d.error||'提取失败','error');return;}
    if(!r.d.openid){showToast('未匹配到包含 '+_pickToken+' 的消息，请先在群里 @ 本机器人发送该数字后再试','error');return;}
    document.getElementById('botOpenidHex').value=r.d.openid;
    document.getElementById('pickOpenidMask').style.display='none';
    showToast('已提取 OpenID：'+r.d.openid);
  });
}
function pickOpenidCancel(){
  document.getElementById('pickOpenidMask').style.display='none';
  if(_pickId) api('/bots/'+_pickId+'/cancelopenid',{method:'POST'}).then(function(){}); // 清除验证码，恢复对该消息的正常处理
  _pickId='';_pickToken='';
}

// ===== 指令 / 菜单 管理 =====
var CMD_FEATURES=['今日运势','签到','抽签','笑话','掷骰子','时间','整点报时','关于','清除上下文','ping','入群欢迎'];
var MENU_FEATURES=['今日运势','签到','抽签','笑话','掷骰子','时间','整点报时','关于','清除上下文'];
// 菜单隐藏功能（勾选后不在 /菜单 链接按钮显示，但指令仍可用）
var MENU_HIDE_FEATURES=['今日运势','签到','抽签','笑话','掷骰子','时间','关于','清除上下文','任务列表'];

function loadCmdBots(){
  api('/bots').then(function(res){
    if(!res.ok)return;
    var sel=document.getElementById('cmdBotSelect');
    sel.innerHTML='<option value="">请选择</option>'+res.d.bots.map(function(b){return '<option value="'+b.id+'">'+esc(b.name)+'</option>';}).join('');
    if(sel.value===''){document.getElementById('cmdConfig').innerHTML='<div class="empty"><p>请先选择机器人</p></div>';document.getElementById('cmdMenuPreview').innerHTML='';}
  });
}

function loadCmdConfig(){
  var id=document.getElementById('cmdBotSelect').value;
  var box=document.getElementById('cmdConfig');
  var prev=document.getElementById('cmdMenuPreview');
  if(!id){box.innerHTML='<div class="empty"><p>请先选择机器人</p></div>';prev.innerHTML='';return;}
  api('/bots/'+id).then(function(res){
    if(!res.ok){box.innerHTML='<div class="empty"><p>加载失败</p></div>';return;}
    var b=res.d.bot;
    var cmds=b.commands||{};
    var hide=(b.menuHideCommands||[]);
    // 指令页仅管理具体指令功能
    var html='<div class="form-group"><label>具体指令（未勾选则菜单不显示，且快捷/斜杠指令均不触发）</label><div class="check-group">'+
      CMD_FEATURES.map(function(f){
        var label=(f==='ping')?f+'（菜单和指令均不显示）':(f==='入群欢迎')?f+'（菜单和快捷指令均不显示，新成员进群自动@欢迎，群内@机器人 入群欢迎可管理）':f;
        return '<label class="check-row"><input type="checkbox" class="cmd-feat" data-k="'+f+'"'+(cmds[f]!==false?' checked':'')+'><span>'+label+'</span></label>';
      }).join('')+
      '</div></div>';
    // 菜单隐藏功能（勾选后不在 /菜单 链接按钮显示，但指令仍可用）
    html+='<div class="form-group"><label>菜单隐藏功能（勾选后不在 /菜单 链接按钮显示，指令仍可用）</label><div class="check-group">'+
      MENU_HIDE_FEATURES.map(function(f){
        return '<label class="check-row"><input type="checkbox" class="cmd-hide" data-h="'+f+'"'+(hide.indexOf(f)>=0?' checked':'')+'><span>'+f+'</span></label>';
      }).join('')+
      '</div></div>';
    // Ping 接口配置（可选，留空则 ping 指令不可用）
    html+='<div class="form-group"><label>Ping 接口（可选，留空则 ping 指令不可用）</label>'+
      '<div class="form-row">'+
        '<div class="form-group"><label>接口地址</label><input type="text" id="cmdPingApiUrl" value="'+esc(b.pingApiUrl||'')+'" placeholder="例如：https://your-ping.example.com/api_ping.php"></div>'+
        '<div class="form-group"><label>API 密钥</label><input type="text" id="cmdPingApiKey" value="'+esc(b.pingApiKey||'')+'" placeholder="自建接口时自行设置的密钥"></div>'+
      '</div>'+
      '<div class="cmd-menu-box" style="font-size:11px;color:#666;margin-top:6px;">请求方式：POST 到上方“接口地址”。<br>请求头：Content-Type: application/json；X-API-Key：上方“API 密钥”。<br>请求体：{"target":"要ping的地址"}。<br>返回：{"result":"ping输出文本","success":true/false}；出错时返回 {"error":"错误信息"}。<br>留空时 /ping 指令会提示“接口未配置”，方便自建接口后自行填写。</div>'+
      '</div>';
    box.innerHTML=html;
    var cbs=box.querySelectorAll('input[type=checkbox]');
    for(var i=0;i<cbs.length;i++){cbs[i].addEventListener('change',saveCmdConfig);}
    renderCmdPreview(id);
  });
}

// ===== 消息接收方式 管理 =====
function loadMsgRecvPage(){
  api('/bots').then(function(res){
    if(!res.ok)return;
    var bots=res.d.bots;
    if(!bots.length){document.getElementById('msgRecvConfig').innerHTML='<div class="empty"><p>暂无机器人</p></div>';return;}
    var html='';
    // —— N秒接收一次 ——
    html+='<h3 style="margin:6px 0 8px;font-size:17px;color:#333;">N秒接收一次</h3>';
    html+='<div style="font-size:11px;color:#999;margin-bottom:8px;">本机器人每隔 N 秒批量处理一次收到的群消息（模拟真人隔 N 秒看手机）</div>';
    html+='<div class="check-group">';
    bots.forEach(function(b){
      var isRound=b.autoReplyMode==='round';
      var iv=b.autoReplyInterval||5;
      html+='<label class="check-row" style="display:flex;align-items:center;gap:8px;">'+
        '<input type="radio" name="msgMode_'+b.id+'" value="interval" data-id="'+b.id+'"'+(isRound?'':' checked')+'>'+
        '<span style="min-width:80px;font-weight:600;">'+esc(b.name)+'</span>'+
        '<input type="number" class="mr-interval" data-id="'+b.id+'" min="1" max="3600" value="'+iv+'" style="width:80px;"> 秒'+
        '</label>';
    });
    html+='</div>';
    // —— 机器人轮着间隔N秒接收 ——
    var roundIv=(bots.filter(function(b){return b.autoReplyMode==='round';})[0]||{}).autoReplyInterval||5;
    html+='<h3 style="margin:22px 0 8px;font-size:17px;color:#333;">机器人轮着间隔N秒接收</h3>';
    html+='<div style="font-size:11px;color:#999;margin-bottom:8px;display:flex;align-items:center;gap:4px;flex-wrap:wrap;">轮着统一间隔：<input type="number" id="mrRoundInterval" min="1" max="3600" value="'+roundIv+'" style="width:80px;"> 秒　多个机器人轮着接收，每 N 秒切换一个机器人处理；按权重轮询，同权重按默认顺序</div>';
    html+='<div class="check-group">';
    bots.forEach(function(b){
      var isRound=b.autoReplyMode==='round';
      var w=b.roundWeight||1;
      html+='<label class="check-row" style="display:flex;align-items:center;gap:8px;">'+
        '<input type="radio" name="msgMode_'+b.id+'" value="round" data-id="'+b.id+'"'+(isRound?' checked':'')+'>'+
        '<span style="min-width:80px;font-weight:600;">'+esc(b.name)+'</span>'+
        '<span style="margin-left:6px;">权重</span><input type="number" class="mr-weight" data-id="'+b.id+'" min="1" value="'+w+'" style="width:60px;">'+
        '</label>';
    });
    html+='</div>';
    html+='<button class="btn btn-primary" style="margin-top:16px;" onclick="saveMsgRecvPage()">保存</button>';
    document.getElementById('msgRecvConfig').innerHTML=html;
  });
}

function saveMsgRecvPage(){
  var radios=document.querySelectorAll('#msgRecvConfig input[type=radio]:checked');
  var roundIv=parseInt(document.getElementById('mrRoundInterval').value,10)||5;
  var p=Promise.resolve();
  var saved=0;
  for(var i=0;i<radios.length;i++){
    (function(id,mode){
      var label=document.querySelector('input[name="msgMode_'+id+'"]:checked').closest('label');
      var body={autoReplyMode:mode};
      if(mode==='round'){
        body.autoReplyInterval=roundIv;
        var wEl=label.querySelector('.mr-weight');
        body.roundWeight=parseInt(wEl.value,10)||1;
      }else{
        var iv=label.querySelector('.mr-interval');
        body.autoReplyInterval=parseInt(iv.value,10)||5;
      }
      p=p.then(function(){return api('/bots/'+id,{method:'PUT',body:JSON.stringify(body)});}).then(function(res){
        if(res.ok){saved++;}
      });
    })(radios[i].getAttribute('data-id'),radios[i].value);
  }
  p.then(function(){showToast(saved>0?('保存成功('+saved+' 个机器人)'):'保存失败','');});
}

function saveCmdConfig(){
  var id=document.getElementById('cmdBotSelect').value;
  if(!id)return;
  var data={};
  var cbs=document.getElementById('cmdConfig').querySelectorAll('input[type=checkbox]');
  var hides=[];
  for(var i=0;i<cbs.length;i++){
    var k=cbs[i].getAttribute('data-k');
    if(cbs[i].className==='cmd-total'){data[k]=cbs[i].checked;}
    else if(cbs[i].className==='cmd-feat'){if(!data.commands)data.commands={};data.commands[k]=cbs[i].checked;}
    else if(cbs[i].className==='cmd-hide'&&cbs[i].checked){hides.push(cbs[i].getAttribute('data-h'));}
  }
  data.menuHideCommands=hides;
  var pu=document.getElementById('cmdPingApiUrl');
  var pk=document.getElementById('cmdPingApiKey');
  if(pu){data.pingApiUrl=pu.value.trim();}
  if(pk){data.pingApiKey=pk.value.trim();}
  api('/bots/'+id,{method:'PUT',body:JSON.stringify(data)}).then(function(res){
    if(res.ok){showToast('已保存');renderCmdPreview(id);}
    else{showToast(res.d.error||'保存失败','error');}
  });
}

function renderCmdPreview(id){
  api('/bots/'+id).then(function(res){
    var prev=document.getElementById('cmdMenuPreview');
    if(!res.ok||!res.d.bot){prev.innerHTML='';return;}
    var b=res.d.bot;var cmds=b.commands||{};
    var bottomOn=b.enableBottomCommands!==false;
    var quickOn=b.enableQuickCommands!==false;
    var convOn=b.enableConversation!==false;
    var lines=['—— 指令菜单 ——',''];
    if(bottomOn){
      var en=MENU_FEATURES.filter(function(f){return cmds[f]!==false;});
      if(en.length===0){lines.push('· 暂无可用指令');}
      else{for(var i=0;i<en.length;i+=3){lines.push('· '+en.slice(i,i+3).join(' · '));}}
    }else{lines.push('· 聊天底部指令已关闭（斜杠指令不可用）');}
    if(!quickOn){lines.push('💡 快捷指令已关闭');}
    lines.push(convOn?'💬 对话功能已开启，发消息就能聊天~':'💬 对话功能已关闭');
    lines.push('📌 群聊、私聊和频道的记录无法同步');
    prev.innerHTML='<div class="card"><div class="card-title"><span>菜单预览</span></div><div class="cmd-menu-box">'+esc(lines.join('\n'))+'</div></div>';
  });
}

function saveBot(){
  var id=document.getElementById('botId').value;
  var data={
    name:document.getElementById('botName').value.trim(),
    appId:document.getElementById('botAppId').value.trim(),
    appSecret:document.getElementById('botAppSecret').value.trim(),
    systemPrompt:document.getElementById('botPrompt').value,
    apiUrl:document.getElementById('botApiUrl').value.trim(),
    apiKey:document.getElementById('botApiKey').value.trim(),
    model:document.getElementById('botModel').value.trim(),
    enableConversation:document.getElementById('botEnableConversation').checked,
    enableQuickCommands:document.getElementById('botEnableQuickCommands').checked,
    enableBottomCommands:document.getElementById('botEnableBottomCommands').checked,
    allowKeywordWake:document.getElementById('botAllowKeywordWake').checked,
    enableVisionModel:document.getElementById('botEnableVisionModel').checked,
    enableVoiceModel:document.getElementById('botEnableVoiceModel').checked,
    aboutContent:document.getElementById('botAboutContent').value.trim(),
    botOpenidHex:document.getElementById('botOpenidHex').value.trim()
  };
  if(!data.name||!data.appId||!data.appSecret){showToast('名称、AppID、AppSecret必填','error');return;}
  var url=id?'/bots/'+id:'/bots';
  var method=id?'PUT':'POST';
  api(url,{method:method,body:JSON.stringify(data)}).then(function(res){
    if(res.ok){showToast(id?'修改成功':'添加成功');closeModal();loadBots();}
    else{showToast(res.d.error||'操作失败','error');}
  });
}

function reconnectBot(id){
  api('/bots/'+id+'/reconnect',{method:'POST'}).then(function(res){
    if(res.ok){showToast('正在重连...');setTimeout(loadBots,2000);}
  });
}

function disconnectBot(id){
  api('/bots/'+id+'/disconnect',{method:'POST'}).then(function(res){
    if(res.ok){showToast('已断开连接');loadBots();}
    else{showToast((res.d&&res.d.error)||'断开失败','error');}
  });
}

function deleteBot(id,name){
  if(!confirm('确定删除机器人「'+name+'」吗？此操作不可恢复。'))return;
  api('/bots/'+id,{method:'DELETE'}).then(function(res){
    if(res.ok){showToast('已删除');loadBots();}
  });
}

function doLogout(){
  api('/logout',{method:'POST'}).catch(function(){});
  localStorage.removeItem('token');
  location.href='/login.html';
}

function loadChatBots(){
  api('/bots').then(function(res){
    if(!res.ok)return;
    var sel=document.getElementById('chatBotSelect');
    sel.innerHTML='<option value="">请选择</option>'+res.d.bots.map(function(b){return '<option value="'+b.id+'">'+esc(b.name)+'</option>';}).join('');
  });
}

function loadChatList(){
  var botId=document.getElementById('chatBotSelect').value;
  var type=document.getElementById('chatTypeSelect').value;
  var list=document.getElementById('chatList');
  if(!botId){list.innerHTML='<div class="empty"><p>请先选择机器人</p></div>';return;}
  api('/bots/'+botId+'/chats?type='+type).then(function(res){
    if(!res.ok){list.innerHTML='<div class="empty"><p>'+esc(res.d.error||'加载失败')+'</p></div>';return;}
    var chats=res.d.chats||[];
    if(chats.length===0){list.innerHTML='<div class="empty"><p>暂无聊天记录</p></div>';return;}
    list.innerHTML=chats.map(function(c){
      return '<div class="chat-record-item" onclick="loadChatDetail(\''+botId+'\',\''+type+'\',\''+esc(c.key)+'\',\''+esc(c.name)+'\')" style="cursor:pointer;">'+
        '<div class="chat-record-meta"><span style="font-weight:600;color:#333;">'+esc(c.name)+'</span><span>'+c.count+' 条消息</span></div>'+
        '<div class="chat-record-content" style="color:#888;font-size:11px;">'+esc(c.key)+'</div>'+
      '</div>';
    }).join('');
  });
}

var currentChat=null;
function deleteCurrentChat(){
  if(!currentChat){showToast('没有可删除的聊天记录','error');return;}
  if(!confirm('确定删除这条聊天记录吗？删除后不可恢复。'))return;
  api('/bots/'+currentChat.botId+'/chats/'+encodeURIComponent(currentChat.key)+'?type='+currentChat.type,{method:'DELETE'}).then(function(res){
    if(!res.ok){showToast((res.d&&res.d.error)||'删除失败','error');return;}
    document.getElementById('chatDetailCard').style.display='none';
    loadChatList();
    showToast('聊天记录已删除');
  });
}
function loadChatDetail(botId,type,key,name){
  currentChat={botId:botId,type:type,key:key};
  document.getElementById('chatDetailTitle').textContent=name+' - 对话详情';
  document.getElementById('chatDetailCard').style.display='block';
  api('/bots/'+botId+'/chats/'+encodeURIComponent(key)+'?type='+type).then(function(res){
    var detail=document.getElementById('chatDetail');
    if(!res.ok){detail.innerHTML='<div class="alert alert-error">加载失败</div>';return;}
    var msgs=res.d.messages||[];
    if(msgs.length===0){detail.innerHTML='<div class="empty"><p>暂无消息</p></div>';return;}
    detail.innerHTML=msgs.map(function(m){
      var isOtherBot=(m.role==='user'&&(m.isBot||(m.userName||'').indexOf('other.bot')===0));
      var author=m.role==='assistant'?('机器人·（'+(m.userName||'机器人')+'）'):(isOtherBot?('机器人·'+(m.userName&&m.userName!=='other.bot'?m.userName:'other.bot')):('用户·'+(m.userName||'')));
      var badgeCls=m.role==='assistant'?'badge-success':(isOtherBot?'badge-bot':'badge-info');
      var contentCls=m.role==='assistant'?'assistant':'user';
      return '<div class="chat-record-item">'+
        '<div class="chat-record-meta"><span class="badge '+badgeCls+'">'+author+'</span><span>'+(m.time||'')+'</span></div>'+
        '<div class="chat-record-content '+contentCls+'">'+esc(m.content)+'</div>'+
      '</div>';
    }).join('');
  });
}

document.getElementById('modal').addEventListener('click',function(e){if(e.target.id==='modal')closeModal();});

loadBots();
setInterval(loadBots,15000);


function toggleAppSecret() {
  var input = document.getElementById('botAppSecret');
  var btn = document.getElementById('appSecretEyeBtn');
  if (input.type === 'password') {
    input.type = 'text';
    btn.innerHTML = '🙈';
  } else {
    input.type = 'password';
    btn.innerHTML = '👁️';
  }
}


function downloadBackup(){
  var token = document.cookie.replace(/(?:(?:^|.*;)\s*token\s*\=\s*([^;]*).*$)|^.*$/, "$1");
  // 用fetch带header下载
  fetch('/api/backup')
    .then(r => { if(!r.ok) throw new Error('下载失败'); return r.blob(); })
    .then(b => {
      var url = URL.createObjectURL(b);
      var a = document.createElement('a');
      a.href = url;
      a.download = 'qqbot_backup_' + new Date().toISOString().slice(0,10) + '.zip';
      a.click();
      URL.revokeObjectURL(url);
    }).catch(e => alert(e.message));
}

function restoreBackup(input){
  if(!input.files[0]) return;
  if(!confirm('恢复将覆盖当前所有数据，确定继续？')) return;
  var f = input.files[0];
  var reader = new FileReader();
  reader.onload = function(){
    fetch('/api/restore', {
      method:'POST',
      headers:{'Content-Type':'application/zip'},
      body: new Uint8Array(reader.result)
    }).then(r => r.json()).then(d => {
      alert(d.success ? '恢复成功，3秒后重启服务...' : '失败: ' + (d.error||''));
      if(d.success) setTimeout(function(){ location.reload(); }, 3000);
    }).catch(e => alert('请求失败: ' + e.message));
  };
  reader.readAsArrayBuffer(f);
}
