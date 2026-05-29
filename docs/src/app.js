const API_BASE = '/api';

const { createApp } = Vue;
const { createRouter, createWebHashHistory } = VueRouter;

// ========== Axios ==========
axios.interceptors.request.use((config) => {
  const token = localStorage.getItem('token');
  if (token) config.headers.Authorization = `Bearer ${token}`;
  return config;
});

// ========== 离线演示模式（后端不可达时自动切换） ==========
(function () {
  const KEY = 'weibo_demo';

  function seed() {
    const now = new Date().toISOString();
    const h = (n) => new Date(Date.now() - n * 3600000).toISOString();
    return {
      users: [
        { id: 1, username: 'demo', nickname: 'Demo用户', bio: '这是一个演示账号', avatar: null, password: '123456', followers: ['微博新人', '读书人'], following: ['微博新人'] },
        { id: 2, username: '微博新人', nickname: '微博小白', bio: '刚来微博，请多关照', avatar: null, password: '123456', followers: ['demo'], following: ['demo'] },
        { id: 3, username: '读书人', nickname: '爱读书的程序员', bio: '书中自有黄金屋 📚', avatar: null, password: '123456', followers: ['demo'], following: [] },
      ],
      posts: [
        { id: 1, content: '欢迎来到微博平台！🎉 这是离线演示模式，所有数据都保存在你的浏览器中。你可以注册新账号、发微博、评论、点赞、关注～', image: null, username: 'demo', likes: 5, likedBy: ['微博新人', '读书人'], createdAt: h(1), comments: [
          { id: 1, content: '太棒了！终于能用啦～', username: '微博新人', createdAt: h(0.5) },
          { id: 2, content: '这个Demo做得不错！', username: '读书人', createdAt: h(0.3) },
        ] },
        { id: 2, content: '今天天气真好，适合出去走走。#好天气 #心情', image: null, username: '微博新人', likes: 3, likedBy: ['demo'], createdAt: h(3), comments: [
          { id: 3, content: '心情超好！刚跑完步回来～', username: '读书人', createdAt: h(2) },
        ] },
        { id: 3, content: '刚看完一本好书，推荐给大家——《活着》。#读书 #好书推荐', image: null, username: '读书人', likes: 8, likedBy: ['demo', '微博新人'], createdAt: h(6), comments: [] },
        { id: 4, content: '分享一个前端小技巧：使用 CSS Grid 可以轻松实现复杂的布局，比 Flexbox 更强大！', image: null, username: 'demo', likes: 12, likedBy: [], createdAt: h(12), comments: [] },
      ],
      notifications: [],
      nextId: 5, nextCommentId: 4, nextNotifId: 1, nextUserId: 4,
      _tokens: {},
    };
  }

  let S = null, T = {};
  function store() { if (!S) { const r = localStorage.getItem(KEY); S = r ? JSON.parse(r) : seed(); T = S._tokens || {}; } return S; }
  function save() { S._tokens = T; localStorage.setItem(KEY, JSON.stringify(S)); }
  function user() { return S._curUser || null; }
  function uid() { return user() ? user().username : null; }

  function ok(d, m) { return { status: 200, statusText: 'OK', headers: {}, config: {}, data: { code: 200, data: d, message: m || 'ok' } }; }
  function created(d, m) { return { status: 201, statusText: 'Created', headers: {}, config: {}, data: { code: 201, data: d, message: m || 'created' } }; }
  function e(code, m) { return Promise.reject({ response: { status: code, data: { code, message: m } } }); }

  function fmtPosts(list) {
    const u = uid();
    return list.map(p => ({ ...p, liked: u ? p.likedBy.includes(u) : false }));
  }

  function addNotif(type, fromUser, toUser, postId, postContent, commentContent) {
    if (fromUser === toUser) return;
    S.notifications.push({ id: S.nextNotifId++, type, fromUser, toUser, postId, postContent: (postContent || '').slice(0, 50), commentContent: commentContent || null, read: false, createdAt: new Date().toISOString() });
    save();
  }

  function readDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(reader.result);
      reader.onerror = reject;
      reader.readAsDataURL(file);
    });
  }

  async function handleMock(config) {
    const s = store();
    let url = (config.url || '').replace(/^https?:\/\/[^/]+/, '');
    const method = (config.method || 'get').toUpperCase();

    // Parse body
    let body = {};
    if (config.data) {
      if (typeof config.data === 'string') { try { body = JSON.parse(config.data); } catch (_) {} }
      else if (config.data instanceof FormData) { body._formData = config.data; }
      else { body = config.data; }
    }
    const token = ((config.headers && config.headers.Authorization) || '').replace('Bearer ', '');
    S._curUser = T[token] ? S.users.find(u => u.id === T[token]) || null : null;

    try {
      // ===== GET =====
      if (method === 'GET') {
        if (url === '/api/posts') {
          const sorted = [...s.posts].sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          return ok(fmtPosts(sorted));
        }
        if (url.startsWith('/api/posts/')) {
          const id = parseInt(url.split('/api/posts/')[1], 10);
          const p = s.posts.find(x => x.id === id);
          if (!p) return e(404, '帖子不存在');
          return ok(fmtPosts([p])[0]);
        }
        if (url === '/api/user') {
          if (!user()) return e(401, '未登录');
          return ok({ id: user().id, username: user().username, nickname: user().nickname, bio: user().bio, avatar: user().avatar });
        }
        if (url === '/api/notifications') {
          if (!user()) return e(401, '请先登录');
          const list = s.notifications.filter(n => n.toUser === uid()).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          return ok(list);
        }
        if (url.startsWith('/api/users/')) {
          const username = url.split('/api/users/')[1].split('/')[0];
          const u = s.users.find(x => x.username === username);
          if (!u) return e(404, '用户不存在');
          const userPosts = s.posts.filter(p => p.username === u.username).sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          return ok({
            username: u.username, nickname: u.nickname, bio: u.bio, avatar: u.avatar,
            followersCount: u.followers.length, followingCount: u.following.length,
            isFollowed: user() ? u.followers.includes(uid()) : false,
            posts: fmtPosts(userPosts),
          });
        }
        if (url.startsWith('/api/search')) {
          const q = (new URLSearchParams(url.split('?')[1] || '')).get('q') || '';
          if (!q) return ok([]);
          const kw = q.toLowerCase();
          const results = s.posts.filter(p => p.content.toLowerCase().includes(kw) || p.username.toLowerCase().includes(kw));
          results.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
          return ok(fmtPosts(results));
        }
        if (url === '/api/news') {
          return ok([
            { word: '微博离线演示', hot: 4892034 }, { word: 'Vue 3 前端实战', hot: 3829102 },
            { word: 'Express API 设计', hot: 2981034 }, { word: 'GitHub Pages', hot: 2567890 },
            { word: '现代Web课程', hot: 2123456 }, { word: '前端热门话题', hot: 1890234 },
            { word: 'JavaScript技巧', hot: 1654321 }, { word: '周末去哪儿玩', hot: 1432109 },
            { word: '好书推荐', hot: 1287654 }, { word: '程序员的日常', hot: 1102938 },
          ]);
        }
      }

      // ===== POST =====
      if (method === 'POST') {
        if (url === '/api/login') {
          const u = s.users.find(x => x.username === body.username && x.password === body.password);
          if (!u) return e(401, '用户名或密码错误');
          const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
          T[token] = u.id;
          return ok({ id: u.id, username: u.username, nickname: u.nickname, bio: u.bio, avatar: u.avatar, token }, '登录成功');
        }
        if (url === '/api/register') {
          const { username, password } = body;
          if (!username || username.trim().length < 2 || username.trim().length > 12) return e(400, '用户名需 2-12 个字符');
          if (!password || password.length < 6) return e(400, '密码不能少于 6 位');
          if (s.users.find(x => x.username === username.trim())) return e(400, '用户名已存在');
          const nu = { id: s.nextUserId++, username: username.trim(), nickname: username.trim(), bio: '', avatar: null, password, followers: [], following: [] };
          s.users.push(nu);
          const token = Math.random().toString(36).substring(2) + Date.now().toString(36);
          T[token] = nu.id;
          S._curUser = nu;
          save();
          return created({ id: nu.id, username: nu.username, nickname: nu.nickname, token }, '注册成功');
        }
        if (url === '/api/posts') {
          if (!user()) return e(401, '请先登录');
          const { content, image } = body;
          if (!content || !content.trim()) return e(400, '内容不能为空');
          if (content.length > 280) return e(400, '内容不能超过280字');
          const np = { id: s.nextId++, content: content.trim(), image: image || null, username: uid(), likes: 0, likedBy: [], createdAt: new Date().toISOString(), comments: [] };
          s.posts.push(np);
          save();
          return created(np, '发布成功');
        }
        if (url.startsWith('/api/posts/') && url.endsWith('/like')) {
          if (!user()) return e(401, '请先登录');
          const id = parseInt(url.split('/api/posts/')[1].split('/')[0], 10);
          const p = s.posts.find(x => x.id === id);
          if (!p) return e(404, '帖子不存在');
          const idx = p.likedBy.indexOf(uid());
          if (idx === -1) { p.likedBy.push(uid()); p.likes++; }
          else { p.likedBy.splice(idx, 1); p.likes--; }
          addNotif('like', uid(), p.username, p.id, p.content);
          save();
          return ok({ ...p, liked: idx === -1 }, idx === -1 ? '点赞成功' : '已取消点赞');
        }
        if (url.startsWith('/api/posts/') && url.endsWith('/comments')) {
          if (!user()) return e(401, '请先登录');
          const id = parseInt(url.split('/api/posts/')[1].split('/')[0], 10);
          const p = s.posts.find(x => x.id === id);
          if (!p) return e(404, '帖子不存在');
          const { content, repost } = body;
          if (!content || !content.trim()) return e(400, '评论内容不能为空');
          if (content.length > 200) return e(400, '评论不能超过200字');
          const nc = { id: s.nextCommentId++, content: content.trim(), username: uid(), createdAt: new Date().toISOString() };
          p.comments.push(nc);
          addNotif('comment', uid(), p.username, p.id, p.content, content.trim());
          let repostPost = null;
          if (repost) {
            repostPost = { id: s.nextId++, content: '评论了 @' + p.username + ' 的微博：' + content.trim(), image: null, username: uid(), likes: 0, likedBy: [], createdAt: new Date().toISOString(), comments: [] };
            s.posts.push(repostPost);
          }
          save();
          return created({ comment: nc, repostPost }, '评论成功' + (repost ? '，已转发' : ''));
        }
        if (url.startsWith('/api/users/') && url.endsWith('/follow')) {
          if (!user()) return e(401, '请先登录');
          const targetUsername = url.split('/api/users/')[1].split('/')[0];
          const tu = s.users.find(x => x.username === targetUsername);
          if (!tu) return e(404, '用户不存在');
          if (tu.username === uid()) return e(400, '不能关注自己');
          if (tu.followers.includes(uid())) return e(400, '已关注');
          tu.followers.push(uid());
          user().following.push(tu.username);
          save();
          return ok({ followersCount: tu.followers.length }, '关注成功');
        }
        if (url === '/api/upload') {
          if (!user()) return e(401, '请先登录');
          if (body._formData) {
            const file = body._formData.get('image');
            if (file && file instanceof File) {
              try {
                const dataUrl = await readDataURL(file);
                return ok({ url: dataUrl }, '上传成功');
              } catch (_) { return e(400, '图片读取失败'); }
            }
          }
          return e(400, '请选择图片文件');
        }
        if (url === '/api/user/avatar') {
          if (!user()) return e(401, '请先登录');
          if (body._formData) {
            const file = body._formData.get('avatar');
            if (file && file instanceof File) {
              try {
                const dataUrl = await readDataURL(file);
                user().avatar = dataUrl;
                save();
                return ok({ avatar: dataUrl }, '头像已更新');
              } catch (_) { return e(400, '图片读取失败'); }
            }
          }
          return e(400, '请选择图片');
        }
      }

      // ===== PUT =====
      if (method === 'PUT') {
        if (url === '/api/user/profile') {
          if (!user()) return e(401, '请先登录');
          const { nickname, bio } = body;
          if (nickname !== undefined) {
            if (!nickname.trim() || nickname.trim().length < 2 || nickname.trim().length > 12) return e(400, '昵称需 2-12 个字符');
            user().nickname = nickname.trim();
          }
          if (bio !== undefined) {
            if (bio.length > 100) return e(400, '简介不能超过 100 字');
            user().bio = bio;
          }
          save();
          return ok({ id: user().id, username: user().username, nickname: user().nickname, bio: user().bio, avatar: user().avatar }, '资料已更新');
        }
        if (url.startsWith('/api/posts/')) {
          const id = parseInt(url.split('/api/posts/')[1], 10);
          const p = s.posts.find(x => x.id === id);
          if (!p) return e(404, '帖子不存在');
          if (!user()) return e(401, '请先登录');
          if (p.username !== uid()) return e(403, '只能编辑自己的帖子');
          const { content } = body;
          if (!content || !content.trim()) return e(400, '内容不能为空');
          if (content.length > 280) return e(400, '内容不能超过280字');
          p.content = content.trim();
          save();
          return ok(p, '编辑成功');
        }
        if (url === '/api/notifications/read') {
          if (!user()) return e(401, '请先登录');
          s.notifications.forEach(n => { if (n.toUser === uid()) n.read = true; });
          save();
          return ok(null, '已全部标为已读');
        }
      }

      // ===== DELETE =====
      if (method === 'DELETE') {
        if (url.startsWith('/api/posts/') && url.includes('/comments/')) {
          const parts = url.split('/api/posts/')[1].split('/comments/');
          const postId = parseInt(parts[0], 10);
          const commentId = parseInt(parts[1], 10);
          const p = s.posts.find(x => x.id === postId);
          if (!p) return e(404, '帖子不存在');
          if (!user()) return e(401, '请先登录');
          const ci = p.comments.findIndex(c => c.id === commentId);
          if (ci === -1) return e(404, '评论不存在');
          if (p.comments[ci].username !== uid()) return e(403, '只能删除自己的评论');
          p.comments.splice(ci, 1);
          save();
          return ok(null, '评论已删除');
        }
        if (url.startsWith('/api/posts/')) {
          const id = parseInt(url.split('/api/posts/')[1], 10);
          const pi = s.posts.findIndex(x => x.id === id);
          if (pi === -1) return e(404, '帖子不存在');
          if (!user()) return e(401, '请先登录');
          if (s.posts[pi].username !== uid()) return e(403, '只能删除自己的帖子');
          s.posts.splice(pi, 1);
          save();
          return ok(null, '帖子已删除');
        }
        if (url.startsWith('/api/users/') && url.endsWith('/follow')) {
          if (!user()) return e(401, '请先登录');
          const targetUsername = url.split('/api/users/')[1].split('/')[0];
          const tu = s.users.find(x => x.username === targetUsername);
          if (!tu) return e(404, '用户不存在');
          const fi = tu.followers.indexOf(uid());
          if (fi === -1) return e(400, '未关注');
          tu.followers.splice(fi, 1);
          const fgi = user().following.indexOf(tu.username);
          if (fgi !== -1) user().following.splice(fgi, 1);
          save();
          return ok({ followersCount: tu.followers.length }, '已取消关注');
        }
      }

      // Unhandled route
      return null; // let the real error propagate
    } catch (err) {
      return e(500, '服务器内部错误');
    }
  }

  // 直接替换 axios 方法（比拦截器更可靠）
  if (location.hostname.includes('github.io') || location.protocol === 'file:') {
    function wrapData(d) { return d instanceof FormData ? d : (typeof d === 'string' ? d : JSON.stringify(d)); }
    axios.get = async function (url, config) { return handleMock({ url, method: 'get', headers: (config || {}).headers || {} }); };
    axios.post = async function (url, data, config) { return handleMock({ url, method: 'post', headers: (config || {}).headers || {}, data: wrapData(data) }); };
    axios.put = async function (url, data, config) { return handleMock({ url, method: 'put', headers: (config || {}).headers || {}, data: wrapData(data) }); };
    axios.delete = async function (url, config) { return handleMock({ url, method: 'delete', headers: (config || {}).headers || {} }); };
  }
})();

// ========== 工具 ==========
const EMOJIS = [
  '😀','😂','🤣','😍','🥰','😘','😜','🤪','😎','🤩',
  '😢','😭','😤','😡','🥺','😱','🤗','🤔','😴','🥳',
  '👍','👎','👏','🙌','💪','🤝','❤️','💔','🔥','⭐',
  '🎉','🎊','🌸','🌺','☀️','🌈','🍕','🍔','☕','🍰',
  '🐶','🐱','🦊','🐼','🐨','🐸','🦄','🐙','🌟','💡',
  '📝','💬','🔔','📢','🏠','✈️','🚀','💻','📱','🎵',
];

function renderContent(text) {
  if (!text) return '';
  return text.replace(/#([一-鿿\w]+)/g, '<span class="hashtag" data-tag="$1">#$1</span>');
}

function insertAtCursor(el, text) {
  const s = el.selectionStart, e = el.selectionEnd;
  el.value = el.value.substring(0, s) + text + el.value.substring(e);
  el.selectionStart = el.selectionEnd = s + text.length;
  el.focus();
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

function formatTime(iso) {
  const d = new Date(iso), n = new Date(), diff = n - d;
  const min = Math.floor(diff / 60000), hour = Math.floor(diff / 3600000), day = Math.floor(diff / 86400000);
  if (min < 1) return '刚刚';
  if (min < 60) return `${min}分钟前`;
  if (hour < 24) return `${hour}小时前`;
  if (day < 7) return `${day}天前`;
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

// ========== 路由 ==========
const routes = [
  { path: '/', component: { props: ['posts'], template: '<home-page :posts="posts"></home-page>' } },
  { path: '/post/:id', component: { template: '<post-detail-page></post-detail-page>' } },
  { path: '/discover', component: { template: '<discover-page></discover-page>' } },
  { path: '/messages', component: { template: '<messages-page></messages-page>' } },
  { path: '/profile', component: { template: '<profile-page></profile-page>' } },
  { path: '/user/:username', component: { template: '<user-profile-page></user-profile-page>' } },
  { path: '/login', component: { template: '<login-page></login-page>' } },
  { path: '/register', component: { template: '<register-page></register-page>' } },
];

const router = createRouter({ history: createWebHashHistory(), routes });

// ========== 根应用 ==========
const app = createApp({
  data() {
    return {
      posts: [], loading: false, user: null,
      notifications: [], showNotifPanel: false,
      pollTimer: null, autoRefreshTimer: null,
      toast: { message: '', type: 'success' }, toastTimer: null,
    };
  },
  computed: {
    unreadCount() { return this.notifications.filter((n) => !n.read).length; },
  },
  methods: {
    showToast(message, type = 'success') {
      clearTimeout(this.toastTimer);
      this.toast = { message, type };
      this.toastTimer = setTimeout(() => { this.toast.message = ''; }, 3000);
    },
    async fetchPosts() {
      this.loading = true;
      try { this.posts = (await axios.get(`${API_BASE}/posts`)).data.data; }
      catch (err) { this.showToast(err.response?.data?.message || '加载失败', 'error'); }
      finally { this.loading = false; }
    },
    async silentRefresh() {
      try { this.posts = (await axios.get(`${API_BASE}/posts`)).data.data; } catch (e) {}
    },
    async addPost({ content, image }) {
      try {
        const res = await axios.post(`${API_BASE}/posts`, { content, image });
        const np = res.data.data; np._new = true;
        this.posts.unshift(np);
        this.showToast(res.data.message || '发布成功');
        setTimeout(() => { np._new = false; }, 500);
      } catch (err) { this.showToast(err.response?.data?.message || '发布失败', 'error'); }
    },
    async toggleLike(id) {
      if (!this.user) return this.showToast('请先登录', 'error');
      const post = this.posts.find((p) => p.id === id);
      if (!post) return;
      const was = post.liked;
      post.liked = !post.liked; post.likes += post.liked ? 1 : -1;
      try { await axios.post(`${API_BASE}/posts/${id}/like`); }
      catch (err) { post.liked = was; post.likes += was ? 1 : -1; this.showToast('操作失败', 'error'); }
    },
    async fetchNotifications() {
      if (!this.user) return;
      try { this.notifications = (await axios.get(`${API_BASE}/notifications`)).data.data; } catch (e) {}
    },
    async markAllRead() {
      try { await axios.put(`${API_BASE}/notifications/read`); this.notifications.forEach((n) => { n.read = true; }); } catch (e) {}
    },
    toggleNotifPanel() { this.showNotifPanel = !this.showNotifPanel; if (this.showNotifPanel) this.markAllRead(); },
    setUser(data) {
      this.user = { id: data.id, username: data.username, nickname: data.nickname || data.username, bio: data.bio || '', avatar: data.avatar || null };
      localStorage.setItem('token', data.token);
      this.startPolling();
    },
    logout() {
      this.user = null; this.notifications = [];
      localStorage.removeItem('token');
      this.showToast('已退出登录'); this.stopPolling();
      router.push('/');
    },
    async restoreSession() {
      const token = localStorage.getItem('token');
      if (!token) return;
      try { const res = await axios.get(`${API_BASE}/user`); this.user = res.data.data; this.startPolling(); }
      catch (err) { localStorage.removeItem('token'); }
    },
    startPolling() {
      this.stopPolling();
      this.fetchNotifications();
      this.pollTimer = setInterval(() => this.fetchNotifications(), 15000);
      this.autoRefreshTimer = setInterval(() => this.silentRefresh(), 30000);
    },
    stopPolling() { clearInterval(this.pollTimer); clearInterval(this.autoRefreshTimer); },
  },
  mounted() { this.restoreSession(); this.fetchPosts(); },
  beforeUnmount() { this.stopPolling(); },
});

app.use(router);

// ========== 登录页 ==========
app.component('LoginPage', {
  template: `
    <div class="auth-card"><h2 class="auth-title">登录微博</h2>
      <form @submit.prevent="handleLogin">
        <div class="form-group"><input v-model="username" type="text" placeholder="用户名" class="auth-input" /></div>
        <div class="form-group"><input v-model="password" type="password" placeholder="密码" class="auth-input" :class="{ 'input-error': password.length > 0 && password.length < 6 }" />
          <p v-if="password.length > 0 && password.length < 6" class="field-hint">⚠ 密码至少 6 位</p></div>
        <button type="submit" class="auth-submit" :disabled="!valid || loading">{{ loading ? '登录中...' : '登录' }}</button>
      </form>
      <p class="auth-switch">还没有账号？<router-link to="/register">立即注册</router-link></p></div>`,
  data() { return { username: '', password: '', loading: false }; },
  computed: { valid() { return this.username.trim() && this.password.length >= 6; } },
  methods: {
    async handleLogin() { if (!this.valid) return; this.loading = true;
      try { const r = await axios.post(`${API_BASE}/login`, { username: this.username.trim(), password: this.password }); this.$root.setUser(r.data.data); this.$root.showToast(r.data.message || '登录成功'); this.$router.push('/'); }
      catch (e) { this.$root.showToast(e.response?.data?.message || '登录失败', 'error'); } finally { this.loading = false; } },
  },
});

// ========== 注册页 ==========
app.component('RegisterPage', {
  template: `
    <div class="auth-card"><h2 class="auth-title">注册微博</h2>
      <form @submit.prevent="handleRegister">
        <div class="form-group"><input v-model="username" type="text" placeholder="用户名（2-12个字符）" class="auth-input" :class="{ 'input-error': username.length > 0 && (username.length < 2 || username.length > 12) }" />
          <p v-if="username.length > 0 && username.length < 2" class="field-hint">⚠ 用户名至少 2 个字符</p><p v-if="username.length > 12" class="field-hint">⚠ 用户名最多 12 个字符</p></div>
        <div class="form-group"><input v-model="password" type="password" placeholder="密码（至少6位）" class="auth-input" :class="{ 'input-error': password.length > 0 && password.length < 6 }" />
          <p v-if="password.length > 0 && password.length < 6" class="field-hint">⚠ 密码至少 6 位</p></div>
        <div class="form-group"><input v-model="confirmPassword" type="password" placeholder="确认密码" class="auth-input" :class="{ 'input-error': confirmPassword.length > 0 && confirmPassword !== password }" />
          <p v-if="confirmPassword.length > 0 && confirmPassword !== password" class="field-hint">⚠ 两次密码不一致</p></div>
        <button type="submit" class="auth-submit" :disabled="!valid || loading">{{ loading ? '注册中...' : '注册' }}</button>
      </form>
      <p class="auth-switch">已有账号？<router-link to="/login">去登录</router-link></p></div>`,
  data() { return { username: '', password: '', confirmPassword: '', loading: false }; },
  computed: { valid() { return this.username.trim().length >= 2 && this.username.trim().length <= 12 && this.password.length >= 6 && this.password === this.confirmPassword; } },
  methods: {
    async handleRegister() { if (!this.valid) return; this.loading = true;
      try { const r = await axios.post(`${API_BASE}/register`, { username: this.username.trim(), password: this.password }); this.$root.setUser(r.data.data); this.$root.showToast(r.data.message || '注册成功'); this.$router.push('/'); }
      catch (e) { this.$root.showToast(e.response?.data?.message || '注册失败', 'error'); } finally { this.loading = false; } },
  },
});

// ========== 首页 ==========
app.component('HomePage', {
  props: { posts: { type: Array, required: true } },
  template: `
    <div>
      <post-form v-if="$root.user"></post-form>
      <div v-else class="login-prompt-card"><p>👋 登录后即可发布微博</p><router-link to="/login" class="btn-publish">去登录</router-link></div>
      <template v-if="loading"><skeleton-card v-for="i in 3" :key="i"></skeleton-card></template>
      <post-list v-else :posts="posts" @delete="onDel"></post-list>
    </div>`,
  data() { return { loading: false }; },
  methods: { onDel(id) { this.$root.posts = this.$root.posts.filter((p) => p.id !== id); } },
});

// ========== 发现页 ==========
app.component('DiscoverPage', {
  template: `
    <div>
      <div class="search-bar"><input v-model="keyword" type="text" placeholder="搜索微博内容..." class="search-input" @keyup.enter="doSearch" />
        <button class="btn-search" @click="doSearch">搜索</button></div>
      <template v-if="!searched">
        <div class="empty-state" style="padding:40px 0"><div class="icon">🔍</div><p>搜索你感兴趣的内容</p></div>
      </template>
      <template v-else>
        <p class="search-info">搜索"{{ lastKeyword }}" 找到 {{ results.length }} 条结果</p>
        <post-item v-for="p in results" :key="p.id" :post="p"></post-item>
        <div v-if="results.length === 0" class="empty-state"><p>未找到相关微博</p></div>
        <p class="expand-link" @click="searched = false">&larr; 返回</p>
      </template>
    </div>`,
  data() { return { keyword: '', searched: false, results: [], lastKeyword: '' }; },
  methods: {
    async doSearch() { const q = this.keyword.trim(); if (!q) return; this.lastKeyword = q; this.searched = true; try { this.results = (await axios.get(`${API_BASE}/search?q=${encodeURIComponent(q)}`)).data.data; } catch (e) {} },
  },
  mounted() { const q = this.$route.query.q; if (q) { this.keyword = q; this.doSearch(); } },
  watch: { '$route.query.q'(val) { if (val) { this.keyword = val; this.doSearch(); } } },
});

// ========== 消息页 ==========
app.component('MessagesPage', {
  template: `
    <div>
      <div v-if="!$root.user" class="login-prompt-card"><p>👋 请先登录查看消息</p><router-link to="/login" class="btn-publish">去登录</router-link></div>
      <template v-else>
        <div class="section-title">收到的赞 ({{ likes.length }})</div>
        <div v-if="likes.length === 0" class="empty-small">暂无</div>
        <router-link v-for="n in likes" :key="n.id" :to="'/post/' + n.postId" class="msg-item msg-item-link">
          <div><strong>{{ n.fromUser }}</strong> 赞了你的微博</div>
          <div class="msg-meta">{{ n.postContent }}...</div>
          <span class="msg-arrow">查看 &rarr;</span>
        </router-link>

        <div class="section-title" style="margin-top:20px">收到的评论 ({{ comments.length }})</div>
        <div v-if="comments.length === 0" class="empty-small">暂无</div>
        <router-link v-for="n in comments" :key="n.id" :to="'/post/' + n.postId" class="msg-item msg-item-link">
          <div><strong>{{ n.fromUser }}</strong> 评论了你的微博</div>
          <div class="msg-meta">"{{ n.commentContent }}"</div>
          <span class="msg-arrow">查看 &rarr;</span>
        </router-link>
      </template>
    </div>`,
  computed: {
    notifications() { return this.$root.notifications; },
    likes() { return this.notifications.filter((n) => n.type === 'like'); },
    comments() { return this.notifications.filter((n) => n.type === 'comment'); },
  },
});

// ========== 个人页 ==========
app.component('ProfilePage', {
  template: `
    <div>
      <div v-if="!$root.user" class="login-prompt-card"><p>👋 请先登录</p><router-link to="/login" class="btn-publish">去登录</router-link></div>
      <template v-else>
        <div class="profile-card">
          <div class="profile-header">
            <label class="avatar-upload">
              <img :src="$root.user.avatar || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22><rect fill=%22%23e64a2e%22 width=%2240%22 height=%2240%22/><text fill=%22white%22 x=%2220%22 y=%2227%22 text-anchor=%22middle%22 font-size=%2220%22>微</text></svg>'" class="profile-avatar" />
              <span class="avatar-change-hint">换头像</span>
              <input type="file" accept="image/*" style="display:none" @change="uploadAvatar" />
            </label>
            <div class="profile-info">
              <div class="profile-name">{{ $root.user.nickname || $root.user.username }}</div>
              <div class="profile-username">@{{ $root.user.username }}</div>
              <div class="profile-bio">{{ $root.user.bio || '这个人很懒，什么都没写...' }}</div>
            </div>
          </div>
          <button class="btn-edit-profile" @click="showEdit = true">编辑资料</button>
        </div>

        <div v-if="showEdit" class="edit-panel">
          <h3>编辑资料</h3>
          <div class="form-group"><label>昵称</label><input v-model="editForm.nickname" class="auth-input" placeholder="2-12个字符" /></div>
          <div class="form-group"><label>简介</label><input v-model="editForm.bio" class="auth-input" placeholder="最多100字" maxlength="100" /></div>
          <div class="edit-actions"><button class="btn-save" @click="saveProfile">保存</button><button class="btn-cancel" @click="showEdit = false">取消</button></div>
        </div>

        <div class="section-title" style="margin-top:20px">我的微博 ({{ myPosts.length }})</div>
        <post-item v-for="p in myPosts" :key="p.id" :post="p" @delete="onDelete"></post-item>
        <div v-if="myPosts.length === 0" class="empty-small">暂无微博</div>
      </template>
    </div>`,
  data() { return { showEdit: false, editForm: { nickname: '', bio: '' } }; },
  computed: { myPosts() { return this.$root.posts.filter((p) => p.username === this.$root.user?.username); } },
  methods: {
    async uploadAvatar(e) {
      const f = e.target.files[0]; if (!f) return;
      const fd = new FormData(); fd.append('avatar', f);
      try { const r = await axios.post(`${API_BASE}/user/avatar`, fd); this.$root.user.avatar = r.data.data.avatar; this.$root.showToast('头像已更新'); }
      catch (err) { this.$root.showToast(err.response?.data?.message || '上传失败', 'error'); }
    },
    async saveProfile() {
      try { const r = await axios.put(`${API_BASE}/user/profile`, this.editForm); this.$root.user.nickname = r.data.data.nickname; this.$root.user.bio = r.data.data.bio; this.showEdit = false; this.$root.showToast('资料已更新'); }
      catch (e) { this.$root.showToast(e.response?.data?.message || '更新失败', 'error'); }
    },
    onDelete(id) { this.$root.posts = this.$root.posts.filter((p) => p.id !== id); },
  },
  watch: {
    '$root.user'(val) { if (val) { this.editForm.nickname = val.nickname || ''; this.editForm.bio = val.bio || ''; } },
  },
  mounted() { if (this.$root.user) { this.editForm.nickname = this.$root.user.nickname || ''; this.editForm.bio = this.$root.user.bio || ''; } },
});

// ========== 帖子详情页 ==========
app.component('PostDetailPage', {
  template: `
    <div><router-link to="/" class="btn-back">&larr; 返回首页</router-link>
      <skeleton-card v-if="loading"></skeleton-card>
      <template v-else-if="post"><post-item :post="post" :show-comment-btn="false" @delete="onDelete"></post-item>
        <div class="section-title">评论 ({{ post.comments.length }})</div>
        <comment-form v-if="$root.user" :post-id="post.id" @commented="onCommented"></comment-form>
        <div v-else class="login-prompt-card" style="margin-bottom:12px"><p>👋 <router-link to="/login">登录</router-link>后即可评论</p></div>
        <comment-list :comments="post.comments" @delete="onDeleteComment"></comment-list>
      </template>
      <div v-else class="empty-state"><div class="icon">🔍</div><p>帖子不存在</p></div></div>`,
  data() { return { post: null, loading: false }; },
  methods: {
    async fetchPost() { this.loading = true; try { this.post = (await axios.get(`${API_BASE}/posts/${this.$route.params.id}`)).data.data; } catch (e) { this.$root.showToast('加载失败', 'error'); } finally { this.loading = false; } },
    onCommented({ comment, repostPost }) { this.post.comments.push(comment); if (repostPost) { repostPost._new = true; this.$root.posts.unshift(repostPost); setTimeout(() => { repostPost._new = false; }, 500); } const rp = this.$root.posts.find((p) => p.id === this.post.id); if (rp) rp.comments.push(comment); },
    async onDeleteComment(cid) { try { await axios.delete(`${API_BASE}/posts/${this.post.id}/comments/${cid}`); this.post.comments = this.post.comments.filter((c) => c.id !== cid); const rp = this.$root.posts.find((p) => p.id === this.post.id); if (rp) rp.comments = rp.comments.filter((c) => c.id !== cid); this.$root.showToast('评论已删除'); } catch (e) { this.$root.showToast(e.response?.data?.message || '删除失败', 'error'); } },
    onDelete() { this.$router.push('/'); },
  },
  watch: { '$route.params.id'() { this.fetchPost(); } },
  mounted() { this.fetchPost(); },
});

// ========== 用户主页 ==========
app.component('UserProfilePage', {
  template: `
    <div><router-link to="/" class="btn-back">&larr; 返回</router-link>
      <div v-if="loading" class="loading"><div class="spinner"></div></div>
      <template v-else-if="user">
        <div class="profile-card"><div class="profile-header">
          <img :src="user.avatar || 'data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 40 40%22><rect fill=%22%23e64a2e%22 width=%2240%22 height=%2240%22/><text fill=%22white%22 x=%2220%22 y=%2227%22 text-anchor=%22middle%22 font-size=%2220%22>微</text></svg>'" class="profile-avatar" />
          <div class="profile-info"><div class="profile-name">{{ user.nickname }}</div><div class="profile-username">@{{ user.username }}</div><div class="profile-bio">{{ user.bio || '这个人很懒，什么都没写...' }}</div></div></div>
          <div class="profile-stats"><span><strong>{{ user.followersCount }}</strong> 粉丝</span><span><strong>{{ user.followingCount }}</strong> 关注</span></div>
          <button v-if="$root.user && $root.user.username !== user.username" class="btn-follow" :class="{ following: user.isFollowed }" @click="toggleFollow">
            {{ following ? '已关注' : '+ 关注' }}
          </button></div>
        <div class="section-title" style="margin-top:20px">TA 的微博 ({{ user.posts.length }})</div>
        <post-item v-for="p in user.posts" :key="p.id" :post="p"></post-item>
        <div v-if="user.posts.length === 0" class="empty-small">暂无微博</div>
      </template></div>`,
  data() { return { user: null, loading: false, following: false }; },
  methods: {
    async fetchUser() {
      this.loading = true;
      try { this.user = (await axios.get(`${API_BASE}/users/${this.$route.params.username}`)).data.data; this.following = this.user.isFollowed; }
      catch (e) { this.$root.showToast('用户不存在', 'error'); }
      finally { this.loading = false; }
    },
    async toggleFollow() {
      try {
        if (this.following) {
          await axios.delete(`${API_BASE}/users/${this.user.username}/follow`);
          this.user.followersCount--;
        } else {
          await axios.post(`${API_BASE}/users/${this.user.username}/follow`);
          this.user.followersCount++;
        }
        this.following = !this.following;
      } catch (e) { this.$root.showToast(e.response?.data?.message || '操作失败', 'error'); }
    },
  },
  watch: { '$route.params.username'() { this.fetchUser(); } },
  mounted() { this.fetchUser(); },
});

// ========== PostForm ==========
app.component('PostForm', {
  template: `
    <div class="post-form-card"><textarea ref="input" v-model="content" placeholder="有什么新鲜事想分享？" maxlength="280"></textarea>
      <div v-if="imagePreview" class="image-preview"><img :src="imagePreview" /><button class="btn-remove" @click="removeImage">&times;</button></div>
      <div class="form-footer"><div class="form-footer-left">
        <label class="btn-upload" :class="{ 'has-image': imageFile }">🖼️ {{ imageFile ? '已选' : '图片' }}<input type="file" accept="image/*" style="display:none" @change="onFile" /></label>
        <button class="btn-emoji" @click="showEmoji = !showEmoji">😊</button>
        <span class="char-count" :class="{ warn: content.length >= 260 }">{{ content.length }}/280</span></div>
        <button class="btn-publish" :disabled="!content.trim() || uploading" @click="handleSubmit">{{ uploading ? '发布中...' : '发布' }}</button>
      </div>
      <emoji-picker v-if="showEmoji" @pick="onEmoji"></emoji-picker></div>`,
  data() { return { content: '', imageFile: null, imagePreview: null, uploading: false, showEmoji: false }; },
  methods: {
    onFile(e) { const f = e.target.files[0]; if (!f) return; if (f.size > 5*1024*1024) return this.$root.showToast('图片不超5MB','error'); this.imageFile = f; this.imagePreview = URL.createObjectURL(f); },
    removeImage() { this.imageFile = null; this.imagePreview = null; },
    onEmoji(emoji) { insertAtCursor(this.$refs.input, emoji); this.showEmoji = false; },
    async handleSubmit() { const t = this.content.trim(); if (!t) return; this.uploading = true; let img = null; if (this.imageFile) { try { const fd = new FormData(); fd.append('image', this.imageFile); img = (await axios.post(`${API_BASE}/upload`, fd)).data.data.url; } catch (e) { this.$root.showToast('上传失败','error'); this.uploading = false; return; } } this.$root.addPost({ content: t, image: img }); this.content = ''; this.imageFile = null; this.imagePreview = null; this.uploading = false; },
  },
});

// ========== PostList ==========
app.component('PostList', { props: { posts: Array, required: true }, emits: ['delete'], template: `<div><post-item v-for="p in posts" :key="p.id" :post="p" @delete="$emit('delete', p.id)"></post-item><div v-if="posts.length===0" class="empty-state"><div class="icon">📝</div><p>还没有微博</p></div></div>` });

// ========== PostItem ==========
app.component('PostItem', {
  props: { post: Object, required: true, showCommentBtn: { type: Boolean, default: true } },
  template: `
    <div class="post-card" :class="{ 'post-new': post._new }">
      <div class="post-header"><div class="avatar">微</div><div class="user-info"><router-link :to="'/user/' + post.username" class="username" @click.stop>{{ post.username }}</router-link><span class="post-time">{{ formatTime(post.createdAt) }}</span></div>
        <div v-if="isOwner && !editing" class="post-menu"><button class="btn-icon" @click="startEdit">✏️</button><button class="btn-icon" @click="confirmDelete">🗑️</button></div></div>
      <div v-if="editing"><textarea v-model="editContent" class="edit-textarea" maxlength="280"></textarea>
        <div class="edit-actions"><span class="char-count" :class="{ warn: editContent.length >= 260 }">{{ editContent.length }}/280</span>
          <button class="btn-save" :disabled="!editContent.trim()" @click="saveEdit">保存</button><button class="btn-cancel" @click="cancelEdit">取消</button></div></div>
      <template v-else><div class="post-content" v-html="renderContent(post.content)" @click="onHashtag"></div>
        <div v-if="post.image" class="post-image"><img :src="post.image" /></div>
        <div class="post-actions"><button class="btn-like" :class="{ liked: post.liked, 'like-pop': likePop }" @click="doLike"><span class="like-icon">{{ post.liked ? '❤️' : '🤍' }}</span><span>{{ post.likes }}</span></button>
          <router-link v-if="showCommentBtn" :to="'/post/' + post.id" class="btn-comment"><span class="comment-icon">💬</span><span>{{ post.comments ? post.comments.length : 0 }}</span></router-link></div>
        <div v-if="showCommentBtn && post.comments && post.comments.length > 0" class="comment-preview"><div v-for="c in post.comments.slice(0,2)" :key="c.id" class="preview-item"><router-link :to="'/user/' + c.username" class="preview-user" @click.stop>{{ c.username }}</router-link>：{{ c.content }}</div>
          <router-link v-if="post.comments.length > 2" :to="'/post/' + post.id" class="expand-link">展开全部 {{ post.comments.length }} 条评论 &raquo;</router-link></div></template></div>`,
  emits: ['delete'],
  data() { return { editing: false, editContent: '', likePop: false }; },
  computed: { isOwner() { return this.$root.user && this.$root.user.username === this.post.username; } },
  methods: {
    formatTime, renderContent,
    onHashtag(e) { if (e.target.classList.contains('hashtag')) { const tag = e.target.dataset.tag; this.$router.push({ path: '/discover', query: { q: '#' + tag } }); } },
    doLike() {
      if (!this.$root.user) return this.$root.showToast('请先登录', 'error');
      this.post.liked = !this.post.liked;
      this.post.likes += this.post.liked ? 1 : -1;
      if (this.post.liked) { this.likePop = true; setTimeout(() => { this.likePop = false; }, 300); }
      axios.post(`${API_BASE}/posts/${this.post.id}/like`).catch(() => {
        this.post.liked = !this.post.liked;
        this.post.likes += this.post.liked ? 1 : -1;
        this.$root.showToast('操作失败', 'error');
      });
    },
    startEdit() { this.editContent = this.post.content; this.editing = true; },
    cancelEdit() { this.editing = false; },
    async saveEdit() { const t = this.editContent.trim(); if (!t) return; try { this.post.content = (await axios.put(`${API_BASE}/posts/${this.post.id}`, { content: t })).data.data.content; this.editing = false; this.$root.showToast('编辑成功'); } catch (e) { this.$root.showToast(e.response?.data?.message || '编辑失败', 'error'); } },
    async confirmDelete() { if (!confirm('确定删除？')) return; try { await axios.delete(`${API_BASE}/posts/${this.post.id}`); this.$emit('delete'); this.$root.showToast('已删除'); } catch (e) { this.$root.showToast(e.response?.data?.message || '删除失败', 'error'); } },
  },
});

// ========== CommentForm（含转发） ==========
app.component('CommentForm', {
  props: { postId: { type: Number, required: true } },
  template: `
    <div class="comment-form-card"><div class="comment-input-row"><input ref="input" v-model="content" type="text" placeholder="写评论..." maxlength="200" @keyup.enter="submitComment" />
        <button class="btn-emoji btn-emoji-small" @click="showEmoji = !showEmoji">😊</button>
        <button class="btn-comment-submit" :disabled="!content.trim() || submitting" @click="submitComment">{{ submitting ? '发送中' : '发送' }}</button></div>
      <div class="comment-extra"><label class="repost-label"><input type="checkbox" v-model="repost" /> 同时转发到我的微博</label></div>
      <emoji-picker v-if="showEmoji" @pick="onEmoji"></emoji-picker></div>`,
  emits: ['commented'],
  data() { return { content: '', repost: false, submitting: false, showEmoji: false }; },
  methods: {
    onEmoji(emoji) { insertAtCursor(this.$refs.input, emoji); this.showEmoji = false; },
    async submitComment() { const t = this.content.trim(); if (!t) return; this.submitting = true;
      try { const r = await axios.post(`${API_BASE}/posts/${this.postId}/comments`, { content: t, repost: this.repost }); this.content = ''; this.repost = false; this.$emit('commented', r.data.data); this.$root.showToast(r.data.message || '评论成功'); }
      catch (e) { this.$root.showToast(e.response?.data?.message || '评论失败', 'error'); } finally { this.submitting = false; } },
  },
});

// ========== CommentList ==========
app.component('CommentList', {
  props: { comments: Array, required: true }, emits: ['delete'],
  template: `<div><div v-if="comments.length===0" class="empty-small">暂无评论</div><div v-for="c in comments" :key="c.id" class="comment-card"><div class="comment-header"><router-link :to="'/user/' + c.username" class="comment-user" @click.stop>{{ c.username }}</router-link><span class="comment-time">{{ formatTime(c.createdAt) }}</span></div><div class="comment-body"><div class="comment-content">{{ c.content }}</div><button v-if="$root.user && $root.user.username === c.username" class="btn-delete-comment" @click="$emit('delete', c.id)">&times;</button></div></div></div>`,
  methods: { formatTime },
});

// ========== EmojiPicker ==========
app.component('EmojiPicker', { emits: ['pick'], template: `<div class="emoji-picker"><span v-for="e in emojis" :key="e" class="emoji-item" @click="$emit('pick', e)">{{ e }}</span></div>`, data() { return { emojis: EMOJIS }; } });

// ========== SkeletonCard ==========
app.component('SkeletonCard', { template: `<div class="post-card skeleton"><div class="skeleton-header"><div class="skeleton-avatar"></div><div class="skeleton-lines"><div class="skeleton-line short"></div><div class="skeleton-line tiny"></div></div></div><div class="skeleton-line"></div><div class="skeleton-line"></div><div class="skeleton-line medium"></div></div>` });

// ========== 挂载 ==========
app.mount('#app');
