const express = require('express');
const fs = require('fs');
const path = require('path');
const crypto = require('crypto');

const app = express();
const PORT = 3000;
const DATA_FILE = path.join(__dirname, 'data', 'users.json');

app.use(express.json());
app.use(express.static(path.join(__dirname)));

// ===== 工具函数 =====
function loadDB() {
  try {
    const raw = fs.readFileSync(DATA_FILE, 'utf-8');
    return JSON.parse(raw);
  } catch {
    return { users: {} };
  }
}

function saveDB(db) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(db, null, 2), 'utf-8');
}

function generateId() {
  return crypto.randomBytes(6).toString('hex');
}

// ===== API: 注册 =====
app.post('/api/auth/register', (req, res) => {
  const { nickname } = req.body;
  if (!nickname || !nickname.trim()) {
    return res.status(400).json({ error: '昵称不能为空' });
  }

  const db = loadDB();
  const userId = generateId();

  db.users[userId] = {
    nickname: nickname.trim(),
    createdAt: Date.now(),
    friendResponses: []
  };

  saveDB(db);
  res.json({ userId, nickname: nickname.trim() });
});

// ===== API: 登录（用 userId） =====
app.post('/api/auth/login', (req, res) => {
  const { userId } = req.body;
  if (!userId) {
    return res.status(400).json({ error: '请提供用户ID' });
  }

  const db = loadDB();
  const user = db.users[userId];
  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }

  res.json({ userId, nickname: user.nickname, createdAt: user.createdAt });
});

// ===== API: 获取号主画像数据（聚合好友答题） =====
app.get('/api/user/:id/profile', (req, res) => {
  const { id } = req.params;
  const db = loadDB();
  const user = db.users[id];

  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }

  const responses = user.friendResponses || [];
  const friendCount = responses.length;

  // 聚合计算平均分数
  let avgScores = null;
  if (friendCount > 0) {
    const totals = {};
    let scoreKeys = [];
    responses.forEach(r => {
      if (r.scores) {
        scoreKeys = Object.keys(r.scores);
        scoreKeys.forEach(k => {
          totals[k] = (totals[k] || 0) + (r.scores[k] || 0);
        });
      }
    });
    avgScores = {};
    scoreKeys.forEach(k => {
      avgScores[k] = Math.round((totals[k] || 0) / friendCount);
    });
  }

  // 收集所有已解锁卡牌
  const collectedCards = new Set();
  responses.forEach(r => {
    if (r.answerMap) {
      Object.entries(r.answerMap).forEach(([qid, ans]) => {
        if (ans && ans.optionId) {
          collectedCards.add(`T${qid}-${ans.optionId}`);
        }
      });
    }
  });

  res.json({
    userId: id,
    nickname: user.nickname,
    friendCount,
    avgScores,
    collectedCards: Array.from(collectedCards),
    responses: responses.map(r => ({
      friendId: r.friendId,
      timestamp: r.timestamp,
      scores: r.scores
    }))
  });
});

// ===== API: 好友提交答题结果 =====
app.post('/api/user/:id/response', (req, res) => {
  const { id } = req.params;
  const { answerMap, scores } = req.body;

  if (!answerMap || Object.keys(answerMap).length === 0) {
    return res.status(400).json({ error: '答题数据为空' });
  }

  const db = loadDB();
  const user = db.users[id];

  if (!user) {
    return res.status(404).json({ error: '号主不存在' });
  }

  const response = {
    friendId: generateId(),
    timestamp: Date.now(),
    answerMap,
    scores: scores || {}
  };

  if (!user.friendResponses) {
    user.friendResponses = [];
  }
  user.friendResponses.push(response);
  saveDB(db);

  res.json({ success: true, friendId: response.friendId });
});

// ===== API: 获取邀请信息 =====
app.get('/api/user/:id/share', (req, res) => {
  const { id } = req.params;
  const db = loadDB();
  const user = db.users[id];

  if (!user) {
    return res.status(404).json({ error: '用户不存在' });
  }

  // 从请求头或查询参数获取主机地址
  const protocol = req.protocol;
  const host = req.get('host');
  const inviteUrl = `${protocol}://${host}/?invite=${id}`;

  res.json({
    userId: id,
    nickname: user.nickname,
    inviteUrl,
    responseCount: (user.friendResponses || []).length
  });
});

// ===== 兜底：SPA 路由回退到 index.html =====
app.use((req, res) => {
  // 排除 API 路径
  if (req.path.startsWith('/api/')) {
    return res.status(404).json({ error: 'Not found' });
  }
  res.sendFile(path.join(__dirname, 'index.html'));
});

app.listen(PORT, () => {
  console.log(`====================================`);
  console.log(`  服务器已启动: http://localhost:${PORT}`);
  console.log(`  局域网访问: http://${getLocalIP()}:${PORT}`);
  console.log(`====================================`);
});

function getLocalIP() {
  const interfaces = require('os').networkInterfaces();
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        return iface.address;
      }
    }
  }
  return 'localhost';
}
