// Chat Tree: overlay UI injected into claude.ai.
(function () {
  "use strict";
  if (window.__chatTreeLoaded) return;
  window.__chatTreeLoaded = true;

  const ext = globalThis.browser || globalThis.chrome;
  const C = globalThis.ChatTreeCluster;
  const API = globalThis.ChatTreeAPI;
  const PALETTE = ["#c2603a", "#3b7dd8", "#2e9d6a", "#a855c7", "#d4a21a", "#d2486e", "#1fa3a8", "#7a6cf0", "#8a9a2b", "#e07b1f", "#5a8fa8", "#b5651d"];
  const MISC = "#9a958b";
  const STALE_MS = 10 * 60 * 1000;

  // ---------- storage (local only) ----------
  const store = {
    async get(k, d) { try { const r = await ext.storage.local.get(k); return r[k] === undefined ? d : r[k]; } catch (e) { return d; } },
    async set(k, v) { try { await ext.storage.local.set({ [k]: v }); } catch (e) { console.warn("[ChatTree] storage", e); } },
  };

  // ---------- state ----------
  const S = {
    org: null, chats: [], tags: {}, deep: {}, settings: { fab: true, deep: false, hubs: true, smart: true }, emb: {}, embVec: new Map(),
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
  const search = h("input", { type: "search", placeholder: "Search chats…  ( / )", oninput: (e) => { S.query = e.target.value; render(); } ,
    onkeydown: (e) => { if (e.key === "Enter") { const first = firstVisible(); if (first != null) openChat(S.chats[first].uuid, e.ctrlKey || e.metaKey); } } });
  const viewBtns = {};
  const viewSeg = h("div", { class: "seg" }, ["tree", "graph"].map((v) => (viewBtns[v] = h("button", { onclick: () => { S.view = v; render(); } }, v === "tree" ? "Tree" : "Graph"))));
  const groupSel = h("select", { title: "Group the tree by", onchange: (e) => { S.group = e.target.value; render(); } },
    h("option", { value: "topics" }, "Auto topics"), h("option", { value: "tags" }, "My tags"), h("option", { value: "projects" }, "Projects"), h("option", { value: "months" }, "Month"));
  const refreshBtn = h("button", { title: "Reload chats from claude.ai", onclick: () => refresh(true) }, "Refresh");
  const exportSel = h("select", { title: "Export", onchange: (e) => { if (e.target.value) doExport(e.target.value); e.target.value = ""; } },
    h("option", { value: "" }, "Export…"), h("option", { value: "md" }, "Markdown outline"), h("option", { value: "json" }, "JSON (with tags)"));
  const settingsBtn = h("button", { title: "Settings and shortcuts", onclick: () => { S.selected = "__settings"; renderSide(); } }, "⚙");
  const closeBtn = h("button", { class: "close", title: "Close (Esc)", onclick: () => toggle(false) }, "✕");

  const rangeSel = h("select", { onchange: (e) => { S.range = e.target.value; render(); } },
    h("option", { value: "all" }, "Any time"), h("option", { value: "7" }, "Last 7 days"), h("option", { value: "30" }, "Last 30 days"),
    h("option", { value: "90" }, "Last 3 months"), h("option", { value: "365" }, "Last year"), h("option", { value: "old" }, "Older than a year"));
  const starChk = h("input", { type: "checkbox", onchange: (e) => { S.starred = e.target.checked; render(); } });
  const projSel = h("select", { onchange: (e) => { S.project = e.target.value; render(); } });
  const tagSel = h("select", { onchange: (e) => { S.tag = e.target.value; render(); } });
  const resultCount = h("span");

  const main = h("div", { class: "main" });
  const side = h("aside", { class: "side" });
  const statusEl = h("span");
  const panel = h("div", { class: "panel", role: "dialog", "aria-label": "Chat Tree" },
    h("header", null, h("span", { class: "title" }, svg(ICON), "Chat Tree"), search, viewSeg, groupSel, refreshBtn, exportSel, settingsBtn, closeBtn),
    h("div", { class: "filters" }, h("label", null, "When", rangeSel), h("label", null, starChk, "Starred only"),
      h("label", null, "Project", projSel), h("label", null, "Tag", tagSel), resultCount),
    h("div", { class: "body" }, main, side),
    h("footer", null, statusEl, h("span", { class: "grow" }), h("span", null, "Everything stays in this browser. Alt+Shift+K to toggle.")));
  const overlay = h("div", { class: "overlay", onclick: (e) => { if (e.target === overlay) toggle(false); } }, panel);
  wrap.append(fab, overlay);

  function mount() { if (!document.documentElement.contains(host)) document.documentElement.append(host); }
  mount();
  new MutationObserver(mount).observe(document.documentElement, { childList: true });

  function applyTheme() {
    const bg = getComputedStyle(document.body || document.documentElement).backgroundColor;
    const m = bg.match(/\d+/g);
    let dark = window.matchMedia("(prefers-color-scheme: dark)").matches;
    if (m && m.length >= 3 && !(m.length === 4 && +m[3] === 0)) dark = (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]) < 128;
    wrap.classList.toggle("dark", dark);
  }

  // ---------- open / close ----------
  let isOpen = false;
  async function toggle(force) {
    isOpen = force === undefined ? !isOpen : force;
    overlay.classList.toggle("open", isOpen);
    if (!isOpen) { stopGraph(); return; }
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
    Object.entries(viewBtns).forEach(([v, b]) => b.classList.toggle("on", S.view === v));
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
        n.r = n.kind === "topic" ? 6 + Math.sqrt(n.topic.members.length) * 1.6 : 4;
      });
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
    fill(G.legend, 
      S.tree.roots.map((r, ri) => h("div", { class: S.hiddenTopics.has(r) ? "dim" : "", title: "Click to hide or show",
        onclick: () => { S.hiddenTopics.has(r) ? S.hiddenTopics.delete(r) : S.hiddenTopics.add(r); renderLegend(); draw(); } },
        h("span", { class: "dot", style: { background: PALETTE[ri % PALETTE.length] } }), r.label, h("span", { class: "count" }, r.members.length))),
      S.tree.misc.length ? h("div", null, h("span", { class: "dot", style: { background: MISC } }), "Other", h("span", { class: "count" }, S.tree.misc.length)) : null);
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
      // Weak pull to the centre.
      p.vx -= p.x * 0.002 * a; p.vy -= p.y * 0.002 * a;
    });
    links.forEach((l) => {
      const s = nodes[l.source], t = nodes[l.target];
      const dx = t.x - s.x, dy = t.y - s.y, d = Math.sqrt(dx * dx + dy * dy) || 1;
      const target = l.hub ? 45 : 40 + (1 - l.w) * 50;
      const k = (l.hub ? 0.08 : 0.06 * (0.5 + l.w)) * a;
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

  function draw() {
    if (!G || !S.graph) return;
    const { ctx, view } = G, dark = wrap.classList.contains("dark");
    ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    ctx.clearRect(0, 0, G.w, G.h);
    ctx.translate(G.w / 2 + view.x, G.h / 2 + view.y); ctx.scale(view.k, view.k);
    const nodes = S.graph.nodes;
    const selIdx = S.byId.get(S.selected);
    const focus = G.hover || (selIdx != null ? nodes[selIdx] : null);
    const neighbours = new Set();
    const query = !!S.query;
    ctx.lineWidth = 1 / view.k;
    S.graph.links.forEach((l) => {
      const s = nodes[l.source], t = nodes[l.target];
      if (!nodeShown(s) || !nodeShown(t)) return;
      const lit = focus && (s === focus || t === focus);
      if (lit) { neighbours.add(s); neighbours.add(t); }
      ctx.strokeStyle = lit ? (dark ? "rgba(255,255,255,.7)" : "rgba(0,0,0,.55)") : l.hub ? (dark ? "rgba(255,255,255,.05)" : "rgba(0,0,0,.05)") : (dark ? "rgba(255,255,255,.14)" : "rgba(0,0,0,.12)");
      ctx.beginPath(); ctx.moveTo(s.x, s.y); ctx.lineTo(t.x, t.y); ctx.stroke();
    });
    nodes.forEach((n) => {
      if (!nodeShown(n)) return;
      const dim = (focus && !neighbours.has(n) && n !== focus) || (query && n.kind === "chat" && !S.hits.has(n.i));
      ctx.globalAlpha = dim ? 0.25 : 1;
      ctx.fillStyle = n.color;
      ctx.beginPath(); ctx.arc(n.x, n.y, n.r, 0, Math.PI * 2); ctx.fill();
      if (n.kind === "chat" && S.chats[n.i].uuid === S.selected) { ctx.lineWidth = 2.5 / view.k; ctx.strokeStyle = dark ? "#fff" : "#000"; ctx.stroke(); ctx.lineWidth = 1 / view.k; }
    });
    ctx.globalAlpha = 1;
    // Labels: topics always; chats when zoomed in, or for the focus and its neighbours.
    ctx.textAlign = "center"; ctx.textBaseline = "top";
    nodes.forEach((n) => {
      if (!nodeShown(n)) return;
      const isTopic = n.kind === "topic";
      if (!isTopic && view.k < 1.6 && !neighbours.has(n) && n !== focus && !(query && S.hits.has(n.i) && S.hits.size < 40)) return;
      const label = isTopic ? n.label : S.chats[n.i].name;
      const size = (isTopic ? 13 : 11) / Math.max(view.k, 0.6);
      ctx.font = (isTopic ? "600 " : "") + size + "px system-ui, sans-serif";
      const txt = label.length > 42 ? label.slice(0, 40) + "…" : label;
      ctx.lineWidth = 3 / view.k; ctx.strokeStyle = dark ? "rgba(31,30,27,.9)" : "rgba(251,250,247,.9)";
      ctx.strokeText(txt, n.x, n.y + n.r + 2 / view.k);
      ctx.fillStyle = dark ? "#ece9e2" : "#22201c";
      ctx.fillText(txt, n.x, n.y + n.r + 2 / view.k);
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
    const chk = (key, label, note, after) => h("label", null, h("input", { type: "checkbox", checked: S.settings[key] || null, onchange: (e) => { S.settings[key] = e.target.checked; saveSettings(); if (after) after(e.target.checked); } }), h("span", null, label, note ? h("br") : null, note ? h("small", { class: "help" }, note) : null));
    fill(side, h("h3", null, "Settings"), h("div", { class: "settings" },
      chk("fab", "Show the round button on claude.ai", "You can still open Chat Tree with Alt+Shift+K or the toolbar icon.", (v) => { fab.style.display = v ? "" : "none"; }),
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
  }, true);

  try { ext.runtime.onMessage.addListener((m) => { if (m && m.type === "chat-tree-toggle") toggle(); }); } catch (e) { /* not in an extension (test page) */ }

  (async () => {
    S.settings = Object.assign(S.settings, await store.get("settings", {}));
    fab.style.display = S.settings.fab ? "" : "none";
    applyTheme();
  })();

  globalThis.__chatTreeDebug = { S, toggle, refresh };
})();
