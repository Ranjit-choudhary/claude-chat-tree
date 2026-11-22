// Chat Tree: styles for the overlay. Lives inside a shadow root so claude.ai's styles never clash.
// Colours come from claude.ai's own theme tokens at runtime (see applyTheme in content.js);
// the values below are only fallbacks taken from claude.ai's light and dark themes. No gradients:
// claude.ai's surfaces are flat, so these are too.
globalThis.ChatTreeCSS = `
:host { all: initial; }
* { box-sizing: border-box; }
.wrap {
  --bg: #faf9f5; --panel: #ffffff; --raised: #f5f4ed; --hover: #f0eee6; --line: rgba(31,30,29,.15);
  --text: #141413; --muted: #73726c; --accent: #d97757; --accent-soft: rgba(217,119,87,.14);
  --hit: rgba(217,119,87,.28); --shadow: 0 8px 40px rgba(0,0,0,.16); --scrim: rgba(0,0,0,.25);
  --font: ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif;
  font: 14px/1.45 var(--font);
  color: var(--text);
}
.wrap.dark {
  --bg: #262624; --panel: #30302e; --raised: #3a3936; --hover: #3d3d3a; --line: rgba(222,220,209,.15);
  --text: #faf9f5; --muted: #a6a39b; --accent: #d97757; --accent-soft: rgba(217,119,87,.18);
  --hit: rgba(217,119,87,.35); --shadow: 0 8px 40px rgba(0,0,0,.5); --scrim: rgba(0,0,0,.45);
}
.fab {
  position: fixed; right: 18px; bottom: 84px; z-index: 2147483000; width: 40px; height: 40px; border-radius: 50%;
  border: 1px solid var(--line); background: var(--panel); color: var(--accent); cursor: pointer; box-shadow: var(--shadow);
  display: grid; place-items: center; padding: 0;
}
.fab:hover { background: var(--hover); }
.fab svg { width: 20px; height: 20px; }
.overlay { position: fixed; inset: 0; z-index: 2147483001; background: var(--scrim); display: none; }
.overlay.open { display: block; }
.panel {
  position: absolute; left: 50%; top: 50%; transform: translate(-50%, -50%);
  width: min(1180px, calc(100vw - 32px)); height: min(820px, calc(100vh - 32px));
  background: var(--panel); border: 1px solid var(--line); border-radius: 16px;
  box-shadow: var(--shadow); display: grid; grid-template-rows: auto auto auto 1fr auto; overflow: hidden;
}
.top { display: flex; align-items: center; gap: 10px; padding: 16px 18px 6px 22px; }
.title { color: var(--muted); display: flex; align-items: center; gap: 8px; font-size: 15px; }
.title svg { width: 16px; height: 16px; color: var(--accent); }
.tabs { display: flex; gap: 4px; padding: 6px 16px 10px; align-items: center; flex-wrap: wrap; border-bottom: 1px solid var(--line); }
.tab { border: none; background: none; color: var(--text); padding: 5px 12px; border-radius: 8px; font-size: 15px; cursor: pointer; }
.tab:hover { background: var(--hover); }
.tab[aria-selected="true"] { background: var(--raised); box-shadow: inset 0 0 0 1px var(--line); }
.tabs .spacer { flex: 1; }
input[type=search], select, input[type=text] {
  font: inherit; color: var(--text); background: var(--bg); border: 1px solid var(--line); border-radius: 8px; padding: 6px 10px; outline: none;
}
input[type=search] { width: min(380px, 50vw); }
input:focus-visible, select:focus-visible, button:focus-visible, a:focus-visible { outline: 2px solid var(--accent); outline-offset: 1px; }
button { font: inherit; color: var(--text); background: transparent; border: 1px solid var(--line); border-radius: 8px; padding: 5px 10px; cursor: pointer; }
button:hover { background: var(--hover); }
button.on { background: var(--accent-soft); border-color: transparent; color: var(--accent); }
button.icon { border: none; padding: 6px; display: grid; place-items: center; color: var(--muted); }
button.icon svg { width: 18px; height: 18px; }
.filters { display: flex; gap: 10px; align-items: center; padding: 8px 22px; border-bottom: 1px solid var(--line); flex-wrap: wrap; color: var(--muted); font-size: 13px; }
.filters label { display: inline-flex; gap: 6px; align-items: center; }
.filters select { padding: 3px 8px; }
.close { margin-left: auto; }
.body { display: grid; grid-template-columns: 1fr 340px; min-height: 0; }
.main { position: relative; overflow: auto; min-height: 0; }
.side { border-left: 1px solid var(--line); overflow: auto; padding: 16px 18px; }
footer { padding: 9px 22px; border-top: 1px solid var(--line); color: var(--muted); font-size: 13px; display: flex; gap: 16px; align-items: center; flex-wrap: wrap; }
footer .grow { flex: 1; }
kbd { border: 1px solid var(--line); border-radius: 5px; padding: 0 5px; font: 12px/18px var(--font); color: var(--muted); background: var(--bg); margin-left: 4px; }
.section-label { color: var(--muted); font-size: 13px; padding: 12px 12px 4px; }
.tree { padding: 6px 10px 30px; }
details { margin: 1px 0; }
summary { list-style: none; cursor: pointer; padding: 6px 10px; border-radius: 8px; display: flex; gap: 8px; align-items: center; }
summary::-webkit-details-marker { display: none; }
summary:hover { background: var(--hover); }
summary .chev { width: 12px; transition: transform .12s; color: var(--muted); flex: none; }
details[open] > summary .chev { transform: rotate(90deg); }
.dot { width: 9px; height: 9px; border-radius: 50%; flex: none; }
.tlabel { font-weight: 550; }
.tlabel.shelf { color: var(--muted); font-weight: 500; font-size: 13px; }
.count { color: var(--muted); font-size: 12px; }
.kids { margin-left: 16px; padding-left: 6px; border-left: 1px solid var(--line); }
a.chat { display: flex; gap: 8px; align-items: baseline; padding: 6px 10px; border-radius: 8px; color: var(--text); text-decoration: none; }
a.chat:hover, a.chat:focus { background: var(--hover); outline: none; }
a.chat.sel { background: var(--raised); box-shadow: inset 0 0 0 1px var(--line); }
a.chat .nm { overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
a.chat .meta { color: var(--muted); font-size: 12px; margin-left: auto; white-space: nowrap; flex: none; }
a.chat .star { color: var(--accent); }
a.chat .tag, .tagchip { font-size: 11px; padding: 0 7px; border-radius: 10px; background: var(--accent-soft); color: var(--accent); white-space: nowrap; }
mark { background: var(--hit); color: inherit; border-radius: 3px; }
.empty { padding: 40px; text-align: center; color: var(--muted); }
canvas { display: block; width: 100%; height: 100%; cursor: grab; }
canvas.dragging { cursor: grabbing; }
.graphwrap { position: absolute; inset: 0; background: var(--bg); }
.legend { position: absolute; left: 12px; top: 12px; background: var(--panel); border: 1px solid var(--line); border-radius: 12px; padding: 6px; font-size: 12px; max-height: calc(100% - 24px); overflow: auto; max-width: 250px; }
.legend-head { border: none; background: none; display: flex; gap: 6px; align-items: center; padding: 3px 7px; font-size: 12px; color: var(--muted); }
.legend div { display: flex; gap: 7px; align-items: center; cursor: pointer; padding: 3px 7px; border-radius: 6px; }
.legend div:hover { background: var(--hover); }
.legend div.dim { opacity: .4; }
.gtools { position: absolute; right: 12px; top: 12px; display: flex; gap: 6px; }
.gtools button { background: var(--panel); }
.tip { position: absolute; pointer-events: none; background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 7px 10px; font-size: 12px; max-width: 320px; box-shadow: var(--shadow); display: none; }
.side h3 { margin: 0 0 6px; font-size: 16px; font-weight: 600; }
.side h4 { margin: 18px 0 6px; font-size: 13px; font-weight: 500; color: var(--muted); }
.side p { margin: 4px 0; color: var(--muted); }
.side .summary { color: var(--text); white-space: pre-wrap; max-height: 220px; overflow: auto; font-size: 13px; }
.side a.chat { padding: 5px 8px; }
.tags { display: flex; flex-wrap: wrap; gap: 5px; align-items: center; }
.tagchip button { border: none; background: none; padding: 0 0 0 4px; color: inherit; cursor: pointer; }
.side .row { display: flex; gap: 6px; margin-top: 10px; flex-wrap: wrap; }
.help { font-size: 13px; color: var(--muted); }
.help div { margin: 3px 0; }
.settings label { display: flex; gap: 8px; margin: 10px 0; align-items: flex-start; }
.spin { display: inline-block; width: 10px; height: 10px; border: 2px solid var(--line); border-top-color: var(--accent); border-radius: 50%; animation: s 0.8s linear infinite; vertical-align: -1px; }
@keyframes s { to { transform: rotate(360deg); } }
@media (prefers-reduced-motion: reduce) { .spin { animation: none; } summary .chev { transition: none; } }
.sr { position: absolute; width: 1px; height: 1px; overflow: hidden; clip: rect(0 0 0 0); }
@media (max-width: 820px) { .body { grid-template-columns: 1fr; } .side { display: none; } footer .hints { display: none; } }
`;
