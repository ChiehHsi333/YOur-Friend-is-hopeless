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
  hasDrawn: false
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
  redrawCardsBtn: document.getElementById("redrawCardsBtn")
};

init();

async function init() {
  // 临时清空：答题历史与当前进度
  if (typeof localStorage !== "undefined") {
    localStorage.removeItem(ATTEMPT_HISTORY_KEY);
    localStorage.removeItem(CURRENT_ANSWER_KEY);
  }

  const [questions, outcomes, comments] = await Promise.all([
    loadJson("./data/questions.json"),
    loadJson("./data/outcomes.json"),
    loadJson("./data/comments.json")
  ]);

  if (!questions || !outcomes || !comments) {
    showToast("数据加载失败，请使用本地服务器打开。", true);
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

  bindEvents();
  showScreen("intro");
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

function showScreen(name) {
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
    openProfile();
  }
  updateBottomNav(name);
}

function handleStart() {
  const answered = Object.keys(state.answerMap).length;
  if (answered > 0 && !state.result) {
    showScreen("quiz");
    return;
  }
  startQuiz();
}

function onNavQuiz() {
  showScreen("intro");
}

function onNavProfile() {
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
  ui.progressCurrent.textContent = String(state.currentIndex + 1);
  ui.questionTitle.textContent = `第 ${question.id} 题 · ${question.title}`;
  ui.questionPrompt.textContent = question.prompt;

  const selected = state.answerMap[question.id]?.optionId;
  ui.optionsList.innerHTML = "";

  question.options.forEach((option) => {
    const button = document.createElement("button");
    button.type = "button";
    button.className = "option" + (selected === option.id ? " selected" : "");
    button.dataset.option = option.id;
    button.innerHTML = `
      <span class="option-label">${option.id}</span>
      <span class="option-content">
        <h4>${option.text}</h4>
        <p>${option.note}</p>
      </span>
    `;
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

function openProfile() {
  const hasHistory = state.attemptHistory.length > 0;
  const currentAnswered = Object.keys(state.answerMap).length;
  const total = state.questions.length || 1;

  if (!hasHistory && currentAnswered === 0) {
    ui.profileLabel.textContent = "尚未开始";
    ui.profileDescription.textContent = "你还没有回答任何问题，开始答题以生成画像。";
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

  if (hasHistory) {
    scores = computeAverageScores();
    sourceHint = `基于 ${state.attemptHistory.length} 次答题的平均值`;
  } else {
    scores = computeScores();
  }

  const outcome = selectOutcome(scores);
  const comment = selectComment(scores);

  ui.profileLabel.textContent = outcome.label;
  ui.profileDescription.textContent = outcome.description;
  ui.profileComment.textContent = comment.text;

  if (ui.profileProgressHint) {
    if (hasHistory) {
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

  // Rebuild collected cards from historical attempts (multi-run collection)
  rebuildCollectedFromHistory();

  // Initialize the draw-cards area for the profile page
  initDrawCardsSection();
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

  // 重置UI
  const slots = ui.drawCardsGrid?.querySelectorAll(".draw-card-slot");
  slots?.forEach((slot, index) => {
    slot.classList.remove("revealed");
    slot.innerHTML = '<span class="draw-card-question">?</span>';
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
      slot.innerHTML = `<img src="${card.image}" alt="${card.title}">`;
    }

    // 检查是否全部翻开
    if (state.revealedSlots.every((r) => r)) {
      state.hasDrawn = true;
      updateCardEcho();
    }
  }

  // 显示弹窗
  openCardModal(card);
}

function redrawCards() {
  initDrawCardsSection();
}

function getCardById(cardId) {
  return state.cards.find((card) => card.id === cardId);
}

function renderCardWall() {
  if (!ui.cardGrid) return;

  ui.cardGrid.innerHTML = "";

  const drawnIds = new Set(state.drawnCards.map((c) => c.id));

  state.cards.forEach((card) => {
    const item = document.createElement("div");
    const isDrawn = drawnIds.has(card.id);
    item.className = `card-item${isDrawn ? "" : " locked"}`;

    if (isDrawn) {
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
    ui.cardCount.textContent = String(state.drawnCards.length);
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

  ctx.strokeStyle = "rgba(0, 0, 0, 0.18)";
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
    ctx.fillStyle = "#111111";
    ctx.font = "12px 'Noto Sans SC'";
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
  ctx.fillStyle = "rgba(0, 0, 0, 0.12)";
  ctx.fill();
  ctx.strokeStyle = "#111111";
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
  ctx.fillStyle = "#f6f2ea";
  ctx.fillRect(0, 0, width, height);

  ctx.fillStyle = "#111111";
  ctx.font = "40px 'ZCOOL XiaoWei'";
  ctx.fillText("最终画像", 80, 120);

  ctx.font = "64px 'ZCOOL XiaoWei'";
  wrapText(ctx, outcome.label, 80, 210, width - 160, 72);

  ctx.font = "32px 'Noto Sans SC'";
  wrapText(ctx, outcome.description, 80, 360, width - 160, 46);

  ctx.font = "28px 'Noto Sans SC'";
  wrapText(ctx, comment.text, 80, 500, width - 160, 40);

  ctx.font = "26px 'Noto Sans SC'";
  ctx.fillText("属性总计", 80, 740);

  ctx.font = "24px 'Noto Sans SC'";
  ATTRS.forEach((attr, index) => {
    ctx.fillText(`${attr.label} ${state.scores[attr.id]}`, 80, 790 + index * 42);
  });

  ctx.font = "20px 'Noto Sans SC'";
  ctx.fillStyle = "#5f5f5f";
  ctx.fillText("15 题版本", 80, height - 80);

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
  ui.toast.style.background = isError ? "#111111" : "#00b894";
  ui.toast.classList.add("show");
  setTimeout(() => ui.toast.classList.remove("show"), 2000);
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
