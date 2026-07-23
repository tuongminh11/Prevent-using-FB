// db.js — interface to IndexedDB for storing site info and usage data
// Data structure:
//  - store "sites": { id (domain is primary key), name, domain, matchList, messagesUrl, limitMinutes, enabled }
//  - store "usage": { key = `${domain}|${date}`, domain, date (YYYY-MM-DD), seconds }

const DB_NAME = "socialTimeLimiterDB";
const DB_VERSION = 1;
const STORE_SITES = "sites";
const STORE_USAGE = "usage";

let dbPromise = null;

export function openDB() {
  if (dbPromise) return dbPromise;
  dbPromise = new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = e.target.result;
      if (!db.objectStoreNames.contains(STORE_SITES)) {
        db.createObjectStore(STORE_SITES, { keyPath: "id" });
      }
      if (!db.objectStoreNames.contains(STORE_USAGE)) {
        const usageStore = db.createObjectStore(STORE_USAGE, { keyPath: "key" });
        usageStore.createIndex("byDomain", "domain", { unique: false });
        usageStore.createIndex("byDate", "date", { unique: false });
      }
    };
    req.onsuccess = (e) => resolve(e.target.result);
    req.onerror = (e) => reject(e.target.error);
  });
  return dbPromise;
}

function tx(db, storeName, mode) {
  return db.transaction(storeName, mode).objectStore(storeName);
}

function reqToPromise(req) {
  return new Promise((resolve, reject) => {
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

/* ---------- SITES ---------- */

export async function getSites() {
  const db = await openDB();
  const store = tx(db, STORE_SITES, "readonly");
  return reqToPromise(store.getAll());
}

export async function getSite(id) {
  const db = await openDB();
  const store = tx(db, STORE_SITES, "readonly");
  return reqToPromise(store.get(id));
}

export async function saveSite(site) {
  const db = await openDB();
  const store = tx(db, STORE_SITES, "readwrite");
  return reqToPromise(store.put(site));
}

export async function deleteSite(id) {
  const db = await openDB();
  const store = tx(db, STORE_SITES, "readwrite");
  return reqToPromise(store.delete(id));
}

export async function ensureDefaultSites() {
  const sites = await getSites();
  if (sites.length > 0) return;
  const defaults = [
    {
      id: "facebook.com",
      name: "Facebook",
      domain: "facebook.com",
      matchList: ["facebook.com"],
      messagesUrl: "https://www.facebook.com/messages",
      limitMinutes: 30,
      enabled: true
    },
    {
      id: "instagram.com",
      name: "Instagram",
      domain: "instagram.com",
      matchList: ["instagram.com"],
      messagesUrl: "https://www.instagram.com/direct/inbox/",
      limitMinutes: 30,
      enabled: true
    }
  ];
  for (const s of defaults) await saveSite(s);
}

/* ---------- USAGE ---------- */

export function todayStr(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function getUsageRecord(domain, date) {
  const db = await openDB();
  const store = tx(db, STORE_USAGE, "readonly");
  const key = `${domain}|${date}`;
  const rec = await reqToPromise(store.get(key));
  return rec || { key, domain, date, seconds: 0 };
}

export async function addUsageSeconds(domain, date, secondsToAdd) {
  const db = await openDB();
  const store = tx(db, STORE_USAGE, "readwrite");
  const key = `${domain}|${date}`;
  const existing = await reqToPromise(store.get(key));
  const rec = existing || { key, domain, date, seconds: 0 };
  rec.seconds += secondsToAdd;
  await reqToPromise(store.put(rec));
  return rec;
}

export async function getUsageForDomainInRange(domain, startDate, endDate) {
  // startDate, endDate: "YYYY-MM-DD" strings, inclusive
  const db = await openDB();
  const store = tx(db, STORE_USAGE, "readonly");
  const index = store.index("byDomain");
  const all = await reqToPromise(index.getAll(domain));
  return all.filter((r) => r.date >= startDate && r.date <= endDate);
}

export async function getAllUsageForDate(date) {
  const db = await openDB();
  const store = tx(db, STORE_USAGE, "readonly");
  const index = store.index("byDate");
  return reqToPromise(index.getAll(date));
}
