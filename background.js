// Chat Tree background: toolbar button, keyboard command, and the on-device model host.
const ext = globalThis.browser || globalThis.chrome;

async function toggleIn(tab) {
  if (tab && tab.url && tab.url.startsWith("https://claude.ai/")) {
    try { await ext.tabs.sendMessage(tab.id, { type: "chat-tree-toggle" }); } catch (e) { /* page still loading */ }
  } else {
    await ext.tabs.create({ url: "https://claude.ai/recents", ...(tab && tab.cookieStoreId ? { cookieStoreId: tab.cookieStoreId } : {}) });
  }
}
ext.action.onClicked.addListener((tab) => toggleIn(tab));
ext.commands.onCommand.addListener(async (cmd) => {
  if (cmd !== "toggle-chat-tree") return;
  const [tab] = await ext.tabs.query({ active: true, currentWindow: true });
  if (tab && tab.url && tab.url.startsWith("https://claude.ai/")) toggleIn(tab);
});

// ---- Model host. Loaded only when asked, closed 30 s after the last use to free memory. ----
const MODEL_URL = "embed/embed.html";
let hasModel = null;
let modelReady = null, readyResolve = null, idleTimer = null;

function openModel() {
  if (modelReady) return modelReady;
  modelReady = new Promise((resolve) => { readyResolve = resolve; });
  if (typeof document !== "undefined") {
    // Firefox: the background is a page, so a hidden frame hosts the model.
    const f = document.createElement("iframe");
    f.id = "ct-model"; f.src = ext.runtime.getURL(MODEL_URL);
    (document.body || document.documentElement).append(f);
  } else {
    // Chrome: the background is a service worker, so use an offscreen document.
    chrome.offscreen.createDocument({ url: MODEL_URL, reasons: ["WORKERS"], justification: "Run a small on-device text model to group chats by topic" })
      .catch(() => readyResolve && readyResolve()); // already open
  }
  setTimeout(() => readyResolve && readyResolve(), 15000); // never wait forever
  return modelReady;
}

async function closeModel() {
  modelReady = null; readyResolve = null;
  if (typeof document !== "undefined") { const f = document.getElementById("ct-model"); if (f) f.remove(); }
  if (globalThis.chrome && chrome.offscreen) { try { await chrome.offscreen.closeDocument(); } catch (e) { /* not open */ } }
}

ext.runtime.onMessage.addListener((msg, sender, reply) => {
  if (!msg) return;
  if (msg.type === "ct-embed-ready") { if (readyResolve) readyResolve(); return; }
  if (msg.type === "ct-embed-batch") {
    clearTimeout(idleTimer);
    (async () => {
      if (hasModel === null) hasModel = await fetch(ext.runtime.getURL("embed/model.onnx"), { method: "HEAD" }).then((r) => r.ok, () => false);
      if (!hasModel) return { error: "lite version: no AI model included" };
      await openModel();
      const res = await ext.runtime.sendMessage({ type: "ct-embed", texts: msg.texts });
      idleTimer = setTimeout(closeModel, 30000);
      return res;
    })().then(reply, (e) => reply({ error: String(e && e.message || e) }));
    return true;
  }
  if (msg.type === "ct-embed-done") { clearTimeout(idleTimer); idleTimer = setTimeout(closeModel, 3000); }
});
