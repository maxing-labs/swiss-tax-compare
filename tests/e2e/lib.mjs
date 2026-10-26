// Shared helpers for the browser tests. playwright-core is not a project dependency: point PLAYWRIGHT_CORE at an
// installed copy (and CHROMIUM at a browser binary if its bundled revision is not installed); without it, tests skip.
import { createHash } from "node:crypto";
import fs from "node:fs";
import { createRequire } from "node:module";
import os from "node:os";
import path from "node:path";

export const BASE = process.env.BASE || "http://127.0.0.1:8766";

let chromium = null;
export let skip = false;
try {
  ({ chromium } = createRequire(import.meta.url)(process.env.PLAYWRIGHT_CORE || "playwright-core"));
} catch {
  skip = "playwright-core not found (set PLAYWRIGHT_CORE)";
}

// Zürich, single, CHF 100'000 gross, 2026: the app defaults, spelled out so the tests do not depend on them
export const ZURICH = "loc=800100000&name=8001%20Z%C3%BCrich&bfs=261&ct=ZH&year=2026&status=1&kids=&mode=gross" +
  "&inc1=100000&type1=1&yob1=1990&wealth=0&conf1=4";

const PHONE = { viewport: { width: 390, height: 844 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true };

let browser;
async function launch() {
  if (!browser) {
    await fetch(BASE).catch(() => { throw new Error(`no server at ${BASE}: run python3 server.py first`); });
    browser = await chromium.launch({ headless: true, executablePath: process.env.CHROMIUM || undefined });
  }
  return browser;
}

export async function close() {
  await browser?.close();
  browser = null;
}

// /api responses are cached on disk for an hour (the CDN's s-maxage) and shared by all test files: curve, history
// and compare make 17-26 upstream calls each, and upstream refuses connections for a while when it gets too many.
// The key includes api/index.py, so a backend change starts afresh. Page routes run before this one.
const CACHE_DIR = path.join(os.tmpdir(), "swiss-tax-compare-e2e");
const CACHE_TTL = 3600 * 1000;
const API_HASH = createHash("sha1").update(fs.readFileSync(new URL("../../api/index.py", import.meta.url))).digest("hex");

async function serveCached(route) {
  const file = path.join(CACHE_DIR, `${createHash("sha1").update(API_HASH + route.request().url()).digest("hex")}.json`);
  let hit = null;
  try {
    if (Date.now() - fs.statSync(file).mtimeMs < CACHE_TTL) hit = JSON.parse(fs.readFileSync(file, "utf8"));
  } catch {
    // not cached yet
  }
  if (!hit) {
    const res = await route.fetch().catch(() => null);
    if (!res) return route.abort().catch(() => {});
    hit = { status: res.status(), contentType: res.headers()["content-type"], body: await res.text() };
    if (res.ok()) {
      fs.mkdirSync(CACHE_DIR, { recursive: true });
      fs.writeFileSync(file, JSON.stringify(hit));
    }
  }
  await route.fulfill(hit).catch(() => {});
}

// New context with empty localStorage, desktop or a 390px phone. `beforeGoto(page)` can install routes before the
// app starts. Resolves once the first requests have settled, and fails if one of them did. Page errors and console
// errors/warnings go to page.errors.
export async function openApp({ query = "", beforeGoto = null, phone = false } = {}) {
  const context = await (await launch()).newContext(phone ? PHONE : { viewport: { width: 1280, height: 900 } });
  await context.addInitScript(() => {
    // toasts remove themselves after 2.6 s, so record them as they appear; count each time the badge leaves loading
    window.__toasts = [];
    window.__settled = 0;
    window.__doc = Math.random();
    document.addEventListener("DOMContentLoaded", () => {
      new MutationObserver((ms) => ms.forEach((m) => m.addedNodes.forEach((n) => {
        if (n.classList?.contains("toast-item")) window.__toasts.push(n.textContent);
      }))).observe(document.getElementById("toast-container"), { childList: true });
      const badge = document.getElementById("status-badge");
      let wasLoading = false;
      new MutationObserver(() => {
        const loading = badge.classList.contains("loading");
        if (wasLoading && !loading) window.__settled++;
        wasLoading = loading;
      }).observe(badge, { attributes: true, attributeFilter: ["class"] });
    });
  });
  await context.route("**/api/**", serveCached);
  const page = await context.newPage();
  page.errors = [];
  page.on("pageerror", (e) => page.errors.push(`[pageerror] ${e.message}`));
  page.on("console", (m) => { if (["error", "warning"].includes(m.type())) page.errors.push(`[${m.type()}] ${m.text()}`); });
  if (beforeGoto) await beforeGoto(page);
  await settle(page, () => page.goto(`${BASE}/${query}`, { waitUntil: "domcontentloaded" }));
  if ((await badge(page)).error) throw new Error(`a request failed while the app loaded: ${page.errors.join(" | ")}`);
  return page;
}

// Run `action` and wait until the requests it starts have finished: the status badge goes loading and back
// (counted from zero again if the action loads a new document). Do not use waitForLoadState("networkidle"): it
// returns at once on a page that has been idle before.
export async function settle(page, action) {
  const before = await page.evaluate(() => ({ doc: window.__doc, n: window.__settled ?? 0 }));
  await action();
  await page.waitForFunction(({ doc, n }) => window.__settled > (window.__doc === doc ? n : 0) &&
    !document.getElementById("status-badge").classList.contains("loading"), before, { timeout: 60000 });
}

export const badge = (page) => page.evaluate(() => {
  const b = document.getElementById("status-badge");
  return { text: b.textContent, loading: b.classList.contains("loading"), error: b.classList.contains("error") };
});

export const takeToasts = (page) => page.evaluate(() => window.__toasts.splice(0));

// Sets a number or text input and fires the change event the app listens to
export const setInput = (page, sel, v) => page.evaluate(([sel, v]) => {
  const el = document.querySelector(sel);
  el.value = String(v);
  el.dispatchEvent(new Event("change", { bubbles: true }));
}, [sel, v]);

export const clickTab = (page, tab) => page.click(`.nav-tabs button[data-tab="${tab}"]`);

// Records the URLs of the /api/<kind> requests the page makes from now on
export function recordRequests(page, kind) {
  const urls = [];
  page.on("request", (r) => { if (new URL(r.url()).pathname === `/api/${kind}`) urls.push(r.url()); });
  return urls;
}

export const text = (page, sel) => page.evaluate((sel) => document.querySelector(sel)?.textContent.replace(/\s+/g, " ").trim() ?? null, sel);
export const texts = (page, sel) => page.evaluate((sel) => [...document.querySelectorAll(sel)].map(e => e.textContent.replace(/\s+/g, " ").trim()), sel);

export const delay = (ms) => new Promise((res) => setTimeout(res, ms));
