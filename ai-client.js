// ai-client.js - 通用AI API调用（OpenAI兼容格式）
const https = require('https');
const http = require('http');
const { URL } = require('url');

/**
 * 解析AI回复，提取正文内容，隐藏思考内容
 * 支持多种格式：
 * 1. <think>思考内容</think>正文（Qwen3格式）
 * 2. <thinking>思考内容</thinking>正文
 * 3. reasoning_content字段存思考，content字段存正文（DeepSeek格式）
 * 4. content为null，只有reasoning_content（gpt-oss格式）
 */
function parseAIResponse(message) {
  if (!message) return '';

  let content = message.content || '';
  const reasoning = message.reasoning_content || message.reasoning || '';

  // 如果content是null或空字符串，但有reasoning，返回空（只思考不输出）
  if (!content && reasoning) {
    return '';
  }

  if (!content) return '';

  // 移除<think>...</think>标签及内容（支持大小写、可选空格、自闭合）
  // 格式1: <think>思考内容</think>
  // 格式2: <think ...>思考内容</think>
  // 格式3: <think/>
  content = content.replace(/<think[^>]*>[\s\S]*?<\/think>/gi, '');
  content = content.replace(/<think\s*\/>/gi, '');

  // 移除<thinking>...</thinking>标签及内容
  content = content.replace(/<thinking[^>]*>[\s\S]*?<\/thinking>/gi, '');
  content = content.replace(/<thinking\s*\/>/gi, '');

  // 移除<reasoning>...</reasoning>标签及内容
  content = content.replace(/<reasoning[^>]*>[\s\S]*?<\/reasoning>/gi, '');
  content = content.replace(/<reasoning\s*\/>/gi, '');

  // 移除<analysis>...</analysis>标签及内容（部分模型使用）
  content = content.replace(/<analysis[^>]*>[\s\S]*?<\/analysis>/gi, '');
  content = content.replace(/<analysis\s*\/>/gi, '');

  // 移除<inner_monologue>...</inner_monologue>标签及内容
  content = content.replace(/<inner_monologue[^>]*>[\s\S]*?<\/inner_monologue>/gi, '');

  // 清理开头多余的换行和空格
  content = content.replace(/^\s+/, '');
  // 清理结尾多余的换行和空格
  content = content.replace(/\s+$/, '');

  return content;
}

function callAI(apiUrl, apiKey, model, messages, timeout = 120000) {
  return new Promise((resolve, reject) => {
    const url = new URL(apiUrl);
    const lib = url.protocol === 'https:' ? https : http;

    const postData = JSON.stringify({
      model: model,
      messages: messages,
      temperature: 1.0,
      top_p: 1.0
    });

    const options = {
      hostname: url.hostname,
      port: url.port || (url.protocol === 'https:' ? 443 : 80),
      path: url.pathname + url.search,
      method: 'POST',
      headers: {
        'Content-Type': 'application/json; charset=utf-8',
        'Authorization': `Bearer ${apiKey}`,
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36',
        'Content-Length': Buffer.byteLength(postData)
      },
      timeout: timeout,
      rejectUnauthorized: false
    };

    const req = lib.request(options, (res) => {
      let data = '';
      res.on('data', (chunk) => { data += chunk; });
      res.on('end', () => {
        if (res.statusCode !== 200) {
          reject(new Error(`API HTTP ${res.statusCode}: ${data.substring(0, 200)}`));
          return;
        }
        try {
          const json = JSON.parse(data);
          if (json.choices && json.choices[0] && json.choices[0].message) {
            // 解析AI回复，提取正文，隐藏思考内容
            const reply = parseAIResponse(json.choices[0].message);
            resolve(reply);
          } else if (json.error) {
            reject(new Error(json.error.message || JSON.stringify(json.error)));
          } else {
            reject(new Error('Unexpected API response: ' + data.substring(0, 200)));
          }
        } catch (e) {
          reject(new Error('JSON parse error: ' + e.message));
        }
      });
    });

    req.on('error', (e) => reject(e));
    req.on('timeout', () => { req.destroy(); reject(new Error('API request timeout')); });
    req.write(postData);
    req.end();
  });
}

module.exports = { callAI, parseAIResponse };
