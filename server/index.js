const express = require('express');
const cors = require('cors');
const path = require('path');
const multer = require('multer');
const axios = require('axios');

const app = express();
const PORT = 3000;

app.use(cors());
app.use(express.json());

// ========== 静态文件 ==========
app.use(express.static(path.join(__dirname, '..', 'client')));
app.use('/uploads', express.static(path.join(__dirname, 'uploads')));
app.use('/avatars', express.static(path.join(__dirname, 'avatars')));

// ========== Multer 头像 & 图片 ==========
const storage = multer.diskStorage({
  destination: path.join(__dirname, 'uploads'),
  filename(req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`);
  },
});
const avatarStorage = multer.diskStorage({
  destination: path.join(__dirname, 'avatars'),
  filename(req, file, cb) {
    const ext = path.extname(file.originalname);
    cb(null, `avatar-${Date.now()}${ext}`);
  },
});

const upload = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    cb(null, /\.(jpg|jpeg|png|gif|webp)$/i.test(path.extname(file.originalname)));
  },
});
const uploadAvatar = multer({
  storage: avatarStorage,
  limits: { fileSize: 2 * 1024 * 1024 },
  fileFilter(req, file, cb) {
    cb(null, /\.(jpg|jpeg|png)$/i.test(path.extname(file.originalname)));
  },
});

// ========== 工具函数 ==========
function generateToken() {
  return Math.random().toString(36).substring(2) + Date.now().toString(36);
}
function getUserByToken(req) {
  const auth = req.headers.authorization;
  if (!auth || !auth.startsWith('Bearer ')) return null;
  const userId = tokens[auth.slice(7)];
  return userId ? users.find((u) => u.id === userId) || null : null;
}
function addNotification(type, fromUser, toUser, postId, postContent, commentContent) {
  if (fromUser === toUser) return;
  notifications.push({
    id: nextNotifId++, type, fromUser, toUser, postId,
    postContent: postContent.slice(0, 50),
    commentContent: commentContent || null,
    read: false, createdAt: new Date().toISOString(),
  });
}

// ========== 内存数据 ==========
let nextId = 4, nextCommentId = 4, nextUserId = 1, nextNotifId = 1;
const users = [], tokens = {}, notifications = [];

const posts = [
  { id: 1, content: '欢迎来到微博平台！这是第一条示例微博，大家可以在这里畅所欲言～', image: null, username: '系统用户', likes: 12, likedBy: [], createdAt: new Date(Date.now() - 3600000).toISOString(), comments: [
    { id: 1, content: '沙发！欢迎欢迎～', username: '热心网友', createdAt: new Date(Date.now() - 1800000).toISOString() },
    { id: 2, content: '终于等到你！', username: '微博新人', createdAt: new Date(Date.now() - 900000).toISOString() },
  ]},
  { id: 2, content: '今天天气真好，适合出去走走。#好天气 #心情', image: null, username: '系统用户', likes: 8, likedBy: [], createdAt: new Date(Date.now() - 7200000).toISOString(), comments: [
    { id: 3, content: '心情超好！刚跑完步回来～', username: '运动达人', createdAt: new Date(Date.now() - 3600000).toISOString() },
  ]},
  { id: 3, content: '刚看完一本好书，推荐给大家——《活着》。#读书 #好书推荐', image: null, username: '读书人', likes: 25, likedBy: [], createdAt: new Date(Date.now() - 10800000).toISOString(), comments: [] },
];

function formatPosts(list, username) {
  return list.map((p) => ({ ...p, liked: username ? p.likedBy.includes(username) : false }));
}

// ========== 百度热搜缓存 ==========
let newsCache = { data: [], time: 0 };

async function fetchBaiduHotSearch() {
  if (Date.now() - newsCache.time < 600000) return newsCache.data; // 10分钟缓存
  try {
    const { data } = await axios.get('https://top.baidu.com/board?tab=realtime', {
      headers: { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36' },
      timeout: 8000,
    });
    // 解析 HTML 提取热搜
    const items = [];
    const regex = /<div class="c-single-text-ellipsis">([^<]+)<\/div>[\s\S]*?<div class="hot-index[^"]*">(\d+)<\/div>/g;
    let match;
    while ((match = regex.exec(data)) !== null) {
      items.push({ word: match[1].trim(), hot: parseInt(match[2]) || 0 });
      if (items.length >= 20) break;
    }
    // 如果解析失败，使用备用数据
    if (items.length === 0) {
      items.push(
        { word: '今日天气', hot: 4892034 },
        { word: '微博新版上线', hot: 3829102 },
        { word: 'AI改变生活', hot: 2981034 },
        { word: '高考倒计时', hot: 2567890 },
        { word: '夏日美食推荐', hot: 2123456 },
        { word: '热门电影讨论', hot: 1890234 },
        { word: '科技前沿资讯', hot: 1654321 },
        { word: '周末去哪儿玩', hot: 1432109 },
        { word: '读书分享', hot: 1287654 },
        { word: '新歌推荐', hot: 1102938 },
      );
    }
    newsCache = { data: items, time: Date.now() };
    return items;
  } catch (err) {
    if (newsCache.data.length > 0) return newsCache.data;
    // 首次失败返回空数组
    return [];
  }
}

// ========== 认证 API ==========
app.post('/api/register', (req, res) => {
  const { username, password } = req.body;
  if (!username || !username.trim()) return res.status(400).json({ code: 400, message: '用户名不能为空' });
  if (username.trim().length < 2 || username.trim().length > 12) return res.status(400).json({ code: 400, message: '用户名需 2-12 个字符' });
  if (!password || password.length < 6) return res.status(400).json({ code: 400, message: '密码不能少于 6 位' });
  if (users.find((u) => u.username === username.trim())) return res.status(400).json({ code: 400, message: '用户名已存在' });

  const user = { id: nextUserId++, username: username.trim(), nickname: username.trim(), bio: '', avatar: null, password, followers: [], following: [] };
  users.push(user);
  const token = generateToken();
  tokens[token] = user.id;
  res.status(201).json({ code: 201, data: { id: user.id, username: user.username, nickname: user.nickname, token }, message: '注册成功' });
});

app.post('/api/login', (req, res) => {
  const { username, password } = req.body;
  const user = users.find((u) => u.username === username && u.password === password);
  if (!user) return res.status(401).json({ code: 401, message: '用户名或密码错误' });
  const token = generateToken();
  tokens[token] = user.id;
  res.json({ code: 200, data: { id: user.id, username: user.username, nickname: user.nickname, bio: user.bio, avatar: user.avatar, token }, message: '登录成功' });
});

app.get('/api/user', (req, res) => {
  const user = getUserByToken(req);
  if (!user) return res.status(401).json({ code: 401, message: '未登录' });
  res.json({ code: 200, data: { id: user.id, username: user.username, nickname: user.nickname, bio: user.bio, avatar: user.avatar } });
});

app.put('/api/user/profile', (req, res) => {
  const user = getUserByToken(req);
  if (!user) return res.status(401).json({ code: 401, message: '请先登录' });
  const { nickname, bio } = req.body;
  if (nickname !== undefined) {
    if (!nickname.trim() || nickname.trim().length < 2 || nickname.trim().length > 12) return res.status(400).json({ code: 400, message: '昵称需 2-12 个字符' });
    user.nickname = nickname.trim();
  }
  if (bio !== undefined) {
    if (bio.length > 100) return res.status(400).json({ code: 400, message: '简介不能超过 100 字' });
    user.bio = bio;
  }
  res.json({ code: 200, data: { id: user.id, username: user.username, nickname: user.nickname, bio: user.bio, avatar: user.avatar }, message: '资料已更新' });
});

app.post('/api/user/avatar', uploadAvatar.single('avatar'), (req, res) => {
  const user = getUserByToken(req);
  if (!user) return res.status(401).json({ code: 401, message: '请先登录' });
  if (!req.file) return res.status(400).json({ code: 400, message: '请选择图片' });
  user.avatar = `/avatars/${req.file.filename}`;
  res.json({ code: 200, data: { avatar: user.avatar }, message: '头像已更新' });
});

// ========== 用户主页 API ==========
app.get('/api/users/:username', (req, res) => {
  const user = users.find((u) => u.username === req.params.username);
  if (!user) return res.status(404).json({ code: 404, message: '用户不存在' });

  const currentUser = getUserByToken(req);
  const userPosts = posts
    .filter((p) => p.username === user.username)
    .sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  res.json({
    code: 200,
    data: {
      username: user.username,
      nickname: user.nickname,
      bio: user.bio,
      avatar: user.avatar,
      followersCount: user.followers.length,
      followingCount: user.following.length,
      isFollowed: currentUser ? user.followers.includes(currentUser.username) : false,
      posts: formatPosts(userPosts, currentUser?.username),
    },
  });
});

// 关注用户
app.post('/api/users/:username/follow', (req, res) => {
  const currentUser = getUserByToken(req);
  if (!currentUser) return res.status(401).json({ code: 401, message: '请先登录' });
  const targetUser = users.find((u) => u.username === req.params.username);
  if (!targetUser) return res.status(404).json({ code: 404, message: '用户不存在' });
  if (targetUser.username === currentUser.username) return res.status(400).json({ code: 400, message: '不能关注自己' });

  if (targetUser.followers.includes(currentUser.username)) {
    return res.status(400).json({ code: 400, message: '已关注' });
  }

  targetUser.followers.push(currentUser.username);
  currentUser.following.push(targetUser.username);
  res.json({ code: 200, message: '关注成功', data: { followersCount: targetUser.followers.length } });
});

// 取消关注
app.delete('/api/users/:username/follow', (req, res) => {
  const currentUser = getUserByToken(req);
  if (!currentUser) return res.status(401).json({ code: 401, message: '请先登录' });
  const targetUser = users.find((u) => u.username === req.params.username);
  if (!targetUser) return res.status(404).json({ code: 404, message: '用户不存在' });

  const fi = targetUser.followers.indexOf(currentUser.username);
  if (fi === -1) return res.status(400).json({ code: 400, message: '未关注' });
  targetUser.followers.splice(fi, 1);

  const fgi = currentUser.following.indexOf(targetUser.username);
  if (fgi !== -1) currentUser.following.splice(fgi, 1);

  res.json({ code: 200, message: '已取消关注', data: { followersCount: targetUser.followers.length } });
});

// ========== 新闻 API ==========
app.get('/api/news', async (req, res) => {
  try {
    const data = await fetchBaiduHotSearch();
    res.json({ code: 200, data });
  } catch (err) {
    res.json({ code: 200, data: [] });
  }
});

// ========== 搜索 API ==========
app.get('/api/search', (req, res) => {
  const q = (req.query.q || '').trim();
  if (!q) return res.json({ code: 200, data: [] });
  const keyword = q.toLowerCase();
  const results = posts.filter((p) =>
    p.content.toLowerCase().includes(keyword) ||
    p.username.toLowerCase().includes(keyword)
  );
  const sorted = results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  const user = getUserByToken(req);
  res.json({ code: 200, data: formatPosts(sorted, user?.username) });
});

// ========== 微博 API ==========
app.get('/api/posts', (req, res) => {
  const user = getUserByToken(req);
  const sorted = [...posts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ code: 200, data: formatPosts(sorted, user?.username) });
});

app.get('/api/posts/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const post = posts.find((p) => p.id === id);
  if (!post) return res.status(404).json({ code: 404, message: '帖子不存在' });
  const user = getUserByToken(req);
  res.json({ code: 200, data: formatPosts([post], user?.username)[0] });
});

app.post('/api/posts', (req, res) => {
  const user = getUserByToken(req);
  if (!user) return res.status(401).json({ code: 401, message: '请先登录' });
  const { content, image } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ code: 400, message: '内容不能为空' });
  if (content.length > 280) return res.status(400).json({ code: 400, message: '内容不能超过280字' });
  const post = { id: nextId++, content: content.trim(), image: image || null, username: user.username, likes: 0, likedBy: [], createdAt: new Date().toISOString(), comments: [] };
  posts.push(post);
  res.status(201).json({ code: 201, data: post, message: '发布成功' });
});

app.put('/api/posts/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const post = posts.find((p) => p.id === id);
  if (!post) return res.status(404).json({ code: 404, message: '帖子不存在' });
  const user = getUserByToken(req);
  if (!user) return res.status(401).json({ code: 401, message: '请先登录' });
  if (post.username !== user.username) return res.status(403).json({ code: 403, message: '只能编辑自己的帖子' });
  const { content } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ code: 400, message: '内容不能为空' });
  if (content.length > 280) return res.status(400).json({ code: 400, message: '内容不能超过280字' });
  post.content = content.trim();
  res.json({ code: 200, data: post, message: '编辑成功' });
});

app.delete('/api/posts/:id', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const idx = posts.findIndex((p) => p.id === id);
  if (idx === -1) return res.status(404).json({ code: 404, message: '帖子不存在' });
  const user = getUserByToken(req);
  if (!user) return res.status(401).json({ code: 401, message: '请先登录' });
  if (posts[idx].username !== user.username) return res.status(403).json({ code: 403, message: '只能删除自己的帖子' });
  posts.splice(idx, 1);
  res.json({ code: 200, message: '帖子已删除' });
});

app.post('/api/posts/:id/like', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const post = posts.find((p) => p.id === id);
  if (!post) return res.status(404).json({ code: 404, message: '帖子不存在' });
  const user = getUserByToken(req);
  if (!user) return res.status(401).json({ code: 401, message: '请先登录' });
  const username = user.username;
  const idx = post.likedBy.indexOf(username);
  if (idx === -1) { post.likedBy.push(username); post.likes++; }
  else { post.likedBy.splice(idx, 1); post.likes--; }
  addNotification('like', username, post.username, post.id, post.content);
  res.json({ code: 200, data: { ...post, liked: idx === -1 }, message: idx === -1 ? '点赞成功' : '已取消点赞' });
});

app.post('/api/posts/:id/comments', (req, res) => {
  const id = parseInt(req.params.id, 10);
  const post = posts.find((p) => p.id === id);
  if (!post) return res.status(404).json({ code: 404, message: '帖子不存在' });
  const user = getUserByToken(req);
  if (!user) return res.status(401).json({ code: 401, message: '请先登录' });
  const { content, repost } = req.body;
  if (!content || !content.trim()) return res.status(400).json({ code: 400, message: '评论内容不能为空' });
  if (content.length > 200) return res.status(400).json({ code: 400, message: '评论不能超过200字' });

  const comment = { id: nextCommentId++, content: content.trim(), username: user.username, createdAt: new Date().toISOString() };
  post.comments.push(comment);
  addNotification('comment', user.username, post.username, post.id, post.content, content.trim());

  // 评论转发：同时发布为新微博
  let repostPost = null;
  if (repost) {
    const repostContent = `评论了 @${post.username} 的微博：${content.trim()}`;
    repostPost = { id: nextId++, content: repostContent, image: null, username: user.username, likes: 0, likedBy: [], createdAt: new Date().toISOString(), comments: [] };
    posts.push(repostPost);
  }

  res.status(201).json({ code: 201, data: { comment, repostPost }, message: '评论成功' + (repost ? '，已转发' : '') });
});

app.delete('/api/posts/:postId/comments/:commentId', (req, res) => {
  const postId = parseInt(req.params.postId, 10), commentId = parseInt(req.params.commentId, 10);
  const post = posts.find((p) => p.id === postId);
  if (!post) return res.status(404).json({ code: 404, message: '帖子不存在' });
  const user = getUserByToken(req);
  if (!user) return res.status(401).json({ code: 401, message: '请先登录' });
  const idx = post.comments.findIndex((c) => c.id === commentId);
  if (idx === -1) return res.status(404).json({ code: 404, message: '评论不存在' });
  if (post.comments[idx].username !== user.username) return res.status(403).json({ code: 403, message: '只能删除自己的评论' });
  post.comments.splice(idx, 1);
  res.json({ code: 200, message: '评论已删除' });
});

// ========== 通知 API ==========
app.get('/api/notifications', (req, res) => {
  const user = getUserByToken(req);
  if (!user) return res.status(401).json({ code: 401, message: '请先登录' });
  const list = notifications.filter((n) => n.toUser === user.username).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
  res.json({ code: 200, data: list });
});

app.put('/api/notifications/read', (req, res) => {
  const user = getUserByToken(req);
  if (!user) return res.status(401).json({ code: 401, message: '请先登录' });
  notifications.forEach((n) => { if (n.toUser === user.username) n.read = true; });
  res.json({ code: 200, message: '已全部标为已读' });
});

// ========== 上传 ==========
app.post('/api/upload', upload.single('image'), (req, res) => {
  if (!req.file) return res.status(400).json({ code: 400, message: '请选择图片文件' });
  res.json({ code: 200, data: { url: `/uploads/${req.file.filename}` }, message: '上传成功' });
});

app.use((err, req, res, next) => {
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') return res.status(400).json({ code: 400, message: '文件大小超限' });
    return res.status(400).json({ code: 400, message: err.message });
  }
  if (err.message) return res.status(400).json({ code: 400, message: err.message });
  next(err);
});

// ========== 启动 ==========
app.listen(PORT, () => { console.log(`微博 API 服务已启动: http://localhost:${PORT}`); });
