import {
  getSites,
  saveSite,
  deleteSite,
  getUsageForDomainInRange,
  todayStr
} from "./db.js";

/* ---------- Tabs ---------- */

document.querySelectorAll(".tab-btn").forEach((btn) => {
  btn.addEventListener("click", () => {
    document.querySelectorAll(".tab-btn").forEach((b) => b.classList.remove("active"));
    document.querySelectorAll(".panel").forEach((p) => p.classList.remove("active"));
    btn.classList.add("active");
    document.getElementById(`panel-${btn.dataset.tab}`).classList.add("active");
    if (btn.dataset.tab === "stats") renderChart();
  });
});

function showToast(msg) {
  const t = document.getElementById("toast");
  t.textContent = msg;
  t.classList.add("show");
  setTimeout(() => t.classList.remove("show"), 1400);
}

function slugify(domain) {
  return domain.trim().toLowerCase().replace(/^https?:\/\//, "").replace(/\/.*$/, "").replace(/^www\./, "");
}

/* ---------- Site Management ---------- */

async function loadSitesTable() {
  const sites = await getSites();
  const tbody = document.getElementById("sitesBody");
  tbody.innerHTML = "";

  sites.forEach((site) => {
    const tr = document.createElement("tr");
    tr.innerHTML = `
      <td class="toggle-cell">
        <label class="switch">
          <input type="checkbox" ${site.enabled ? "checked" : ""} data-field="enabled" />
          <span class="slider"></span>
        </label>
      </td>
      <td><input type="text" value="${escapeAttr(site.name)}" data-field="name" /></td>
      <td><input type="text" value="${escapeAttr(site.domain)}" data-field="domain" /></td>
      <td><input type="url" value="${escapeAttr(site.messagesUrl)}" data-field="messagesUrl" /></td>
      <td><input type="number" min="1" value="${site.limitMinutes}" data-field="limitMinutes" /></td>
      <td class="action-cell">
        <button class="icon-btn danger" title="Delete">🗑</button>
      </td>
    `;

    tr.querySelectorAll("input").forEach((input) => {
      const eventName = input.type === "checkbox" ? "change" : "change";
      input.addEventListener(eventName, async () => {
        const field = input.dataset.field;
        let value = input.type === "checkbox" ? input.checked : input.value;
        if (field === "limitMinutes") value = Math.max(1, parseInt(value, 10) || 1);
        if (field === "domain") value = slugify(value);

        const updated = { ...site, [field]: value };
        if (field === "domain") {
          updated.matchList = [value];
        }
        await saveSite(updated);
        Object.assign(site, updated);
        showToast("Changes saved");
        chrome.runtime.sendMessage({ type: "REFRESH" }).catch(() => {});
      });
    });

    tr.querySelector(".icon-btn.danger").addEventListener("click", async () => {
      if (!confirm(`Delete "${site.name}" from the tracking list?`)) return;
      await deleteSite(site.id);
      showToast("Site deleted");
      chrome.runtime.sendMessage({ type: "REFRESH" }).catch(() => {});
      loadSitesTable();
      loadSiteSelect();
    });

    tbody.appendChild(tr);
  });
}

function escapeAttr(str) {
  return String(str ?? "").replace(/&/g, "&amp;").replace(/"/g, "&quot;");
}

document.getElementById("addSiteBtn").addEventListener("click", async () => {
  const name = document.getElementById("newName").value.trim();
  const domainRaw = document.getElementById("newDomain").value.trim();
  const msgUrl = document.getElementById("newMsgUrl").value.trim();
  const limit = Math.max(1, parseInt(document.getElementById("newLimit").value, 10) || 30);

  if (!name || !domainRaw || !msgUrl) {
    alert("Please fill in all fields.");
    return;
  }
  const domain = slugify(domainRaw);
  const site = {
    id: domain,
    name,
    domain,
    matchList: [domain],
    messagesUrl: msgUrl,
    limitMinutes: limit,
    enabled: true
  };
  await saveSite(site);
  document.getElementById("newName").value = "";
  document.getElementById("newDomain").value = "";
  document.getElementById("newMsgUrl").value = "";
  document.getElementById("newLimit").value = "30";

  showToast("Site added");
  chrome.runtime.sendMessage({ type: "REFRESH" }).catch(() => {});
  loadSitesTable();
  loadSiteSelect();
});

/* ---------- Statistics / Chart ---------- */

let currentRange = "day";

async function loadSiteSelect() {
  const sites = await getSites();
  const select = document.getElementById("siteSelect");
  const prevValue = select.value;
  select.innerHTML = sites.map((s) => `<option value="${s.id}">${escapeAttr(s.name)}</option>`).join("");
  if (sites.some((s) => s.id === prevValue)) select.value = prevValue;
}

document.getElementById("siteSelect").addEventListener("change", renderChart);

document.getElementById("rangeSeg").addEventListener("click", (e) => {
  const btn = e.target.closest("button[data-range]");
  if (!btn) return;
  document.querySelectorAll("#rangeSeg button").forEach((b) => b.classList.remove("active"));
  btn.classList.add("active");
  currentRange = btn.dataset.range;
  renderChart();
});

function dateAddDays(dateStr, days) {
  const d = new Date(dateStr + "T00:00:00");
  d.setDate(d.getDate() + days);
  return todayStr(d);
}

function buildBuckets(range) {
  // Trả về danh sách { label, start, end } — end/start là chuỗi YYYY-MM-DD
  const today = todayStr();
  const buckets = [];

  if (range === "day") {
    for (let i = 6; i >= 0; i--) {
      const d = dateAddDays(today, -i);
      const dt = new Date(d + "T00:00:00");
      const label = dt.toLocaleDateString("en-US", { weekday: "short", day: "2-digit", month: "2-digit" });
      buckets.push({ label, start: d, end: d });
    }
  } else if (range === "week") {
    const now = new Date(today + "T00:00:00");
    const dayOfWeek = (now.getDay() + 6) % 7; // 0 = Monday
    const thisMonday = dateAddDays(today, -dayOfWeek);
    for (let i = 11; i >= 0; i--) {
      const start = dateAddDays(thisMonday, -7 * i);
      const end = dateAddDays(start, 6);
      const startDt = new Date(start + "T00:00:00");
      const label = `${startDt.getDate()}/${startDt.getMonth() + 1}`;
      buckets.push({ label, start, end });
    }
  } else if (range === "month") {
    const now = new Date(today + "T00:00:00");
    for (let i = 11; i >= 0; i--) {
      const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
      const y = d.getFullYear();
      const m = d.getMonth();
      const start = `${y}-${String(m + 1).padStart(2, "0")}-01`;
      const lastDay = new Date(y, m + 1, 0).getDate();
      const end = `${y}-${String(m + 1).padStart(2, "0")}-${String(lastDay).padStart(2, "0")}`;
      const label = d.toLocaleDateString("en-US", { month: "short", year: "2-digit" });
      buckets.push({ label, start, end });
    }
  }
  return buckets;
}

async function renderChart() {
  const select = document.getElementById("siteSelect");
  const domain = select.value;
  if (!domain) return;

  try {
    await chrome.runtime.sendMessage({ type: "REFRESH" });
  } catch {}

  const buckets = buildBuckets(currentRange);
  const overallStart = buckets[0].start;
  const overallEnd = buckets[buckets.length - 1].end;
  const records = await getUsageForDomainInRange(domain, overallStart, overallEnd);

  const values = buckets.map((b) => {
    const sumSeconds = records
      .filter((r) => r.date >= b.start && r.date <= b.end)
      .reduce((acc, r) => acc + r.seconds, 0);
    return Math.round((sumSeconds / 60) * 10) / 10; // phút, 1 chữ số thập phân
  });

  drawBarChart(values, buckets.map((b) => b.label));
  renderSummary(values);
}

function renderSummary(values) {
  const totalMin = values.reduce((a, b) => a + b, 0);
  const avgMin = values.length ? totalMin / values.length : 0;
  const maxMin = values.length ? Math.max(...values) : 0;

  const box = (label, value) => `
    <div class="summary-box">
      <div class="label">${label}</div>
      <div class="value">${value}</div>
    </div>`;

  document.getElementById("summaryRow").innerHTML =
    box("Total", `${Math.round(totalMin)} minutes`) +
    box("Average", `${Math.round(avgMin)} minutes`) +
    box("Highest", `${Math.round(maxMin)} minutes`);
}

function drawBarChart(values, labels) {
  const canvas = document.getElementById("chartCanvas");
  const wrap = document.getElementById("chartWrap");
  const dpr = window.devicePixelRatio || 1;

  const cssWidth = Math.max(wrap.clientWidth, labels.length * 56);
  const cssHeight = 300;
  canvas.style.width = cssWidth + "px";
  canvas.style.height = cssHeight + "px";
  canvas.width = cssWidth * dpr;
  canvas.height = cssHeight * dpr;

  const ctx = canvas.getContext("2d");
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.clearRect(0, 0, cssWidth, cssHeight);

  const paddingLeft = 40;
  const paddingBottom = 34;
  const paddingTop = 16;
  const chartW = cssWidth - paddingLeft - 12;
  const chartH = cssHeight - paddingTop - paddingBottom;

  const maxVal = Math.max(1, ...values);
  const niceMax = Math.ceil(maxVal / 10) * 10 || 10;

  // Trục & lưới ngang
  ctx.strokeStyle = "#262f47";
  ctx.fillStyle = "#9aa4b8";
  ctx.font = "11px -apple-system, Segoe UI, Roboto, Arial, sans-serif";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  const gridLines = 4;
  for (let i = 0; i <= gridLines; i++) {
    const y = paddingTop + chartH - (chartH * i) / gridLines;
    const val = Math.round((niceMax * i) / gridLines);
    ctx.beginPath();
    ctx.moveTo(paddingLeft, y);
    ctx.lineTo(cssWidth - 6, y);
    ctx.stroke();
    ctx.fillText(String(val), paddingLeft - 8, y);
  }

  // Cột
  const barSlot = chartW / values.length;
  const barWidth = Math.min(28, barSlot * 0.55);

  values.forEach((v, i) => {
    const x = paddingLeft + barSlot * i + barSlot / 2 - barWidth / 2;
    const h = (v / niceMax) * chartH;
    const y = paddingTop + chartH - h;

    const grad = ctx.createLinearGradient(0, y, 0, paddingTop + chartH);
    grad.addColorStop(0, "#5b8cff");
    grad.addColorStop(1, "#3a5fd9");
    ctx.fillStyle = grad;
    roundRect(ctx, x, y, barWidth, Math.max(h, 1), 4);
    ctx.fill();

    // nhãn giá trị
    if (v > 0) {
      ctx.fillStyle = "#e9edf5";
      ctx.textAlign = "center";
      ctx.textBaseline = "bottom";
      ctx.font = "10px -apple-system, Segoe UI, Roboto, Arial, sans-serif";
      ctx.fillText(String(v), x + barWidth / 2, y - 4);
    }

    // nhãn trục X
    ctx.fillStyle = "#9aa4b8";
    ctx.textAlign = "center";
    ctx.textBaseline = "top";
    ctx.font = "10px -apple-system, Segoe UI, Roboto, Arial, sans-serif";
    ctx.fillText(labels[i], paddingLeft + barSlot * i + barSlot / 2, paddingTop + chartH + 8);
  });
}

function roundRect(ctx, x, y, w, h, r) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

window.addEventListener("resize", () => {
  if (document.getElementById("panel-stats").classList.contains("active")) renderChart();
});

/* ---------- Khởi tạo ---------- */

(async function init() {
  await loadSitesTable();
  await loadSiteSelect();
})();
