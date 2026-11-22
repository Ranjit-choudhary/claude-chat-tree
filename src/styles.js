// Chat Tree: styles for the overlay. Lives inside a shadow root so claude.ai's styles never clash.
globalThis.ChatTreeCSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.wrap {
  --bg: #fbfaf7; --panel: #ffffff; --line: #e6e2d9; --text: #22201c; --muted: #6f6a60;
  --accent: #c2603a; --accent-soft: #f6e6dd; --hit: #fff1a8; --shadow: 0 20px 60px rgba(0,0,0,.25);
  font: 14px/1.4 ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif;
  color: var(--text);
}
.wrap.dark {
  --bg: #1f1e1b; --panel: #262522; --line: #3a3833; --text: #ece9e2; --muted: #a29d92;
  --accent: #e08a62; --accent-soft: #3d2c24; --hit: #5a4d14; --shadow: 0 20px 60px rgba(0,0,0,.6);
}
.fab {
  position: fixed; right: 18px; bottom: 84px; z-index: 2147483000; width: 42px; height: 42px; border-radius: 50%;
  border: 1px solid var(--line); background: var(--panel); color: var(--accent); cursor: pointer; box-shadow: 0 4px 14px rgba(0,0,0,.18);
  display: grid; place-items: center; padding: 0;
}
.fab:hover { transform: scale(1.06); }
.fab svg { width: 22px; height: 22px; }
.overlay { position: fixed; inset: 0; z-index: 2147483001; background: rgba(0,0,0,.35); display: none; }
.overlay.open { display: block; }
.panel {
  position: absolute; inset: 3vh 3vw; background: var(--bg); border: 1px solid var(--line); border-radius: 14px;
  box-shadow: var(--shadow); display: grid; grid-template-rows: auto auto 1fr auto; overflow: hidden;
}
header { display: flex; gap: 8px; align-items: center; padding: 10px 12px; border-bottom: 1px solid var(--line); flex-wrap: wrap; }
.title { font-weight: 650; margin-right: 6px; display: flex; align-items: center; gap: 6px; }
.title svg { width: 18px; height: 18px; color: var(--accent); }
input[type=search], select, input[type=text] {
  font: inherit; color: var(--text); background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 6px 9px; outline: none;
}
input[type=search] { flex: 1 1 220px; min-width: 160px; }
input:focus, select:focus { border-color: var(--accent); }
button { font: inherit; color: var(--text); background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; cursor: pointer; }
button:hover { border-color: var(--accent); }
button.on { background: var(--accent-soft); border-color: var(--accent); color: var(--accent); }
.seg { display: inline-flex; }
.seg button { border-radius: 0; margin-left: -1px; }
.seg button:first-child { border-radius: 8px 0 0 8px; margin-left: 0; }
.seg button:last-child { border-radius: 0 8px 8px 0; }
.filters { display: flex; gap: 8px; align-items: center; padding: 8px 12px; border-bottom: 1px solid var(--line); flex-wrap: wrap; color: var(--muted); font-size: 13px; }
.filters label { display: inline-flex; gap: 5px; align-items: center; }
.close { margin-left: auto; }
.body { display: grid; grid-template-columns: 1fr 340px; min-height: 0; }
.main { position: relative; overflow: auto; min-height: 0; }
.side { border-left: 1px solid var(--line); overflow: auto; padding: 14px; background: var(--panel); }
footer { padding: 6px 12px; border-top: 1px solid var(--line); color: var(--muted); font-size: 12px; display: flex; gap: 12px; align-items: center; }
footer .grow { flex: 1; }
.tree { padding: 8px 10px 30px; }
details { margin: 1px 0; }
summary { list-style: none; cursor: pointer; padding: 4px 6px; border-radius: 6px; display: flex; gap: 6px; align-items: center; }
summary::-webkit-details-marker { display: none; }
summary:hover { background: var(--accent-soft); }
summary .chev { width: 12px; transition: transform .12s; color: var(--muted); flex: none; }
details[open] > summary .chev { transform: rotate(90deg); }
.dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
.tlabel { font-weight: 600; }
.tlabel.shelf { text-transform: uppercase; letter-spacing: .06em; font-size: 12px; color: var(--muted); }
.count { color: var(--muted); font-size: 12px; }
.kids { margin-left: 14px; border-left: 1px dashed var(--line); padding-left: 6px; }
a.chat { display: flex; gap: 8px; align-items: baseline; padding: 3px 6px; border-radius: 6px; color: var(--text); text-decoration: none; }
a.chat:hover { background: var(--accent-soft); }
a.chat.sel { background: var(--accent-soft); outline: 1px solid var(--accent); }
a.chat .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
a.chat .meta { color: var(--muted); font-size: 12px; margin-left: auto; white-space: nowrap; flex: none; }
a.chat .star { color: #d9a400; }
a.chat .tag, .tagchip { font-size: 11px; padding: 0 6px; border-radius: 10px; background: var(--accent-soft); color: var(--accent); white-space: nowrap; }
mark { background: var(--hit); color: inherit; border-radius: 3px; }
.empty { padding: 40px; text-align: center; color: var(--muted); }
canvas { display: block; width: 100%; height: 100%; cursor: grab; }
canvas.dragging { cursor: grabbing; }
.graphwrap { position: absolute; inset: 0; }
.legend { position: absolute; left: 10px; top: 10px; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; font-size: 12px; max-height: 60%; overflow: auto; max-width: 260px; }
.legend div { display: flex; gap: 6px; align-items: center; cursor: pointer; padding: 1px 2px; border-radius: 4px; }
.legend div:hover { background: var(--accent-soft); }
.legend div.dim { opacity: .4; }
.gtools { position: absolute; right: 10px; top: 10px; display: flex; gap: 6px; }
.tip { position: absolute; pointer-events: none; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 6px 8px; font-size: 12px; max-width: 320px; box-shadow: 0 4px 14px rgba(0,0,0,.15); display: none; }
.side h3 { margin: 0 0 6px; font-size: 16px; }
.side h4 { margin: 18px 0 6px; font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted); }
.side p { margin: 4px 0; color: var(--muted); }
.side .summary { color: var(--text); white-space: pre-wrap; max-height: 220px; overflow: auto; font-size: 13px; }
.tags { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
.tagchip button { border: none; background: none; padding: 0 0 0 4px; color: inherit; cursor: pointer; }
.side .row { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; }
.help { font-size: 13px; color: var(--muted); }
.help kbd { border: 1px solid var(--line); border-bottom-width: 2px; border-radius: 4px; padding: 0 4px; font-size: 11px; background: var(--bg); }
.settings label { display: flex; gap: 8px; margin: 8px 0; align-items: flex-start; }
.spin { display: inline-block; width: 10px; height: 10px; border: 2px solid var(--line); border-top-color: var(--accent); border-radius: 50%; animation: s 0.8s linear infinite; }
@keyframes s { to { transform: rotate(360deg); } }
@media (max-width: 820px) { .body { grid-template-columns: 1fr; } .side { display: none; } .side.show { display: block; position: absolute; inset: auto 0 0 0; height: 50%; border-top: 1px solid var(--line); } }
`;
