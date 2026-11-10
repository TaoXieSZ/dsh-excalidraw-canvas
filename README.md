# Excalidraw canvas for DSH

A shared, hand-drawn canvas in the DeepSeek Harness right sidebar — the agent draws on it live, and you draw on the same board.

一个开在 DeepSeek Harness 右侧边栏里的手绘画布：AI 实时动笔，你也能直接上手改，两边共用同一张画布。

<img src="icon.svg" width="72" align="right" alt="plugin icon">

## What it does

- **Agent draws live.** `excalidraw_draw` writes rectangles, ellipses, diamonds, arrows, lines and text; the batch appears on screen within a second, with a short fade-in on the new shapes.
- **You draw too.** The same board has tools for shapes, freehand, text and an eraser, plus selection drag, undo/redo, colours, stroke width, pan and zoom.
- **One board, everywhere.** The canvas is shared across sessions and workspaces, so switching conversations never shows you an empty page.
- **Nothing gets lost.** The scene is mirrored to `$DSH_HOME/excalidraw-canvas/scenes.json`, so a plugin reload or an application restart restores it.
- **Take it with you.** `⤓` downloads a standard `.excalidraw` file that drops straight into [excalidraw.com](https://excalidraw.com) or the desktop app.

## Install

```bash
git clone https://github.com/TaoXieSZ/dsh-excalidraw-canvas.git
```

Then, in Harness, install the bundle from the checked-out directory:

```
plugin_manager  action=install_bundle  target=/absolute/path/to/dsh-excalidraw-canvas
```

Refresh the page once. Open the canvas from the right sidebar's `+` → **Excalidraw 画布**, or let the agent's first drawing open it for you.

## Using it

| | |
| --- | --- |
| Open | Right sidebar → `+` → 「Excalidraw 画布」 |
| Pan | wheel / trackpad / middle-drag / hold `Space` and drag |
| Zoom | `⌘` (or `Ctrl`) + wheel around the pointer, `−` / `+`, or click the percentage to return to 100% |
| Undo | `⌘Z`, redo `⇧⌘Z` |
| Delete | select an element, press `Delete` |
| Export | `⤓` — a `.excalidraw` file with the same element model |

The board fills the whole panel: no paper border, no margins, and the first drawing frames itself to fit.

## Agent tools

### `excalidraw_draw`

Adds elements. Coordinates are canvas units, origin top-left, y down; the default board is 1600×1000, and content outside it still works.

| Element | Required | Optional |
| --- | --- | --- |
| `rectangle` / `ellipse` / `diamond` | `x` `y` `width` `height` | `text` (centred label), `strokeColor`, `backgroundColor`, `fillStyle`, `strokeWidth`, `strokeStyle`, `fontSize` |
| `arrow` / `line` | `x1` `y1` `x2` `y2` | `text` (midpoint label), colours, `strokeWidth`, `strokeStyle` |
| `text` | `x` `y` `text` | `fontSize`, `strokeColor` |

`clear: true` empties the board first. Both tools return a compact, model-readable summary.

### `excalidraw_canvas`

| Action | Effect |
| --- | --- |
| `read` | lists every element with its id, author (`ai` / `用户`), position, size and label — the way an agent sees what you drew |
| `clear` | empties the board |
| `delete` | removes the given `ids` |
| `move` | shifts the given `ids` by `dx`, `dy` |

## How it works

```
┌──────────────┐   tools    ┌───────────────────────────┐
│  Agent turn  │ ─────────▶ │  Host half (index.js)     │
└──────────────┘            │  one shared scene +       │
                            │  scenes.json mirror       │
┌──────────────┐  HTTP GET  │                           │
│  Canvas tab  │ ─────────▶ │  GET  /excalidraw/api/…   │
│  (client.js) │  HTTP POST │  POST /excalidraw/api/…   │
└──────────────┘ ◀───────── └───────────────────────────┘
```

- The Host keeps the only authoritative copy. Tools mutate it; the tab polls it every ~650 ms and posts its own strokes back.
- Merging is per element, not per snapshot: an element the Client has not seen yet (created by a tool call mid-drag) survives a Client upload.
- A Host that restarted with an empty copy never wipes the tab; the Client adopts whatever the Host restored from disk, and only re-uploads when that restore was empty.
- The renderer is a compact Excalidraw-v2-compatible one written for this plugin: deterministic seeded "rough" strokes, hachure fills, wrapped labels, no external runtime — the Client module is plain JavaScript loaded by the Harness module loader.

## Limits

- The scene is a scratch board, not a document store: it lives outside the session log and the workspace, and the last writer wins.
- Images, frames and bound arrows are not supported yet; anything else in the element model round-trips through the `.excalidraw` export.
- One board per profile. Per-session boards would need a scene key in the protocol.

## Development

```
index.js            Host half: scene store, persistence, HTTP API, two tools
client.js           Client half: right-sidebar tab, canvas renderer and editor
cordis.patch.yml    Loader row inserted at install time
locale/*.json       Plugin title and description (zh / en)
icon.svg            Plugin icon
```

- Host changes need the plugin reloaded (Plugin Manager → toggle it off and on).
- Client changes need a page refresh.
- No build step: both halves are plain ES modules served as-is.

## License

MIT — see [LICENSE](LICENSE).
