require('dotenv').config();
const express = require('express');
const cors = require('cors');
const fetch = require('node-fetch');

const app = express();
app.use(cors());
app.use(express.json({ limit: '10mb' }));

const LICENSE_URL = process.env.LICENSE_BACKEND_URL || 'https://pengip.com';
const YUNWU_KEY = process.env.YUNWU_API_KEY;
const YUNWU_URL = process.env.YUNWU_BASE_URL || 'https://yunwu.ai';

// ── 授权中间件：验证 token + 扣积分 ──────────────────────────
function licenseCheck(software, cost) {
  return async (req, res, next) => {
    const token = req.headers.authorization;
    if (!token) return res.status(401).json({ error: '请先登录' });

    try {
      // 查余额
      const balRes = await fetch(`${LICENSE_URL}/api/v1/user/balance`, {
        headers: { Authorization: token }
      });
      if (balRes.status === 401 || balRes.status === 403) {
        return res.status(403).json({ error: 'Token 已过期，请重新登录' });
      }
      const { balance } = await balRes.json();
      if (balance < cost) {
        return res.status(402).json({ error: '积分不足，请充值', balance });
      }

      // 拦截 res.json，成功后扣费
      const origJson = res.json.bind(res);
      res.json = (body) => {
        if (res.statusCode < 400) {
          fetch(`${LICENSE_URL}/api/v1/proxy/use`, {
            method: 'POST',
            headers: { Authorization: token, 'Content-Type': 'application/json' },
            body: JSON.stringify({ software })
          }).catch(() => {});
        }
        return origJson(body);
      };
      next();
    } catch (e) {
      // 授权后端不可达时放行，不影响用户使用
      next();
    }
  };
}

// ── 激活码登录（透传，同 healvision 逻辑） ───────────────────
app.post('/api/license/activate', async (req, res) => {
  try {
    const r = await fetch(`${LICENSE_URL}/api/v1/user/activate`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(req.body)
    });
    res.status(r.status).json(await r.json());
  } catch (e) {
    res.status(500).json({ error: '授权服务器连接失败' });
  }
});

// ── 充值码激活（透传，需 Bearer token） ───────────────────────
app.post('/api/license/recharge', async (req, res) => {
  try {
    const r = await fetch(`${LICENSE_URL}/api/v1/user/recharge`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: req.headers.authorization || ''
      },
      body: JSON.stringify(req.body)
    });
    res.status(r.status).json(await r.json());
  } catch (e) {
    res.status(500).json({ error: '授权服务器连接失败' });
  }
});

// ── 查余额（透传） ────────────────────────────────────────────
app.get('/api/license/balance', async (req, res) => {
  try {
    const r = await fetch(`${LICENSE_URL}/api/v1/user/balance`, {
      headers: { Authorization: req.headers.authorization || '' }
    });
    res.status(r.status).json(await r.json());
  } catch (e) {
    res.status(500).json({ error: '授权服务器连接失败' });
  }
});

// ── 生成图片（扣 10 积分） ────────────────────────────────────
app.post('/api/generate/image', licenseCheck('prevsim_generate_image', 10), async (req, res) => {
  try {
    const r = await fetch(`${YUNWU_URL}/v1beta/models/gemini-3-pro-image-preview:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${YUNWU_KEY}`
      },
      body: JSON.stringify(req.body)
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data.error?.message || '生成失败' });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: '图片生成服务异常' });
  }
});

// ── 生成文字（扣 1 积分） ─────────────────────────────────────
app.post('/api/generate/text', licenseCheck('prevsim_generate_text', 1), async (req, res) => {
  try {
    const r = await fetch(`${YUNWU_URL}/v1beta/models/gemini-2.5-pro:generateContent`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${YUNWU_KEY}`
      },
      body: JSON.stringify(req.body)
    });
    const data = await r.json();
    if (!r.ok) return res.status(r.status).json({ error: data.error?.message || '生成失败' });
    res.json(data);
  } catch (e) {
    res.status(500).json({ error: '文字生成服务异常' });
  }
});

const PORT = process.env.PORT || 3001;
app.listen(PORT, () => console.log(`PreVSim backend running on port ${PORT}`));
