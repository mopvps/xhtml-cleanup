# HTML Cleaner — Project Documentation

## Overview & Purpose

Client-only web tool that cleans messy/legacy HTML (mainly eBook/OEB-style markup)
into normalized, semantically-tagged HTML, plus a separate feature to replace
special characters with HTML entities (decimal / hex / named). Built for
MoPower Information Services — used in eBook/publishing production pipeline
to clean scraped or converted HTML before further processing.

No backend, no build step. Open `index.html` in browser (or serve locally —
required for `entities.json` fetch to work due to CORS on `file://`).

## Tech Stack & Dependencies

- Vanilla HTML/CSS/JS, no framework, no bundler.
- **CodeMirror 5.65.16** (CDN, cdnjs) — code editor widgets for input/output
  panes. Modes: `xml`, `htmlmixed`. Themes: `dracula` (dark), `default` (light).
- `entities.json` — local data file, fetched via `fetch()` at runtime.
- No package.json / npm / build tooling of any kind.
- Git repo present (`.git/`), branch `main`, remote `origin`.

## File Structure

```
Code/
├── index.html        entry point, page markup, CDN links
├── style.css          all styling (CSS vars, light/dark theme)
├── script.js          all logic: cleanup engine, entity replace, UI wiring
├── entities.json       entity records (decimal/hex/named/char)
├── project.md          this file
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
   click round "CLEAN →" button, get normalized HTML in right pane.
   Shows original/cleaned size, % reduction, processing time (ms).
2. **Entity replacement** — after cleaning, bar appears letting you convert
   special characters in output into entities, one of 3 formats
   (decimal/hex/named), with found/replaced counter and yellow highlight
   of replaced spans in output editor.
3. **Theme toggle** — light/dark, persisted in `localStorage` key
   `cleanup-theme`; also swaps CodeMirror theme (`default` ↔ `dracula`).
4. **Copy / Clear** controls with feedback state ("Copied!").
5. **Live stats** — input/output panes show live Lines/Characters/Size as
   you type (via CodeMirror `change` event).

## Key Modules (script.js)

### Entity loading
Fetches `entities.json` on page load into `entityList`; disables
"REPLACE ENTITIES" button with explanatory tooltip if load fails
(e.g. opened via `file://` without local server).

### CodeMirror setup
Two editors bound to `#inputArea` / `#outputArea` textareas — `inputEditor`
(editable) and `outputEditor` (readOnly, briefly unlocked during entity
replacement to update content, then relocked).

### Theme toggle
Reads/writes `data-theme="dark"` attribute on `<html>`, swaps icon image and
CodeMirror theme, persists choice.

### `cleanupHtml(src)` — the pipeline

Runs these transforms in sequence, each pure string→string regex-based
function (order matters — later steps depend on earlier ones):

| # | Function | Purpose |
|---|----------|---------|
| 1 | `stripDuplicateTags` | collapse consecutive duplicate `<b>`/`<i>` open or close tags |
| 2 | `replaceHeader` | rewrite legacy OEB 1.0.1 doctype/xmlns header to modern XHTML doctype; repoint `default.css` to `../styles/stylesheet.css` |
| 3 | `removeEndOfFile` | strip `<endoffile/>` markers (wrapped or bare) |
| 4 | `removeDivTags` | strip all `<div>`/`</div>` tags (unwraps content) |
| 5 | `firstParaToH1` | first `<p>` right after `<body>` (skipping leading `<div>`s) becomes `<h1 class="h1">` (tags stripped, text only) |
| 6 | `boldToH2` | short (≤75 chars or ≤10 words) `<p class="bodytext/normal">` wholly wrapped in `<b>` becomes `<h2 class="h2">` |
| 7 | `italicToH3` | `<p>` wholly wrapped in `<i>` becomes `<h3 class="h3">` |
| 8 | `closeOrphanP` | auto-closes unclosed `<p>` before next block tag (`p`/`h1-6`/`table`/`div`) |
| 9 | `fixUnbalancedInline` | rebalances mismatched `<b>`/`<i>` open/close counts inside a `<p>` by stripping extras; downgrades that `<p>`'s class to `"normal"` |
| 10 | `removeEmptyP` | deletes empty `<p class="...">` (incl. `&nbsp;`-only) of any class |
| 11 | `cleanupTables` | unwraps `<p class="unknown">` around table tags; rebuilds every `<table>` via `rebuildTable` (parses tag stream, normalizes to `<table class="tbody">`/`<tr class="tr">`/`<td class="td">`, strips old classes, re-indents) |
| 11.5 | `unknownToNoindent` | catches any remaining `<p class="unknown">` (not table-related) → `<p class="noindent">` |
| 12 | `bodytextToIndent` | plain `p.bodytext` (content not *starting* with `<b>`/`<i>`) → `p.indent` |
| 13 | `normalToNoindent` | plain `p.normal` (content not *wholly wrapped* in `<b>`/`<i>`) → `p.noindent` |
| 14 | `mixedInlineToH3` | `p.normal/noindent/indent/bodytext` containing *only* balanced `<b>`+`<i>` combos (no outside text) → `<h3>` |
| 15 | `finalBodytextCleanup` | mop-up: any remaining `p.bodytext` not starting with `<b>`/`<i>` → `p.indent` |
| 15.1 | `mixedBodytextCleanup` | second mop-up: **any** remaining `p.bodytext` (regardless of content) → `p.indent` |
| 15.5 | `remainingNormalToNoindent` | final mop-up: **any** remaining `p.normal` (regardless of content) → `p.noindent` |
| 16 | `formatOutput` | re-indents final HTML: tracks nesting depth of `BLOCK_TAGS` (html/head/body/table/tr/div/section/article/header/footer/nav/ul/ol/blockquote), 2-space indent per depth, preserves `<?xml>`/`<!DOCTYPE>` lines unindented |

Helper functions: `stripBoldTags`, `stripHeadingTags` (strip tags for heading
text extraction), `stripClassAttr`/`rebuildTable` (table reconstruction).

Note: step numbering in code comments (`// NEW`, `// moved here`, `// 10.5`,
`// 15.5`) reflects incremental patching history — `removeDivTags` and
`firstParaToH1` were inserted between original steps 3 and 4; `mixedInlineToH3`
was moved to run after class-reclassification steps rather than with the
other heading-conversion steps.

### `replaceEntities(html, format)`
Operates only on text nodes (regex `/(>)([^<]*)(<)/g` — content between tags).
Sorts `entityList` by entity-character length descending (longest match
first, avoids partial overlaps), replaces each occurrence with chosen
format's value. Handles `&` and `#` replacement **last** (with negative
lookahead so it doesn't double-encode existing entities like `&amp;` or
`&#123;`). Returns `{result, totalFound, totalReplaced}`.

### `highlightEntities(format)`
After replacement, re-scans output text for entities matching chosen
format's pattern and calls CodeMirror's `markText` to visually highlight them
(`.entity-highlight` class, yellow background).

## Data Flow

1. Page load → fetch `entities.json` async; init CodeMirror editors; restore
   theme from localStorage; wire live stats listeners.
2. User pastes HTML into input editor (stats update live on `change`).
3. Click "CLEAN →" → `cleanupHtml()` runs 18-step regex pipeline (16 numbered
   + 2 mop-up sub-steps) → output editor updated → stats bar
   (original/cleaned size, %, ms) updated → entity bar revealed.
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
  (defer not used; script placed at end of `<body>` so DOM exists first).

## Notable Implementation Details / Patterns

- Entire cleanup engine is regex-based string transformation, not a real DOM
  parser — deliberate choice for tolerance of malformed/legacy XHTML that a
  strict parser would choke on.
- Pipeline order matters heavily: div-stripping and heading conversions
  happen before p-class reclassification; multiple mop-up passes exist to
  catch cases earlier steps miss (`bodytextToIndent` → `finalBodytextCleanup`
  → `mixedBodytextCleanup` all target `p.bodytext`; `normalToNoindent` →
  `remainingNormalToNoindent` both target `p.normal`). Suggests engine was
  built/patched incrementally against real-world sample files rather than
  designed from a formal spec — code comments explicitly mark inserted
  (`// NEW`), renumbered (`// 10.5`, `// 15.5`), and relocated
  (`// moved here`) steps.
- Legacy header pattern specifically matches Open eBook (OEB) 1.0.1 DTD —
  strongly implies source documents are exported from an old eBook toolchain.
- Table rebuild (`rebuildTable`) is a small hand-rolled tokenizer/parser
  (tag-splitting via regex, then manual state machine for row/cell), more
  robust than a single regex for nested/malformed table markup.
- Entity replacement carefully orders `&` and `#` substitution last and uses
  negative lookahead to avoid corrupting already-valid entities — a common
  gotcha when writing entity-encoders.
- `fixUnbalancedInline` downgrades any `<p>` it touches to `class="normal"`,
  meaning such paragraphs then flow through the later normal→noindent
  mop-up steps rather than keeping their original class.
- No persistence of cleaned output — everything is in-memory/DOM only, aside
  from dark/light theme preference in `localStorage`.
- Copyright footer: "MoPower Information Services Pvt Ltd", 2026.
