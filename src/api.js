// Chat Tree: reads your chat list from claude.ai, using the same signed-in session as the tab.
// Requests go only to claude.ai itself. In Firefox, the tab's container cookies are used.
// NOTE: these are claude.ai's internal endpoints (not a public API) and may change.
(function () {
  "use strict";
  // Firefox content scripts: content.fetch makes the request as the page (same container, same cookies).
  const pageFetch = (typeof content !== "undefined" && content && content.fetch) ? content.fetch.bind(content) : fetch.bind(window);

  async function getJSON(path) {
    const res = await pageFetch(location.origin + path, { credentials: "include", headers: { accept: "application/json" } });
    if (!res.ok) throw new Error("claude.ai answered " + res.status + " for " + path.split("?")[0]);
    return res.json();
  }

  function cookie(name) {
    const m = document.cookie.match(new RegExp("(?:^|; )" + name + "=([^;]*)"));
    return m ? decodeURIComponent(m[1]) : null;
  }

  async function getOrgId() {
    const fromCookie = cookie("lastActiveOrg");
    if (fromCookie) return fromCookie;
    const orgs = await getJSON("/api/organizations");
    const chatOrg = orgs.find((o) => (o.capabilities || []).includes("chat")) || orgs[0];
    if (!chatOrg) throw new Error("No claude.ai organization found. Are you signed in?");
    return chatOrg.uuid;
  }

  async function listProjects(org) {
    try {
      const p = await getJSON(`/api/organizations/${org}/projects`);
      return new Map((Array.isArray(p) ? p : p.data || []).map((x) => [x.uuid, x.name]));
    } catch (e) { return new Map(); }
  }

  async function listChats(org, onProgress) {
    const pageSize = 200;
    const seen = new Map();
    for (let offset = 0; offset < 50000; offset += pageSize) {
      const page = await getJSON(`/api/organizations/${org}/chat_conversations?limit=${pageSize}&offset=${offset}`);
      const list = Array.isArray(page) ? page : (page.data || page.conversations || []);
      let fresh = 0;
      list.forEach((c) => { if (!seen.has(c.uuid)) { seen.set(c.uuid, c); fresh++; } });
      if (onProgress) onProgress(seen.size);
      // Stop when the page is short, or when the server ignored paging and sent everything at once.
      if (list.length < pageSize || fresh === 0) break;
    }
    return [...seen.values()];
  }

  async function loadAll(onProgress) {
    const org = await getOrgId();
    const [raw, projects] = await Promise.all([listChats(org, onProgress), listProjects(org)]);
    const chats = raw.map((c) => ({
      uuid: c.uuid,
      name: c.name || "Untitled",
      summary: c.summary || "",
      created: c.created_at,
      updated: c.updated_at || c.created_at,
      starred: !!c.is_starred,
      projectId: c.project_uuid || (c.project && c.project.uuid) || null,
      projectName: (c.project && c.project.name) || projects.get(c.project_uuid) || "",
      model: c.model || "",
    }));
    return { org, chats };
  }

  // Opt-in deep index: first user message of one chat, cut to 600 characters, kept only in local storage.
  async function firstMessage(org, uuid) {
    const conv = await getJSON(`/api/organizations/${org}/chat_conversations/${uuid}?tree=False&rendering_mode=messages`);
    const msgs = conv.chat_messages || [];
    const first = msgs.find((m) => m.sender === "human") || msgs[0];
    if (!first) return "";
    const text = first.text || (first.content || []).map((p) => p.text || "").join(" ");
    return text.slice(0, 600);
  }

  globalThis.ChatTreeAPI = { loadAll, firstMessage };
})();
