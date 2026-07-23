import {
  ensureDefaultSites,
  getSites,
  getUsageRecord,
  addUsageSeconds,
  todayStr
} from "./db.js";

const TICK_ALARM = "usage-tick";
const TICK_PERIOD_MINUTES = 1; // polling interval for usage tracking (in minutes)

let state = {
  activeTabId: null,
  activeDomain: null, // domain (site.id) 
  windowFocused: true
};

chrome.runtime.onInstalled.addListener(() => {
  ensureDefaultSites();
  chrome.alarms.create(TICK_ALARM, { periodInMinutes: TICK_PERIOD_MINUTES });
});

chrome.runtime.onStartup.addListener(() => {
  chrome.alarms.create(TICK_ALARM, { periodInMinutes: TICK_PERIOD_MINUTES });
});

/* ---------- Tiện ích khớp domain ---------- */

function getHostname(url) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return null;
  }
}

function findMatchingSite(hostname, sites) {
  if (!hostname) return null;
  console.log(hostname, sites);
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

/* ---------- Tracking web usage ---------- */

async function refreshActiveDomain() {
  try {
    const [tab] = await chrome.tabs.query({ active: true, lastFocusedWindow: true });
    if (!tab || !tab.url) {
      state.activeTabId = null;
      state.activeDomain = null;
      return;
    }
    state.activeTabId = tab.id;
    const hostname = getHostname(tab.url);
    const sites = await getSites();
    const site = findMatchingSite(hostname, sites);
    state.activeDomain = site ? site.id : null;

    // redirect to messages page if over limit
    if (site) {
      await checkAndRedirectIfOverLimit(site, tab);
    }
  } catch (e) {
    console.error("refreshActiveDomain error", e);
  }
}

chrome.tabs.onActivated.addListener(() => refreshActiveDomain());
chrome.tabs.onUpdated.addListener((tabId, changeInfo, tab) => {
  if (changeInfo.status === "loading" || changeInfo.url) {
    refreshActiveDomain();
  }
});
chrome.windows.onFocusChanged.addListener(async (windowId) => {
  state.windowFocused = windowId !== chrome.windows.WINDOW_ID_NONE;
  await refreshActiveDomain();
});

/* ---------- Check and Redirect if Over Limit ---------- */

async function checkAndRedirectIfOverLimit(site, tab) {
  if (!site.limitMinutes || site.limitMinutes <= 0) return;
  const date = todayStr();
  const rec = await getUsageRecord(site.id, date);
  const usedMinutes = rec.seconds / 60;
  if (usedMinutes >= site.limitMinutes) {
    if (!tab.url.includes(site.messagesUrl)) {
      chrome.tabs.update(tab.id, { url: site.messagesUrl });
    }
  }
}

async function redirectAllTabsForSite(site) {
  const matchList = site.matchList || [site.domain];
  const tabs = await chrome.tabs.query({});
  for (const tab of tabs) {
    const hostname = getHostname(tab.url || "");
    if (!hostname) continue;
    const matches = matchList.some(
      (d) => hostname === d || hostname.endsWith("." + d) || hostname === "www." + d
    );
    if (matches && !tab.url.includes(site.messagesUrl)) {
      chrome.tabs.update(tab.id, { url: site.messagesUrl });
    }
  }
}

/* ---------- Usage Tracking Alarm (every minute) ---------- */

chrome.alarms.onAlarm.addListener(async (alarm) => {
  if (alarm.name !== TICK_ALARM) return;
  await refreshActiveDomain();

  if (!state.activeDomain || !state.windowFocused) return;

  const sites = await getSites();
  const site = sites.find((s) => s.id === state.activeDomain);
  if (!site || !site.enabled) return;

  const date = todayStr();
  const secondsToAdd = TICK_PERIOD_MINUTES * 60;
  const rec = await addUsageSeconds(site.id, date, secondsToAdd);

  const usedMinutes = rec.seconds / 60;
  if (site.limitMinutes > 0 && usedMinutes >= site.limitMinutes) {
    await redirectAllTabsForSite(site);
  }
});

// Allow popup/options to request the current state or force a recheck
chrome.runtime.onMessage.addListener((msg, sender, sendResponse) => {
  if (msg?.type === "GET_ACTIVE_STATE") {
    sendResponse({ activeDomain: state.activeDomain, windowFocused: state.windowFocused });
    return true;
  }
  if (msg?.type === "REFRESH") {
    refreshActiveDomain().then(() => sendResponse({ ok: true }));
    return true;
  }
});
