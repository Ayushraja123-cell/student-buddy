/* =====================================================
   STUDENT BUDDY — Popup Script
   All 8 features: Timer, Tasks, Flashcards, AI,
   Stats, Notes, Schedule, Focus Mode
   ===================================================== */

'use strict';

// ════════════════════════════════════════════════════
// UTILITIES
// ════════════════════════════════════════════════════

const $ = id => document.getElementById(id);
const $$ = sel => document.querySelectorAll(sel);

function showToast(msg, type = 'info', ms = 2600) {
  const t = $('toast');
  t.textContent = msg;
  t.className = `toast show ${type}`;
  clearTimeout(t._tid);
  t._tid = setTimeout(() => { t.className = 'toast'; }, ms);
}

function getStorage(keys) {
  return new Promise(res => chrome.storage.local.get(keys, res));
}

function setStorage(data) {
  return new Promise(res => chrome.storage.local.set(data, res));
}

function today() { return new Date().toISOString().slice(0, 10); }

function fmtTime(s) {
  return `${Math.floor(s / 60).toString().padStart(2, '0')}:${(s % 60).toString().padStart(2, '0')}`;
}

function fmtMins(m) {
  return m < 60 ? `${m}m` : `${Math.floor(m / 60)}h${m % 60 ? ' ' + (m % 60) + 'm' : ''}`;
}

function esc(str = '') {
  const d = document.createElement('div');
  d.appendChild(document.createTextNode(str));
  return d.innerHTML;
}

const DAY_NAMES = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

// ════════════════════════════════════════════════════
// TAB NAVIGATION
// ════════════════════════════════════════════════════

let activeTab = 'timer';

$$('.tab-btn').forEach(btn => {
  btn.addEventListener('click', () => {
    const tab = btn.dataset.tab;
    $$('.tab-btn').forEach(b => b.classList.remove('active'));
    $$('.tab-panel').forEach(p => p.classList.remove('active'));
    btn.classList.add('active');
    $(`tab-${tab}`).classList.add('active');
    activeTab = tab;

    if (tab === 'stats')      renderStats();
    else if (tab === 'notes') loadNote();
    else if (tab === 'schedule') renderSchedule();
    else if (tab === 'tasks') renderTasks();
    else if (tab === 'flashcards') { renderDecks(); }
    else if (tab === 'focus') renderFocusTab();
    else if (tab === 'ai')    initAITab();
  });
});

// ════════════════════════════════════════════════════
// STREAK
// ════════════════════════════════════════════════════

async function refreshStreak() {
  const { studyDays = [] } = await getStorage(['studyDays']);
  const td = today();
  if (!studyDays.includes(td)) {
    studyDays.push(td);
    await setStorage({ studyDays });
  }
  let streak = 0, d = new Date();
  while (true) {
    const k = d.toISOString().slice(0, 10);
    if (!studyDays.includes(k)) break;
    streak++;
    d.setDate(d.getDate() - 1);
  }
  $('streakCount').textContent = streak;
  $('statsStreakNum') && ($('statsStreakNum').textContent = streak);
}

// ════════════════════════════════════════════════════
// SETTINGS MODAL
// ════════════════════════════════════════════════════

$('settingsBtn').addEventListener('click', openSettings);
$('closeSettingsBtn').addEventListener('click', () => $('settingsModal').style.display = 'none');
$('settingsModal').addEventListener('click', e => { if (e.target === $('settingsModal')) $('settingsModal').style.display = 'none'; });

async function openSettings() {
  $('settingsModal').style.display = 'flex';
  const { settings = {} } = await getStorage(['settings']);
  $('settingsApiKey').value = settings.apiKey || '';
  $('settingNotifs').checked = settings.notifications !== false;
  $('settingAutoBreak').checked = !!settings.autoStartBreak;
}

$('saveSettingsKeyBtn').addEventListener('click', async () => {
  const { settings = {} } = await getStorage(['settings']);
  settings.apiKey = $('settingsApiKey').value.trim();
  await setStorage({ settings });
  aiKey = settings.apiKey;
  showToast('API key saved ✓', 'success');
});

['settingNotifs', 'settingAutoBreak'].forEach(id => {
  $(id).addEventListener('change', async () => {
    const { settings = {} } = await getStorage(['settings']);
    settings.notifications = $('settingNotifs').checked;
    settings.autoStartBreak = $('settingAutoBreak').checked;
    await setStorage({ settings });
  });
});

// ════════════════════════════════════════════════════
// ① POMODORO TIMER
// ════════════════════════════════════════════════════

const RING_R       = 86;
const RING_CIRC    = 2 * Math.PI * RING_R; // ≈ 540.35

const MODES = {
  focus: 'Focus Time',
  short: 'Short Break',
  long:  'Long Break'
};

let timer = {
  running:  false,
  mode:     'focus',
  timeLeft: 25 * 60,
  total:    25 * 60,
  session:  1,
  tick:     null
};

function getModeSecs(mode) {
  const f = parseInt($('focusDuration').value)      || 25;
  const s = parseInt($('shortBreakDuration').value)  || 5;
  const l = parseInt($('longBreakDuration').value)   || 15;
  return { focus: f * 60, short: s * 60, long: l * 60 }[mode];
}

function drawRing(left, total) {
  const pct    = total > 0 ? left / total : 1;
  const offset = RING_CIRC * (1 - pct);
  const r      = $('ringProgress');
  r.style.strokeDasharray  = RING_CIRC;
  r.style.strokeDashoffset = offset;
}

function refreshTimerUI() {
  $('timerDisplay').textContent = fmtTime(timer.timeLeft);
  $('timerLabel').textContent   = MODES[timer.mode];
  $('currentSession').textContent = timer.session;
  drawRing(timer.timeLeft, timer.total);

  $$('.session-dot').forEach((dot, i) => {
    dot.classList.remove('active', 'done');
    if (i < timer.session - 1)     dot.classList.add('done');
    else if (i === timer.session - 1) dot.classList.add('active');
  });
}

function setMode(mode) {
  pauseTimer();
  timer.mode = mode;
  timer.timeLeft = timer.total = getModeSecs(mode);
  timer.running = false;
  $$('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === mode));
  refreshTimerUI();
}

function startTimer() {
  timer.running = true;
  $('playIcon').style.display  = 'none';
  $('pauseIcon').style.display = '';
  chrome.runtime.sendMessage({
    action:  'startTimer',
    timeLeft: timer.timeLeft,
    totalTime: timer.total,
    mode:    timer.mode,
    currentSession: timer.session
  });
  timer.tick = setInterval(async () => {
    if (timer.timeLeft <= 0) { await onTimerEnd(); return; }
    timer.timeLeft--;
    refreshTimerUI();
  }, 1000);
}

function pauseTimer() {
  timer.running = false;
  $('playIcon').style.display  = '';
  $('pauseIcon').style.display = 'none';
  clearInterval(timer.tick);
  timer.tick = null;
  chrome.runtime.sendMessage({ action: 'stopTimer' });
}

async function onTimerEnd() {
  pauseTimer();

  if (timer.mode === 'focus') {
    // Update daily stats
    const { dailyStats = {} } = await getStorage(['dailyStats']);
    const td = today();
    if (!dailyStats[td]) dailyStats[td] = { pomodoros: 0, focusMinutes: 0, tasksCompleted: 0, cardsReviewed: 0 };
    dailyStats[td].pomodoros++;
    dailyStats[td].focusMinutes += (parseInt($('focusDuration').value) || 25);
    await setStorage({ dailyStats });
    await refreshStreak();

    if (timer.session >= 4) {
      timer.session = 1;
      showToast('🎉 4 sessions done! Time for a long break!', 'success', 4000);
      setMode('long');
    } else {
      timer.session++;
      showToast('✅ Focus session complete! Short break time.', 'success', 3500);
      setMode('short');
    }
  } else {
    showToast('⏱ Break over! Ready to focus again?', 'info', 3000);
    setMode('focus');
  }
}

$('timerStartBtn').addEventListener('click', () => {
  timer.running ? pauseTimer() : startTimer();
});

$('timerResetBtn').addEventListener('click', () => {
  pauseTimer();
  timer.timeLeft = timer.total = getModeSecs(timer.mode);
  refreshTimerUI();
});

$('timerSkipBtn').addEventListener('click', () => {
  pauseTimer();
  const next = timer.mode === 'focus' ? 'short' : 'focus';
  setMode(next);
});

$$('.mode-btn').forEach(b => b.addEventListener('click', () => setMode(b.dataset.mode)));

['focusDuration', 'shortBreakDuration', 'longBreakDuration'].forEach(id => {
  $(id).addEventListener('change', () => {
    if (!timer.running) {
      timer.timeLeft = timer.total = getModeSecs(timer.mode);
      refreshTimerUI();
    }
  });
});

// Sync with service worker when popup reopens
async function syncTimerFromSW() {
  try {
    const state = await new Promise(res =>
      chrome.runtime.sendMessage({ action: 'getTimerState' }, r => res(r || {}))
    );
    if (state?.isRunning && state.startTime) {
      const elapsed  = Math.floor((Date.now() - state.startTime) / 1000);
      const remaining = Math.max(0, state.totalTime - elapsed);
      timer.mode     = state.mode || 'focus';
      timer.total    = state.totalTime;
      timer.session  = state.currentSession || 1;
      timer.timeLeft = remaining;
      $$('.mode-btn').forEach(b => b.classList.toggle('active', b.dataset.mode === timer.mode));
      startTimer();
    }
  } catch (_) {}
}

// ════════════════════════════════════════════════════
// ② TO-DO LIST
// ════════════════════════════════════════════════════

let tasks = [];
let taskFilter = 'all';

async function loadTasks() {
  const { tasks: t = [] } = await getStorage(['tasks']);
  tasks = t;
}

async function saveTasks() { await setStorage({ tasks }); }

function renderTasks() {
  const list = $('taskList');
  let show = [...tasks];
  if (taskFilter === 'active')    show = show.filter(t => !t.done);
  if (taskFilter === 'completed') show = show.filter(t =>  t.done);

  if (show.length === 0) {
    const msgs = { all: 'No tasks yet. Add one above!', active: 'No active tasks.', completed: 'No completed tasks.' };
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">📋</div><p>${msgs[taskFilter]}</p></div>`;
    return;
  }

  // Sort: incomplete & high priority first
  const pri = { high: 0, medium: 1, low: 2 };
  show.sort((a, b) => {
    if (a.done !== b.done) return a.done ? 1 : -1;
    return (pri[a.priority] ?? 1) - (pri[b.priority] ?? 1);
  });

  list.innerHTML = show.map(t => `
    <div class="task-item ${t.done ? 'done' : ''}">
      <input class="task-cb" type="checkbox" ${t.done ? 'checked' : ''} data-toggle-task="${t.id}">
      <div class="task-main">
        <div class="task-txt">${esc(t.text)}</div>
        <div class="task-meta">
          ${t.priority !== 'medium' ? `<span class="task-tag tag-${t.priority}">${t.priority}</span>` : ''}
          ${t.subject ? `<span class="task-tag tag-subj">${esc(t.subject)}</span>` : ''}
          ${t.due ? `<span class="task-due">📅 ${t.due}</span>` : ''}
        </div>
      </div>
      <button class="task-del" data-delete-task="${t.id}" title="Delete">✕</button>
    </div>`).join('');
}

async function toggleTask(id) {
  const t = tasks.find(x => x.id === id);
  if (!t) return;
  t.done = !t.done;
  if (t.done) {
    const { dailyStats = {} } = await getStorage(['dailyStats']);
    const td = today();
    if (!dailyStats[td]) dailyStats[td] = { pomodoros: 0, focusMinutes: 0, tasksCompleted: 0, cardsReviewed: 0 };
    dailyStats[td].tasksCompleted++;
    await setStorage({ dailyStats });
  }
  await saveTasks();
  renderTasks();
}

async function deleteTask(id) {
  tasks = tasks.filter(t => t.id !== id);
  await saveTasks();
  renderTasks();
  showToast('Task deleted', 'info');
}

async function addTask() {
  const text = $('taskInput').value.trim();
  if (!text) { showToast('Please enter a task text', 'error'); return; }
  tasks.unshift({
    id:       Date.now().toString(),
    text,
    priority: $('taskPriority').value,
    subject:  $('taskSubject').value.trim(),
    due:      $('taskDueDate').value,
    done:     false,
    at:       Date.now()
  });
  await saveTasks();
  $('taskInput').value = $('taskSubject').value = $('taskDueDate').value = '';
  renderTasks();
  showToast('Task added ✓', 'success');
}

$('addTaskBtn').addEventListener('click', addTask);
$('taskInput').addEventListener('keypress', e => e.key === 'Enter' && addTask());

$$('.filter-btn').forEach(b => {
  b.addEventListener('click', () => {
    taskFilter = b.dataset.filter;
    $$('.filter-btn').forEach(x => x.classList.remove('active'));
    b.classList.add('active');
    renderTasks();
  });
});

// ════════════════════════════════════════════════════
// ③ FLASHCARDS
// ════════════════════════════════════════════════════

let decks = [];
let activeDeckId  = null;
let cardIdx       = 0;
let cardFlipped   = false;

async function loadDecks() {
  const { decks: d = [] } = await getStorage(['decks']);
  decks = d;
}
async function saveDecks() { await setStorage({ decks }); }

function renderDecks() {
  const list = $('deckList');
  if (decks.length === 0) {
    list.innerHTML = `<div class="empty-state"><div class="empty-icon">🃏</div><p>No decks yet. Create your first one!</p></div>`;
    return;
  }
  list.innerHTML = decks.map(d => `
    <div class="deck-item" data-open-deck="${d.id}">
      <div class="deck-emoji">${d.emoji || '📚'}</div>
      <div class="deck-info">
        <div class="deck-name">${esc(d.name)}</div>
        <div class="deck-count">${d.cards.length} card${d.cards.length !== 1 ? 's' : ''}</div>
      </div>
      <div class="deck-arrow">›</div>
      <button class="deck-del" data-delete-deck="${d.id}" title="Delete deck">🗑</button>
    </div>`).join('');
}

function openDeck(id) {
  activeDeckId = id; cardIdx = 0; cardFlipped = false;
  $('deckListView').style.display = 'none';
  $('cardStudyView').style.display = '';
  const d = decks.find(x => x.id === id);
  $('studyDeckName').textContent = `${d.emoji || ''} ${d.name}`;
  showCard();
}

async function deleteDeck(id) {
  if (!confirm('Delete this deck and all its cards?')) return;
  decks = decks.filter(d => d.id !== id);
  await saveDecks();
  renderDecks();
  showToast('Deck deleted', 'info');
}

function showCard() {
  const d = decks.find(x => x.id === activeDeckId);
  if (!d || d.cards.length === 0) {
    $('cardFront').textContent   = 'No cards in this deck.';
    $('cardBack').textContent    = 'Click "+ Card" to add some!';
    $('cardProgressText').textContent = 'Empty deck';
    $('cardProgressFill').style.width = '0%';
    $('ratingBtns').style.display = 'none';
    return;
  }
  const card = d.cards[cardIdx];
  const fc = $('flashcard');
  fc.classList.remove('flipped');
  cardFlipped = false;
  $('ratingBtns').style.display = 'none';
  setTimeout(() => {
    $('cardFront').textContent = card.front;
    $('cardBack').textContent  = card.back;
  }, 200);
  const pct = ((cardIdx + 1) / d.cards.length * 100).toFixed(0);
  $('cardProgressFill').style.width = `${pct}%`;
  $('cardProgressText').textContent  = `Card ${cardIdx + 1} of ${d.cards.length}`;
}

// Flip on card click
$('flashcard').addEventListener('click', () => {
  cardFlipped = !cardFlipped;
  $('flashcard').classList.toggle('flipped', cardFlipped);
  if (cardFlipped) {
    $('ratingBtns').style.display = 'flex';
    bumpCardStat();
  }
});

async function bumpCardStat() {
  const { dailyStats = {} } = await getStorage(['dailyStats']);
  const td = today();
  if (!dailyStats[td]) dailyStats[td] = { pomodoros: 0, focusMinutes: 0, tasksCompleted: 0, cardsReviewed: 0 };
  dailyStats[td].cardsReviewed++;
  await setStorage({ dailyStats });
}

async function rateCard(passed) {
  const d = decks.find(x => x.id === activeDeckId);
  if (!d || d.cards.length === 0) return;
  const card = d.cards[cardIdx];
  card.score = passed ? (card.score || 0) + 1 : Math.max(0, (card.score || 0) - 1);
  card.lastReviewed = Date.now();
  await saveDecks();
  if (cardIdx < d.cards.length - 1) {
    cardIdx++;
    showCard();
  } else {
    const mastered = d.cards.filter(c => (c.score || 0) > 0).length;
    showToast(`🎉 Deck done! ${mastered}/${d.cards.length} mastered`, 'success', 4000);
    cardIdx = 0;
    showCard();
  }
}

$('rateFailBtn').addEventListener('click', () => rateCard(false));
$('ratePassBtn').addEventListener('click', () => rateCard(true));

$('prevCardBtn').addEventListener('click', () => {
  const d = decks.find(x => x.id === activeDeckId);
  if (!d || !d.cards.length) return;
  cardIdx = (cardIdx - 1 + d.cards.length) % d.cards.length;
  showCard();
});
$('nextCardBtn').addEventListener('click', () => {
  const d = decks.find(x => x.id === activeDeckId);
  if (!d || !d.cards.length) return;
  cardIdx = (cardIdx + 1) % d.cards.length;
  showCard();
});

$('backToDecksBtn').addEventListener('click', () => {
  $('cardStudyView').style.display = 'none';
  $('deckListView').style.display  = '';
  activeDeckId = null;
  renderDecks();
});

// — Add Deck Modal
$('addDeckBtn').addEventListener('click', () => { $('newDeckName').value = ''; $('newDeckEmoji').value = ''; $('addDeckModal').style.display = 'flex'; setTimeout(() => $('newDeckName').focus(), 80); });
$('cancelDeckBtn').addEventListener('click', () => $('addDeckModal').style.display = 'none');
$('addDeckModal').addEventListener('click', e => { if (e.target === $('addDeckModal')) $('addDeckModal').style.display = 'none'; });
$('saveDeckBtn').addEventListener('click', async () => {
  const name = $('newDeckName').value.trim();
  if (!name) { showToast('Enter a deck name', 'error'); return; }
  decks.push({ id: Date.now().toString(), name, emoji: $('newDeckEmoji').value.trim() || '📚', cards: [], at: Date.now() });
  await saveDecks();
  $('addDeckModal').style.display = 'none';
  renderDecks();
  showToast('Deck created 🃏', 'success');
});

// — Add Card Modal
$('addCardBtn').addEventListener('click', () => { $('newCardFront').value = ''; $('newCardBack').value = ''; $('addCardModal').style.display = 'flex'; setTimeout(() => $('newCardFront').focus(), 80); });
$('cancelCardBtn').addEventListener('click', () => $('addCardModal').style.display = 'none');
$('addCardModal').addEventListener('click', e => { if (e.target === $('addCardModal')) $('addCardModal').style.display = 'none'; });
$('saveCardBtn').addEventListener('click', async () => {
  const front = $('newCardFront').value.trim();
  const back  = $('newCardBack').value.trim();
  if (!front || !back) { showToast('Fill both sides of the card', 'error'); return; }
  const d = decks.find(x => x.id === activeDeckId);
  if (!d) return;
  d.cards.push({ id: Date.now().toString(), front, back, score: 0, at: Date.now() });
  await saveDecks();
  $('addCardModal').style.display = 'none';
  showCard();
  showToast('Card added ✓', 'success');
});

// ════════════════════════════════════════════════════
// ④ AI SUMMARIZER
// ════════════════════════════════════════════════════

let aiKey = '';

async function initAITab() {
  const { settings = {} } = await getStorage(['settings']);
  aiKey = settings.apiKey || '';
  $('apiKeySetup').style.display = aiKey ? 'none' : '';
  $('aiActions').style.display   = aiKey ? 'flex' : 'none';
  $('aiChatArea').style.display  = aiKey ? ''     : 'none';
  if ($('settingsApiKey')) $('settingsApiKey').value = aiKey;
}

$('saveApiKeyBtn').addEventListener('click', async () => {
  const k = $('apiKeyInput').value.trim();
  if (!k) { showToast('Enter your API key', 'error'); return; }
  const { settings = {} } = await getStorage(['settings']);
  settings.apiKey = k;
  await setStorage({ settings });
  aiKey = k;
  $('apiKeySetup').style.display = 'none';
  $('aiActions').style.display   = 'flex';
  $('aiChatArea').style.display  = '';
  showToast('API key saved ✓', 'success');
});

// URLs where scripts cannot be injected
const RESTRICTED_PREFIXES = [
  'chrome://', 'chrome-extension://', 'edge://', 'about:',
  'https://chrome.google.com/webstore', 'moz-extension://'
];

function isRestrictedUrl(url = '') {
  return RESTRICTED_PREFIXES.some(p => url.startsWith(p)) || !url;
}

async function getPageText() {
  return new Promise((res, rej) => {
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => {
      if (!tabs[0]) return rej(new Error('No active tab found'));

      const url = tabs[0].url || '';

      // Block restricted pages immediately — no script injection allowed
      if (isRestrictedUrl(url)) {
        return rej(new Error(
          'Navigate to a regular webpage first (not a chrome:// or extension page)'
        ));
      }

      // Try content script first
      chrome.tabs.sendMessage(tabs[0].id, { action: 'extractText' }, response => {
        // Suppress the lastError from the console
        void chrome.runtime.lastError;

        if (response?.text) {
          return res(response.text);
        }

        // Fallback: inject via scripting API
        chrome.scripting.executeScript({
          target: { tabId: tabs[0].id },
          func: () => {
            const clone = document.body.cloneNode(true);
            clone.querySelectorAll('script,style,noscript,nav,footer,header,aside')
              .forEach(el => el.remove());
            return (clone.innerText || document.body.innerText || '')
              .replace(/\s{2,}/g, ' ').trim().substring(0, 8000);
          }
        }, results => {
          void chrome.runtime.lastError;
          if (results?.[0]?.result) return res(results[0].result);
          rej(new Error('Could not read page content. Try refreshing the page.'));
        });
      });
    });
  });
}

async function callGemini(prompt) {
  const url = `https://generativelanguage.googleapis.com/v1beta/models/gemini-1.5-flash:generateContent?key=${aiKey}`;
  const res = await fetch(url, {
    method:  'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      contents: [{ parts: [{ text: prompt }] }],
      generationConfig: { maxOutputTokens: 1200, temperature: 0.6 }
    })
  });
  if (!res.ok) {
    const e = await res.json().catch(() => ({}));
    throw new Error(e?.error?.message || `HTTP ${res.status}`);
  }
  const data = await res.json();
  return data.candidates?.[0]?.content?.parts?.[0]?.text || 'No response generated.';
}

function setAIState(state) {
  // state: 'actions' | 'loading' | 'result'
  $('aiActions').style.display  = state === 'actions'  ? 'flex' : 'none';
  $('aiLoading').style.display  = state === 'loading'  ? 'flex' : 'none';
  $('aiResult').style.display   = state === 'result'   ? ''     : 'none';
}

function showAIResult(label, text) {
  $('aiResultLabel').textContent = label;
  $('aiResultBody').textContent  = text;
  setAIState('result');
}

async function runAI(label, loadMsg, promptFn) {
  if (!aiKey) { showToast('Set your API key first', 'error'); return; }
  $('aiLoadingText').textContent = loadMsg;
  setAIState('loading');
  try {
    const text = await getPageText();
    const result = await callGemini(promptFn(text));
    showAIResult(label, result);
  } catch (e) {
    setAIState('actions');
    showToast(`Error: ${e.message}`, 'error', 5000);
  }
}

$('summarizeBtn').addEventListener('click', () => runAI(
  '📖 Summary', 'Summarizing page content…',
  text => `You are a student study assistant. Summarize this webpage for a student.\n\nFormat:\n📌 SUMMARY\n[2–3 clear sentences]\n\n🔑 KEY POINTS\n• [point 1]\n• [point 2]\n• [point 3]\n• [point 4]\n\nContent:\n${text.substring(0, 6000)}`
));

$('aiQuizBtn').addEventListener('click', () => runAI(
  '🧠 Quiz Questions', 'Generating quiz questions…',
  text => `Generate 5 multiple-choice questions from this content.\n\nFormat each as:\nQ1: [Question]\nA) ...\nB) ...\nC) ...\nD) ...\n✓ Answer: [Letter] — [brief explanation]\n\nContent:\n${text.substring(0, 5500)}`
));

$('aiKeyTermsBtn').addEventListener('click', () => runAI(
  '🔑 Key Terms', 'Extracting key terms…',
  text => `Extract the 10 most important key terms from this content.\n\nFormat each as:\nTerm: [name]\nMeaning: [student-friendly definition]\n\nContent:\n${text.substring(0, 5500)}`
));

$('copyResultBtn').addEventListener('click', () => {
  navigator.clipboard.writeText($('aiResultBody').textContent);
  showToast('Copied ✓', 'success');
});

$('aiAskBtn').addEventListener('click', async () => {
  const q = $('aiCustomPrompt').value.trim();
  if (!q) return;
  await runAI('💬 Answer', 'Thinking…',
    text => `You are a helpful study assistant. A student reading a webpage asks:\n\n"${q}"\n\nProvide a clear, helpful answer based on the page content below.\n\nPage content:\n${text.substring(0, 4000)}`
  );
  $('aiCustomPrompt').value = '';
});
$('aiCustomPrompt').addEventListener('keypress', e => e.key === 'Enter' && $('aiAskBtn').click());

// ════════════════════════════════════════════════════
// ⑤ STUDY STATS
// ════════════════════════════════════════════════════

async function renderStats() {
  const { dailyStats = {}, studyDays = [] } = await getStorage(['dailyStats', 'studyDays']);
  const td = today();
  const ds = dailyStats[td] || { pomodoros: 0, focusMinutes: 0, tasksCompleted: 0, cardsReviewed: 0 };

  $('statFocus').textContent    = fmtMins(ds.focusMinutes || 0);
  $('statTasks').textContent    = ds.tasksCompleted || 0;
  $('statCards').textContent    = ds.cardsReviewed  || 0;
  $('statPomodoros').textContent = ds.pomodoros     || 0;

  // Streak
  let streak = 0, d = new Date();
  while (studyDays.includes(d.toISOString().slice(0, 10))) { streak++; d.setDate(d.getDate() - 1); }
  $('statsStreakNum').textContent = streak;
  $('streakCount').textContent   = streak;

  renderWeeklyChart(dailyStats);
}

function renderWeeklyChart(dailyStats) {
  const days = Array.from({ length: 7 }, (_, i) => {
    const d = new Date(); d.setDate(d.getDate() - 6 + i);
    return { key: d.toISOString().slice(0, 10), label: DAY_NAMES[d.getDay()] };
  });
  const maxMins = days.reduce((m, { key }) => Math.max(m, (dailyStats[key] || {}).focusMinutes || 0), 1);
  const td = today();

  $('weeklyChart').innerHTML = days.map(({ key, label }) => {
    const m   = (dailyStats[key] || {}).focusMinutes || 0;
    const h   = Math.max(4, Math.round((m / maxMins) * 76));
    const isT = key === td;
    return `<div class="bar-wrap ${isT ? 'bar-today' : ''}">
      <div class="bar" style="height:${h}px" title="${m}m focus"></div>
      <div class="bar-day">${label}</div>
    </div>`;
  }).join('');
}

$('resetStatsBtn').addEventListener('click', async () => {
  if (!confirm('Reset all study stats? This cannot be undone.')) return;
  await setStorage({ dailyStats: {}, studyDays: [] });
  renderStats();
  showToast('Stats reset', 'info');
});

// ════════════════════════════════════════════════════
// ⑥ QUICK NOTES
// ════════════════════════════════════════════════════

let noteScope    = 'global';
let noteDebounce = null;

async function loadNote() {
  const url     = await getActiveTabUrl();
  const pageKey = 'note_' + btoa(url || '').slice(0, 20);
  const { notes = {} } = await getStorage(['notes']);
  const key  = noteScope === 'global' ? 'global' : pageKey;
  $('noteArea').value = notes[key] || '';
  updateNoteMeta();
}

async function getActiveTabUrl() {
  return new Promise(res =>
    chrome.tabs.query({ active: true, currentWindow: true }, tabs => res(tabs[0]?.url || ''))
  );
}

async function saveNote() {
  const url     = await getActiveTabUrl();
  const pageKey = 'note_' + btoa(url || '').slice(0, 20);
  const { notes = {} } = await getStorage(['notes']);
  const key  = noteScope === 'global' ? 'global' : pageKey;
  notes[key] = $('noteArea').value;
  await setStorage({ notes });
  $('saveStatus').textContent = '✓ Saved';
  setTimeout(() => { $('saveStatus').textContent = ''; }, 1800);
}

function updateNoteMeta() {
  const v = $('noteArea').value;
  $('charCount').textContent = `${v.length} chars`;
  $('wordCount').textContent = `${v.trim() ? v.trim().split(/\s+/).length : 0} words`;
}

$('noteArea').addEventListener('input', () => {
  updateNoteMeta();
  clearTimeout(noteDebounce);
  noteDebounce = setTimeout(saveNote, 700);
});

$('clearNoteBtn').addEventListener('click', async () => {
  if ($('noteArea').value && !confirm('Clear this note?')) return;
  $('noteArea').value = '';
  updateNoteMeta();
  await saveNote();
  showToast('Note cleared', 'info');
});

$$('.scope-tab').forEach(t => {
  t.addEventListener('click', () => {
    noteScope = t.dataset.scope;
    $$('.scope-tab').forEach(x => x.classList.remove('active'));
    t.classList.add('active');
    loadNote();
  });
});

// ════════════════════════════════════════════════════
// ⑦ STUDY SCHEDULE
// ════════════════════════════════════════════════════

const TIME_SLOTS = [
  '6 AM','7 AM','8 AM','9 AM','10 AM','11 AM',
  '12 PM','1 PM','2 PM','3 PM','4 PM','5 PM',
  '6 PM','7 PM','8 PM','9 PM','10 PM'
];
const DAYS_SHORT = ['Mon','Tue','Wed','Thu','Fri','Sat','Sun'];
const PALETTE = ['#8b5cf6','#14b8a6','#f59e0b','#ef4444','#10b981','#3b82f6','#ec4899','#f97316','#06b6d4'];

let subjects = [];
let sched    = {};
let selSubj  = null;
let selColor = PALETTE[0];

async function loadScheduleData() {
  const { subjects: s = [], schedule: sc = {} } = await getStorage(['subjects', 'schedule']);
  subjects = s; sched = sc;
}

async function saveScheduleData() { await setStorage({ subjects, schedule: sched }); }

function renderSchedule() {
  renderSubjectPalette();
  renderGrid();
}

function renderSubjectPalette() {
  $('subjectPalette').innerHTML = subjects.map(s =>
    `<div class="subject-chip ${selSubj?.id === s.id ? 'selected' : ''}"
          style="background:${s.color}26;color:${s.color};border-color:${selSubj?.id === s.id ? s.color : 'transparent'}"
          data-pick-subject="${s.id}">${esc(s.name)}</div>`
  ).join('');
}

function pickSubject(id) {
  const found = subjects.find(s => s.id === id);
  selSubj = selSubj?.id === id ? null : found;
  renderSubjectPalette();
}

function renderGrid() {
  const grid  = $('scheduleGrid');
  const todayIdx = (new Date().getDay() + 6) % 7; // Mon=0
  const cols  = `32px repeat(${DAYS_SHORT.length}, 1fr)`;
  grid.style.gridTemplateColumns = cols;

  let html = '<div class="sch-time"></div>';
  DAYS_SHORT.forEach((d, i) =>
    html += `<div class="sch-day-hdr ${i === todayIdx ? 'sch-today' : ''}">${d}</div>`
  );

  TIME_SLOTS.forEach(slot => {
    html += `<div class="sch-time">${slot}</div>`;
    DAYS_SHORT.forEach(day => {
      const key  = `${day}_${slot}`;
      const sid  = sched[key];
      const subj = subjects.find(s => s.id === sid);
      if (subj) {
        html += `<div class="sch-cell filled" style="background:${subj.color}28;border-color:${subj.color}44;"
                      data-cell-key="${key}" title="${subj.name}">${subj.name.slice(0, 3)}</div>`;
      } else {
        html += `<div class="sch-cell" data-cell-key="${key}"></div>`;
      }
    });
  });
  grid.innerHTML = html;
}

async function clickCell(key) {
  if (selSubj) {
    sched[key] = sched[key] === selSubj.id ? undefined : selSubj.id;
    if (!sched[key]) delete sched[key];
  } else if (sched[key]) {
    delete sched[key];
  } else {
    showToast(subjects.length ? 'Select a subject first' : 'Add a subject first!', 'info');
    return;
  }
  await saveScheduleData();
  renderGrid();
}

// Subject modal
$('addSubjectBtn').addEventListener('click', () => {
  $('newSubjectName').value = ''; selColor = PALETTE[0];
  renderSwatches();
  $('addSubjectModal').style.display = 'flex';
  setTimeout(() => $('newSubjectName').focus(), 80);
});
$('cancelSubjectBtn').addEventListener('click', () => $('addSubjectModal').style.display = 'none');
$('addSubjectModal').addEventListener('click', e => { if (e.target === $('addSubjectModal')) $('addSubjectModal').style.display = 'none'; });

function renderSwatches() {
  $('colorSwatches').innerHTML = PALETTE.map(c =>
    `<div class="color-swatch ${c === selColor ? 'sel' : ''}" style="background:${c}" data-pick-color="${c}"></div>`
  ).join('');
}

function pickColor(c) { selColor = c; renderSwatches(); }

$('saveSubjectBtn').addEventListener('click', async () => {
  const name = $('newSubjectName').value.trim();
  if (!name) { showToast('Enter a subject name', 'error'); return; }
  subjects.push({ id: Date.now().toString(), name, color: selColor });
  await saveScheduleData();
  $('addSubjectModal').style.display = 'none';
  renderSchedule();
  showToast(`${name} added ✓`, 'success');
});

// ════════════════════════════════════════════════════
// ⑧ FOCUS MODE
// ════════════════════════════════════════════════════

let blocked     = [];
let focusOn     = false;

async function loadFocusData() {
  const { blockedSites = [], focusEnabled = false } = await getStorage(['blockedSites', 'focusEnabled']);
  blocked = blockedSites; focusOn = focusEnabled;
}

async function renderFocusTab() {
  await loadFocusData();
  $('focusToggle').checked = focusOn;
  updateFocusHero();
  renderBlockList();
}

function updateFocusHero() {
  const lbl = $('focusStatusLabel');
  const sub = $('focusStatusSub');
  if (focusOn) {
    lbl.textContent = '🎯 Focus Mode Active';
    lbl.style.color = 'var(--purple-l)';
    sub.textContent = `${blocked.length} site${blocked.length !== 1 ? 's' : ''} blocked`;
  } else {
    lbl.textContent = 'Focus Mode Off';
    lbl.style.color = 'var(--txt)';
    sub.textContent = 'Enable to block distracting sites';
  }
}

function renderBlockList() {
  $('blockCount').textContent = `${blocked.length} site${blocked.length !== 1 ? 's' : ''}`;
  const list = $('blockList');
  if (blocked.length === 0) {
    list.innerHTML = `<div class="empty-state sm"><div class="empty-icon">🛡️</div><p>No sites blocked.</p></div>`;
    return;
  }
  list.innerHTML = blocked.map(s =>
    `<div class="block-item">
       <div class="block-site-txt">🚫 ${esc(s)}</div>
       <button class="block-remove" data-unblock-site="${esc(s)}" title="Remove">×</button>
     </div>`
  ).join('');
}

$('focusToggle').addEventListener('change', async () => {
  focusOn = $('focusToggle').checked;
  await setStorage({ focusEnabled: focusOn });
  updateFocusHero();
  chrome.runtime.sendMessage({ action: 'updateFocusMode', enabled: focusOn, sites: blocked });
  showToast(focusOn ? '🎯 Focus mode ON!' : '😌 Focus mode off', focusOn ? 'success' : 'info');
});

$('addBlockBtn').addEventListener('click', doAddBlock);
$('blockSiteInput').addEventListener('keypress', e => e.key === 'Enter' && doAddBlock());

async function doAddBlock(rawSite) {
  const raw  = typeof rawSite === 'string' ? rawSite : $('blockSiteInput').value.trim().toLowerCase();
  if (!raw) return;
  const site = raw.replace(/^(https?:\/\/)?(www\.)?/, '').split('/')[0];
  if (blocked.includes(site)) { showToast('Already blocked', 'error'); return; }
  blocked.push(site);
  await setStorage({ blockedSites: blocked });
  $('blockSiteInput').value = '';
  if (focusOn) chrome.runtime.sendMessage({ action: 'updateFocusMode', enabled: true, sites: blocked });
  renderBlockList();
  updateFocusHero();
  showToast(`${site} blocked ✓`, 'success');
}

async function unblockSite(site) {
  blocked = blocked.filter(s => s !== site);
  await setStorage({ blockedSites: blocked });
  if (focusOn) chrome.runtime.sendMessage({ action: 'updateFocusMode', enabled: true, sites: blocked });
  renderBlockList();
  updateFocusHero();
  showToast(`${site} unblocked`, 'info');
}

// Quick-add chips
$$('.chip').forEach(chip => {
  chip.addEventListener('click', () => doAddBlock(chip.dataset.site));
});

// ════════════════════════════════════════════════════
// EVENT DELEGATION (replaces all inline handlers)
// CSP-compliant: no onclick/onchange in innerHTML
// ════════════════════════════════════════════════════

function setupDelegation() {
  // ── Tasks ──────────────────────────────────────────
  $('taskList').addEventListener('change', e => {
    const id = e.target.dataset.toggleTask;
    if (id) toggleTask(id);
  });
  $('taskList').addEventListener('click', e => {
    const id = e.target.closest('[data-delete-task]')?.dataset.deleteTask;
    if (id) deleteTask(id);
  });

  // ── Flashcard Decks ────────────────────────────────
  $('deckList').addEventListener('click', e => {
    // Delete button takes priority over open
    const delId = e.target.closest('[data-delete-deck]')?.dataset.deleteDeck;
    if (delId) { deleteDeck(delId); return; }
    const openId = e.target.closest('[data-open-deck]')?.dataset.openDeck;
    if (openId) openDeck(openId);
  });

  // ── Block List ─────────────────────────────────────
  $('blockList').addEventListener('click', e => {
    const site = e.target.closest('[data-unblock-site]')?.dataset.unblockSite;
    if (site) unblockSite(site);
  });

  // ── Schedule Grid ──────────────────────────────────
  $('scheduleGrid').addEventListener('click', e => {
    const key = e.target.closest('[data-cell-key]')?.dataset.cellKey;
    if (key) clickCell(key);
  });

  // ── Subject Palette ────────────────────────────────
  $('subjectPalette').addEventListener('click', e => {
    const id = e.target.closest('[data-pick-subject]')?.dataset.pickSubject;
    if (id) pickSubject(id);
  });

  // ── Color Swatches ─────────────────────────────────
  $('colorSwatches').addEventListener('click', e => {
    const color = e.target.closest('[data-pick-color]')?.dataset.pickColor;
    if (color) pickColor(color);
  });
}

// ════════════════════════════════════════════════════
// INIT
// ════════════════════════════════════════════════════

async function init() {
  setupDelegation();

  await Promise.all([loadTasks(), loadDecks(), loadFocusData(), loadScheduleData()]);
  await refreshStreak();

  const { settings = {} } = await getStorage(['settings']);
  aiKey = settings.apiKey || '';

  // Draw initial timer ring
  refreshTimerUI();

  // Sync timer if it was running before popup closed
  await syncTimerFromSW();
}

init();

