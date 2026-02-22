// 所有请求走自己的后端，API Key 不暴露给用户
const BASE = import.meta.env.VITE_API_BASE || '/api';

function getAuthHeaders() {
  const token = localStorage.getItem('pengip_token');
  return {
    'Content-Type': 'application/json',
    ...(token ? { Authorization: `Bearer ${token}` } : {})
  };
}

async function handleResponse(res) {
  const data = await res.json();
  if (res.status === 401 || res.status === 403) {
    localStorage.removeItem('pengip_token');
    window.dispatchEvent(new Event('auth:logout'));
    throw new Error('登录已过期，请重新登录');
  }
  if (res.status === 402) throw Object.assign(new Error('积分不足，请充值'), { code: 402, balance: data.balance });
  if (!res.ok) throw new Error(data.error || '请求失败');
  return data;
}

// 静默复用 pengip.com 网页登录态（同域，cookie 自动携带）
export async function autoLogin() {
  try {
    const res = await fetch('/api/v1/user/token');
    if (!res.ok) return null;
    const data = await res.json();
    if (data.token) {
      localStorage.setItem('pengip_token', data.token);
      return data.user;
    }
  } catch {}
  return null;
}

// 激活码登录（同 healvision 逻辑）
export async function activate(code) {
  let deviceId = localStorage.getItem('pengip_device_id');
  if (!deviceId) {
    deviceId = crypto.randomUUID();
    localStorage.setItem('pengip_device_id', deviceId);
  }
  const res = await fetch(`${BASE}/license/activate`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ code, deviceId })
  });
  const data = await handleResponse(res);
  if (data.token) localStorage.setItem('pengip_token', data.token);
  return data;
}

// 充值码激活
export async function recharge(code) {
  const res = await fetch(`${BASE}/license/recharge`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify({ code })
  });
  return handleResponse(res);
}

// 查余额
export async function getBalance() {
  const res = await fetch(`${BASE}/license/balance`, { headers: getAuthHeaders() });
  return handleResponse(res);
}

// 生成图片
export async function generateImageAPI(prompt, referenceImageDataUrl = null, negativePrompt = '') {
  const parts = [{ text: prompt }];
  if (referenceImageDataUrl) {
    const m = referenceImageDataUrl.match(/^data:(.+);base64,(.+)$/);
    if (m) parts.push({ inlineData: { mimeType: m[1], data: m[2] } });
  }
  const payload = {
    contents: [{ role: 'user', parts }],
    generationConfig: { aspectRatio: '3:4', ...(negativePrompt ? { negativePrompt } : {}) }
  };
  const res = await fetch(`${BASE}/generate/image`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload)
  });
  const data = await handleResponse(res);

  // 解析图片（base64 或 URL）
  for (const part of data.candidates?.[0]?.content?.parts || []) {
    const inline = part.inlineData || part.inline_data;
    if (inline?.data) return `data:${inline.mimeType || inline.mime_type || 'image/png'};base64,${inline.data}`;
    if (part.text) { const u = part.text.match(/https?:\/\/[^\s)]+/); if (u) return u[0]; }
  }
  if (data.data?.[0]?.url) return data.data[0].url;
  throw new Error('未能解析生成的图片');
}

// 生成文字（AI 风格多样化）
export async function generateTextAPI(systemPrompt, userPrompt) {
  const payload = {
    systemInstruction: { parts: [{ text: systemPrompt }] },
    contents: [{ role: 'user', parts: [{ text: userPrompt }] }],
    generationConfig: { temperature: 1, topP: 1, maxOutputTokens: 2048 }
  };
  const res = await fetch(`${BASE}/generate/text`, {
    method: 'POST',
    headers: getAuthHeaders(),
    body: JSON.stringify(payload)
  });
  const data = await handleResponse(res);
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('未能获取文字响应');
  return text;
}
