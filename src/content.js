// Chat Tree: overlay UI injected into claude.ai.
(function () {
  "use strict";
  if (window.__chatTreeLoaded) return;
  window.__chatTreeLoaded = true;

  const ext = globalThis.browser || globalThis.chrome;
  const C = globalThis.ChatTreeCluster;
  const API = globalThis.ChatTreeAPI;
  // Topic colours: Anthropic's Claude palette (clay, sky, olive, fig, kraft, cactus, heather) and deeper tones of the same hues.
  const PALETTE = ["#d97757", "#6a9bcc", "#788c5d", "#c46686", "#d4a27f", "#7fa79b", "#9b97c2", "#b85c3f", "#4f7fae", "#5f7347", "#a5506e", "#b5865f"];
  const MISC = "#91908a";
  const STALE_MS = 10 * 60 * 1000;

  // ---------- storage (local only) ----------
  const store = {
    async get(k, d) { try { const r = await ext.storage.local.get(k); return r[k] === undefined ? d : r[k]; } catch (e) { return d; } },
    async set(k, v) { try { await ext.storage.local.set({ [k]: v }); } catch (e) { console.warn("[ChatTree] storage", e); } },
  };

  // ---------- state ----------
  const S = {
    org: null, chats: [], tags: {}, deep: {}, settings: { fab: "auto", deep: false, hubs: true, smart: true }, emb: {}, embVec: new Map(),
    view: "tree", group: "topics", query: "", range: "all", starred: false, project: "", tag: "",
    index: null, tree: null, visible: null, hits: null, selected: null, loading: false, status: "", hiddenTopics: new Set(),
  };

  // ---------- tiny DOM helper (text is always set as text, never as HTML) ----------
  function h(tag, attrs, ...kids) {
    const el = document.createElement(tag);
    for (const k in attrs || {}) {
      const v = attrs[k];
      if (v == null || v === false) continue;
      if (k.startsWith("on")) el.addEventListener(k.slice(2), v);
      else if (k === "class") el.className = v;
      else if (k === "style" && typeof v === "object") Object.assign(el.style, v);
      else el.setAttribute(k, v === true ? "" : v);
    }
    kids.flat(9).forEach((c) => { if (c != null && c !== false) el.append(c.nodeType ? c : String(c)); });
    return el;
  }
  // Replace an element's children; accepts nested arrays and skips null/false.
  function fill(el, ...kids) { el.replaceChildren(...kids.flat(9).filter((k) => k != null && k !== false && k !== "")); }
  function svg(path) {
    const s = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("fill", "none"); s.setAttribute("stroke", "currentColor");
    s.setAttribute("stroke-width", "2"); s.setAttribute("stroke-linecap", "round"); s.setAttribute("stroke-linejoin", "round");
    path.split("|").forEach((d) => { const p = document.createElementNS("http://www.w3.org/2000/svg", "path"); p.setAttribute("d", d); s.append(p); });
    return s;
  }
  const ICON = "M12 3v5|M12 8l-6 5|M12 8l6 5|M6 13v4|M18 13v4|M4 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0|M16 19a2 2 0 1 0 4 0a2 2 0 1 0 -4 0|M10 3a2 2 0 1 0 4 0a2 2 0 1 0 -4 0";
  const CHEV = "M9 6l6 6l-6 6";
  function chev() { const s = svg(CHEV); s.setAttribute("class", "chev"); return s; }

  function highlight(text, query) {
    if (!query) return text;
    const parts = query.toLowerCase().split(/\s+/).filter(Boolean).map((p) => p.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"));
    if (!parts.length) return text;
    const re = new RegExp("(" + parts.join("|") + ")", "ig");
    return text.split(re).map((piece, i) => (i % 2 ? h("mark", null, piece) : piece));
  }
  function fmtDate(iso) {
    if (!iso) return "";
    const d = new Date(iso), now = new Date();
    const days = Math.floor((now - d) / 864e5);
    if (days < 1) return d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
    if (days < 7) return d.toLocaleDateString([], { weekday: "short" });
    if (d.getFullYear() === now.getFullYear()) return d.toLocaleDateString([], { month: "short", day: "numeric" });
    return d.toLocaleDateString([], { year: "numeric", month: "short" });
  }
  const currentChatId = () => (location.pathname.match(/\/chat\/([0-9a-f-]{36})/) || [])[1] || null;

  // ---------- shell ----------
  const host = h("div", { id: "chat-tree-root" });
  const root = host.attachShadow({ mode: "open" });
  root.append(h("style", null, globalThis.ChatTreeCSS));
  const wrap = h("div", { class: "wrap" });
  root.append(wrap);

  const fab = h("button", { class: "fab", title: "Chat Tree (Alt+Shift+K)", "aria-label": "Open Chat Tree", onclick: () => toggle() }, svg(ICON));
  const search = h("input", { type: "search", placeholder: "Search chats", "aria-label": "Search chats", oninput: (e) => { S.query = e.target.value; render(); },
    onkeydown: (e) => {
      if (e.key === "Enter") { const first = firstVisible(); if (first != null) openChat(S.chats[first].uuid, e.ctrlKey || e.metaKey); }
      if (e.key === "ArrowDown") { e.preventDefault(); focusRow(0); }
    } });
  const viewBtns = {};
  const tabs = ["tree", "graph"].map((v) => (viewBtns[v] = h("button", { class: "tab", role: "tab", "aria-selected": "false", onclick: () => setView(v) }, v === "tree" ? "Tree" : "Graph")));
  const groupSel = h("select", { title: "Group the tree by", "aria-label": "Group the tree by", onchange: (e) => { S.group = e.target.value; render(); } },
    h("option", { value: "topics" }, "Auto topics"), h("option", { value: "tags" }, "My tags"), h("option", { value: "projects" }, "Projects"), h("option", { value: "months" }, "Month"));
  const ICON_REFRESH = "M20 11a8 8 0 1 0 -2.3 5.7|M20 5v6h-6";
  const ICON_GEAR = "M12 15a3 3 0 1 0 0-6a3 3 0 0 0 0 6|M19.4 15a1.7 1.7 0 0 0 .3 1.8l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.8-.3a1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5a1.7 1.7 0 0 0-1.8.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.8a1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1a1.7 1.7 0 0 0-.3-1.8l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.8.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5a1.7 1.7 0 0 0 1.8-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.8V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1z";
  const ICON_X = "M6 6l12 12|M18 6L6 18";
  const refreshBtn = h("button", { class: "icon", title: "Reload chats from claude.ai", "aria-label": "Reload chats", onclick: () => refresh(true) }, svg(ICON_REFRESH));
  const exportSel = h("select", { title: "Export", "aria-label": "Export", onchange: (e) => { if (e.target.value) doExport(e.target.value); e.target.value = ""; } },
    h("option", { value: "" }, "Export"), h("option", { value: "md" }, "Markdown outline"), h("option", { value: "json" }, "JSON (with tags)"));
  const settingsBtn = h("button", { class: "icon", title: "Settings and shortcuts", "aria-label": "Settings", onclick: () => { S.selected = "__settings"; renderSide(); } }, svg(ICON_GEAR));
  const closeBtn = h("button", { class: "icon", title: "Close (Esc)", "aria-label": "Close", onclick: () => toggle(false) }, svg(ICON_X));

  const rangeSel = h("select", { "aria-label": "Time range", onchange: (e) => { S.range = e.target.value; render(); } },
    h("option", { value: "all" }, "Any time"), h("option", { value: "7" }, "Last 7 days"), h("option", { value: "30" }, "Last 30 days"),
    h("option", { value: "90" }, "Last 3 months"), h("option", { value: "365" }, "Last year"), h("option", { value: "old" }, "Older than a year"));
  const starChk = h("input", { type: "checkbox", onchange: (e) => { S.starred = e.target.checked; render(); } });
  const projSel = h("select", { "aria-label": "Project", onchange: (e) => { S.project = e.target.value; render(); } });
  const tagSel = h("select", { "aria-label": "Tag", onchange: (e) => { S.tag = e.target.value; render(); } });
  const resultCount = h("span", { "aria-live": "polite" });

  const main = h("div", { class: "main", onkeydown: treeKeys });
  const side = h("aside", { class: "side", "aria-label": "Details" });
  const statusEl = h("span", { role: "status" });
  const hint = (label, ...keys) => h("span", null, label, keys.map((k) => h("kbd", null, k)));
  const panel = h("div", { class: "panel", role: "dialog", "aria-modal": "true", "aria-label": "Chat Tree", onkeydown: trapFocus },
    h("div", { class: "top" }, h("span", { class: "title" }, svg(ICON), "Chat Tree"), search, h("span", { class: "close" }), refreshBtn, exportSel, settingsBtn, closeBtn),
    h("div", { class: "tabs", role: "tablist", "aria-label": "View" }, tabs, groupSel, h("span", { class: "spacer" }), resultCount),
    h("div", { class: "filters" }, h("label", null, "When", rangeSel), h("label", null, starChk, "Starred only"),
      h("label", null, "Project", projSel), h("label", null, "Tag", tagSel)),
    h("div", { class: "body" }, main, side),
    h("footer", null, statusEl, h("span", { class: "grow" }),
      h("span", { class: "hints" }, hint("Close", "Esc"), " ", hint("Change view", "←", "→"), " ", hint("Search", "/"), " ", hint("Open", "↵"))));
  const overlay = h("div", { class: "overlay", onclick: (e) => { if (e.target === overlay) toggle(false); } }, panel);
  wrap.append(fab, overlay);

  function setView(v) { S.view = v; render(); }

  // Keyboard: arrow keys move through chats in the tree, Enter opens, Tab stays inside the panel.
  function rows() { return [...main.querySelectorAll("a.chat")].filter((a) => a.offsetParent !== null); }
  function focusRow(i) { const r = rows(); if (r.length) r[Math.max(0, Math.min(r.length - 1, i))].focus(); }
  function treeKeys(e) {
    const a = e.composedPath().find((el) => el.classList && el.classList.contains("chat"));
    if (!a) return;
    const r = rows(), i = r.indexOf(a);
    if (e.key === "ArrowDown") { e.preventDefault(); focusRow(i + 1); }
    else if (e.key === "ArrowUp") { e.preventDefault(); if (i === 0) search.focus(); else focusRow(i - 1); }
    else if (e.key === "Enter") { e.preventDefault(); openChat(a.dataset.id, e.ctrlKey || e.metaKey); }
    else if (e.key === " ") { e.preventDefault(); select(a.dataset.id); }
  }
  function trapFocus(e) {
    if (e.key !== "Tab") return;
    const f = [...panel.querySelectorAll("button, input, select, a[href], summary, canvas[tabindex]")].filter((el) => el.offsetParent !== null);
    if (!f.length) return;
    const active = root.activeElement;
    if (e.shiftKey && active === f[0]) { e.preventDefault(); f[f.length - 1].focus(); }
    else if (!e.shiftKey && active === f[f.length - 1]) { e.preventDefault(); f[0].focus(); }
  }

  function mount() { if (!document.documentElement.contains(host)) document.documentElement.append(host); }
  mount();
  new MutationObserver(mount).observe(document.documentElement, { childList: true });

  // ---------- theme: read claude.ai's own design tokens so the panel matches it exactly ----------
  function token(cs, names) {
    for (const n of names) {
      const v = cs.getPropertyValue(n).trim();
      if (!v) continue;
      if (/^\d+(\.\d+)?\s+\d+(\.\d+)?%\s+\d+(\.\d+)?%/.test(v)) return "hsl(" + v.replace(/\s*\/\s*/, " / ") + ")"; // "60 20% 99%" style
      if (/^(#|rgb|hsl|oklch|color\()/.test(v)) return v;
    }
    return null;
  }
  function luminance(color) {
    const probe = document.createElement("span"); probe.style.color = color; document.body.append(probe);
    const m = getComputedStyle(probe).color.match(/[\d.]+/g); probe.remove();
    return m ? (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) : 255;
  }
  function applyTheme() {
    const cs = getComputedStyle(document.documentElement);
    const bodyBg = getComputedStyle(document.body || document.documentElement).backgroundColor;
    const bg = token(cs, ["--bg-100"]) || (bodyBg && !/rgba\(0, 0, 0, 0\)/.test(bodyBg) ? bodyBg : null);
    let dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (bg && document.body) dark = luminance(bg) < 128;
    wrap.classList.toggle("dark", dark);
    const map = {
      "--bg": ["--bg-100"], "--panel": ["--bg-000"], "--raised": ["--bg-200"], "--hover": ["--bg-300"],
      "--line": ["--border-300", "--border-200"], "--text": ["--text-000", "--text-100"], "--muted": ["--text-400", "--text-300", "--text-500"],
      "--accent": ["--accent-brand", "--accent-main-100", "--brand-000"],
    };
    Object.entries(map).forEach(([k, names]) => { const v = token(cs, names); if (v) wrap.style.setProperty(k, v); else wrap.style.removeProperty(k); });
    const accent = token(cs, ["--accent-brand", "--accent-main-100"]);
    if (accent) { wrap.style.setProperty("--accent-soft", "color-mix(in srgb, " + accent + " 16%, transparent)"); wrap.style.setProperty("--hit", "color-mix(in srgb, " + accent + " 32%, transparent)"); }
    const font = getComputedStyle(document.body || document.documentElement).fontFamily;
    if (font) wrap.style.setProperty("--font", font);
    S.dark = dark;
  }
  if (document.documentElement) new MutationObserver(() => { if (isOpen) { applyTheme(); if (G) draw(); } }).observe(document.documentElement, { attributes: true, attributeFilter: ["class", "data-theme", "data-mode", "style"] });

  // ---------- open / close ----------
  let isOpen = false;
  let lastFocus = null;
  // opts: { view: "tree" | "graph", query: "text" } (used when opened from claude.ai's Search window)
  async function toggle(force, opts) {
    isOpen = force === undefined ? !isOpen : force;
    overlay.classList.toggle("open", isOpen);
    if (!isOpen) { stopGraph(); if (lastFocus && lastFocus.focus) try { lastFocus.focus(); } catch (e) { /* gone */ } return; }
    lastFocus = document.activeElement;
    if (opts && opts.view) S.view = opts.view;
    if (opts && typeof opts.query === "string") { S.query = opts.query; search.value = opts.query; }
    applyTheme();
    const cur = currentChatId();
    if (cur) S.selected = cur;
    if (!S.chats.length) await loadCached();
    render();
    setTimeout(() => search.focus(), 30);
    if (!S.cachedAt || Date.now() - S.cachedAt > STALE_MS) refresh(false); else smartIndex();
  }

  // ---------- data ----------
  async function loadCached() {
    const lastOrg = await store.get("lastOrg", null);
    if (!lastOrg) return;
    const cache = await store.get("cache:" + lastOrg, null);
    S.org = lastOrg;
    S.tags = await store.get("tags:" + lastOrg, {});
    S.deep = await store.get("deep:" + lastOrg, {});
    S.emb = await store.get("emb:" + lastOrg, {});
    if (cache) { S.chats = cache.chats; S.cachedAt = cache.at; rebuild(); }
  }

  async function refresh(manual) {
    if (S.loading) return;
    S.loading = true; setStatus("Loading chats from claude.ai…", true);
    try {
      const { org, chats } = await API.loadAll((n) => setStatus("Loading chats… " + n, true));
      if (org !== S.org) { S.tags = await store.get("tags:" + org, {}); S.deep = await store.get("deep:" + org, {}); S.emb = await store.get("emb:" + org, {}); S.embVec.clear(); }
      S.org = org; S.chats = chats; S.cachedAt = Date.now();
      await store.set("lastOrg", org);
      await store.set("cache:" + org, { chats, at: S.cachedAt });
      rebuild(); render();
      setStatus(chats.length + " chats, updated " + new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }));
      if (S.settings.deep) deepIndex();
      smartIndex();
    } catch (e) {
      console.warn("[ChatTree]", e);
      setStatus("Could not load chats: " + e.message + (S.chats.length ? " (showing saved copy)" : ""));
      if (!S.chats.length) render();
    } finally { S.loading = false; }
  }

  function setStatus(text, busy) {
    S.status = text;
    fill(statusEl, busy ? h("span", { class: "spin" }) : "", " ", text);
  }

  function rebuild() {
    const docs = S.chats.map((c) => Object.assign({}, c, { tags: S.tags[c.uuid] || [], extraText: S.deep[c.uuid] || "" }));
    S.index = C.buildIndex(docs);
    if (S.settings.smart) S.index.dense = S.chats.map((c) => vecFor(c));
    S.tree = C.buildTree(S.index);
    S.graph = null;
    S.byId = new Map(S.chats.map((c, i) => [c.uuid, i]));
    // Filter dropdowns
    const projects = [...new Set(S.chats.map((c) => c.projectName).filter(Boolean))].sort();
    fill(projSel, h("option", { value: "" }, "All"), h("option", { value: "__none" }, "No project"), projects.map((p) => h("option", { value: p }, p)));
    projSel.value = projects.includes(S.project) || S.project === "__none" ? S.project : "";
    const tags = allTags();
    fill(tagSel, h("option", { value: "" }, "All"), h("option", { value: "__none" }, "Untagged"), tags.map((t) => h("option", { value: t }, t)));
    tagSel.value = tags.includes(S.tag) || S.tag === "__none" ? S.tag : "";
  }
  const allTags = () => [...new Set(Object.values(S.tags).flat())].sort((a, b) => a.localeCompare(b));

  function computeVisible() {
    const now = Date.now();
    const hits = S.index ? C.search(S.index, S.query) : null;
    S.hits = hits;
    const vis = new Set();
    S.chats.forEach((c, i) => {
      if (hits && !hits.has(i)) return;
      if (S.starred && !c.starred) return;
      if (S.project === "__none" ? c.projectName : S.project && c.projectName !== S.project) return;
      const t = S.tags[c.uuid] || [];
      if (S.tag === "__none" ? t.length : S.tag && !t.includes(S.tag)) return;
      if (S.range !== "all") {
        const age = (now - new Date(c.updated)) / 864e5;
        if (S.range === "old" ? age < 365 : age > +S.range) return;
      }
      vis.add(i);
    });
    S.visible = vis;
    resultCount.textContent = vis.size === S.chats.length ? S.chats.length + " chats" : vis.size + " of " + S.chats.length + " chats";
  }
  const isFiltered = () => S.visible && S.visible.size !== S.chats.length;
  function firstVisible() { for (const i of S.visible || []) return i; return null; }

  // ---------- render ----------
  function render() {
    if (!isOpen) return;
    Object.entries(viewBtns).forEach(([v, b]) => b.setAttribute("aria-selected", String(S.view === v)));
    groupSel.style.display = S.view === "tree" ? "" : "none";
    if (!S.chats.length) {
      stopGraph();
      fill(main, h("div", { class: "empty" }, S.loading ? "Loading your chats…" : "No chats loaded yet. " + (S.status || ""), h("br"), h("br"), h("button", { onclick: () => refresh(true) }, "Load chats")));
      renderSide();
      return;
    }
    computeVisible();
    if (S.view === "tree") { stopGraph(); renderTree(); } else renderGraph();
    renderSide();
  }

  function chatRow(i) {
    const c = S.chats[i];
    const tags = S.tags[c.uuid] || [];
    return h("a", { class: "chat" + (S.selected === c.uuid ? " sel" : ""), href: "/chat/" + c.uuid, "data-id": c.uuid, title: c.summary ? c.summary.slice(0, 300) : c.name,
      onclick: (e) => { if (e.ctrlKey || e.metaKey || e.shiftKey || e.button) return; e.preventDefault(); select(c.uuid); },
      ondblclick: (e) => { e.preventDefault(); openChat(c.uuid); } },
      c.starred ? h("span", { class: "star" }, "★") : null,
      h("span", { class: "nm" }, highlight(c.name, S.query)),
      tags.slice(0, 3).map((t) => h("span", { class: "tag" }, t)),
      h("span", { class: "meta" }, fmtDate(c.updated)));
  }
  const byRecent = (a, b) => (S.chats[b].updated || "").localeCompare(S.chats[a].updated || "");

  function topicBlock(node, color, open) {
    const vis = node.members.filter((i) => S.visible.has(i));
    if (!vis.length) return null;
    const childIdx = new Set();
    const kids = (node.children || []).map((ch) => { ch.members.forEach((m) => childIdx.add(m)); return topicBlock(ch, color, open && false); }).filter(Boolean);
    const direct = vis.filter((i) => !childIdx.has(i)).sort(byRecent);
    const d = h("details", { open: open || isFiltered() || null },
      h("summary", null, chev(), h("span", { class: "dot", style: { background: color } }), h("span", { class: "tlabel" }, node.label), h("span", { class: "count" }, vis.length)),
      h("div", { class: "kids" }, kids, direct.map(chatRow)));
    return d;
  }
  function flatBlock(label, idxs, color, open) {
    const vis = idxs.filter((i) => S.visible.has(i)).sort(byRecent);
    if (!vis.length) return null;
    const d = h("details", { open: open || isFiltered() || null },
      h("summary", null, chev(), h("span", { class: "dot", style: { background: color } }), h("span", { class: "tlabel" }, label), h("span", { class: "count" }, vis.length)),
      h("div", { class: "kids" }, vis.map(chatRow)));
    return d;
  }

  function renderTree() {
    const blocks = [];
    if (S.group === "topics") {
      const color = (r) => PALETTE[S.tree.roots.indexOf(r) % PALETTE.length];
      S.tree.shelves.forEach((sh) => {
        const kids = sh.topics.map((r) => topicBlock(r, color(r), false)).filter(Boolean);
        if (!kids.length) return;
        const n = sh.topics.reduce((a, r) => a + r.members.filter((i) => S.visible.has(i)).length, 0);
        blocks.push(h("details", { open: true }, h("summary", null, chev(), h("span", { class: "tlabel shelf" }, sh.label), h("span", { class: "count" }, n)), h("div", { class: "kids" }, kids)));
      });
      S.tree.unshelved.forEach((r) => blocks.push(topicBlock(r, color(r), false)));
      blocks.push(flatBlock("Other chats", S.tree.misc, MISC, false));
    } else if (S.group === "tags") {
      allTags().forEach((t, ti) => blocks.push(flatBlock("#" + t, S.chats.map((c, i) => ((S.tags[c.uuid] || []).includes(t) ? i : -1)).filter((i) => i >= 0), PALETTE[ti % PALETTE.length], false)));
      blocks.push(flatBlock("Untagged", S.chats.map((c, i) => ((S.tags[c.uuid] || []).length ? -1 : i)).filter((i) => i >= 0), MISC, false));
    } else if (S.group === "projects") {
      const m = new Map();
      S.chats.forEach((c, i) => { const k = c.projectName || ""; if (!m.has(k)) m.set(k, []); m.get(k).push(i); });
      [...m.keys()].filter(Boolean).sort().forEach((k, ki) => blocks.push(flatBlock(k, m.get(k), PALETTE[ki % PALETTE.length], false)));
      if (m.has("")) blocks.push(flatBlock("No project", m.get(""), MISC, false));
    } else {
      const m = new Map();
      S.chats.forEach((c, i) => { const d = new Date(c.updated); const k = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0"); if (!m.has(k)) m.set(k, []); m.get(k).push(i); });
      [...m.keys()].sort().reverse().forEach((k, ki) => {
        const [y, mo] = k.split("-");
        blocks.push(flatBlock(new Date(+y, +mo - 1, 1).toLocaleDateString([], { year: "numeric", month: "long" }), m.get(k), PALETTE[ki % PALETTE.length], ki < 2));
      });
    }
    const list = blocks.filter(Boolean);
    fill(main, h("div", { class: "tree" }, list.length ? list : h("div", { class: "empty" }, S.group === "tags" && !allTags().length ? "No tags yet. Select a chat and add a tag on the right." : "No chats match.")));
    const sel = main.querySelector("a.chat.sel");
    if (sel) { let p = sel.parentElement; while (p && p !== main) { if (p.tagName === "DETAILS") p.open = true; p = p.parentElement; } sel.scrollIntoView({ block: "center" }); }
  }

  // ---------- graph ----------
  let G = null; // {nodes, links, canvas, ctx, raf, view:{x,y,k}, alpha}
  function stopGraph() { if (G && G.raf) cancelAnimationFrame(G.raf); if (G) G.raf = 0; }

  function renderGraph() {
    if (!S.graph || S.graph.hubs !== S.settings.hubs) {
      const g = C.buildGraph(S.index, S.tree, { hubs: S.settings.hubs });
      // Seed positions: topic hubs on a circle, chats around their topic.
      const tops = S.tree.roots.length || 1;
      const topicPos = new Map();
      S.tree.roots.forEach((r, ri) => { const a = (ri / tops) * Math.PI * 2; const rad = 120 + 12 * Math.sqrt(S.chats.length); topicPos.set(r, [Math.cos(a) * rad, Math.sin(a) * rad]); });
      g.nodes.forEach((n, k) => {
        const base = n.topic ? topicPos.get(n.topic) : [0, 0];
        const jitter = n.kind === "topic" ? 0 : 60;
        n.x = base[0] + (Math.random() - 0.5) * jitter * 2 + (n.topic ? 0 : (Math.random() - 0.5) * 500);
        n.y = base[1] + (Math.random() - 0.5) * jitter * 2 + (n.topic ? 0 : (Math.random() - 0.5) * 500);
        n.vx = 0; n.vy = 0;
        n.color = n.topic ? PALETTE[n.topic.color % PALETTE.length] : MISC;
        n.deg = 0;
      });
      g.links.forEach((l) => { if (!l.hub) { g.nodes[l.source].deg++; g.nodes[l.target].deg++; } });
      g.nodes.forEach((n) => { n.r = n.kind === "topic" ? 5 + Math.sqrt(n.topic.members.length) * 1.2 : 4.2 + Math.min(4, Math.sqrt(n.deg) * 1.2); });
      S.graph = { nodes: g.nodes, links: g.links, hubs: S.settings.hubs };
      if (G) G.alpha = 1;
    }
    if (!G || !main.contains(G.wrapEl)) setupCanvas();
    else { G.alpha = Math.max(G.alpha, 0.05); }
    renderLegend();
    loop();
  }

  function setupCanvas() {
    const canvas = h("canvas");
    const tip = h("div", { class: "tip" });
    const legend = h("div", { class: "legend" });
    const tools = h("div", { class: "gtools" },
      h("button", { title: "Show topic hubs in the graph", class: S.settings.hubs ? "on" : "", onclick: (e) => { S.settings.hubs = !S.settings.hubs; e.target.classList.toggle("on", S.settings.hubs); saveSettings(); render(); } }, "Topic hubs"),
      h("button", { onclick: () => fitView() }, "Fit"),
      h("button", { onclick: () => { G.alpha = 1; } }, "Re-layout"));
    const wrapEl = h("div", { class: "graphwrap" }, canvas, legend, tools, tip);
    fill(main, wrapEl);
    const ctx = canvas.getContext("2d");
    G = { canvas, ctx, tip, legend, wrapEl, view: { x: 0, y: 0, k: 0.8 }, alpha: 1, raf: 0, hover: null, fitted: false };
    const resize = () => { const r = main.getBoundingClientRect(); const dpr = window.devicePixelRatio || 1; canvas.width = r.width * dpr; canvas.height = r.height * dpr; canvas.style.width = r.width + "px"; canvas.style.height = r.height + "px"; G.w = r.width; G.h = r.height; G.dpr = dpr; draw(); };
    new ResizeObserver(resize).observe(main);
    resize();
    const toWorld = (mx, my) => [(mx - G.w / 2 - G.view.x) / G.view.k, (my - G.h / 2 - G.view.y) / G.view.k];
    const pick = (e) => {
      const r = canvas.getBoundingClientRect();
      const [wx, wy] = toWorld(e.clientX - r.left, e.clientY - r.top);
      let best = null, bd = Infinity;
      S.graph.nodes.forEach((n) => { if (!nodeShown(n)) return; const d = (n.x - wx) ** 2 + (n.y - wy) ** 2; const rr = (n.r + 4 / G.view.k) ** 2; if (d < rr && d < bd) { bd = d; best = n; } });
      return best;
    };
    let drag = null;
    canvas.addEventListener("pointerdown", (e) => {
      const n = pick(e);
      drag = { n, sx: e.clientX, sy: e.clientY, vx: G.view.x, vy: G.view.y, moved: false };
      canvas.setPointerCapture(e.pointerId); canvas.classList.add("dragging");
    });
    canvas.addEventListener("pointermove", (e) => {
      if (drag) {
        const dx = e.clientX - drag.sx, dy = e.clientY - drag.sy;
        if (Math.abs(dx) + Math.abs(dy) > 3) drag.moved = true;
        if (drag.n) { const r = canvas.getBoundingClientRect(); const [wx, wy] = toWorld(e.clientX - r.left, e.clientY - r.top); drag.n.x = wx; drag.n.y = wy; drag.n.fixed = true; G.alpha = Math.max(G.alpha, 0.3); loop(); }
        else { G.view.x = drag.vx + dx; G.view.y = drag.vy + dy; draw(); }
        return;
      }
      const n = pick(e);
      if (n !== G.hover) { G.hover = n; draw(); }
      if (n) {
        const r = main.getBoundingClientRect();
        const c = n.kind === "chat" ? S.chats[n.i] : null;
        fill(tip, h("b", null, c ? c.name : "Topic: " + n.label), h("br"), c ? (fmtDate(c.updated) + (c.projectName ? " · " + c.projectName : "")) : n.topic.members.length + " chats");
        tip.style.display = "block"; tip.style.left = Math.min(e.clientX - r.left + 14, r.width - 330) + "px"; tip.style.top = (e.clientY - r.top + 14) + "px";
      } else tip.style.display = "none";
    });
    canvas.addEventListener("pointerup", (e) => {
      canvas.classList.remove("dragging");
      if (drag && !drag.moved && drag.n) {
        if (drag.n.kind === "chat") { if (e.ctrlKey || e.metaKey) openChat(S.chats[drag.n.i].uuid, true); else select(S.chats[drag.n.i].uuid); }
        else { S.hiddenTopics.clear(); S.selectedTopic = drag.n.topic; S.selected = "__topic"; renderSide(); draw(); }
      }
      if (drag && drag.n) drag.n.fixed = false;
      drag = null;
    });
    canvas.addEventListener("dblclick", (e) => { const n = pick(e); if (n && n.kind === "chat") openChat(S.chats[n.i].uuid); });
    canvas.addEventListener("wheel", (e) => {
      e.preventDefault();
      const r = canvas.getBoundingClientRect(); const mx = e.clientX - r.left - G.w / 2, my = e.clientY - r.top - G.h / 2;
      const f = Math.exp(-e.deltaY * 0.0015); const k = Math.min(6, Math.max(0.08, G.view.k * f));
      G.view.x = mx - (mx - G.view.x) * (k / G.view.k); G.view.y = my - (my - G.view.y) * (k / G.view.k); G.view.k = k; draw();
    }, { passive: false });
  }

  function renderLegend() {
    const head = h("button", { class: "legend-head", "aria-expanded": String(!!S.legendOpen), onclick: () => { S.legendOpen = !S.legendOpen; renderLegend(); } },
      "Topics", h("span", { class: "count" }, S.tree.roots.length), S.legendOpen ? " ▴" : " ▾");
    fill(G.legend, head, S.legendOpen ? [
      S.tree.roots.map((r, ri) => h("div", { class: S.hiddenTopics.has(r) ? "dim" : "", title: "Click to hide or show", role: "button", tabindex: "0",
        onclick: () => { S.hiddenTopics.has(r) ? S.hiddenTopics.delete(r) : S.hiddenTopics.add(r); renderLegend(); draw(); } },
        h("span", { class: "dot", style: { background: PALETTE[ri % PALETTE.length] } }), r.label, h("span", { class: "count" }, r.members.length))),
      S.tree.misc.length ? h("div", null, h("span", { class: "dot", style: { background: MISC } }), "Other", h("span", { class: "count" }, S.tree.misc.length)) : null] : null);
  }

  function nodeShown(n) {
    if (n.topic && S.hiddenTopics.has(n.topic)) return false;
    if (n.kind === "chat") return S.visible.has(n.i);
    return n.topic.members.some((m) => S.visible.has(m));
  }

  function tick() {
    const nodes = S.graph.nodes, links = S.graph.links, a = G.alpha;
    const n = nodes.length;
    // Repulsion on a grid so large chat lists stay fast.
    const cell = 80, grid = new Map();
    const hubs = nodes.filter((q) => q.kind === "topic");
    nodes.forEach((p, i) => { const key = Math.floor(p.x / cell) + "," + Math.floor(p.y / cell); if (!grid.has(key)) grid.set(key, []); grid.get(key).push(i); });
    nodes.forEach((p) => {
      const gx = Math.floor(p.x / cell), gy = Math.floor(p.y / cell);
      for (let dx = -2; dx <= 2; dx++) for (let dy = -2; dy <= 2; dy++) {
        const list = grid.get((gx + dx) + "," + (gy + dy)); if (!list) continue;
        for (const j of list) {
          const q = nodes[j]; if (q === p) continue;
          let ddx = p.x - q.x, ddy = p.y - q.y, d2 = ddx * ddx + ddy * ddy;
          if (d2 < 0.01) { ddx = Math.random() - 0.5; ddy = Math.random() - 0.5; d2 = 0.5; }
          if (d2 > cell * cell * 4) continue;
          const f = (p.kind === "topic" || q.kind === "topic" ? 900 : 260) / d2;
          p.vx += ddx * f * a; p.vy += ddy * f * a;
        }
      }
      // Topic hubs push each other apart at any distance, so clusters get their own space.
      if (p.kind === "topic") hubs.forEach((q) => {
        if (q === p) return;
        let dx = p.x - q.x, dy = p.y - q.y, d2 = dx * dx + dy * dy + 1;
        const f = 9000 / d2; p.vx += dx * f * a / Math.sqrt(d2) * 4; p.vy += dy * f * a / Math.sqrt(d2) * 4;
      });
      // Weak pull to the centre.
      p.vx -= p.x * 0.002 * a; p.vy -= p.y * 0.002 * a;
    });
    links.forEach((l) => {
      const s = nodes[l.source], t = nodes[l.target];
      const dx = t.x - s.x, dy = t.y - s.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      const target = l.hub ? 18 + 5 * Math.sqrt(s.topic ? s.topic.members.length : 4) : 40 + (1 - l.w) * 50;
      const k = (l.hub ? 0.18 : 0.03 * (0.5 + l.w)) * a;
      const f = (d - target) / d * k;
      if (!t.fixed) { t.vx -= dx * f; t.vy -= dy * f; }
      if (!s.fixed) { s.vx += dx * f; s.vy += dy * f; }
    });
    for (let i = 0; i < n; i++) {
      const p = nodes[i];
      if (p.fixed) { p.vx = p.vy = 0; continue; }
      p.vx *= 0.6; p.vy *= 0.6;
      const sp = Math.hypot(p.vx, p.vy); if (sp > 30) { p.vx *= 30 / sp; p.vy *= 30 / sp; }
      p.x += p.vx; p.y += p.vy;
    }
    G.alpha *= 0.985;
  }

  function loop() {
    if (G.raf) return;
    const step = () => {
      G.raf = 0;
      if (!isOpen || S.view !== "graph") return;
      const iters = S.graph.nodes.length > 1500 ? 1 : 2;
      for (let i = 0; i < iters && G.alpha > 0.01; i++) tick();
      if (!G.fitted && G.alpha < 0.5) { fitView(); G.fitted = true; }
      draw();
      if (G.alpha > 0.01) G.raf = requestAnimationFrame(step);
    };
    G.raf = requestAnimationFrame(step);
  }

  function fitView() {
    const shown = S.graph.nodes.filter(nodeShown);
    if (!shown.length) return;
    let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
    shown.forEach((n) => { x0 = Math.min(x0, n.x); y0 = Math.min(y0, n.y); x1 = Math.max(x1, n.x); y1 = Math.max(y1, n.y); });
    const k = Math.min(3, 0.9 * Math.min(G.w / (x1 - x0 + 60), G.h / (y1 - y0 + 60)));
    G.view.k = k; G.view.x = -((x0 + x1) / 2) * k; G.view.y = -((y0 + y1) / 2) * k;
    draw();
  }

  function roundRect(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r);
    ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  const alpha = (hex, a) => hex + Math.round(a * 255).toString(16).padStart(2, "0");

  function draw() {
    if (!G || !S.graph) return;
    const { ctx, view } = G;
    const cs = getComputedStyle(wrap);
    const C_ = { text: cs.getPropertyValue("--text").trim(), muted: cs.getPropertyValue("--muted").trim(), panel: cs.getPropertyValue("--panel").trim(),
      line: cs.getPropertyValue("--line").trim(), accent: cs.getPropertyValue("--accent").trim(), font: cs.getPropertyValue("--font").trim() || "system-ui" };
    ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    ctx.clearRect(0, 0, G.w, G.h);
    ctx.translate(G.w / 2 + view.x, G.h / 2 + view.y); ctx.scale(view.k, view.k);
    const k = view.k, px = (v) => v / k; // screen pixels -> world units
    const nodes = S.graph.nodes;
    const selIdx = S.byId.get(S.selected);
    const focus = G.hover || (selIdx != null ? nodes[selIdx] : null);
    const neighbours = new Set();
    const query = !!S.query;

    // 1) Soft halo behind each topic's chats.
    S.tree.roots.forEach((r, ri) => {
      if (S.hiddenTopics.has(r)) return;
      const pts = r.members.filter((m) => S.visible.has(m)).map((m) => nodes[m]);
      if (pts.length < 2) return;
      let cx = 0, cy = 0; pts.forEach((p) => { cx += p.x; cy += p.y; }); cx /= pts.length; cy /= pts.length;
      const ds = pts.map((p) => Math.hypot(p.x - cx, p.y - cy)).sort((a, b) => a - b);
      const rad = ds[Math.floor(ds.length * 0.8)] + 16;
      const col = PALETTE[ri % PALETTE.length];
      ctx.beginPath(); ctx.arc(cx, cy, rad, 0, Math.PI * 2);
      ctx.fillStyle = alpha(col, S.dark ? 0.08 : 0.07); ctx.fill();
      ctx.lineWidth = px(1); ctx.strokeStyle = alpha(col, 0.22); ctx.stroke();
    });

    // 2) Links as gentle curves; the focused chat's links stand out.
    S.graph.links.forEach((l) => {
      const s = nodes[l.source], t = nodes[l.target];
      if (!nodeShown(s) || !nodeShown(t)) return;
      const lit = focus && (s === focus || t === focus);
      if (lit) { neighbours.add(s); neighbours.add(t); }
      if (l.hub && !lit) return; // hub spokes only show for the focused topic
      const mx = (s.x + t.x) / 2, my = (s.y + t.y) / 2, dx = t.x - s.x, dy = t.y - s.y;
      const cxp = mx - dy * 0.12, cyp = my + dx * 0.12;
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.quadraticCurveTo(cxp, cyp, t.x, t.y);
      ctx.lineWidth = px(lit ? 1.6 : 0.6 + l.w * 1.2);
      ctx.strokeStyle = lit ? alpha(s.color.length === 7 ? s.color : "#888888", 0.9) : C_.line;
      ctx.stroke();
    });

    // 3) Chat dots, ringed in the panel colour so overlapping dots stay readable.
    nodes.forEach((n) => {
      if (!nodeShown(n) || n.kind === "topic") return;
      const dim = (focus && !neighbours.has(n) && n !== focus) || (query && !S.hits.has(n.i));
      ctx.globalAlpha = dim ? (G.hover || query ? 0.22 : 0.6) : 1;
      const isSel = S.chats[n.i].uuid === S.selected;
      if (isSel) { ctx.beginPath(); ctx.arc(n.x, n.y, n.r + px(5), 0, Math.PI * 2); ctx.fillStyle = alpha(n.color.length === 7 ? n.color : "#888888", 0.25); ctx.fill(); }
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2);
      ctx.fillStyle = n.color; ctx.fill();
      ctx.lineWidth = px(isSel ? 2 : 1.2); ctx.strokeStyle = isSel ? C_.text : C_.panel; ctx.stroke();
    });
    ctx.globalAlpha = 1;

    // 4) Labels in screen space, skipping any that would overlap one already drawn.
    ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    const toScreen = (n) => [G.w / 2 + view.x + n.x * k, G.h / 2 + view.y + n.y * k];
    const placed = [];
    const fits = (x, y, w, h) => { if (placed.some((p) => x < p[0] + p[2] && x + w > p[0] && y < p[1] + p[3] && y + h > p[1])) return false; placed.push([x, y, w, h]); return true; };
    // Topic pills first, biggest topics win space.
    nodes.filter((n) => n.kind === "topic" && nodeShown(n)).sort((a, b) => b.topic.members.length - a.topic.members.length).forEach((n) => {
      let [sx, sy] = n.kind === "topic" ? toScreen(n) : [0, 0];
      ctx.font = "500 12.5px " + C_.font;
      const label = n.label.length > 30 ? n.label.slice(0, 29) + "…" : n.label;
      const w = ctx.measureText(label).width + 28, h = 24;
      const x = sx - w / 2, y = sy - h / 2;
      if (!fits(x, y, w, h)) return;
      const dim = G.hover && G.hover.kind === "chat" && G.hover.topic !== n.topic;
      ctx.globalAlpha = dim ? 0.45 : 1;
      roundRect(ctx, x, y, w, h, 12); ctx.fillStyle = C_.panel; ctx.fill(); ctx.lineWidth = 1; ctx.strokeStyle = C_.line; ctx.stroke();
      ctx.beginPath(); ctx.arc(x + 12, sy, 4, 0, Math.PI * 2); ctx.fillStyle = n.color; ctx.fill();
      ctx.fillStyle = C_.text; ctx.textAlign = "left"; ctx.textBaseline = "middle"; ctx.fillText(label, x + 21, sy + 0.5);
      ctx.globalAlpha = 1;
    });
    // Chat titles: focus and neighbours first, then search hits, then everything when zoomed in.
    const want = [];
    if (focus && focus.kind === "chat") want.push(focus);
    neighbours.forEach((n) => { if (n !== focus && n.kind === "chat") want.push(n); });
    if (query) S.hits.forEach((i) => want.push(nodes[i]));
    if (k >= 1.4) nodes.forEach((n) => { if (n.kind === "chat") want.push(n); });
    const done = new Set();
    ctx.font = "12px " + C_.font; ctx.textAlign = "left"; ctx.textBaseline = "middle";
    want.forEach((n) => {
      if (done.has(n) || !nodeShown(n)) return; done.add(n);
      const [sx, sy] = toScreen(n);
      if (sx < -50 || sy < -20 || sx > G.w + 50 || sy > G.h + 20) return;
      const name = S.chats[n.i].name;
      const label = name.length > 38 ? name.slice(0, 37) + "…" : name;
      const w = ctx.measureText(label).width + 12, h = 20, x = sx + n.r * k + 4, y = sy - h / 2;
      if (!fits(x, y, w, h)) return;
      const strong = n === focus || neighbours.has(n);
      roundRect(ctx, x, y, w, h, 6); ctx.fillStyle = C_.panel; ctx.globalAlpha = strong ? 0.96 : 0.82; ctx.fill(); ctx.globalAlpha = 1;
      ctx.fillStyle = strong ? C_.text : C_.muted; ctx.fillText(label, x + 6, sy + 0.5);
    });
  }

  // ---------- side panel ----------
  function select(uuid) {
    S.selected = uuid;
    if (S.view === "tree") main.querySelectorAll("a.chat").forEach((a) => a.classList.toggle("sel", a.dataset.id === uuid));
    else draw();
    renderSide();
  }

  function renderSide() {
    if (S.selected === "__settings") return renderSettings();
    if (S.selected === "__topic" && S.selectedTopic) {
      const t = S.selectedTopic;
      fill(side, h("h3", null, t.label), h("p", null, t.members.length + " chats in this topic"),
        h("h4", null, "Most recent"), h("div", null, t.members.slice().sort(byRecent).slice(0, 25).map(chatRow)));
      return;
    }
    const i = S.byId ? S.byId.get(S.selected) : undefined;
    if (i == null) {
      fill(side, h("h3", null, "Your chats, organised"),
        h("p", null, "Chats on the same subject are grouped into topics automatically, from their titles and summaries. Click a chat to see details, tags and related chats. Double-click to open it."),
        helpBlock());
      return;
    }
    const c = S.chats[i];
    const tags = S.tags[c.uuid] || [];
    const tagInput = h("input", { type: "text", placeholder: "Add tag…", list: "ct-tags", style: { width: "120px" },
      onkeydown: (e) => { if (e.key === "Enter" && e.target.value.trim()) { addTag(c.uuid, e.target.value.trim()); } } });
    const datalist = h("datalist", { id: "ct-tags" }, allTags().map((t) => h("option", { value: t })));
    const topic = S.tree.topicOf.get(i);
    const rel = C.related(S.index, i, 8);
    fill(side, 
      h("h3", null, c.starred ? "★ " : "", c.name),
      h("p", null, "Updated " + new Date(c.updated).toLocaleString(), c.projectName ? " · Project: " + c.projectName : "", c.model ? " · " + c.model : ""),
      topic ? h("p", null, "Topic: ", h("b", null, topic.label)) : null,
      h("div", { class: "row" },
        h("button", { onclick: () => openChat(c.uuid) }, "Open"),
        h("button", { onclick: () => openChat(c.uuid, true) }, "Open in new tab"),
        h("button", { onclick: () => { navigator.clipboard.writeText(location.origin + "/chat/" + c.uuid); setStatus("Link copied"); } }, "Copy link")),
      h("h4", null, "Tags"),
      h("div", { class: "tags" }, tags.map((t) => h("span", { class: "tagchip" }, t, h("button", { title: "Remove", onclick: () => removeTag(c.uuid, t) }, "×"))), tagInput, datalist),
      c.summary || S.deep[c.uuid] ? h("h4", null, c.summary ? "Summary" : "First message") : null,
      c.summary || S.deep[c.uuid] ? h("div", { class: "summary" }, c.summary || S.deep[c.uuid]) : null,
      h("h4", null, "Related chats"),
      rel.length ? h("div", null, rel.map(([j]) => chatRow(j))) : h("p", null, "Nothing similar found yet."));
  }

  function helpBlock() {
    const k = (s) => h("kbd", null, s);
    return h("div", { class: "help" }, h("h4", null, "Shortcuts"),
      h("div", null, k("Alt"), "+", k("Shift"), "+", k("K"), " open or close"), h("div", null, k("/"), " search"), h("div", null, k("Enter"), " open first result"),
      h("div", null, k("Esc"), " close"), h("div", null, k("Ctrl"), "+click open in new tab"), h("div", null, "Graph: drag to pan, scroll to zoom, drag a dot to move it"));
  }

  function renderSettings() {
    const chk = (key, label, note, after) => h("label", null, h("input", { type: "checkbox", checked: S.settings[key] === true || null, onchange: (e) => { S.settings[key] = e.target.checked; saveSettings(); if (after) after(e.target.checked); } }), h("span", null, label, note ? h("br") : null, note ? h("small", { class: "help" }, note) : null));
    fill(side, h("h3", null, "Settings"), h("div", { class: "settings" },
      chk("fab", "Always show the round button", "Normally it hides once Chat Tree finds claude.ai's Search window (Tree and Graph tabs appear there). Alt+Shift+K and the toolbar icon always work.", (v) => { S.settings.fab = v ? true : "auto"; saveSettings(); updateFab(); }),
      chk("smart", "Smart grouping (on-device AI)", "A small model bundled with the extension reads chat titles and links them by meaning. It runs outside the claude.ai page on one CPU core, only when there are new chats (about 10 s per 1,000 chats, roughly 150 MB of memory), then unloads a few seconds later.", (v) => { rebuild(); render(); if (v) smartIndex(); }),
      chk("deep", "Deep index (experimental)", "Also reads the first message of each chat, slowly (one chat every 1.5 s), so topics and search are better. The text stays in this browser.", (v) => { if (v) deepIndex(); }),
      h("p", { class: "help" }, Object.keys(S.deep).length + " chats deep-indexed."),
      h("div", { class: "row" },
        h("button", { onclick: async () => { S.deep = {}; await store.set("deep:" + S.org, {}); rebuild(); render(); } }, "Clear deep index"),
        h("button", { onclick: async () => { await store.set("cache:" + S.org, null); S.chats = []; S.cachedAt = 0; render(); refresh(true); } }, "Clear saved chat list"))),
      helpBlock());
  }

  async function saveSettings() { await store.set("settings", S.settings); }

  async function addTag(uuid, tag) {
    const t = tag.replace(/^#/, "").slice(0, 40);
    const list = S.tags[uuid] || [];
    if (!list.includes(t)) S.tags[uuid] = list.concat(t);
    await store.set("tags:" + S.org, S.tags);
    rebuild(); render();
    const inp = side.querySelector("input[type=text]"); if (inp) inp.focus();
  }
  async function removeTag(uuid, tag) {
    S.tags[uuid] = (S.tags[uuid] || []).filter((x) => x !== tag);
    if (!S.tags[uuid].length) delete S.tags[uuid];
    await store.set("tags:" + S.org, S.tags);
    rebuild(); render();
  }

  // ---------- smart grouping (on-device model, runs inside the extension, not on this page) ----------
  const embText = (c) => (c.name + (c.summary ? ". " + c.summary.slice(0, 160) : "")).slice(0, 300);
  function hash(str) { let x = 5381; for (let i = 0; i < str.length; i++) x = ((x << 5) + x + str.charCodeAt(i)) | 0; return (x >>> 0).toString(36); }
  function vecFor(c) {
    const e = S.emb[c.uuid];
    if (!e || e.h !== hash(embText(c))) return null;
    const key = c.uuid + e.h;
    if (!S.embVec.has(key)) S.embVec.set(key, C.decodeVec(e.v));
    return S.embVec.get(key);
  }
  let smartRunning = false;
  async function smartIndex() {
    if (smartRunning || !S.settings.smart || !S.org || !ext.runtime || !ext.runtime.sendMessage) return;
    const todo = S.chats.filter((c) => !vecFor(c));
    if (!todo.length) { if (S.index && !S.index.dense) { rebuild(); render(); } return; }
    smartRunning = true;
    const t0 = performance.now();
    try {
      for (let k = 0; k < todo.length && S.settings.smart; k += 32) {
        const batch = todo.slice(k, k + 32);
        const res = await ext.runtime.sendMessage({ type: "ct-embed-batch", texts: batch.map(embText) });
        if (!res || res.error || !res.vectors) throw new Error((res && res.error) || "model did not answer");
        batch.forEach((c, j) => { S.emb[c.uuid] = { h: hash(embText(c)), v: res.vectors[j] }; });
        setStatus("Smart grouping: " + Math.min(k + 32, todo.length) + " of " + todo.length + " new chats", true);
        await new Promise((r) => setTimeout(r, 30)); // stay gentle
      }
      // Forget vectors of chats that no longer exist.
      const live = new Set(S.chats.map((c) => c.uuid));
      Object.keys(S.emb).forEach((u) => { if (!live.has(u)) delete S.emb[u]; });
      await store.set("emb:" + S.org, S.emb);
      rebuild(); render();
      setStatus("Smart grouping ready (" + todo.length + " chats in " + ((performance.now() - t0) / 1000).toFixed(1) + " s)");
    } catch (e) {
      console.warn("[ChatTree] smart grouping", e);
      await store.set("emb:" + S.org, S.emb);
      if (/lite version/.test(e.message)) { S.settings.smart = false; saveSettings(); setStatus(S.chats.length + " chats (lite version, basic grouping)"); }
      else setStatus("Smart grouping unavailable, using basic grouping (" + e.message + ")");
    } finally {
      smartRunning = false;
      try { ext.runtime.sendMessage({ type: "ct-embed-done" }); } catch (e) { /* ignore */ }
    }
  }

  // ---------- deep index ----------
  let deepRunning = false;
  async function deepIndex() {
    if (deepRunning || !S.org) return;
    deepRunning = true;
    try {
      const todo = S.chats.filter((c) => S.deep[c.uuid] === undefined);
      let done = 0;
      for (const c of todo) {
        if (!S.settings.deep) break;
        try { S.deep[c.uuid] = await API.firstMessage(S.org, c.uuid); }
        catch (e) { if (/429|403/.test(e.message)) { setStatus("Deep index paused: claude.ai asked to slow down. It will continue next time."); break; } S.deep[c.uuid] = ""; }
        done++;
        if (done % 10 === 0) { await store.set("deep:" + S.org, S.deep); setStatus("Deep index: " + Object.keys(S.deep).length + " of " + S.chats.length, true); }
        await new Promise((r) => setTimeout(r, 1500));
      }
      await store.set("deep:" + S.org, S.deep);
      if (done) { rebuild(); render(); setStatus("Deep index: " + Object.keys(S.deep).length + " of " + S.chats.length + " chats"); }
    } finally { deepRunning = false; }
  }

  // ---------- navigation and export ----------
  function openChat(uuid, newTab) {
    const url = "/chat/" + uuid;
    if (newTab) { window.open(url, "_blank", "noopener"); return; }
    toggle(false);
    // Prefer clicking claude.ai's own link so the page does not fully reload.
    const a = document.querySelector('a[href="' + url + '"]');
    if (a) a.click(); else location.assign(url);
  }

  function doExport(kind) {
    let text, name;
    const link = (i) => "[" + S.chats[i].name.replace(/[[\]]/g, "") + "](" + location.origin + "/chat/" + S.chats[i].uuid + ")";
    if (kind === "md") {
      const lines = ["# My Claude chats by topic", "", "_Exported " + new Date().toLocaleString() + "_", ""];
      const walk = (node, depth) => {
        lines.push("  ".repeat(depth) + "- **" + node.label + "** (" + node.members.length + ")");
        const inKids = new Set(); (node.children || []).forEach((ch) => { ch.members.forEach((m) => inKids.add(m)); walk(ch, depth + 1); });
        node.members.filter((m) => !inKids.has(m)).sort(byRecent).forEach((m) => lines.push("  ".repeat(depth + 1) + "- " + link(m)));
      };
      S.tree.roots.forEach((r) => walk(r, 0));
      if (S.tree.misc.length) { lines.push("- **Other chats** (" + S.tree.misc.length + ")"); S.tree.misc.slice().sort(byRecent).forEach((m) => lines.push("  - " + link(m))); }
      text = lines.join("\n"); name = "claude-chats.md";
    } else {
      const strip = (node) => ({ topic: node.label, chats: node.members.map((m) => S.chats[m].uuid), children: (node.children || []).map(strip) });
      text = JSON.stringify({ exported: new Date().toISOString(), chats: S.chats.map((c) => Object.assign({}, c, { tags: S.tags[c.uuid] || [] })), topics: S.tree.roots.map(strip), other: S.tree.misc.map((m) => S.chats[m].uuid) }, null, 2);
      name = "claude-chats.json";
    }
    const blob = new Blob([text], { type: kind === "md" ? "text/markdown" : "application/json" });
    const a = h("a", { href: URL.createObjectURL(blob), download: name });
    root.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
  }

  // ---------- keyboard and messages ----------
  window.addEventListener("keydown", (e) => {
    if (e.altKey && e.shiftKey && (e.code === "KeyK")) { e.preventDefault(); e.stopPropagation(); toggle(); return; }
    if (!isOpen) return;
    if (e.key === "Escape") { e.preventDefault(); e.stopPropagation(); toggle(false); return; }
    const inField = e.composedPath().some((el) => el.tagName === "INPUT" || el.tagName === "SELECT");
    if (e.key === "/" && !inField) { e.preventDefault(); search.focus(); search.select(); }
    if (!inField && (e.key === "ArrowLeft" || e.key === "ArrowRight") && !e.composedPath().some((el) => el.tagName === "CANVAS")) { e.preventDefault(); setView(S.view === "tree" ? "graph" : "tree"); }
  }, true);

  try { ext.runtime.onMessage.addListener((m) => { if (m && m.type === "chat-tree-toggle") toggle(); }); } catch (e) { /* not in an extension (test page) */ }

  (async () => {
    S.settings = Object.assign(S.settings, await store.get("settings", {}));
    S.hookSeen = await store.get("hookSeen", false);
    updateFab();
    applyTheme();
  })();

  // ---------- claude.ai Search window: add "Tree" and "Graph" tabs next to All / Artifacts / ... ----------
  // claude.ai's markup is not public, so this looks for the dialog by its visible tab names and copies the
  // look of an existing tab. If claude.ai changes it, the round button comes back automatically.
  function updateFab() { fab.style.display = S.settings.fab === true || (S.settings.fab !== false && !S.hookSeen) ? "" : "none"; }
  const TAB_NAMES = ["All", "Artifacts", "Sessions", "Code", "Projects", "Scheduled", "Chats"];
  function findSearchTabs() {
    const dialogs = document.querySelectorAll('[role="dialog"], dialog[open]');
    for (const d of dialogs) {
      if (host.contains(d) || d === panel) continue;
      const btns = [...d.querySelectorAll('button, [role="tab"]')].filter((b) => !b.dataset.chatTree);
      const named = btns.filter((b) => TAB_NAMES.includes(b.textContent.trim()));
      const all = named.find((b) => b.textContent.trim() === "All");
      if (!all || named.length < 3) continue;
      const row = all.parentElement;
      const plain = named.find((b) => b !== all && b.parentElement === row) || all;
      return { dialog: d, row, plain, input: d.querySelector('input[type="text"], input[type="search"], input:not([type]), [contenteditable="true"]') };
    }
    return null;
  }
  function closeNativeSearch(found) {
    const opts = { key: "Escape", code: "Escape", keyCode: 27, bubbles: true, cancelable: true };
    (found.input || found.dialog).dispatchEvent(new KeyboardEvent("keydown", opts));
  }
  function injectTabs() {
    const found = findSearchTabs();
    if (!found || found.row.querySelector("[data-chat-tree]")) return;
    const make = (view, label) => {
      const b = found.plain.cloneNode(false); // same classes as claude.ai's own tab
      b.removeAttribute("aria-selected"); b.removeAttribute("data-state"); b.removeAttribute("id"); b.removeAttribute("aria-controls");
      b.setAttribute("data-chat-tree", view); b.setAttribute("type", "button"); b.setAttribute("title", "Show your chats as a " + label.toLowerCase() + " (Chat Tree)");
      b.textContent = label;
      b.addEventListener("click", (e) => {
        e.preventDefault(); e.stopPropagation();
        const q = found.input ? (found.input.value != null ? found.input.value : found.input.textContent) || "" : "";
        closeNativeSearch(found);
        setTimeout(() => toggle(true, { view, query: q }), 0);
      }, true);
      return b;
    };
    found.row.append(make("tree", "Tree"), make("graph", "Graph"));
    if (!S.hookSeen) { S.hookSeen = true; store.set("hookSeen", true); updateFab(); }
  }
  let hookQueued = false;
  new MutationObserver(() => { if (hookQueued) return; hookQueued = true; requestAnimationFrame(() => { hookQueued = false; try { injectTabs(); } catch (e) { console.warn("[ChatTree] search hook", e); } }); })
    .observe(document.documentElement, { childList: true, subtree: true });

  globalThis.__chatTreeDebug = { S, toggle, refresh };
})();
