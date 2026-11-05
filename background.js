import {
  ensureDefaultSites,
  getSites,
  getUsageRecord,
  addUsageSeconds,
  todayStr
} from "./db.js";

const TICK_ALARM = "usage-tick";
const TICK_PERIOD_MINUTES = 0.5; // 30 seconds backup flush & limit check
const IDLE_DETECTION_SECONDS = 30; // 30s of inactivity considered idle

/* ---------- Session State ---------- */

let session = {
  siteId: null,       // Tracked site ID currently active
  startTime: null,    // Date.now() when current session started
  lastFlush: null,    // Date.now() when last flushed to DB
  tabId: null,        // Active tab ID
  windowFocused: true,
  userActive: true
};

/* ---------- Lifecycle ---------- */

chrome.runtime.onInstalled.addListener(() => {
  ensureDefaultSites();
  chrome.alarms.create(TICK_ALARM, { periodInMinutes: TICK_PERIOD_MINUTES });
  if (chrome.idle?.setDetectionInterval) {
    chrome.idle.setDetectionInterval(IDLE_DETECTION_SECONDS);
  }
});

chrome.runtime.onStartup.addListener(async () => {
  chrome.alarms.create(TICK_ALARM, { periodInMinutes: TICK_PERIOD_MINUTES });
  if (chrome.idle?.setDetectionInterval) {
    chrome.idle.setDetectionInterval(IDLE_DETECTION_SECONDS);
  }
  await restoreSession();
});

// Defensive: ensure alarm always exists on worker startup
chrome.alarms.get(TICK_ALARM, (alarm) => {
  if (!alarm) {
    chrome.alarms.create(TICK_ALARM, { periodInMinutes: TICK_PERIOD_MINUTES });
  }
});

/* ---------- Session Persistence ---------- */

async function persistSession() {
  try {
    if (chrome.storage?.session) {
      await chrome.storage.session.set({
        _session: {
          siteId: session.siteId,
          startTime: session.startTime,
          lastFlush: session.lastFlush,
          tabId: session.tabId
        }
      });
    }
  } catch (e) {
    console.error("persistSession error", e);
  }
}

async function restoreSession() {
  try {
    if (chrome.storage?.session) {
      const data = await chrome.storage.session.get("_session");
      if (data?._session?.siteId) {
        session.siteId = data._session.siteId;
        session.startTime = data._session.startTime;
        session.lastFlush = data._session.lastFlush;
        session.tabId = data._session.tabId;
      }
    }
  } catch (e) {
    console.error("restoreSession error", e);
  }
}

/* ---------- Domain Matching Utilities ---------- */

function getHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function findMatchingSite(hostname, sites) {
  if (!hostname) return null;
  return (
    sites.find(
      (site) =>
        site.enabled &&
        (site.matchList || [site.domain]).some(
          (d) => hostname === d || hostname.endsWith("." + d) || hostname === "www." + d
        )
    ) || null
  );
}

function isOnMessagesPage(tabUrl, messagesUrl) {
  if (!tabUrl || !messagesUrl) return false;
  try {
    const tab = new URL(tabUrl);
    const msg = new URL(messagesUrl);
    const msgPath = msg.pathname.replace(/\/+$/, "");
    const tabHost = tab.hostname.replace(/^www\./, "");
    const msgHost = msg.hostname.replace(/^www\./, "");

    const hostMatches = tabHost === msgHost || tabHost.endsWith("." + msgHost);
    const tabPath = tab.pathname.replace(/\/+$/, "");
    const pathMatches = tabPath === msgPath || tab.pathname.startsWith(msgPath + "/");

    return hostMatches && pathMatches;
  } catch {
    return tabUrl.includes(messagesUrl);
  }
}

/* ---------- Session Flushing and Transitions ---------- */

/**
 * Flush elapsed time from the current session to IndexedDB.
 * Splits usage across midnight if a session spans multiple days.
 */
async function flushSession() {
  if (!session.siteId || !session.lastFlush) return 0;

  const now = Date.now();
  const elapsedMs = now - session.lastFlush;
  if (elapsedMs < 500) return 0; // Ignore sub-second noise

  const elapsedSeconds = Math.round(elapsedMs / 1000);
  const flushDate = todayStr(new Date(session.lastFlush));
  const currentDate = todayStr(new Date(now));

  if (flushDate !== currentDate) {
    const midnight = new Date(currentDate + "T00:00:00").getTime();
    const beforeMidnight = Math.max(0, Math.round((midnight - session.lastFlush) / 1000));
    const afterMidnight = Math.max(0, Math.round((now - midnight) / 1000));

    if (beforeMidnight > 0) {
      await addUsageSeconds(session.siteId, flushDate, beforeMidnight);
    }
    if (afterMidnight > 0) {
      await addUsageSeconds(session.siteId, currentDate, afterMidnight);
    }
  } else {
    await addUsageSeconds(session.siteId, currentDate, elapsedSeconds);
  }

  session.lastFlush = now;
  await persistSession();
  return elapsedSeconds;
}

/**
 * Start or resume tracking a site session.
 */
async function startSession(siteId, tabId) {
  if (session.siteId === siteId) {
    session.tabId = tabId;
    return;
  }

  // End previous session if different site
  await endSession();

  const now = Date.now();
  session.siteId = siteId;
  session.startTime = now;
  session.lastFlush = now;
  session.tabId = tabId;
  await persistSession();
}

/**
 * End current session and flush remaining seconds to DB.
 */
async function endSession() {
  if (!session.siteId) return;

  await flushSession();

  session.siteId = null;
  session.startTime = null;
  session.lastFlush = null;
  session.tabId = null;
  await persistSession();
}

/* ---------- Evaluate Current State ---------- */

/**
 * Evaluates active tab, window focus, idle state and handles
 * session start/end and limit redirect.
 */
async function evaluate() {
  try {
    // If window is not focused or user is idle, stop tracking
    if (!session.windowFocused || !session.userActive) {
      await endSession();
      return;
    }

    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || !tab.url) {
      await endSession();
      return;
    }

    const hostname = getHostname(tab.url);
    const sites = await getSites();
    const site = findMatchingSite(hostname, sites);

    if (!site || !site.enabled) {
      await endSession();
      return;
    }

    // Check if limit is reached
    if (site.limitMinutes > 0) {
      const date = todayStr();
      const rec = await getUsageRecord(site.id, date);
      const usedMinutes = rec.seconds / 60;

      if (usedMinutes >= site.limitMinutes) {
        await endSession();
        if (!isOnMessagesPage(tab.url, site.messagesUrl)) {
          chrome.tabs.update(tab.id, { url: site.messagesUrl });
        }
        return;
      }
    }

    // Start or maintain active session
    await startSession(site.id, tab.id);
  } catch (e) {
    console.error("evaluate error", e);
  }
}

/* ---------- Event Listeners ---------- */

chrome.tabs.onActivated.addListener(() => {
  evaluate();
});

chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
  if (changeInfo.url || changeInfo.status === "loading") {
    evaluate();
  }
});

chrome.tabs.onRemoved.addListener((tabId) => {
  if (tabId === session.tabId) {
    endSession();
  }
});

chrome.windows.onFocusChanged.addListener(async (windowId) => {
  session.windowFocused = windowId !== chrome.windows.WINDOW_ID_NONE;
  await evaluate();
});

if (chrome.idle?.onStateChanged) {
  chrome.idle.onStateChanged.addListener(async (newState) => {
    session.userActive = newState === "active";
    await evaluate();
  });
}

/* ---------- Backup Alarm (Periodic Flush & Limit Check) ---------- */

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== TICK_ALARM) return;

  if (!session.siteId) return;

  await flushSession();

  const sites = await getSites();
  const site = sites.find((s) => s.id === session.siteId);
  if (!site || !site.enabled) {
    await endSession();
    return;
  }

  if (site.limitMinutes > 0) {
    const date = todayStr();
    const rec = await getUsageRecord(site.id, date);
    const usedMinutes = rec.seconds / 60;

    if (usedMinutes >= site.limitMinutes) {
      await endSession();
      await redirectAllTabsForSite(site);
    }
  }
});

/* ---------- Redirect All Matching Tabs ---------- */

async function redirectAllTabsForSite(site) {
  const matchList = site.matchList || [site.domain];
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    const hostname = getHostname(tab.url || "");
    if (!hostname) continue;
    const matches = matchList.some(
      (d) => hostname === d || hostname.endsWith("." + d) || hostname === "www." + d
    );
    if (matches && !isOnMessagesPage(tab.url, site.messagesUrl)) {
      chrome.tabs.update(tab.id, { url: site.messagesUrl });
    }
  }
}

/* ---------- Communication with Popup / Options ---------- */

chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "GET_ACTIVE_STATE") {
    sendResponse({
      activeDomain: session.siteId,
      windowFocused: session.windowFocused,
      tracking: !!session.siteId
    });
    return true;
  }
  if (msg?.type === "REFRESH") {
    (async () => {
      await flushSession();
      await evaluate();
      sendResponse({ ok: true });
    })();
    return true;
  }
});
