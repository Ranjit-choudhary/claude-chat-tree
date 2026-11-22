// Chat Tree: runs the bundled MiniLM model on chat titles. Lives in an extension page
// (Firefox: hidden frame in the background page; Chrome: offscreen document), never in claude.ai's page.
import * as ort from "./ort.wasm.bundle.min.mjs";
import { WordPiece } from "./tokenizer.js";

const ext = globalThis.browser || globalThis.chrome;
const here = new URL(".", location.href).href;
ort.env.wasm.wasmPaths = here;
ort.env.wasm.numThreads = 1; // one CPU core only, so the browser stays responsive
ort.env.wasm.proxy = false;

let ready = null;
function load() {
  if (!ready) ready = (async () => {
    const [vocab, session] = await Promise.all([
      fetch(here + "vocab.txt").then((r) => r.text()),
      ort.InferenceSession.create(here + "model.onnx", { executionProviders: ["wasm"], graphOptimizationLevel: "all" }),
    ]);
    return { tok: new WordPiece(vocab), session };
  })();
  return ready;
}

function toB64(int8) { let s = ""; const u = new Uint8Array(int8.buffer); for (let i = 0; i < u.length; i++) s += String.fromCharCode(u[i]); return btoa(s); }

// Returns one base64 string per text: the 384-number sentence vector, normalised and stored as int8.
async function embed(texts, maxLen = 48) {
  const { tok, session } = await load();
  const enc = texts.map((t) => tok.encode(t || "", maxLen));
  const L = Math.max(...enc.map((e) => e.length));
  const B = enc.length;
  const ids = new BigInt64Array(B * L), mask = new BigInt64Array(B * L), types = new BigInt64Array(B * L);
  enc.forEach((e, b) => e.forEach((id, j) => { ids[b * L + j] = BigInt(id); mask[b * L + j] = 1n; }));
  const feeds = { input_ids: new ort.Tensor("int64", ids, [B, L]), attention_mask: new ort.Tensor("int64", mask, [B, L]) };
  if (session.inputNames.includes("token_type_ids")) feeds.token_type_ids = new ort.Tensor("int64", types, [B, L]);
  const out = await session.run(feeds);
  const hidden = (out.last_hidden_state || out[session.outputNames[0]]).data;
  const D = hidden.length / (B * L);
  return enc.map((e, b) => {
    const v = new Float32Array(D);
    for (let j = 0; j < e.length; j++) for (let d = 0; d < D; d++) v[d] += hidden[(b * L + j) * D + d];
    let n = 0; for (let d = 0; d < D; d++) n += v[d] * v[d]; n = Math.sqrt(n) || 1;
    const q = new Int8Array(D); for (let d = 0; d < D; d++) q[d] = Math.max(-127, Math.min(127, Math.round((v[d] / n) * 127)));
    return toB64(q);
  });
}

globalThis.ctEmbed = embed;
if (ext && ext.runtime && ext.runtime.onMessage) {
  ext.runtime.onMessage.addListener((msg, _sender, reply) => {
    if (!msg || msg.type !== "ct-embed") return;
    embed(msg.texts).then((vectors) => reply({ vectors }), (e) => reply({ error: String(e && e.message || e) }));
    return true;
  });
  ext.runtime.sendMessage({ type: "ct-embed-ready" }).catch(() => {});
}
