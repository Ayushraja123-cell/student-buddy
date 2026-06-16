// ============================================
// STUDENT BUDDY — Service Worker (Manifest V3)
// Handles: Pomodoro alarms, badge, notifications,
//          focus mode dynamic blocking rules
// ============================================

let timerState = {
  isRunning: false,
  mode: 'focus',
  startTime: null,
  totalTime: 25 * 60,
  currentSession: 1
};

// ── Message Handler ──────────────────────────
chrome.runtime.onMessage.addListener((message, sender, sendResponse) => {
  (async () => {
    switch (message.action) {
      case 'startTimer':
        startTimer(message.timeLeft, message.totalTime, message.mode, message.currentSession);
        sendResponse({ success: true });
        break;

      case 'stopTimer':
        stopTimer();
        sendResponse({ success: true });
        break;

      case 'getTimerState':
        sendResponse({ ...timerState });
        break;

      case 'updateFocusMode':
        await updateFocusMode(message.enabled, message.sites || []);
        sendResponse({ success: true });
        break;

      default:
        sendResponse({});
    }
  })();
  return true; // keep async channel open
});

// ── Timer ────────────────────────────────────
function startTimer(timeLeft, totalTime, mode, currentSession) {
  chrome.alarms.clear('pomodoroEnd');
  chrome.alarms.clear('pomodoroTick');

  timerState = {
    isRunning: true,
    mode: mode || 'focus',
    startTime: Date.now() - ((totalTime - timeLeft) * 1000),
    totalTime,
    currentSession: currentSession || 1
  };

  const delayInMinutes = timeLeft / 60;
  chrome.alarms.create('pomodoroEnd', { delayInMinutes });
  chrome.alarms.create('pomodoroTick', { periodInMinutes: 1 / 60, delayInMinutes: 1 / 60 });

  updateBadge(timeLeft);
  chrome.storage.local.set({ swTimerState: timerState });
}

function stopTimer() {
  timerState.isRunning = false;
  chrome.alarms.clear('pomodoroEnd');
  chrome.alarms.clear('pomodoroTick');
  chrome.action.setBadgeText({ text: '' });
  chrome.storage.local.set({ swTimerState: timerState });
}

function updateBadge(secondsLeft) {
  const mins = Math.ceil(secondsLeft / 60);
  chrome.action.setBadgeText({ text: mins > 0 ? `${mins}m` : '' });
  chrome.action.setBadgeBackgroundColor({ color: '#8b5cf6' });
}

// ── Alarm Handler ────────────────────────────
chrome.alarms.onAlarm.addListener((alarm) => {
  if (alarm.name === 'pomodoroEnd') {
    onTimerComplete();
  } else if (alarm.name === 'pomodoroTick' && timerState.isRunning && timerState.startTime) {
    const elapsed = (Date.now() - timerState.startTime) / 1000;
    const remaining = Math.max(0, timerState.totalTime - elapsed);
    updateBadge(remaining);
  }
});

function onTimerComplete() {
  timerState.isRunning = false;
  chrome.alarms.clear('pomodoroEnd');
  chrome.alarms.clear('pomodoroTick');
  chrome.action.setBadgeText({ text: '' });

  const isBreak = timerState.mode !== 'focus';
  chrome.notifications.create(`pomodoro_${Date.now()}`, {
    type: 'basic',
    iconUrl: 'icons/icon128.png',
    title: isBreak ? '☕ Break Over!' : '🍅 Pomodoro Complete!',
    message: isBreak
      ? 'Time to get back to work! Start your next focus session.'
      : `Session ${timerState.currentSession} done! Take a well-deserved break.`,
    priority: 2
  });

  chrome.storage.local.set({ swTimerState: timerState });
}

// ── Focus Mode ───────────────────────────────
async function updateFocusMode(enabled, sites = []) {
  try {
    const existing = await chrome.declarativeNetRequest.getDynamicRules();
    const existingIds = existing.map(r => r.id);
    if (existingIds.length > 0) {
      await chrome.declarativeNetRequest.updateDynamicRules({ removeRuleIds: existingIds });
    }

    if (!enabled || sites.length === 0) return;

    const rules = [];
    let id = 1;
    for (const site of sites) {
      const blockedUrl = chrome.runtime.getURL('blocked.html') + `?site=${encodeURIComponent(site)}`;
      rules.push({
        id: id++,
        priority: 1,
        action: { type: 'redirect', redirect: { url: blockedUrl } },
        condition: { urlFilter: `||${site}^`, resourceTypes: ['main_frame'] }
      });
    }

    await chrome.declarativeNetRequest.updateDynamicRules({ addRules: rules });
  } catch (e) {
    console.error('[StudentBuddy] Focus mode error:', e);
  }
}

// ── Install Handler ──────────────────────────
chrome.runtime.onInstalled.addListener((details) => {
  if (details.reason === 'install') {
    chrome.storage.local.set({
      tasks: [],
      decks: [],
      dailyStats: {},
      studyDays: [],
      notes: {},
      subjects: [],
      schedule: {},
      blockedSites: [],
      focusEnabled: false,
      settings: {}
    });
    console.log('[StudentBuddy] Extension installed and storage initialized.');
  }
});
