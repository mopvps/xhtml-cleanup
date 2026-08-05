# HTML Cleaner — Project Documentation

## Overview & Purpose

Client-only web tool that cleans messy/legacy HTML (mainly eBook/OEB-style markup)
into normalized, semantically-tagged HTML, plus a separate feature to replace
special characters with HTML entities (decimal / hex / named). Built for
MoPower Information Services — likely used in eBook/publishing production
pipeline to clean scraped or converted HTML before further processing.

No backend, no build step. Open `index.html` in browser (or serve locally —
required for `entities.json` fetch to work due to CORS on `file://`).

## Tech Stack & Dependencies

- Vanilla HTML/CSS/JS, no framework, no bundler.
- **CodeMirror 5.65.16** (CDN, cdnjs) — code editor widgets for input/output
  panes. Modes: `xml`, `htmlmixed`. Themes: `dracula` (dark), `default` (light).
- `entities.json` — local data file, fetched via `fetch()` at runtime.
- No package.json / npm / build tooling of any kind.

## File Structure

```
Code/
├── index.html        entry point, page markup, CDN links
├── style.css          all styling (CSS vars, light/dark theme)
├── script.js          all logic: cleanup engine, entity replace, UI wiring
├── entities.json       983 HTML entity records (decimal/hex/named/char)
└── static/
    ├── title.png        favicon
    ├── html.png         header brand icon
    ├── light.png        theme toggle icon (light mode)
    ├── dark.png         theme toggle icon (dark mode)
    ├── lightning.png     "Clean" button icon
    ├── delete.png        "Clear Input" button icon
    └── copy.png          "Copy" button icon
```

## Core Features

1. **HTML Cleanup engine** — paste dirty HTML into left CodeMirror pane,
   click the round "CLEAN →" button, get normalized HTML in right pane.
   Shows original/cleaned size, % reduction, processing time (ms).
2. **Entity replacement** — after cleaning, a bar appears letting you convert
   special characters in the output into entities, in one of 3 formats
   (decimal/hex/named), with a "found/replaced" counter and yellow highlight
   of replaced spans in the output editor.
3. **Theme toggle** — light/dark, persisted in `localStorage` key
   `cleanup-theme`; also swaps CodeMirror theme (`default` ↔ `dracula`).
4. **Copy / Clear** controls with feedback state ("Copied!").

## Key Modules (script.js)

### Entity loading
Fetches `entities.json` on page load into `entityList`; disables the
"REPLACE ENTITIES" button with an explanatory tooltip if load fails
(e.g. opened via `file://` without a local server).

### CodeMirror setup
Two editors bound to `#inputArea` / `#outputArea` textareas — `inputEditor`
(editable) and `outputEditor` (readOnly, briefly unlocked during entity
replacement to update content, then relocked).

### Theme toggle
Reads/writes `data-theme="dark"` attribute on `<html>`, swaps icon image and
CodeMirror theme, persists choice.

### `cleanupHtml(src)` — the pipeline
Runs these transforms in sequence, each a pure string→string regex-based
function:

| # | Function | Purpose |
|---|----------|---------|
| 1 | `stripDuplicateTags` | collapse consecutive duplicate `<b>`/`<i>` open or close tags |
| 2 | `replaceHeader` | rewrite legacy OEB 1.0.1 doctype/xmlns header to modern XHTML doctype; repoint `default.css` to `../styles/stylesheet.css` |
| 3 | `removeEndOfFile` | strip `<endoffile/>` markers (wrapped or bare) |
| 4 | `removeDivTags` | strip all `<div>`/`</div>` tags (unwraps content) |
| 5 | `firstParaToH1` | first `<p>` right after `<body>` becomes `<h1 class="h1">` (tags stripped, text only) |
| 6 | `boldToH2` | short (`<=75 chars` or `<=10 words`) `<p class="bodytext/normal">` wholly wrapped in `<b>` becomes `<h2 class="h2">` |
| 7 | `italicToH3` | `<p>` wholly wrapped in `<i>` becomes `<h3 class="h3">` |
| 8 | `closeOrphanP` | auto-closes unclosed `<p>` before next block tag |
| 9 | `fixUnbalancedInline` | rebalances mismatched `<b>`/`<i>` open/close counts inside a `<p>` by stripping extras |
| 10 | `removeEmptyP` | deletes empty `<p class="...">` (incl. `&nbsp;`-only) |
| 11 | `cleanupTables` | unwraps `<p class="unknown">` around table tags; rebuilds every `<table>` via `rebuildTable` (parses tag stream, normalizes to `<table class="tbody">`/`<tr class="tr">`/`<td class="td">`, strips old classes, re-indents) |
| 12 | `bodytextToIndent` | plain `p.bodytext` (not starting with b/i) → `p.indent` |
| 13 | `normalToNoindent` | plain `p.normal` (not fully wrapped in b/i) → `p.noindent` |
| 14 | `mixedInlineToH3` | `p.normal/noindent/indent/bodytext` containing *only* balanced `<b>`+`<i>` combos (no outside text) → `<h3>` |
| 15 | `finalBodytextCleanup` / `mixedBodytextCleanup` | mop-up passes converting any remaining `p.bodytext` → `p.indent` |
| 16 | `formatOutput` | re-indents final HTML: tracks nesting depth of `BLOCK_TAGS` (html/head/body/table/tr/div/section/article/header/footer/nav/ul/ol/blockquote), 2-space indent per depth, preserves `<?xml>`/`<!DOCTYPE>` lines unindented |

Helper functions: `stripBoldTags`, `stripHeadingTags` (strip tags for heading
text extraction), `stripClassAttr`/`rebuildTable` (table reconstruction).

### `replaceEntities(html, format)`
Operates only on text nodes (regex `/(>)([^<]*)(<)/g` — content between tags).
Sorts `entityList` by entity-character length descending (longest match
first, avoids partial overlaps), replaces each occurrence with the chosen
format's value. Handles `&` and `#` replacement **last** (and with negative
lookahead so it doesn't double-encode existing entities like `&amp;` or
`&#123;`). Returns `{result, totalFound, totalReplaced}`.

### `highlightEntities(format)`
After replacement, re-scans output text for entities matching the chosen
format's pattern and calls CodeMirror's `markText` to visually highlight them
(`.entity-highlight` class, yellow background).

## Data Flow

1. Page load → fetch `entities.json` async; init CodeMirror editors; restore
   theme from localStorage.
2. User pastes HTML into input editor.
3. Click "CLEAN →" → `cleanupHtml()` runs 16-step regex pipeline → output
   editor updated → stats bar (original/cleaned size, %, ms) updated →
   entity bar revealed.
4. Optional: pick entity format, click "REPLACE ENTITIES" → `replaceEntities()`
   rewrites text nodes in output → editor briefly unlocked to set value, then
   relocked → matches highlighted → found/replaced counters updated.
5. "Reset Defaults" clears stats and hides entity bar (does not clear editors).
6. Copy/Clear buttons operate on output/input editors respectively.

## Entry Point & Build Process

- **Entry point:** `index.html` — no build step, no bundler, no dev server
  requirement other than something that serves static files (needed only so
  `fetch('entities.json')` isn't blocked by `file://` CORS restrictions).
- Load order: `style.css` → CodeMirror CSS/JS (CDN) → page body → `script.js`
  (defer not used; script is placed at end of `<body>` so DOM exists first).

## Notable Implementation Details / Patterns

- Entire cleanup engine is regex-based string transformation, not a real DOM
  parser — deliberate choice likely for tolerance of malformed/legacy XHTML
  that a strict parser would choke on.
- Pipeline order matters a lot: div-stripping and heading conversions happen
  before p-class reclassification, and multiple "final cleanup" passes exist
  to mop up cases earlier steps miss (e.g. `bodytextToIndent` → 
  `finalBodytextCleanup` → `mixedBodytextCleanup` all target `p.bodytext`).
  Suggests engine was built/patched incrementally against real-world sample
  files rather than designed from a formal spec.
  - Legacy header pattern specifically matches Open eBook (OEB) 1.0.1 DTD —
  strongly implies source documents are exported from an old eBook toolchain.
- Table rebuild (`rebuildTable`) is a small hand-rolled tokenizer/parser
  (tag-splitting via regex, then manual state machine for row/cell), more
  robust than a single regex for nested/malformed table markup.
- Entity replacement carefully orders `&` and `#` substitution last and uses
  negative lookahead to avoid corrupting already-valid entities — a common
  gotcha when writing entity-encoders.
- No persistence of cleaned output — everything is in-memory/DOM only, aside
  from the dark/light theme preference in `localStorage`.
- Copyright footer: "MoPower Information Services Pvt Ltd", 2026.
