// Unit tests for the grouping, search and graph logic. Run: npm test
const test = require("node:test");
const assert = require("node:assert");
require("../src/cluster.js");
const C = globalThis.ChatTreeCluster;

const titles = ["Pandas merge two dataframes", "Pandas pivot table help", "Numpy broadcasting explained", "Plot time series with matplotlib",
  "React useEffect cleanup bug", "React context vs Redux", "Next.js app router data fetching", "TypeScript generics for React props",
  "Trip plan for Goa", "Budget trip to Manali", "Packing list for trekking", "Cover letter for internship", "Resume bullet points",
  "Interview prep: system design", "Git rebase vs merge", "Undo last git commit", "Guitar chords for beginners", "Learning piano scales", "Untitled"];
const chats = titles.map((name, i) => ({ uuid: "id" + i, name, summary: "" }));
const nameOf = (i) => chats[i].name;

function topicOf(tree, name) {
  const i = titles.indexOf(name);
  const r = tree.roots.find((t) => t.members.includes(i));
  return r ? r.label : "Other";
}

test("chats on the same subject share a topic", () => {
  const tree = C.buildTree(C.buildIndex(chats));
  assert.strictEqual(topicOf(tree, "Pandas merge two dataframes"), topicOf(tree, "Numpy broadcasting explained"));
  assert.strictEqual(topicOf(tree, "React useEffect cleanup bug"), topicOf(tree, "Next.js app router data fetching"));
  assert.strictEqual(topicOf(tree, "Trip plan for Goa"), "Travel");
  assert.notStrictEqual(topicOf(tree, "Pandas merge two dataframes"), topicOf(tree, "Trip plan for Goa"));
});

test("every chat appears exactly once in the tree", () => {
  for (const withDense of [false, true]) {
    const ix = C.buildIndex(chats);
    if (withDense) ix.dense = chats.map((_, i) => { const v = new Float32Array(8); v[i % 8] = 1; return v; });
    const tree = C.buildTree(ix);
    const seen = [...tree.roots.flatMap((r) => r.members), ...tree.misc];
    assert.strictEqual(seen.length, chats.length, "count with dense=" + withDense);
    assert.strictEqual(new Set(seen).size, chats.length, "duplicates with dense=" + withDense);
  }
});

test("search matches words, prefixes and small typos", () => {
  const ix = C.buildIndex(chats);
  const hits = (q) => [...C.search(ix, q)].map(nameOf);
  assert.deepStrictEqual(hits("pandas").sort(), ["Pandas merge two dataframes", "Pandas pivot table help"]);
  assert.ok(hits("reac").includes("React context vs Redux"));
  assert.ok(hits("dataframs").includes("Pandas merge two dataframes"), "one-letter typo");
  assert.strictEqual(C.search(ix, ""), null);
});

test("related chats rank the closest first", () => {
  const ix = C.buildIndex(chats);
  const rel = C.related(ix, titles.indexOf("Pandas merge two dataframes"), 3).map(([j]) => nameOf(j));
  assert.strictEqual(rel[0], "Pandas pivot table help");
});

test("graph links stay within range and hubs point at their topic", () => {
  const ix = C.buildIndex(chats);
  const tree = C.buildTree(ix);
  const g = C.buildGraph(ix, tree, { hubs: true });
  g.links.forEach((l) => { assert.ok(g.nodes[l.source] && g.nodes[l.target]); });
  const hubs = g.nodes.filter((n) => n.kind === "topic");
  assert.strictEqual(hubs.length, tree.roots.length);
});

test("model vectors decode to unit length", () => {
  const bytes = new Int8Array(384).map((_, i) => (i % 7) - 3);
  const b64 = Buffer.from(bytes.buffer).toString("base64");
  const v = C.decodeVec(b64);
  const n = Math.sqrt(v.reduce((a, x) => a + x * x, 0));
  assert.ok(Math.abs(n - 1) < 1e-5);
});

test("tags pull chats together", () => {
  const tagged = chats.map((c) => (c.name.startsWith("Guitar") || c.name.startsWith("Cover") ? Object.assign({}, c, { tags: ["weekend"] }) : c));
  const ix = C.buildIndex(tagged);
  const rel = C.related(ix, titles.indexOf("Guitar chords for beginners"), 1).map(([j]) => nameOf(j));
  assert.strictEqual(rel[0], "Cover letter for internship");
});
