// Chat Tree: local topic clustering. Runs entirely in the browser; no network.
// Exposes globalThis.ChatTreeCluster = { buildIndex, buildTree, buildGraph, related, search }.
(function () {
  "use strict";

  const STOP = new Set(("a about above after again against all am an and any are as at be because been before being below between both but by can could did do does doing down during each few for from further had has have having he her here hers herself him himself his how i if in into is it its itself just let me more most my myself no nor not now of off on once only or other our ours out over own same she should so some such than that the their theirs them then there these they this those through to too under until up very was we were what when where which while who whom why will with would you your yours yourself " +
    "chat claude help please want need make using use get like new one two also way vs via thing things question questions issue issues problem quick simple basic explain explained explaining understanding understand idea ideas tips guide create creating build building write writing best untitled conversation re hi hello thanks discussion discuss about explanation overview plan list basic basics beginner beginners vs good better ways step steps work working").split(/\s+/));

  function stem(w) {
    if (w.length > 5 && w.endsWith("ing")) return w.slice(0, -3);
    if (w.length > 4 && w.endsWith("ies")) return w.slice(0, -3) + "y";
    if (w.length > 4 && w.endsWith("ed")) return w.slice(0, -2);
    if (w.length > 3 && w.endsWith("s") && !w.endsWith("ss") && !w.endsWith("us") && !w.endsWith("is")) return w.slice(0, -1);
    return w;
  }

  function tokenize(text) {
    const out = [];
    const words = (text || "").toLowerCase().normalize("NFKD").replace(/[̀-ͯ]/g, "")
      .split(/[^a-z0-9+#.]+/);
    for (let w of words) {
      w = w.replace(/^\.+|\.+$/g, "");
      if (w.length < 2 || STOP.has(w) || /^\d+$/.test(w)) continue;
      out.push(stem(w));
    }
    return out;
  }


  // Small built-in vocabulary so short titles that share no words can still land together
  // (e.g. "pandas merge" and "numpy broadcasting" both map to Python & data). Local, no network.
  const CONCEPTS = {
    "Python & data": "python pandas numpy dataframe csv matplotlib seaborn jupyter notebook plot groupby pivot excel spreadsheet",
    "Machine learning & AI": "ml regression classification scikit sklearn neural pytorch tensorflow keras cnn rnn lstm transformer attention bert gpt llm embedding overfitting backprop gradient model dataset hyperparameter forest",
    "Web development": "react next nextjs next.js node.js vue.js vue angular svelte javascript typescript html css tailwind frontend backend node express api rest graphql hydration component props redux zod form dom webpack vite",
    "Browsers & extensions": "browser firefox chrome extension manifest content script container tab addon",
    "Git & version control": "git github commit rebase merge branch conflict pull push repo",
    "DevOps & cloud": "docker dockerfile compose kubernetes k8s deployment yaml aws gcp azure nginx ci cd pipeline server deploy linux ubuntu",
    "Databases & SQL": "sql postgres postgresql mysql sqlite mongodb database query index join subquery table schema",
    "Shell & tools": "bash shell zsh terminal vim emacs script cli regex sed awk",
    "Systems programming": "rust c++ cpp golang pointer reference segmentation fault borrow ownership tokio async goroutine memory compiler",
    "Algorithms & data structures": "algorithm data structure linked list tree binary search bst graph bfs dfs dijkstra dynamic programming knapsack sort sorting complexity recursion heap hash array leetcode",
    "Operating systems": "operating os process thread deadlock scheduling round robin virtual memory paging kernel semaphore",
    "Computer networks": "network networking tcp udp ip handshake subnet subnetting dns http routing router osi protocol",
    "Electronics": "digital electronics flip flop circuit microprocessor 8085 8086 vlsi cmos inverter transistor logic gate verilog fpga amplifier diode",
    "Signals & control": "signal signals fourier laplace transform z convergence bode pid controller control root locus frequency filter",
    "Mechanical & physics": "thermodynamics entropy carnot engine heat exchanger fluid mechanics bernoulli reynolds pipe flow physics force stress strain",
    "Math": "math calculus integral derivative matrix linear algebra probability statistics equation proof",
    "Career & jobs": "resume cv cover letter internship intern interview linkedin salary negotiation job career recruiter offer behavioral",
    "Travel": "trip travel goa manali trek trekking packing flight hotel railway itinerary visa vacation",
    "Health & fitness": "workout gym protein fitness running 5k sleep diet exercise muscle weight health",
    "Food & cooking": "recipe cooking meal breakfast lunch dinner vegetarian food prep bake",
    "Writing & creative": "poem story speech essay write writing novel lyrics blog creative",
    "Books, movies & fun": "book books movie movies film series anime game games music recommendation",
    "Events & gifts": "birthday gift party wedding diwali festival celebration anniversary",
    "Money & finance": "stock market mutual fund tax saving invest investment finance budget money accounting balance sheet economics demand elasticity",
    "Study & management": "management notes exam syllabus lecture assignment homework course semester study",
  };
  // Broad shelves that group the concepts one level higher in the tree.
  const SHELVES = {
    "Coding": ["Python & data", "Web development", "Browsers & extensions", "Git & version control", "DevOps & cloud", "Databases & SQL", "Shell & tools", "Systems programming", "Machine learning & AI"],
    "Courses & engineering": ["Algorithms & data structures", "Operating systems", "Computer networks", "Electronics", "Signals & control", "Mechanical & physics", "Math", "Study & management"],
    "Career": ["Career & jobs"],
    "Life & fun": ["Travel", "Health & fitness", "Food & cooking", "Writing & creative", "Books, movies & fun", "Events & gifts", "Money & finance"],
  };
  const SHELF_OF = new Map();
  Object.entries(SHELVES).forEach(([shelf, list]) => list.forEach((c) => SHELF_OF.set(c, shelf)));
  const CONCEPT_OF = new Map();
  Object.entries(CONCEPTS).forEach(([name, words]) => {
    const tag = "@" + name;
    words.split(/\s+/).forEach((w) => { const k = stem(w); if (!CONCEPT_OF.has(k)) CONCEPT_OF.set(k, []); CONCEPT_OF.get(k).push(tag); });
  });
  function concepts(tokens) {
    const out = [];
    tokens.forEach((t) => { const c = CONCEPT_OF.get(t); if (c) out.push(...c); });
    return [...new Set(out)];
  }

  // Each chat: {uuid, name, summary, extraText?, tags?}
  function buildIndex(chats) {
    const topConcept = [];
    const docs = chats.map((c) => {
      // Title counts double; tags count triple so manual tags steer clustering.
      const t = tokenize(c.name);
      const s = tokenize(c.summary);
      const x = tokenize(c.extraText);
      const g = (c.tags || []).flatMap((tag) => tokenize(tag));
      const base = t.concat(t, s, x, g, g, g);
      const cs = concepts(base);
      // Strongest concept for this chat (title words count double because they appear twice in base).
      const cc = new Map();
      base.forEach((tok) => (CONCEPT_OF.get(tok) || []).forEach((c) => cc.set(c, (cc.get(c) || 0) + 1)));
      let top = null, tv = 0;
      cc.forEach((v, c) => { if (v > tv) { tv = v; top = c; } });
      topConcept.push(top);
      return base.concat(cs, cs);
    });
    const df = new Map();
    docs.forEach((d) => new Set(d).forEach((w) => df.set(w, (df.get(w) || 0) + 1)));
    const N = docs.length || 1;
    const vecs = docs.map((d) => {
      const tf = new Map();
      d.forEach((w) => tf.set(w, (tf.get(w) || 0) + 1));
      const v = new Map();
      let norm = 0;
      tf.forEach((n, w) => {
        const dfw = df.get(w);
        if (dfw < 2 && N > 20) return; // a word used in only one chat cannot link chats
        const val = (1 + Math.log(n)) * Math.log(1 + N / dfw);
        v.set(w, val);
        norm += val * val;
      });
      norm = Math.sqrt(norm) || 1;
      v.forEach((val, w) => v.set(w, val / norm));
      return v;
    });
    // Keep single-chat words for search even though they are not used for similarity.
    const searchText = chats.map((c) => [c.name, c.summary, (c.tags || []).join(" "), c.projectName, c.extraText].join(" ").toLowerCase());
    return { chats, vecs, df, searchText, topConcept };
  }

  function dot(a, b) {
    if (a.size > b.size) [a, b] = [b, a];
    let s = 0;
    a.forEach((v, k) => { const o = b.get(k); if (o) s += v * o; });
    return s;
  }

  function rng(seed) {
    let s = seed >>> 0;
    return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; };
  }

  function normalize(v) {
    let n = 0;
    v.forEach((x) => { n += x * x; });
    n = Math.sqrt(n) || 1;
    const out = new Map();
    v.forEach((x, k) => { if (x / n > 0.02) out.set(k, x / n); });
    return out;
  }

  // Spherical k-means over a subset of indices. Returns array of {members, centroid}.
  function kmeans(index, members, k, seed) {
    const vecs = index.vecs;
    const R = rng(seed);
    const usable = members.filter((i) => vecs[i].size > 0);
    if (usable.length <= k) return usable.map((i) => ({ members: [i], centroid: vecs[i] }));
    // k-means++ init
    const cents = [vecs[usable[Math.floor(R() * usable.length)]]];
    const best = usable.map(() => 0);
    while (cents.length < k) {
      let total = 0;
      const d = usable.map((i, j) => {
        best[j] = Math.max(best[j], dot(vecs[i], cents[cents.length - 1]));
        const dist = 1 - best[j];
        total += dist * dist;
        return dist * dist;
      });
      if (total === 0) break;
      let r = R() * total, pick = 0;
      for (; pick < d.length - 1; pick++) { r -= d[pick]; if (r <= 0) break; }
      cents.push(vecs[usable[pick]]);
    }
    let assign = new Array(usable.length).fill(-1);
    for (let iter = 0; iter < 15; iter++) {
      let changed = false;
      usable.forEach((i, j) => {
        let bi = 0, bs = -1;
        cents.forEach((c, ci) => { const s = dot(vecs[i], c); if (s > bs) { bs = s; bi = ci; } });
        if (assign[j] !== bi) { assign[j] = bi; changed = true; }
      });
      cents.forEach((_, ci) => {
        const sum = new Map();
        usable.forEach((i, j) => { if (assign[j] === ci) vecs[i].forEach((v, w) => sum.set(w, (sum.get(w) || 0) + v)); });
        if (sum.size) cents[ci] = normalize(sum);
      });
      if (!changed) break;
    }
    const groups = cents.map((c) => ({ members: [], centroid: c }));
    usable.forEach((i, j) => groups[assign[j]].members.push(i));
    return groups.filter((g) => g.members.length);
  }

  function labelFor(index, centroid, members, exclude, depth) {
    // Score words by centroid weight times how many members contain them.
    const scores = [];
    centroid.forEach((v, w) => {
      if (exclude && exclude.has(w)) return;
      let c = 0;
      members.forEach((i) => { if (index.vecs[i].has(w)) c++; });
      if (c >= Math.min(2, members.length)) scores.push([w, v * c]);
    });
    scores.sort((a, b) => b[1] - a[1]);
    const conceptHits = scores.filter((s) => s[0][0] === "@");
    const plain = scores.filter((s) => s[0][0] !== "@").map((s) => s[0]);
    if (depth === 0 && conceptHits.length) return { name: conceptHits[0][0].slice(1), words: plain.slice(0, 3), all: [conceptHits[0][0], ...plain.slice(0, 3)] };
    return { name: plain.slice(0, 3).join(" · "), words: plain.slice(0, 3), all: plain.slice(0, 3) };
  }

  function cohesion(index, centroid, members) {
    let s = 0;
    members.forEach((i) => { s += dot(index.vecs[i], centroid); });
    return members.length ? s / members.length : 0;
  }

  let nodeId = 0;
  function makeNode(index, members, centroid, depth, parentWords, opts) {
    const lab = labelFor(index, centroid, members, parentWords, depth);
    const words = lab.all;
    const node = { id: "t" + (nodeId++), words: lab.words, label: lab.name || "Misc", members, children: [], depth };
    if (depth < opts.maxDepth && members.length > opts.splitAbove) {
      const k = Math.min(8, Math.max(2, Math.round(Math.sqrt(members.length / 3))));
      const sub = kmeans(index, members, k, 7 + depth * 31 + members.length);
      const childWords = new Set([...(parentWords || []), ...words]);
      const kids = [], loose = [];
      sub.forEach((g) => {
        const lw = labelFor(index, g.centroid, g.members, childWords, depth + 1).name;
        if (g.members.length >= 2 && lw && cohesion(index, g.centroid, g.members) > 0.18) kids.push(g);
        else loose.push(...g.members);
      });
      if (kids.length >= 2) {
        node.children = kids.map((g) => makeNode(index, g.members, g.centroid, depth + 1, childWords, opts));
        node.loose = loose; // chats that stay directly under this topic
      }
    }
    return node;
  }

  // Returns { roots: [topicNode], misc: [chatIndex], topicOf: Map(chatIndex -> top-level topic id) }
  function buildTree(index, opts) {
    opts = Object.assign({ maxDepth: 2, splitAbove: 10 }, opts || {});
    nodeId = 0;
    const n = index.chats.length;
    const all = [...Array(n).keys()];
    const empty = all.filter((i) => index.vecs[i].size === 0 && !(index.dense && index.dense[i]));
    const roots = [], misc = [...empty];
    // 1) Chats that match the built-in vocabulary go under that concept.
    const byConcept = new Map();
    all.forEach((i) => { const c = index.topConcept && index.topConcept[i]; if (c && index.vecs[i].size) { if (!byConcept.has(c)) byConcept.set(c, []); byConcept.get(c).push(i); } });
    const placed = new Set();
    byConcept.forEach((members, c) => {
      if (members.length < 2) return;
      const sum = new Map(); members.forEach((i) => index.vecs[i].forEach((v, w) => sum.set(w, (sum.get(w) || 0) + v)));
      const node = makeNode(index, members, normalize(sum), 0, new Set([c]), opts);
      node.label = c.slice(1);
      node.shelf = SHELF_OF.get(node.label) || null;
      roots.push(node); members.forEach((i) => placed.add(i));
    });
    // 2) Everything else is clustered by shared words.
    const D = index.dense;
    // 2a) Smart mode: chats the vocabulary does not cover are grouped by meaning (model vectors).
    if (D) {
      const rest = all.filter((i) => D[i] && !placed.has(i));
      const groups = leaderClusters(D, rest, 0.28);
      if (!groups.length) misc.push(...rest);
      groups.forEach((g) => {
        const lab = labelFor(index, sparseCentroid(index, g.members), g.members, null, 1);
        if (!lab.name) { lab.name = rawLabel(index, g.members); lab.words = []; }
        if (g.members.length < 2) { misc.push(...g.members); return; }
        roots.push({ id: "t" + (nodeId++), words: lab.words, label: lab.name, members: g.members, children: [], depth: 0 });
      });
      rest.forEach((i) => placed.add(i));
    }
    // 2b) Everything else is clustered by shared words.
    const live = all.filter((i) => index.vecs[i].size > 0 && !placed.has(i));
    const k = Math.max(2, Math.min(40, Math.round(Math.sqrt(live.length / 2))));
    const groups = live.length > 3 ? kmeans(index, live, k, 42) : [];
    if (!groups.length) misc.push(...live);
    groups.forEach((g) => {
      if (g.members.length < 2 || cohesion(index, g.centroid, g.members) < 0.12) misc.push(...g.members);
      else roots.push(makeNode(index, g.members, g.centroid, 0, null, opts));
    });
    // Same label twice at top level: merge.
    const byLabel = new Map();
    const merged = [];
    roots.forEach((r) => {
      const prev = byLabel.get(r.label);
      if (prev) { prev.members.push(...r.members); prev.children.push(...r.children); (prev.loose = prev.loose || []).push(...(r.loose || [])); }
      else { byLabel.set(r.label, r); merged.push(r); }
    });
    // Give loose chats a home when they are reasonably close to a topic.
    if (merged.length) {
      const dcents = D ? merged.map((r) => denseCentroid(D, r.members)) : [];
      const cents = merged.map((r) => { const sum = new Map(); r.members.forEach((i) => index.vecs[i].forEach((v, w) => sum.set(w, (sum.get(w) || 0) + v))); return normalize(sum); });
      for (let m = misc.length - 1; m >= 0; m--) {
        const i = misc[m];
        let bi = -1, bs = 0.15;
        if (D && D[i]) { bs = 0.45; dcents.forEach((c, ci) => { if (c) { const sc = ddot(D[i], c); if (sc > bs) { bs = sc; bi = ci; } } }); }
        else cents.forEach((c, ci) => { const sc = dot(index.vecs[i], c); if (sc > bs) { bs = sc; bi = ci; } });
        if (bi >= 0) { merged[bi].members.push(i); (merged[bi].loose = merged[bi].loose || []).push(i); misc.splice(m, 1); }
      }
    }
    return finishTree(merged, misc);
  }

  // Graph: chats linked to their top neighbours above a similarity threshold.
  function buildGraph(index, tree, opts) {
    opts = Object.assign({ perNode: 3, minSim: 0.2, minSimDense: 0.45, hubs: true }, opts || {});
    const n = index.chats.length;
    const nodes = index.chats.map((c, i) => ({ id: c.uuid, i, kind: "chat", topic: tree.topicOf.get(i) }));
    const links = [];
    const seen = new Set();
    // Inverted index keeps this near-linear for typical vocabularies.
    const inv = new Map();
    index.vecs.forEach((v, i) => v.forEach((_, w) => { if (!inv.has(w)) inv.set(w, []); inv.get(w).push(i); }));
    const dense = index.dense;
    for (let i = 0; i < n; i++) {
      if (dense && dense[i]) {
        // Smart mode: nearest chats by meaning (blended with shared words).
        const cand = [];
        for (let j = 0; j < n; j++) if (j !== i && dense[j]) { const sc = sim(index, i, j); if (sc >= opts.minSimDense) cand.push([j, sc]); }
        cand.sort((a, b) => b[1] - a[1]).slice(0, opts.perNode).forEach(([j, sc]) => {
          const key = i < j ? i + ":" + j : j + ":" + i;
          if (seen.has(key)) return;
          seen.add(key);
          links.push({ source: i, target: j, w: Math.min(1, sc) });
        });
        continue;
      }
      const cand = new Map();
      index.vecs[i].forEach((vi, w) => {
        const list = inv.get(w);
        if (list.length > 200) return; // very common words: skip for speed
        list.forEach((j) => { if (j !== i) cand.set(j, (cand.get(j) || 0) + vi * index.vecs[j].get(w)); });
      });
      [...cand.entries()].filter((e) => e[1] >= opts.minSim).sort((a, b) => b[1] - a[1]).slice(0, opts.perNode).forEach(([j, s]) => {
        const key = i < j ? i + ":" + j : j + ":" + i;
        if (seen.has(key)) return;
        seen.add(key);
        links.push({ source: i, target: j, w: s });
      });
    }
    if (opts.hubs) {
      tree.roots.forEach((r) => {
        const hi = nodes.length;
        nodes.push({ id: r.id, kind: "topic", topic: r, label: r.label });
        r.members.forEach((m) => links.push({ source: hi, target: m, w: 0.05, hub: true }));
      });
    }
    return { nodes, links };
  }

  function related(index, i, count) {
    const out = [];
    const useDense = index.dense && index.dense[i];
    index.vecs.forEach((v, j) => {
      if (j === i) return;
      const s = useDense && index.dense[j] ? sim(index, i, j) : dot(index.vecs[i], v);
      if (s > (useDense ? 0.35 : 0.08)) out.push([j, s]);
    });
    return out.sort((a, b) => b[1] - a[1]).slice(0, count || 6);
  }

  // Search: every query word must appear (prefix match); also allows small typos on titles.
  function search(index, query) {
    const q = (query || "").toLowerCase().trim();
    if (!q) return null;
    const parts = q.split(/\s+/);
    const hits = new Set();
    index.searchText.forEach((t, i) => {
      if (parts.every((p) => t.includes(p) || fuzzyWord(t, p))) hits.add(i);
    });
    return hits;
  }
  function fuzzyWord(text, p) {
    if (p.length < 5) return false;
    const words = text.split(/[^a-z0-9]+/);
    return words.some((w) => Math.abs(w.length - p.length) <= 1 && editDistanceAtMost1(w, p));
  }
  function editDistanceAtMost1(a, b) {
    if (a === b) return true;
    let i = 0, j = 0, edits = 0;
    while (i < a.length && j < b.length) {
      if (a[i] === b[j]) { i++; j++; continue; }
      if (++edits > 1) return false;
      if (a.length > b.length) i++; else if (b.length > a.length) j++; else { i++; j++; }
    }
    return edits + (a.length - i) + (b.length - j) <= 1;
  }


  // ---------- Smart mode: dense sentence vectors from the on-device model ----------
  function ddot(a, b) { let s = 0; for (let d = 0; d < a.length; d++) s += a[d] * b[d]; return s; }
  // Blend: meaning (model) 80%, shared words and tags 20%.
  function sim(index, i, j) { return 0.8 * ddot(index.dense[i], index.dense[j]) + 0.2 * dot(index.vecs[i], index.vecs[j]); }

  function dkmeans(vs, members, k, seed) {
    const R = rng(seed);
    if (members.length <= k) return members.map((i) => ({ members: [i], c: vs[i] }));
    const cents = [vs[members[Math.floor(R() * members.length)]]];
    const best = members.map(() => -1);
    while (cents.length < k) {
      let total = 0;
      const d = members.map((i, j) => { best[j] = Math.max(best[j], ddot(vs[i], cents[cents.length - 1])); const x = Math.max(0, 1 - best[j]); total += x * x; return x * x; });
      if (total === 0) break;
      let r = R() * total, pick = 0;
      for (; pick < d.length - 1; pick++) { r -= d[pick]; if (r <= 0) break; }
      cents.push(vs[members[pick]]);
    }
    const assign = new Array(members.length).fill(-1);
    for (let iter = 0; iter < 20; iter++) {
      let changed = false;
      members.forEach((i, j) => { let bi = 0, bs = -2; cents.forEach((c, ci) => { const s = ddot(vs[i], c); if (s > bs) { bs = s; bi = ci; } }); if (assign[j] !== bi) { assign[j] = bi; changed = true; } });
      cents.forEach((_, ci) => {
        const sum = new Float32Array(vs[members[0]].length); let any = false;
        members.forEach((i, j) => { if (assign[j] === ci) { any = true; const v = vs[i]; for (let d = 0; d < v.length; d++) sum[d] += v[d]; } });
        if (any) { let n = 0; for (let d = 0; d < sum.length; d++) n += sum[d] * sum[d]; n = Math.sqrt(n) || 1; for (let d = 0; d < sum.length; d++) sum[d] /= n; cents[ci] = sum; }
      });
      if (!changed) break;
    }
    const groups = cents.map((c) => ({ members: [], c }));
    members.forEach((i, j) => groups[assign[j]].members.push(i));
    return groups.filter((g) => g.members.length);
  }
  function sparseCentroid(index, members) { const sum = new Map(); members.forEach((i) => index.vecs[i].forEach((v, w) => sum.set(w, (sum.get(w) || 0) + v))); return normalize(sum); }
  function dcohesion(vs, g) { let s = 0; g.members.forEach((i) => { s += ddot(vs[i], g.c); }); return s / g.members.length; }

  // Fast single-pass clustering: each chat joins the closest group if it is close enough, else starts one.
  // Two passes so early chats can move to groups that formed later.
  function leaderClusters(vs, members, thr) {
    let groups = [];
    const place = (i) => {
      let bi = -1, bs = thr;
      groups.forEach((g, gi) => { const s = ddot(vs[i], g.c); if (s > bs) { bs = s; bi = gi; } });
      if (bi < 0) groups.push({ members: [i], c: Float32Array.from(vs[i]) });
      else groups[bi].members.push(i);
    };
    members.forEach(place);
    for (let pass = 0; pass < 2; pass++) {
      groups.forEach((g) => { g.c = denseCentroid(vs, g.members); });
      const old = groups; groups = old.filter((g) => g.members.length >= 2).map((g) => ({ members: [], c: g.c }));
      members.forEach(place);
      groups = groups.filter((g) => g.members.length);
    }
    return groups;
  }

  // Label from title words even when they are too rare for the word index.
  function rawLabel(index, members) {
    const count = new Map();
    members.forEach((i) => new Set(tokenize(index.chats[i].name)).forEach((w) => count.set(w, (count.get(w) || 0) + 1)));
    const shared = [...count.entries()].filter((e) => e[1] >= 2).sort((a, b) => b[1] - a[1]).slice(0, 3).map((e) => e[0]);
    if (shared.length) return shared.join(" · ");
    return members.slice(0, 3).map((i) => tokenize(index.chats[i].name)[0]).filter(Boolean).join(" · ") || "Misc";
  }
  function denseCentroid(vs, members) {
    const have = members.filter((i) => vs[i]); if (!have.length) return null;
    const sum = new Float32Array(vs[have[0]].length);
    have.forEach((i) => { for (let d = 0; d < sum.length; d++) sum[d] += vs[i][d]; });
    let n = 0; for (let d = 0; d < sum.length; d++) n += sum[d] * sum[d]; n = Math.sqrt(n) || 1;
    for (let d = 0; d < sum.length; d++) sum[d] /= n;
    return sum;
  }

  function finishTree(merged, misc) {
    merged.sort((a, b) => b.members.length - a.members.length);
    const topicOf = new Map();
    merged.forEach((r, ri) => { r.color = ri; r.members.forEach((i) => topicOf.set(i, r)); });
    const shelfMap = new Map();
    merged.forEach((r) => { if (r.shelf) { if (!shelfMap.has(r.shelf)) shelfMap.set(r.shelf, []); shelfMap.get(r.shelf).push(r); } });
    const shelves = [];
    shelfMap.forEach((list, name) => { if (list.length >= 2) shelves.push({ label: name, topics: list, size: list.reduce((a, r) => a + r.members.length, 0) }); });
    shelves.sort((a, b) => b.size - a.size);
    const onShelf = new Set(shelves.flatMap((sh) => sh.topics));
    return { roots: merged, misc, topicOf, shelves, unshelved: merged.filter((r) => !onShelf.has(r)) };
  }

  function decodeVec(b64) {
    const bin = atob(b64); const v = new Float32Array(bin.length);
    for (let d = 0; d < bin.length; d++) v[d] = ((bin.charCodeAt(d) << 24) >> 24) / 127;
    let n = 0; for (let d = 0; d < v.length; d++) n += v[d] * v[d]; n = Math.sqrt(n) || 1; for (let d = 0; d < v.length; d++) v[d] /= n;
    return v;
  }

  globalThis.ChatTreeCluster = { tokenize, buildIndex, buildTree, buildGraph, related, search, decodeVec };
})();
