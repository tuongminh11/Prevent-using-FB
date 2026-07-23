import { getSites, getUsageRecord, todayStr } from "./db.js";

function fmtMinutes(totalSeconds) {
  const m = Math.floor(totalSeconds / 60);
  const s = Math.floor(totalSeconds % 60);
  if (m <= 0) return `${s}s`;
  return `${m} minutes`;
}

async function render() {
  const listEl = document.getElementById("list");
  const sites = await getSites();
  const enabledSites = sites.filter((s) => s.enabled);

  if (enabledSites.length === 0) {
    listEl.innerHTML = `<div class="empty">No sites currently being tracked.<br/>Go to "Manage & Statistics" to add some.</div>`;
    return;
  }

  const date = todayStr();
  const rows = await Promise.all(
    enabledSites.map(async (site) => {
      const rec = await getUsageRecord(site.id, date);
      const usedMin = rec.seconds / 60;
      const limit = site.limitMinutes || 0;
      const pct = limit > 0 ? Math.min(100, (usedMin / limit) * 100) : 0;
      const over = limit > 0 && usedMin >= limit;
      return `
        <div class="site-card">
          <div class="site-top">
            <span class="site-name">${escapeHtml(site.name)}</span>
            <span class="site-time">${fmtMinutes(rec.seconds)} / ${limit} minutes</span>
          </div>
          <div class="bar-bg">
            <div class="bar-fill ${over ? "over" : ""}" style="width:${pct}%"></div>
          </div>
        </div>`;
    })
  );

  listEl.innerHTML = rows.join("");
}

function escapeHtml(str) {
  const div = document.createElement("div");
  div.textContent = str;
  return div.innerHTML;
}

document.getElementById("openOptions").addEventListener("click", () => {
  chrome.runtime.openOptionsPage();
});

render();
