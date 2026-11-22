# Chat Tree for Claude (v0.2)

A browser extension for claude.ai that sorts your chats into a **topic tree** and shows them as a **graph**, with search, tags, filters and related chats. Works in Firefox (including containers) and Chrome. Everything runs in your browser: chat titles are read from claude.ai using your own signed-in session, and nothing is sent anywhere else.

## Downloads
- **chat-tree-firefox.zip** (about 19 MB, 35 MB installed): Firefox, with the on-device AI model for smart grouping.
- **chat-tree-chrome.zip** (about 19 MB): Chrome / Edge / Brave, with the model.
- **chat-tree-lite-firefox.zip** (about 40 KB): Firefox, basic grouping only (built-in subject list plus shared words).

Build them yourself with `./build.sh` (writes `dist/`). The repo's `manifest.json` is the Firefox one; `manifest.chrome.json` is used for the Chrome zip.

## Install

### Firefox
1. Unzip `chat-tree-firefox.zip` somewhere you will keep it.
2. Open `about:debugging#/runtime/this-firefox`.
3. Click **Load Temporary Add-on…** and pick `manifest.json` inside the folder.
4. Open claude.ai (in any container). A small round tree button appears bottom right, or press **Alt+Shift+K**.
5. If nothing shows: open `about:addons`, click Chat Tree, go to **Permissions**, and turn on access to claude.ai.

A temporary add-on is removed when Firefox restarts. To keep it permanently it has to be signed by Mozilla (a free, private "unlisted" upload). Ask Claude to prepare that when you are happy with it.

### Chrome / Edge / Brave
1. Unzip `chat-tree-chrome.zip`, then open `chrome://extensions`.
2. Turn on **Developer mode** (top right), click **Load unpacked**, and pick the folder.
3. Open claude.ai and press **Alt+Shift+K** or click the button.

## The 10 features

| # | Feature | Status |
|---|---------|--------|
| 1 | **Topic tree**: chats grouped automatically into shelves (Coding, Courses & engineering, Career, Life & fun) then topics, then sub-topics | Done |
| 2 | **Graph view**: every chat is a dot, linked to similar chats and to its topic hub; drag, zoom, hover, click; legend hides topics | Done |
| 3 | **Instant search** across titles, summaries and tags, with typo tolerance; matches are highlighted in the tree and the graph | Done |
| 4 | **Your own tags**, plus a "My tags" tree; tags also steer the auto grouping | Done |
| 5 | **Other ways to group**: by project or by month | Done |
| 6 | **Filters**: time range, starred only, project, tag | Done |
| 7 | **Related chats** for any chat; opens on the chat you are currently viewing | Done |
| 8 | **Keyboard shortcuts**: Alt+Shift+K, `/` search, Enter opens the first match, Esc closes, Ctrl+click new tab | Done |
| 9 | **Export** the tree as a Markdown outline (with links) or JSON | Done |
| 10 | **Deep index** (opt-in, in Settings): reads the first message of each chat slowly, for better topics and search. Text stays local | Done, experimental |
| 11 | **Smart grouping (on-device AI)**: a small model (all-MiniLM-L6-v2, int8) bundled in the extension turns each title into a "meaning" vector, so chats link even when they share no words (e.g. "Pandas merge two dataframes" and "How to join two tables in pandas"). Used for related chats, graph links, and grouping chats the subject list does not cover | Done (full version) |

### Cost of smart grouping (measured in Chromium)
| What | Cost |
|---|---|
| Download / disk | about 19 MB zipped, 35 MB installed (model 23 MB + runtime 11 MB). The lite version has none of this |
| Memory | about 150 MB, only while it runs. The model unloads a few seconds after it finishes (checked: the model page is closed afterwards) |
| CPU | one core only; first run about 10 s per 1,000 chats (110 chats took about 2 s, including 0.7 s to load the model) |
| Later opens | only new or renamed chats are processed, usually a fraction of a second; results are cached (about 0.5 MB per 1,000 chats) |
| claude.ai page speed | no effect: the model runs in a separate extension page, never in the claude.ai tab, and nothing runs until you open the panel |
| Network | none: the model ships inside the extension |

Turn it off any time in Settings, or install the lite version.

Ideas for later: renaming or merging topics by hand, syncing tags across your devices, finding near-duplicate chats, bulk actions (star, move to project, delete).

## How it works and caveats
- The chat list comes from claude.ai's own internal endpoints (`/api/organizations/.../chat_conversations`). These are not a public API, so a claude.ai update could break loading. The last loaded list is kept so the view still works.
- Without smart grouping, topics come from a built-in vocabulary of about 25 subjects plus word overlap between titles. Chats on subjects it does not know are grouped by shared words, and loners go to "Other chats". Tag a few chats to pull them together.
- Data stored in the extension's local storage: the chat list cache, your tags, settings, and the deep index if turned on. Settings has buttons to clear them.
- In Firefox, each container's claude.ai account is read through that container's tab. Tags and the cache are kept per claude.ai organization.

## Files
- `manifest.json`: Manifest V3, works in both browsers
- `background.js`: toolbar button and keyboard command
- `src/api.js`: reads chats from claude.ai
- `src/cluster.js`: topic grouping, graph links, related chats, search (no network)
- `src/content.js`, `src/styles.js`: the overlay
- `embed/`: the on-device model (`model.onnx`, `vocab.txt`, Apache-2.0, see `NOTICE`), ONNX Runtime Web (MIT), and `embed.js` + `tokenizer.js` that run it. Chrome runs it in an offscreen document, Firefox in a hidden frame of the background page
