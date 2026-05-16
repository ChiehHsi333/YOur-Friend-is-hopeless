"use strict";

const ATTRS = [
  { id: "lan", label: "摆烂" },
  { id: "zic", label: "自嘲" },
  { id: "hua", label: "画饼" },
  { id: "xia", label: "消费" },
  { id: "bia", label: "表演" },
  { id: "dun", label: "钝感" }
];

const AUTO_ADVANCE_DELAY = 1100;
const FADE_DURATION = 280;
const ATTEMPT_HISTORY_KEY = "failure-attempt-history";
const CURRENT_ANSWER_KEY = "failure-current-answers";
const AUTH_USER_KEY = "failure-auth-user";

// 解析 URL 参数获取邀请码
function getUrlParam(name) {
  const params = new URLSearchParams(window.location.search);
  return params.get(name);
}

const state = {
  questions: [],
  outcomes: [],
  comments: [],
  cards: [],
  collectedCards: new Set(),
  drawnCards: [],
  revealedSlots: [false, false, false],
  cardEcho: null,
  currentViewingCard: null,
  currentIndex: 0,
  answerMap: {},
  scores: null,
  result: null,
  comment: null,
  maxScores: null,
  autoAdvance: null,
  previousScreen: "intro",
  attemptHistory: [],
  hasDrawn: false,
  profileOutcome: null,
  profileScores: null,
  // ===== 新增：账号系统 =====
  currentUser: null,        // { userId, nickname }
  isFriendMode: false,      // 是否为好友答题模式
  ownerUserId: null,        // 好友模式下对应的号主 ID
  friendProfileData: null   // 号主的聚合画像数据（从服务端拉取）
};

const ui = {
  intro: document.getElementById("intro"),
  quiz: document.getElementById("quiz"),
  result: document.getElementById("result"),
  startBtn: document.getElementById("startBtn"),
  prevBtn: document.getElementById("prevBtn"),
  nextBtn: document.getElementById("nextBtn"),
  progressCurrent: document.getElementById("progressCurrent"),
  progressTotal: document.getElementById("progressTotal"),
  progressRemaining: document.getElementById("progressRemaining"),
  progressFill: document.getElementById("progressFill"),
  progressBar: document.querySelector(".progress-bar"),
  questionCard: document.querySelector(".question-card"),
  questionTitle: document.getElementById("questionTitle"),
  questionPrompt: document.getElementById("questionPrompt"),
  questionImage: document.getElementById("questionImage"),
  optionsList: document.getElementById("optionsList"),
  resultLabel: document.getElementById("resultLabel"),
  resultDescription: document.getElementById("resultDescription"),
  resultCardEcho: document.getElementById("resultCardEcho"),
  resultComment: document.getElementById("resultComment"),
  scoreList: document.getElementById("scoreList"),
  radarCanvas: document.getElementById("radarChart"),
  shareText: document.getElementById("shareText"),
  copyBtn: document.getElementById("copyBtn"),
  downloadBtn: document.getElementById("downloadBtn"),
  finishBtn: document.getElementById("finishBtn"),
  toast: document.getElementById("toast"),
  cards: document.getElementById("cards"),
  openCardsResultBtn: document.getElementById("openCardsResultBtn"),
  openCardsProfileBtn: document.getElementById("openCardsProfileBtn"),
  cardsBackBtn: document.getElementById("cardsBackBtn"),
  cardGrid: document.getElementById("cardGrid"),
  cardCount: document.getElementById("cardCount"),
  cardTotal: document.getElementById("cardTotal"),
  profile: document.getElementById("profile"),
  profileLabel: document.getElementById("profileLabel"),
  profileDescription: document.getElementById("profileDescription"),
  profileComment: document.getElementById("profileComment"),
  profileScoreList: document.getElementById("profileScoreList"),
  profileRadar: document.getElementById("profileRadar"),
  profileProgressHint: document.getElementById("profileProgressHint"),
  bottomNav: document.getElementById("bottomNav"),
  navHome: document.getElementById("navHome"),
  navProfile: document.getElementById("navProfile"),
  cardModal: document.getElementById("cardModal"),
  cardModalImage: document.getElementById("cardModalImage"),
  cardModalTitle: document.getElementById("cardModalTitle"),
  cardModalClose: document.getElementById("cardModalClose"),
  cardModalCancel: document.getElementById("cardModalCancel"),
  drawCardsGrid: document.getElementById("drawCardsGrid"),
  redrawCardsBtn: document.getElementById("redrawCardsBtn"),
  // ===== 新增：账号系统 UI =====
  authModal: document.getElementById("authModal"),
  authCloseBtn: document.getElementById("authCloseBtn"),
  authRegister: document.getElementById("authRegister"),
  authLogin: document.getElementById("authLogin"),
  regForm: document.getElementById("regForm"),
  regNickname: document.getElementById("regNickname"),
  registerBtn: document.getElementById("registerBtn"),
  regSuccess: document.getElementById("regSuccess"),
  regUserId: document.getElementById("regUserId"),
  copyRegUserIdBtn: document.getElementById("copyRegUserIdBtn"),
  goHomeBtn: document.getElementById("goHomeBtn"),
  loginUserId: document.getElementById("loginUserId"),
  loginBtn: document.getElementById("loginBtn"),
  authSwitchText: document.getElementById("authSwitchText"),
  friendBanner: document.getElementById("friendBanner"),
  friendBannerName: document.getElementById("friendBannerName"),
  friendSubmitSuccess: document.getElementById("friendSubmitSuccess"),
  ownerResultContent: document.getElementById("ownerResultContent"),
  inviteUrlInput: document.getElementById("inviteUrlInput"),
  copyInviteBtn: document.getElementById("copyInviteBtn"),
  friendCountHint: document.getElementById("friendCountHint"),
  ownerActions: document.getElementById("ownerActions"),
  ownerInviteBtn: document.getElementById("ownerInviteBtn")
};

init();

// 全局错误捕获
window.addEventListener("error", (e) => {
  console.error("[JS Error]", e.message, e.filename, e.lineno);
});
window.addEventListener("unhandledrejection", (e) => {
  console.error("[Promise Error]", e.reason);
});

async function init() {
  try {
    // 检测 URL 邀请参数
    const inviteId = getUrlParam("invite");
    if (inviteId) {
      state.isFriendMode = true;
      state.ownerUserId = inviteId;
      // 好友模式不需要登录，直接进入测试
    } else {
      // 号主模式：尝试从 localStorage 恢复登录状态
      state.currentUser = loadAuthUser();
    }

    // 先绑定事件，确保 UI 可交互
    bindEvents();

    const [questions, outcomes, comments] = await Promise.all([
      loadJson("./data/questions.json"),
      loadJson("./data/outcomes.json"),
      loadJson("./data/comments.json")
    ]);

    if (!questions || !outcomes || !comments) {
      showToast("数据加载失败，请确认服务器正常运行。", true);
      console.error("[Init] 数据加载失败，请检查 data/ 目录和服务器");
      return;
    }

    state.questions = questions;
    state.outcomes = outcomes;
    state.comments = comments;
    state.cards = buildCardsFromQuestions(questions);
    state.maxScores = computeMaxScores(questions);
    state.attemptHistory = loadAttemptHistory();
    state.answerMap = loadCurrentAnswers();
    ui.progressTotal.textContent = questions.length;
    if (ui.progressBar) {
      ui.progressBar.setAttribute("aria-valuemax", String(questions.length));
    }

    // 根据模式决定初始页面
    if (state.isFriendMode) {
      // 好友模式：获取号主昵称并显示横幅，等待用户点击开始测试
      await fetchOwnerInfo(inviteId);
      showFriendBanner(state.friendProfileData?.nickname || "号主");
      if (ui.startBtn) ui.startBtn.classList.remove("is-hidden");
      if (ui.ownerActions) ui.ownerActions.classList.add("is-hidden");
      // 不自动开始，由用户点击按钮触发
    } else {
      // 号主模式：需要登录
      if (state.currentUser) {
        showScreen("intro");
        loadInviteUrl();
        // 号主模式：隐藏开始测试，显示邀请引导
        if (ui.startBtn) ui.startBtn.classList.add("is-hidden");
        if (ui.ownerActions) ui.ownerActions.classList.remove("is-hidden");
        if (ui.navHome) ui.navHome.textContent = "邀请测试";
      } else {
        showAuthModal();
      }
    }
  } catch (err) {
    console.error("[Init] 初始化失败:", err);
    showToast("初始化出错，请刷新页面重试。", true);
  }
}

// ===== API 调用封装 =====
const API_BASE = "";

async function apiPost(path, data) {
  const res = await fetch(API_BASE + path, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(data)
  });
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "请求失败" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

async function apiGet(path) {
  const res = await fetch(API_BASE + path);
  if (!res.ok) {
    const err = await res.json().catch(() => ({ error: "请求失败" }));
    throw new Error(err.error || `HTTP ${res.status}`);
  }
  return res.json();
}

// ===== 账号系统 =====
function showAuthModal() {
  ui.authModal?.classList.add("active");
}

function hideAuthModal() {
  ui.authModal?.classList.remove("active");
}

function loadAuthUser() {
  try {
    const raw = localStorage.getItem(AUTH_USER_KEY);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
}

function saveAuthUser(user) {
  localStorage.setItem(AUTH_USER_KEY, JSON.stringify(user));
}

function clearAuthUser() {
  localStorage.removeItem(AUTH_USER_KEY);
}

let authPanel = "register"; // 'register' | 'login'
function toggleAuthPanel() {
  authPanel = authPanel === "register" ? "login" : "register";
  ui.authRegister?.classList.toggle("active", authPanel === "register");
  ui.authLogin?.classList.toggle("active", authPanel === "login");
  ui.authSwitchText.textContent = authPanel === "register"
    ? "已有账号？去登录"
    : "没有账号？去注册";
}

async function handleRegister() {
  const nickname = ui.regNickname?.value.trim();
  if (!nickname) {
    showToast("请输入昵称", true);
    return;
  }
  try {
    const data = await apiPost("/api/auth/register", { nickname });
    state.currentUser = { userId: data.userId, nickname: data.nickname };
    saveAuthUser(state.currentUser);
    // 显示注册成功面板，展示 userId
    ui.regForm?.classList.add("is-hidden");
    ui.regSuccess?.classList.remove("is-hidden");
    if (ui.regUserId) ui.regUserId.value = data.userId;
  } catch (e) {
    showToast(e.message || "注册失败", true);
  }
}

function enterHomeFromRegister() {
  hideAuthModal();
  showToast(`欢迎, ${state.currentUser?.nickname}!`);
  loadInviteUrl();
  showScreen("intro");
}

async function handleLogin() {
  const userId = ui.loginUserId?.value.trim();
  if (!userId) {
    showToast("请输入用户ID", true);
    return;
  }
  try {
    const data = await apiPost("/api/auth/login", { userId });
    state.currentUser = { userId: data.userId, nickname: data.nickname };
    saveAuthUser(state.currentUser);
    hideAuthModal();
    showToast(`欢迎回来, ${data.nickname}!`);
    loadInviteUrl();
    showScreen("intro");
  } catch (e) {
    showToast(e.message || "登录失败", true);
  }
}

// ===== 好友模式 =====
function showFriendBanner(ownerName) {
  if (ui.friendBannerName) ui.friendBannerName.textContent = ownerName;
  ui.friendBanner?.classList.remove("is-hidden");
  if (ui.bottomNav) ui.bottomNav.style.display = "none"; // 好友模式隐藏底部导航
}

function hideFriendBanner() {
  ui.friendBanner?.classList.add("is-hidden");
  if (ui.bottomNav) ui.bottomNav.style.display = "";
}

async function fetchOwnerInfo(userId) {
  try {
    const data = await apiGet(`/api/user/${userId}/share`);
    state.friendProfileData = data;
  } catch {
    state.friendProfileData = { nickname: "号主" };
  }
}

async function submitToOwner(answerMap, scores) {
  if (!state.ownerUserId) return false;
  try {
    await apiPost(`/api/user/${state.ownerUserId}/response`, { answerMap, scores });
    return true;
  } catch (e) {
    console.error("提交失败:", e);
    showToast("提交失败，请重试", true);
    return false;
  }
}

async function fetchProfileData(userId) {
  try {
    const data = await apiGet(`/api/user/${userId}/profile`);
    return data;
  } catch (e) {
    console.error("拉取画像数据失败:", e);
    return null;
  }
}

async function loadInviteUrl() {
  if (!state.currentUser) return;
  try {
    const data = await apiGet(`/api/user/${state.currentUser.userId}/share`);
    if (ui.inviteUrlInput) ui.inviteUrlInput.value = data.inviteUrl;
    if (ui.friendCountHint) ui.friendCountHint.textContent = `已有 ${data.responseCount} 位好友作答`;
  } catch {
    // 静默处理
  }
}

function copyInviteUrl() {
  const url = ui.inviteUrlInput?.value;
  if (!url) return;
  navigator.clipboard?.writeText(url).then(
    () => showToast("邀请链接已复制"),
    () => showToast("复制失败，请手动复制", true)
  );
}

function bindEvents() {
  ui.startBtn.addEventListener("click", handleStart);
  ui.prevBtn.addEventListener("click", goPrev);
  ui.nextBtn.addEventListener("click", goNext);
  ui.copyBtn.addEventListener("click", copyShareText);
  ui.downloadBtn.addEventListener("click", downloadResultCard);
  ui.finishBtn?.addEventListener("click", handleFinish);
  ui.openCardsResultBtn?.addEventListener("click", () => openCardWall("result"));
  ui.openCardsProfileBtn?.addEventListener("click", () => openCardWall("profile"));
  ui.cardsBackBtn?.addEventListener("click", () => showScreen(state.previousScreen || "intro"));
  ui.navHome?.addEventListener("click", onNavQuiz);
  ui.navProfile?.addEventListener("click", onNavProfile);
  ui.cardModalClose?.addEventListener("click", closeCardModal);
  ui.cardModalCancel?.addEventListener("click", closeCardModal);
  ui.cardModal?.addEventListener("click", (e) => {
    if (e.target === ui.cardModal) closeCardModal();
  });
  ui.redrawCardsBtn?.addEventListener("click", redrawCards);

  // ===== 账号系统事件 =====
  ui.authCloseBtn?.addEventListener("click", () => {
    // 如果未登录，关闭弹窗后仍需登录
    if (!state.currentUser) {
      showToast("请先登录或注册");
      return;
    }
    hideAuthModal();
  });
  ui.registerBtn?.addEventListener("click", handleRegister);
  ui.loginBtn?.addEventListener("click", handleLogin);
  ui.authSwitchText?.addEventListener("click", toggleAuthPanel);
  ui.regNickname?.addEventListener("keydown", (e) => { if (e.key === "Enter") handleRegister(); });
  ui.loginUserId?.addEventListener("keydown", (e) => { if (e.key === "Enter") handleLogin(); });

  // 邀请相关
  ui.copyInviteBtn?.addEventListener("click", copyInviteUrl);
  ui.ownerInviteBtn?.addEventListener("click", () => {
    copyInviteUrl();
    showToast("邀请链接已复制，快去分享给好友吧！");
  });

  // 注册成功面板
  ui.copyRegUserIdBtn?.addEventListener("click", () => {
    const id = ui.regUserId?.value;
    if (!id) return;
    navigator.clipboard?.writeText(id).then(
      () => showToast("用户ID已复制"),
      () => showToast("复制失败，请手动复制", true)
    );
  });
  ui.goHomeBtn?.addEventListener("click", enterHomeFromRegister);
}

async function loadJson(path) {
  try {
    const res = await fetch(path);
    if (!res.ok) {
      throw new Error("Failed fetch");
    }
    return res.json();
  } catch (error) {
    return null;
  }
}

async function showScreen(name) {
  ui.intro.classList.toggle("active", name === "intro");
  ui.quiz.classList.toggle("active", name === "quiz");
  ui.result.classList.toggle("active", name === "result");
  ui.cards?.classList.toggle("active", name === "cards");
  ui.profile?.classList.toggle("active", name === "profile");
  if (name !== "cards") {
    state.previousScreen = name;
  }
  if (name === "result") {
    updateCardEcho();
  }
  if (name === "profile") {
    await openProfile();
  }
  updateBottomNav(name);
}

function handleStart() {
  // 好友模式：直接进入测试
  if (state.isFriendMode) {
    startQuiz();
    return;
  }
  // 号主模式：需要先登录
  if (!state.currentUser) {
    showAuthModal();
    return;
  }
  // 号主不能为自己测试，复制邀请链接
  copyInviteUrl();
  showToast("邀请链接已复制，快去分享给好友吧！");
}

function onNavQuiz() {
  if (state.isFriendMode) {
    showScreen("quiz");
    return;
  }
  // 号主模式：不能进入测试，回到首页并提示
  if (!state.currentUser) {
    showAuthModal();
    return;
  }
  showScreen("intro");
  showToast("号主无法为自己测试，请邀请好友来测测你");
}

async function onNavProfile() {
  // 好友模式下不允许访问 profile
  if (state.isFriendMode) {
    showToast("好友模式无法查看此页面");
    return;
  }
  if (!state.currentUser) {
    showAuthModal();
    return;
  }
  showScreen("profile");
}

function updateBottomNav(name) {
  if (!ui.navHome || !ui.navProfile) {
    return;
  }
  ui.navHome.classList.toggle("active", name !== "profile");
  ui.navProfile.classList.toggle("active", name === "profile");
}

function handleFinish() {
  state.result = null;
  state.comment = null;
  state.scores = null;
  state.answerMap = {};
  state.currentIndex = 0;
  saveCurrentAnswers();
  showScreen("intro");
}

function startQuiz() {
  clearAutoAdvance();
  state.currentIndex = 0;
  state.answerMap = {};
  state.scores = null;
  state.result = null;
  state.comment = null;
  saveCurrentAnswers();
  state.collectedCards = new Set();
  state.drawnCards = [];
  state.revealedSlots = [false, false, false];
  state.hasDrawn = false;
  renderQuestion();
  showScreen("quiz");
}

function goPrev() {
  clearAutoAdvance();
  if (state.currentIndex === 0) {
    return;
  }
  transitionToIndex(state.currentIndex - 1);
}

function goNext() {
  clearAutoAdvance();
  const current = state.questions[state.currentIndex];
  if (!state.answerMap[current.id]) {
    return;
  }
  if (state.currentIndex === state.questions.length - 1) {
    showResult();
    return;
  }
  transitionToIndex(state.currentIndex + 1);
}

function renderQuestion() {
  const question = state.questions[state.currentIndex];
  if (!question) {
    console.error("[renderQuestion] 题目未加载或索引越界", state.currentIndex, state.questions.length);
    return;
  }
  ui.progressCurrent.textContent = String(state.currentIndex + 1);
  ui.questionTitle.textContent = `第 ${question.id} 题 · ${question.title}`;
  ui.questionPrompt.textContent = question.prompt;
  if (ui.questionImage) {
    ui.questionImage.src = `./images/questions/q${question.id}.png`;
    ui.questionImage.style.display = "";
  }

  const selected = state.answerMap[question.id]?.optionId;
  ui.optionsList.innerHTML = "";

  question.options.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "option" + (selected === option.id ? " selected" : "");
    button.dataset.option = option.id;
    const imgSrc = `./images/cards/t${question.id}${option.id.toLowerCase()}.png`;
    const cardTitle = option.note || option.text;
    button.innerHTML = `
      <span class="option-label">${option.id}</span>
      <img class="option-image" src="${imgSrc}" alt="${cardTitle}" loading="lazy" onerror="this.style.display='none'">
      <span class="option-content">
        <h4>${option.text}</h4>
        <p>${option.note}</p>
      </span>
    `;

    // 点击图片查看大图
    const imgEl = button.querySelector(".option-image");
    if (imgEl) {
      imgEl.addEventListener("click", (e) => {
        e.stopPropagation();
        openCardModal({
          image: imgSrc,
          title: cardTitle
        });
      });
    }

    button.addEventListener("click", () => selectOption(question, option));
    ui.optionsList.appendChild(button);
  });

  ui.prevBtn.disabled = state.currentIndex === 0;
  ui.nextBtn.disabled = !selected;
  ui.nextBtn.textContent = state.currentIndex === state.questions.length - 1 ? "查看结果" : "下一题";
  updateProgress();
}

function transitionToIndex(nextIndex) {
  if (!ui.questionCard) {
    state.currentIndex = nextIndex;
    renderQuestion();
    return;
  }

  ui.questionCard.classList.add("is-fading");
  window.setTimeout(() => {
    state.currentIndex = nextIndex;
    renderQuestion();
    window.requestAnimationFrame(() => {
      ui.questionCard.classList.remove("is-fading");
    });
  }, FADE_DURATION);
}

function selectOption(question, option) {
  clearAutoAdvance();
  state.answerMap[question.id] = {
    optionId: option.id,
    weights: option.weights
  };
  saveCurrentAnswers();
  unlockCard(question.id, option.id);
  renderQuestion();
  const indexSnapshot = state.currentIndex;
  state.autoAdvance = window.setTimeout(() => {
    if (state.currentIndex !== indexSnapshot) {
      return;
    }
    goNext();
  }, AUTO_ADVANCE_DELAY);
}

async function openProfile() {
  // 如果是好友模式，不允许查看 profile
  if (state.isFriendMode) return;

  const hasHistory = state.attemptHistory.length > 0;
  const currentAnswered = Object.keys(state.answerMap).length;
  const total = state.questions.length || 1;

  // ===== 从服务端拉取聚合数据 =====
  let serverScores = null;
  let serverCollectedCards = [];
  let friendCount = 0;

  if (state.currentUser) {
    const profileData = await fetchProfileData(state.currentUser.userId);
    if (profileData) {
      state.friendProfileData = profileData;
      friendCount = profileData.friendCount || 0;
      serverScores = profileData.avgScores;
      serverCollectedCards = profileData.collectedCards || [];
      if (ui.friendCountHint) {
        ui.friendCountHint.textContent = `已有 ${friendCount} 位好友作答`;
      }
    }
  }

  // 有服务端数据时优先使用
  const useServerData = serverScores && friendCount > 0;

  if (!useServerData && !hasHistory && currentAnswered === 0) {
    ui.profileLabel.textContent = "尚未开始";
    ui.profileDescription.textContent = "邀请好友作答后，这里会显示聚合画像。你也可以自己答题来测试。";
    ui.profileComment.textContent = "";
    ui.profileScoreList.innerHTML = "";
    if (ui.profileRadar) {
      const ctx = ui.profileRadar.getContext("2d");
      if (ctx) {
        ctx.clearRect(0, 0, ui.profileRadar.width, ui.profileRadar.height);
      }
    }
    if (ui.profileProgressHint) {
      ui.profileProgressHint.textContent = "";
    }
    return;
  }

  let scores;
  let sourceHint = "";

  if (useServerData) {
    scores = serverScores;
    sourceHint = `基于 ${friendCount} 位好友的答题聚合`;
  } else if (hasHistory) {
    scores = computeAverageScores();
    sourceHint = `基于 ${state.attemptHistory.length} 次答题的平均值`;
  } else {
    scores = computeScores();
  }

  const outcome = selectOutcome(scores);
  const comment = selectComment(scores);

  state.profileScores = scores;
  state.profileOutcome = outcome;

  ui.profileLabel.textContent = outcome.label;
  ui.profileDescription.textContent = outcome.description;

  if (ui.profileProgressHint) {
    if (useServerData && friendCount > 0) {
      ui.profileProgressHint.textContent = sourceHint;
    } else if (hasHistory) {
      ui.profileProgressHint.textContent = sourceHint;
    } else {
      const remaining = total - currentAnswered;
      if (remaining > 0) {
        ui.profileProgressHint.textContent = `已答 ${currentAnswered} / ${total} 题，剩余 ${remaining} 题。结果可能随答题继续变化。`;
      } else {
        ui.profileProgressHint.textContent = `全部 ${total} 题已答完，此为最终结果预览。`;
      }
    }
  }

  renderScoreListTo(scores, ui.profileScoreList);
  renderRadarChartTo(scores, ui.profileRadar);

  // Rebuild collected cards: 服务端数据优先
  if (useServerData && serverCollectedCards.length > 0) {
    state.collectedCards = new Set(serverCollectedCards);
  } else {
    rebuildCollectedFromHistory();
  }

  // Initialize the draw-cards area for the profile page
  initDrawCardsSection();

  // Profile comprehensive comment is locked until the player finishes the draw
  renderProfileCommentStage();
}

// Build `state.collectedCards` from `state.attemptHistory` and current answers
function rebuildCollectedFromHistory() {
  state.collectedCards = new Set(state.collectedCards || []);

  // include current answers in case user has partial progress
  const includeAnswerMap = (answerMap) => {
    Object.entries(answerMap || {}).forEach(([qid, ans]) => {
      const qidNum = Number(qid);
      const opt = ans?.optionId;
      if (qidNum && opt) {
        state.collectedCards.add(getCardId(qidNum, opt));
      }
    });
  };

  // include answers from each historical attempt
  (state.attemptHistory || []).forEach((attempt) => {
    includeAnswerMap(attempt.answerMap);
  });

  // include current in-progress answers as well
  includeAnswerMap(state.answerMap);
}

function renderProfileCommentStage() {
  if (!ui.profileComment) {
    return;
  }

  if (!state.hasDrawn || state.drawnCards.length < 3) {
    ui.profileComment.innerHTML = `
      <p class="profile-comment-lock">抽满 3 张卡后解锁完整综合评语。</p>
      <p class="profile-comment-hint">当前仅展示属性统计与画像主体，综合评语会根据你抽到的卡牌逐级展开。</p>
    `;
    return;
  }

  const outcome = state.profileOutcome || state.result || state.outcomes[0];
  const tierInfo = getDrawnCardsTier();
  const review = getProfileReviewForTier(outcome, tierInfo.tier);

  ui.profileComment.innerHTML = `
    <div class="profile-comment-stage">
      <p class="profile-comment-stage-label">${tierInfo.label}</p>
      <p class="profile-comment-stage-text">${review}</p>
    </div>
  `;
}

function getCardIntensityScore(card) {
  return Object.values(card.weights || {}).reduce((sum, value) => sum + value, 0);
}

function getDrawnCardsTotalScore() {
  return state.drawnCards.reduce((sum, card) => sum + getCardIntensityScore(card), 0);
}

function getMaxCardIntensityScore() {
  const maxScore = Math.max(...state.cards.map((card) => getCardIntensityScore(card)), 0);
  return Math.max(maxScore, 1);
}

function getDrawnCardsTier() {
  const totalScore = getDrawnCardsTotalScore();
  const totals = getPossibleDrawTotals();

  if (!totals.length) {
    return { tier: "mild", label: "轻度综合评语" };
  }

  const p33 = totals[Math.floor((totals.length - 1) * 0.33)];
  const p66 = totals[Math.floor((totals.length - 1) * 0.66)];

  if (totalScore >= p66) {
    return { tier: "severe", label: "重度综合评语" };
  }
  if (totalScore >= p33) {
    return { tier: "medium", label: "中度综合评语" };
  }
  return { tier: "mild", label: "轻度综合评语" };
}

function getPossibleDrawTotals() {
  const poolIds = Array.from(state.collectedCards || []);
  const usePool = poolIds.length >= 3;
  const pool = usePool ? poolIds.map((id) => getCardById(id)).filter(Boolean) : state.cards;

  if (!pool || pool.length < 3) {
    return [];
  }

  const totals = [];
  for (let i = 0; i < pool.length - 2; i += 1) {
    for (let j = i + 1; j < pool.length - 1; j += 1) {
      for (let k = j + 1; k < pool.length; k += 1) {
        totals.push(
          getCardIntensityScore(pool[i]) +
          getCardIntensityScore(pool[j]) +
          getCardIntensityScore(pool[k])
        );
      }
    }
  }

  totals.sort((a, b) => a - b);
  return totals;
}

function getProfileReviewForTier(outcome, tier) {
  const reviews = outcome?.reviews;
  if (reviews && reviews[tier]) {
    return reviews[tier];
  }
  return outcome?.description || "暂无综合评语。";
}

function showResult() {
  state.scores = computeScores();
  const outcome = selectOutcome(state.scores);
  const comment = selectComment(state.scores);

  state.attemptHistory.push({
    timestamp: Date.now(),
    answerMap: JSON.parse(JSON.stringify(state.answerMap)),
    scores: { ...state.scores }
  });
  saveAttemptHistory();
  clearCurrentAnswers();

  state.result = outcome;
  state.comment = comment;

  ui.resultLabel.textContent = outcome.label;
  ui.resultDescription.textContent = outcome.description;
  ui.resultComment.textContent = comment.text;

  // ===== 好友模式：提交到服务端并显示成功提示 =====
  if (state.isFriendMode) {
    // 隐藏号主的结果详情，显示提交成功
    ui.ownerResultContent?.classList.add("is-hidden");
    ui.friendSubmitSuccess?.classList.remove("is-hidden");
    hideFriendBanner();
    // 提交数据到服务端
    submitToOwner(
      JSON.parse(JSON.stringify(state.answerMap)),
      { ...state.scores }
    );
    showScreen("result");
    return;
  }

  // 号主模式：正常展示结果
  ui.ownerResultContent?.classList.remove("is-hidden");
  ui.friendSubmitSuccess?.classList.add("is-hidden");
  showScreen("result");
  renderScoreList(state.scores);
  renderRadarChart(state.scores);
  ui.shareText.value = buildShareText(outcome, comment, state.scores);

  initDrawCardsSection();
}

function computeScores() {
  const totals = createEmptyScores();
  Object.values(state.answerMap).forEach((answer) => {
    Object.entries(answer.weights).forEach(([key, value]) => {
      totals[key] += value;
    });
  });
  return totals;
}

function computeMaxScores(questions) {
  const totals = createEmptyScores();
  questions.forEach((question) => {
    const perQuestionMax = createEmptyScores();
    question.options.forEach((option) => {
      Object.entries(option.weights).forEach(([key, value]) => {
        if (value > perQuestionMax[key]) {
          perQuestionMax[key] = value;
        }
      });
    });
    Object.entries(perQuestionMax).forEach(([key, value]) => {
      totals[key] += value;
    });
  });
  return totals;
}

function selectOutcome(scores) {
  const triggered = state.outcomes
    .filter((outcome) => conditionsMet(outcome.conditions, scores))
    .map((outcome) => ({
      ...outcome,
      triggerScore: computeTriggerScore(outcome, scores)
    }));

  if (triggered.length === 0) {
    return fallbackOutcome(scores);
  }

  const maxPriority = Math.max(...triggered.map((o) => outcomePriority(o)));
  const prioritized = triggered.filter((o) => outcomePriority(o) === maxPriority);
  const maxScore = Math.max(...prioritized.map((o) => o.triggerScore));
  const top = prioritized.filter((o) => o.triggerScore === maxScore);
  return top[Math.floor(Math.random() * top.length)];
}

function conditionsMet(conditions = {}, scores) {
  if (conditions.min) {
    for (const [key, minValue] of Object.entries(conditions.min)) {
      if (scores[key] < minValue) {
        return false;
      }
    }
  }
  if (conditions.max) {
    for (const [key, maxValue] of Object.entries(conditions.max)) {
      if (scores[key] > maxValue) {
        return false;
      }
    }
  }
  if (conditions.question) {
    for (const [qid, allowed] of Object.entries(conditions.question)) {
      const selected = state.answerMap[Number(qid)]?.optionId;
      if (!selected || !allowed.includes(selected)) {
        return false;
      }
    }
  }
  return true;
}

function computeTriggerScore(outcome, scores) {
  const keys = Object.keys(outcome.conditions?.min || {});
  if (!keys.length) {
    return 0;
  }
  return keys.reduce((sum, key) => sum + scores[key], 0);
}

function fallbackOutcome(scores) {
  const ordered = ATTRS.map((attr) => ({ id: attr.id, value: scores[attr.id] }))
    .sort((a, b) => b.value - a.value);
  const topOne = ordered[0]?.id;
  const topTwo = ordered[1]?.id;
  const coreOutcomes = state.outcomes.filter((outcome) => outcome.tier === "core");

  let matched = coreOutcomes.find((outcome) => outcome.main === topOne && outcome.sub === topTwo);
  if (!matched) {
    matched = coreOutcomes.find((outcome) => outcome.main === topOne);
  }
  return matched || coreOutcomes[0] || state.outcomes[0];
}

function selectComment(scores) {
  const ordered = ATTRS.map((attr) => ({ id: attr.id, value: scores[attr.id] }))
    .sort((a, b) => b.value - a.value);
  const topOne = ordered[0]?.id;
  const topTwo = ordered.slice(0, 2).map((item) => item.id);

  const matched = state.comments.find((comment) => commentMatches(comment.rule, topOne, topTwo));
  if (matched) {
    return matched;
  }

  const fallback = state.comments.find((comment) => comment.rule?.topIs === topOne);
  return fallback || state.comments[0];
}

function commentMatches(rule = {}, topOne, topTwo) {
  if (rule.topIs && rule.topIs !== topOne) {
    return false;
  }
  if (rule.topIncludes) {
    const includesAll = rule.topIncludes.every((id) => topTwo.includes(id));
    if (!includesAll) {
      return false;
    }
  }
  if (rule.question) {
    for (const [qid, allowed] of Object.entries(rule.question)) {
      const selected = state.answerMap[Number(qid)]?.optionId;
      if (!selected || !allowed.includes(selected)) {
        return false;
      }
    }
  }
  return true;
}

function buildCardsFromQuestions(questions) {
  const cards = [];
  questions.forEach((question) => {
    question.options.forEach((option) => {
      cards.push({
        id: getCardId(question.id, option.id),
        questionId: question.id,
        optionId: option.id,
        title: option.note || option.text,
        weights: { ...option.weights },
        image: `./images/cards/t${question.id}${option.id.toLowerCase()}.png`
      });
    });
  });
  return cards;
}

function getCardId(questionId, optionId) {
  return `T${questionId}-${optionId}`;
}

function unlockCard(questionId, optionId) {
  const cardId = getCardId(questionId, optionId);
  state.collectedCards.add(cardId);
}

function initDrawCardsSection() {
  state.hasDrawn = false;
  state.drawnCards = [];
  state.revealedSlots = [false, false, false];

  // 随机选择3张卡牌
  const collectedArray = Array.from(state.collectedCards);
  const shuffled = collectedArray.sort(() => Math.random() - 0.5);
  const drawnIds = shuffled.slice(0, 3);
  state.drawnCards = drawnIds.map((id) => getCardById(id)).filter(Boolean);

  // 重置UI - 使用3D翻转结构
  const slots = ui.drawCardsGrid?.querySelectorAll(".draw-card-slot");
  slots?.forEach((slot, index) => {
    slot.classList.remove("revealed");
    const card = state.drawnCards[index];
    slot.innerHTML = `
      <span class="draw-card-question">?</span>
      <img src="${card?.image || ''}" alt="${card?.title || ''}">
    `;
  });

  // 绑定点击事件
  slots?.forEach((slot, index) => {
    slot.onclick = () => revealCardSlot(index);
  });
}

function revealCardSlot(index) {
  const card = state.drawnCards[index];
  if (!card) return;

  // 如果还没翻开，先翻开
  if (!state.revealedSlots[index]) {
    state.revealedSlots[index] = true;

    const slots = ui.drawCardsGrid?.querySelectorAll(".draw-card-slot");
    const slot = slots?.[index];
    if (slot) {
      slot.classList.add("revealed");
    }

    // 检查是否全部翻开
    if (state.revealedSlots.every((r) => r)) {
      state.hasDrawn = true;
      updateCardEcho();
      renderProfileCommentStage();
    }
  }

  // 显示弹窗
  openCardModal(card);
}

function redrawCards() {
  initDrawCardsSection();
  renderProfileCommentStage();
}

function getCardById(cardId) {
  return state.cards.find((card) => card.id === cardId);
}

function renderCardWall() {
  if (!ui.cardGrid) return;

  ui.cardGrid.innerHTML = "";

  const collectedIds = new Set(state.collectedCards || []);

  state.cards.forEach((card) => {
    const item = document.createElement("div");
    const isCollected = collectedIds.has(card.id);
    item.className = `card-item${isCollected ? "" : " locked"}`;

    if (isCollected) {
      item.innerHTML = `
        <img src="${card.image}" alt="${card.title}" class="card-image">
        <div class="card-title">${card.title}</div>
      `;
      item.addEventListener("click", () => openCardModal(card));
    } else {
      item.innerHTML = `<span class="card-locked-text">?</span>`;
    }

    ui.cardGrid.appendChild(item);
  });

  if (ui.cardCount) {
    ui.cardCount.textContent = String(collectedIds.size);
  }
  if (ui.cardTotal) {
    ui.cardTotal.textContent = String(state.cards.length);
  }
  updateCardNav();
}

function updateCardNav() {
  if (!ui.cardsBackBtn) {
    return;
  }
  const labelMap = { result: "返回结果", profile: "返回我的", intro: "返回" };
  ui.cardsBackBtn.textContent = labelMap[state.previousScreen] || "返回";
}

function openCardWall(from) {
  state.previousScreen = from;
  renderCardWall();
  showScreen("cards");
}

function openCardModal(card) {
  state.currentViewingCard = card;
  ui.cardModalImage.src = card.image;
  ui.cardModalImage.alt = card.title;
  ui.cardModalTitle.textContent = card.title;
  ui.cardModal.classList.add("active");
}

function closeCardModal() {
  ui.cardModal.classList.remove("active");
  state.currentViewingCard = null;
}

function updateCardEcho() {
  if (!ui.resultCardEcho) return;

  if (!state.hasDrawn || state.drawnCards.length !== 3) {
    ui.resultCardEcho.textContent = "";
    ui.resultCardEcho.classList.add("is-hidden");
    return;
  }

  const sentence = composeCardSentence(state.drawnCards);
  state.cardEcho = { sentence, cards: state.drawnCards };
  ui.resultCardEcho.textContent = `卡牌回声：${sentence}`;
  ui.resultCardEcho.classList.remove("is-hidden");
}

function composeCardSentence(cards) {
  const cleaned = cards.map((card) => normalizeSentenceFragment(card.title));
  return `${cleaned[0]}，${cleaned[1]}，${cleaned[2]}。`;
}

function normalizeSentenceFragment(text) {
  if (!text) return "";
  return text.replace(/[。！？；,.，!？;]+$/g, "");
}

function renderScoreList(scores) {
  renderScoreListTo(scores, ui.scoreList);
}

function renderScoreListTo(scores, container) {
  if (!container) {
    return;
  }
  container.innerHTML = "";
  ATTRS.forEach((attr) => {
    const maxValue = state.maxScores?.[attr.id] ?? scores[attr.id] ?? 0;
    const percent = maxValue ? Math.round((scores[attr.id] / maxValue) * 100) : 0;
    const row = document.createElement("div");
    row.className = "score-row";
    row.innerHTML = `
      <div class="score-meta">
        <span>${attr.label}</span>
        <span>${scores[attr.id]}</span>
      </div>
      <div class="score-bar"><span style="width: ${percent}%"></span></div>
    `;
    container.appendChild(row);
  });
}

function renderRadarChart(scores) {
  renderRadarChartTo(scores, ui.radarCanvas);
}

function renderRadarChartTo(scores, canvas) {
  if (!canvas) {
    return;
  }
  const available = canvas.parentElement?.clientWidth || 240;
  const size = Math.max(160, Math.min(240, Math.floor(available)));
  const ratio = window.devicePixelRatio || 1;
  canvas.width = size * ratio;
  canvas.height = size * ratio;
  canvas.style.width = `${size}px`;
  canvas.style.height = `${size}px`;

  const ctx = canvas.getContext("2d");
  ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
  ctx.clearRect(0, 0, size, size);

  const center = size / 2;
  const textPadding = Math.max(26, Math.round(size * 0.14));
  const labelOffset = Math.max(10, Math.round(size * 0.05));
  const radius = Math.max(32, center - textPadding - labelOffset);
  const labelDistance = radius + labelOffset;
  const levels = 4;

  ctx.strokeStyle = "rgba(0, 0, 0, 0.12)";
  ctx.lineWidth = 1;

  for (let i = 1; i <= levels; i += 1) {
    const r = (radius / levels) * i;
    ctx.beginPath();
    for (let j = 0; j < ATTRS.length; j += 1) {
      const angle = (Math.PI * 2 * j) / ATTRS.length - Math.PI / 2;
      const x = center + Math.cos(angle) * r;
      const y = center + Math.sin(angle) * r;
      if (j === 0) {
        ctx.moveTo(x, y);
      } else {
        ctx.lineTo(x, y);
      }
    }
    ctx.closePath();
    ctx.stroke();
  }

  ATTRS.forEach((attr, index) => {
    const angle = (Math.PI * 2 * index) / ATTRS.length - Math.PI / 2;
    const x = center + Math.cos(angle) * labelDistance;
    const y = center + Math.sin(angle) * labelDistance;
    ctx.fillStyle = "#1a1a1a";
    ctx.font = "13px 'Noto Sans SC'";
    ctx.textAlign = Math.cos(angle) > 0.1 ? "left" : Math.cos(angle) < -0.1 ? "right" : "center";
    ctx.textBaseline = Math.sin(angle) > 0.1 ? "top" : Math.sin(angle) < -0.1 ? "bottom" : "middle";
    ctx.fillText(attr.label, x, y);
  });

  ctx.beginPath();
  ATTRS.forEach((attr, index) => {
    const maxValue = state.maxScores?.[attr.id] ?? 1;
    const value = scores[attr.id] ?? 0;
    const ratioValue = Math.min(value / maxValue, 1);
    const angle = (Math.PI * 2 * index) / ATTRS.length - Math.PI / 2;
    const x = center + Math.cos(angle) * radius * ratioValue;
    const y = center + Math.sin(angle) * radius * ratioValue;
    if (index === 0) {
      ctx.moveTo(x, y);
    } else {
      ctx.lineTo(x, y);
    }
  });
  ctx.closePath();
  ctx.fillStyle = "rgba(0, 0, 0, 0.08)";
  ctx.fill();
  ctx.strokeStyle = "#1a1a1a";
  ctx.lineWidth = 2;
  ctx.stroke();
}

function buildShareText(outcome, comment, scores) {
  const scoreLine = ATTRS.map((attr) => `${attr.label}${scores[attr.id]}`).join(" / ");
  return `我的结果是「${outcome.label}」。${outcome.description}｜${comment.text}｜${scoreLine}`;
}

function copyShareText() {
  const text = ui.shareText.value;
  if (!text) {
    return;
  }
  navigator.clipboard?.writeText(text).then(
    () => showToast("文案已复制"),
    () => showToast("复制失败，请手动复制", true)
  );
}

async function downloadResultCard() {
  const outcome = state.result;
  const comment = state.comment;
  if (!outcome || !comment) {
    return;
  }

  await document.fonts.ready;

  const canvas = document.createElement("canvas");
  const width = 1080;
  const height = 1350;
  canvas.width = width;
  canvas.height = height;

  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#1a1a1a";
  ctx.font = "600 36px 'Noto Sans SC'";
  ctx.fillText("最终画像", 80, 100);

  ctx.fillStyle = "#1a1a1a";
  ctx.font = "700 64px 'Noto Serif SC'";
  wrapText(ctx, outcome.label, 80, 200, width - 160, 72);

  ctx.font = "32px 'Noto Sans SC'";
  wrapText(ctx, outcome.description, 80, 360, width - 160, 46);

  ctx.font = "28px 'Noto Sans SC'";
  wrapText(ctx, comment.text, 80, 500, width - 160, 40);

  ctx.font = "600 26px 'Noto Sans SC'";
  ctx.fillStyle = "#1a1a1a";
  ctx.fillText("属性总计", 80, 720);

  ctx.font = "24px 'Noto Sans SC'";
  ctx.fillStyle = "#1a1a1a";
  ATTRS.forEach((attr, index) => {
    ctx.fillText(`${attr.label} ${state.scores[attr.id]}`, 80, 770 + index * 42);
  });

  ctx.font = "20px 'Noto Sans SC'";
  ctx.fillStyle = "#666666";
  ctx.fillText("15 题版本", 80, height - 60);

  const link = document.createElement("a");
  link.download = "result-card.png";
  link.href = canvas.toDataURL("image/png");
  link.click();
}

function wrapText(ctx, text, x, y, maxWidth, lineHeight) {
  const words = text.split("");
  let line = "";
  let offsetY = 0;

  words.forEach((char, index) => {
    const testLine = line + char;
    const metrics = ctx.measureText(testLine);
    if (metrics.width > maxWidth && index > 0) {
      ctx.fillText(line, x, y + offsetY);
      line = char;
      offsetY += lineHeight;
    } else {
      line = testLine;
    }
  });
  ctx.fillText(line, x, y + offsetY);
}

function showToast(message, isError = false) {
  ui.toast.textContent = message;
  ui.toast.style.background = isError ? "#2d3436" : "";
  ui.toast.classList.add("show");
  setTimeout(() => ui.toast.classList.remove("show"), 2500);
}

function updateProgress() {
  const total = state.questions.length || 1;
  const answered = Object.keys(state.answerMap).length;
  const remaining = Math.max(total - answered, 0);
  const percent = Math.min(100, Math.round((answered / total) * 100));

  if (ui.progressRemaining) {
    ui.progressRemaining.textContent = String(remaining);
  }
  if (ui.progressFill) {
    ui.progressFill.style.width = `${percent}%`;
  }
  if (ui.progressBar) {
    ui.progressBar.setAttribute("aria-valuenow", String(answered));
  }
}

function createEmptyScores() {
  return ATTRS.reduce((acc, attr) => {
    acc[attr.id] = 0;
    return acc;
  }, {});
}

function outcomePriority(outcome) {
  const priorityMap = { extreme: 3, combo: 2, core: 1 };
  return priorityMap[outcome.tier] ?? 0;
}

function clearAutoAdvance() {
  if (state.autoAdvance) {
    window.clearTimeout(state.autoAdvance);
    state.autoAdvance = null;
  }
}

function loadAttemptHistory() {
  if (typeof localStorage === "undefined") {
    return [];
  }
  try {
    const raw = localStorage.getItem(ATTEMPT_HISTORY_KEY);
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch (error) {
    return [];
  }
}

function saveAttemptHistory() {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(ATTEMPT_HISTORY_KEY, JSON.stringify(state.attemptHistory));
}

function loadCurrentAnswers() {
  if (typeof localStorage === "undefined") {
    return {};
  }
  try {
    const raw = localStorage.getItem(CURRENT_ANSWER_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (error) {
    return {};
  }
}

function saveCurrentAnswers() {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.setItem(CURRENT_ANSWER_KEY, JSON.stringify(state.answerMap));
}

function clearCurrentAnswers() {
  if (typeof localStorage === "undefined") {
    return;
  }
  localStorage.removeItem(CURRENT_ANSWER_KEY);
}

function computeAverageScores() {
  const totals = createEmptyScores();
  const count = state.attemptHistory.length;
  if (count === 0) {
    return totals;
  }
  state.attemptHistory.forEach((attempt) => {
    ATTRS.forEach((attr) => {
      totals[attr.id] += attempt.scores[attr.id] || 0;
    });
  });
  ATTRS.forEach((attr) => {
    totals[attr.id] = Math.round(totals[attr.id] / count);
  });
  return totals;
}
