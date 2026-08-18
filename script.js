/* ================= Entity list ================= */
let entityList = [];
let entityListReady = false;

fetch('entities.json')
  .then(r => {
    if (!r.ok) throw new Error('HTTP ' + r.status);
    return r.json();
  })
  .then(data => {
    entityList = data;
    entityListReady = true;
    const btn = document.getElementById('replaceEntityBtn');
    if (btn) {
      btn.disabled = false;
      btn.title = entityList.length + ' entities loaded';
    }
    console.log('Entities loaded:', entityList.length);
  })
  .catch(err => {
    console.error('Entity list failed to load:', err);
    const btn = document.getElementById('replaceEntityBtn');
    if (btn) {
      btn.disabled = true;
      btn.title = 'entities.json failed to load - use a local server';
    }
  });

/* ================= CodeMirror editors ================= */
const inputEditor = CodeMirror.fromTextArea(document.getElementById('inputArea'), {
  mode: 'htmlmixed',
  theme: 'dracula',
  lineNumbers: true,
  lineWrapping: true,
  autofocus: true
});

const outputEditor = CodeMirror.fromTextArea(document.getElementById('outputArea'), {
  mode: 'htmlmixed',
  theme: 'dracula',
  lineNumbers: true,
  lineWrapping: true,
  readOnly: true
});

/* ================= Theme toggle ================= */
const themeToggle = document.getElementById("themeToggle");
const themeIcon = document.getElementById("themeIcon");
const savedTheme = localStorage.getItem("cleanup-theme");
if (savedTheme === "dark") {
  document.documentElement.setAttribute("data-theme", "dark");
  themeIcon.src = "static/dark.png";
  themeIcon.alt = "dark";
  inputEditor.setOption('theme', 'dracula');
  outputEditor.setOption('theme', 'dracula');
} else {
  inputEditor.setOption('theme', 'default');
  outputEditor.setOption('theme', 'default');
}

themeToggle.addEventListener("click", () => {
  const isDark = document.documentElement.getAttribute("data-theme") === "dark";
  if (isDark) {
    document.documentElement.removeAttribute("data-theme");
    themeIcon.src = "static/light.png";
    themeIcon.alt = "light";
    localStorage.setItem("cleanup-theme", "light");
  } else {
    document.documentElement.setAttribute("data-theme", "dark");
    themeIcon.src = "static/dark.png";
    themeIcon.alt = "dark";
    localStorage.setItem("cleanup-theme", "dark");
  }
  const nowDark = !isDark;
  inputEditor.setOption('theme', nowDark ? 'dracula' : 'default');
  outputEditor.setOption('theme', nowDark ? 'dracula' : 'default');
});

/* ================= UI wiring ================= */
const convertBtn = document.getElementById("convertBtn");
const copyBtn = document.getElementById("copyBtn");
const clearBtn = document.getElementById("clearBtn");

function formatBytes(n) {
  return n < 1024 ? n + " B" : (n / 1024).toFixed(1) + " KB";
}

function updateInputStats() {
  const el = document.getElementById('inputStats');
  if (!el) return;
  const val = inputEditor.getValue();
  const lines = val.split('\n').length;
  const chars = val.length;
  const size = (new Blob([val]).size / 1024).toFixed(2);
  el.textContent = 'Lines: ' + lines + '  Characters: ' + chars + '  Size: ' + size + ' KB';
}

function updateOutputStats() {
  const el = document.getElementById('outputStats');
  if (!el) return;
  const val = outputEditor.getValue();
  const lines = val.split('\n').length;
  const chars = val.length;
  const size = (new Blob([val]).size / 1024).toFixed(2);
  el.textContent = 'Lines: ' + lines + '  Characters: ' + chars + '  Size: ' + size + ' KB';
}

inputEditor.on('change', () => updateInputStats());
outputEditor.on('change', () => updateOutputStats());
updateInputStats();
updateOutputStats();

convertBtn.addEventListener("click", () => {
  const input = inputEditor.getValue();
  const start = performance.now();
  const output = cleanupHtml(input);
  const elapsed = performance.now() - start;
  outputEditor.setValue(output);

  const originalBytes = new Blob([input]).size;
  const cleanedBytes = new Blob([output]).size;
  const reduction = originalBytes > 0
    ? (((originalBytes - cleanedBytes) / originalBytes) * 100).toFixed(1)
    : "0.0";

  document.getElementById("statOriginal").textContent = formatBytes(originalBytes);
  document.getElementById("statCleaned").textContent = formatBytes(cleanedBytes);
  document.getElementById("statReduction").textContent = reduction + "%";
  document.getElementById("statTime").textContent = elapsed.toFixed(1) + " ms";

  document.getElementById("entityBar").style.display = "flex";
});

/* ================= Entity replacement ================= */
function replaceEntities(html, format) {
  const sorted = [...entityList].sort(
    (a, b) => (b['Entity Name'] || '').length - (a['Entity Name'] || '').length
  );

  let totalFound = 0;
  let totalReplaced = 0;

  const result = html.replace(/(>)([^<]*)(<)/g, (match, open, text, close) => {
    let replaced = text;

    for (const entity of sorted) {
      const char = entity['Entity Name'];
      const replacement =
        format === 'decimal' ? entity['Decimal'] :
        format === 'hex'     ? entity['Hexadecimal'] :
                               entity['Character'];

      if (!char || !replacement) continue;
      if (char.includes('<') || char.includes('>')) continue;
      if (char === '&' || char === '#') continue;

      const escaped = char.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const re = new RegExp(escaped, 'g');
      const matches = replaced.match(re);
      if (matches) {
        totalFound += matches.length;
        replaced = replaced.replace(re, replacement);
        totalReplaced += matches.length;
      }
    }

    // Handle & LAST
    const ampReplacement =
      format === 'decimal' ? '&#38;' :
      format === 'hex'     ? '&#x26;' :
                             '&amp;';
    const ampMatches = replaced.match(
      /&(?!#[0-9]+;|#x[0-9a-fA-F]+;|[a-zA-Z][a-zA-Z0-9]*;)/g
    );
    if (ampMatches) {
      totalFound += ampMatches.length;
      replaced = replaced.replace(
        /&(?!#[0-9]+;|#x[0-9a-fA-F]+;|[a-zA-Z][a-zA-Z0-9]*;)/g,
        ampReplacement
      );
      totalReplaced += ampMatches.length;
    }

    // Handle # LAST
    const hashReplacement =
      format === 'decimal' ? '&#35;' :
      format === 'hex'     ? '&#x23;' :
                             '&num;';
    const hashMatches = replaced.match(/#(?![0-9]+;|x[0-9a-fA-F]+;)/g);
    if (hashMatches) {
      totalFound += hashMatches.length;
      replaced = replaced.replace(
        /#(?![0-9]+;|x[0-9a-fA-F]+;)/g,
        hashReplacement
      );
      totalReplaced += hashMatches.length;
    }

    return open + replaced + close;
  });

  return { result, totalFound, totalReplaced };
}

function highlightEntities(format) {
  const pattern =
    format === 'decimal' ? /&#\d+;/g :
    format === 'hex'     ? /&#x[0-9A-Fa-f]+;/g :
                           /&[a-zA-Z]+;/g;

  const doc = outputEditor.getDoc();
  const text = outputEditor.getValue();
  let match;
  while ((match = pattern.exec(text)) !== null) {
    const from = doc.posFromIndex(match.index);
    const to = doc.posFromIndex(match.index + match[0].length);
    doc.markText(from, to, { className: 'entity-highlight' });
  }
}

document.getElementById("resetDefaultsBtn").addEventListener("click", () => {
  document.getElementById("statOriginal").textContent = "0 KB";
  document.getElementById("statCleaned").textContent = "0 KB";
  document.getElementById("statReduction").textContent = "0%";
  document.getElementById("statTime").textContent = "0 ms";
  document.getElementById("statEntitiesFound").textContent = "--";
  document.getElementById("statEntitiesReplaced").textContent = "--";
  document.getElementById("entityBar").style.display = "none";
});

document.getElementById("replaceEntityBtn").addEventListener("click", () => {
  if (!entityListReady) {
    alert('Entity list not loaded yet.');
    return;
  }
  const format = document.getElementById("entityFormat").value;
  const current = outputEditor.getValue();
  const { result, totalFound, totalReplaced } = replaceEntities(current, format);

  outputEditor.setOption('readOnly', false);
  outputEditor.setValue(result);
  outputEditor.setOption('readOnly', true);

  highlightEntities(format);

  document.getElementById('statEntitiesFound').textContent = totalFound;
  document.getElementById('statEntitiesReplaced').textContent = totalReplaced;
});

clearBtn.addEventListener("click", () => {
  inputEditor.setValue("");
  outputEditor.setValue("");
  inputEditor.focus();
});

copyBtn.addEventListener("click", () => {
  const text = outputEditor.getValue();
  if (!text) return;
  navigator.clipboard.writeText(text).then(() => {
    copyBtn.textContent = "Copied!";
    copyBtn.classList.add("copied");
    setTimeout(() => {
      copyBtn.textContent = "Copy";
      copyBtn.classList.remove("copied");
    }, 1500);
  }).catch(() => {
    // Fallback for older browsers / non-secure contexts
    copyBtn.textContent = "Copied!";
    setTimeout(() => (copyBtn.textContent = "Copy"), 1500);
  });
});

/* ================= Cleanup engine ================= */
function cleanupHtml(src) {
  let html = src;

  html = stripDuplicateTags(html);   // 1
  html = stripSpanTags(html);        // 1.5 — strip all span tags, keep content
  html = stripEmptyInlineTags(html); // 1.6 — remove empty <b></b> <i></i>
  html = replaceHeader(html);        // 2
  html = removeEndOfFile(html);      // 3
  html = removeDivTags(html);        // NEW - remove div tags
  html = firstParaToH1(html);        // NEW - first p to h1
  html = boldToH2(html);             // 4
  html = italicToH3(html);           // 5
  html = closeOrphanP(html);         // 7
  html = fixUnbalancedInline(html);  // 8
  html = removeEmptyP(html);         // 9
  html = cleanupTables(html);        // 10
  html = unknownToNoindent(html);    // 10.5 — catch remaining p.unknown
  html = bodytextToIndent(html);     // 11
  html = normalToNoindent(html);     // 12
  html = mixedInlineToH3(html);      // moved here
  html = finalBodytextCleanup(html); // final pass
  html = mixedBodytextCleanup(html); // final pass 2
  html = remainingNormalToNoindent(html); // 15.5 — mop-up remaining p.normal
  html = normalizeWhitespace(html);  // step 15.6 — clean whitespace inside <p>
  html = formatOutput(html);         // 13

  return html;
}

/* ---- 1: strip consecutive duplicate <b>/<i> tags ---- */
function stripDuplicateTags(html) {
  html = html.replace(/(<(b|i)\b[^>]*>)\s*\1/gi, "$1");
  html = html.replace(/(<\/(b|i)>)\s*\1/gi, "$1");
  return html;
}

function stripSpanTags(html) {
  return html.replace(/<span[^>]*>([\s\S]*?)<\/span>/gi, '$1');
}

function stripEmptyInlineTags(html) {
  return html.replace(/<(b|i)>\s*<\/\1>/gi, '');
}

/* ---- 2: header replacement + CSS path ---- */
function replaceHeader(html) {
  const modernHeader =
    '<?xml version="1.0" encoding="utf-8"?>\n' +
    '<!DOCTYPE html>\n' +
    '<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops">';

  const oebHeader = new RegExp(
    '<\\?xml\\s+version="1\\.0"\\s+encoding="UTF-8"\\s*\\?>\\s*' +
    '<!DOCTYPE\\s+html\\s+PUBLIC\\s+"\\+//ISBN\\s+0-9673008-1-9//DTD\\s+OEB\\s+1\\.0\\.1\\s+Document//EN"\\s+' +
    '"http://openebook\\.org/dtds/oeb-1\\.0\\.1/oebdoc101\\.dtd">\\s*' +
    '<html\\s+xmlns="http://openebook\\.org/namespaces/oeb-document/1\\.0/">',
    "i"
  );

  html = html.replace(oebHeader, modernHeader);
  html = html.replace(/href="default\.css"/gi, 'href="../styles/stylesheet.css"');

  return html;
}

/* ---- 3: <endoffile> removal ---- */
function removeEndOfFile(html) {
  html = html.replace(/^[ \t]*<p class="unknown">\s*<endoffile\s*\/?>\s*<\/p>[ \t]*\r?\n?/gim, "");
  html = html.replace(/<p class="unknown">\s*<endoffile\s*\/?>\s*<\/p>/gi, "");
  html = html.replace(/<\/?endoffile\s*\/?>/gi, "");
  return html;
}

/* ---- 16: remove all <div> and </div> tags ---- */
function removeDivTags(html) {
  html = html.replace(/<div\b[^>]*>/gi, '');
  html = html.replace(/<\/div>/gi, '');
  return html;
}

/* ---- 17: first <p> after <body> becomes <h1> ---- */
function firstParaToH1(html) {
  return html.replace(
    /(<body[^>]*>\s*)(?:<div[^>]*>\s*)*(<p\b[^>]*>)([\s\S]*?)(<\/p>)/i,
    (match, body, openP, content, closeP) => {
      const text = content.replace(/<\/?[^>]+>/g, '').trim();
      return body + '<h1 class="h1">' + text + '</h1>';
    }
  );
}

/* ---- HELPER: strip only <b>/</b> tags, preserving surrounding spaces ---- */
function stripBoldTags(s) {
  return s.replace(/<\/?b\b[^>]*>/gi, " ").replace(/\s+/g, " ").trim();
}

/* ---- HELPER: strip <b>/<i> tags for heading conversion ---- */
function stripHeadingTags(s) {
  return s.replace(/<\/?[bi]\b[^>]*>/gi, '').replace(/\s+/g, ' ').trim();
}

/* ---- 4: p.bodytext/normal wholly wrapped in <b>...</b> becomes h2 ---- */
function boldToH2(html) {
  return html.replace(
    /<p\s+class="(?:bodytext|normal)"[^>]*>\s*<b>((?:(?!<\/p>)[\s\S])*?)<\/b>\s*<\/p>/gi,
    (match, content) => {
      const text = stripHeadingTags(content);
      const charCount = text.replace(/<[^>]+>/g, '').length;
      const wordCount = text.replace(/<[^>]+>/g, '').trim().split(/\s+/).length;

      if (charCount <= 75 || wordCount <= 10) {
        return '<h2 class="h2">' + text + '</h2>';
      } else {
        return match;
      }
    }
  );
}

/* ---- 5: p.normal/bodytext wholly wrapped in <i>...</i> becomes h3 ---- */
function italicToH3(html) {
  return html.replace(
    /<p\b[^>]*>\s*(<i>[^<]*(?:<(?!\/i>)[^<]*)*<\/i>)\s*(?:<\/i>\s*)*<\/p>/gi,
    (_m, content) => {
      const text = stripHeadingTags(content);
      return '<h3 class="h3">' + text + '</h3>';
    }
  );
}

/* ---- 6: p.normal containing balanced <i> AND <b> becomes h3 ---- */
function mixedInlineToH3(html) {
  return html.replace(
    /<p\s+class="(?:normal|noindent|indent|bodytext)"[^>]*>((?:(?!<\/p>)[\s\S])*?)<\/p>/gi,
    (match, content) => {
      const count = (re) => (content.match(re) || []).length;
      const hasB = count(/<b\b[^>]*>/gi) > 0;
      const hasI = count(/<i\b[^>]*>/gi) > 0;
      const balancedB = count(/<b\b[^>]*>/gi) === count(/<\/b>/gi);
      const balancedI = count(/<i\b[^>]*>/gi) === count(/<\/i>/gi);
      if (!hasB || !hasI || !balancedB || !balancedI) return match;

      // Remove tag content AND tags to check for plain text OUTSIDE
      const outsideText = content
        .replace(/<i\b[^>]*>[\s\S]*?<\/i>/gi, '')
        .replace(/<b\b[^>]*>[\s\S]*?<\/b>/gi, '')
        .replace(/<[^>]+>/g, '')
        .trim();
      if (outsideText.length > 0) return match;

      const clean = stripHeadingTags(content);
      return '<h3 class="h3">' + clean + '</h3>';
    }
  );
}

/* ---- 7: close orphan <p> before block elements ---- */
function closeOrphanP(html) {
  // Close unclosed <p> before block elements AND before next <p>
  return html.replace(
    /(<p\b[^>]*>(?:(?!<\/p>)[\s\S])*?)(\s*<(?:p\b|h[1-6]\b|table\b|div\b))/gi,
    (match, openP, nextTag) => {
      // Only add </p> if not already closed
      if (openP.match(/<\/p>\s*$/i)) return match;
      return openP + '</p>' + nextTag;
    }
  );
}

/* ---- 8: unbalanced/spanning <b>/<i> — strip only the extra unmatched tags ---- */
function fixUnbalancedInline(html) {
  return html.replace(
    /<p\b([^>]*)>((?:(?!<\/p>)[\s\S])*?)<\/p>/gi,
    (match, attrs, content) => {
      let fixed = content;
      for (const tag of ["b", "i"]) {
        const openRe = new RegExp("<" + tag + "\\b[^>]*>", "gi");
        const closeRe = new RegExp("<\\/" + tag + ">", "gi");
        const opens = (fixed.match(openRe) || []).length;
        const closes = (fixed.match(closeRe) || []).length;

        if (opens > closes) {
          let toRemove = opens - closes;
          fixed = fixed.replace(openRe, (m) => {
            if (toRemove > 0) {
              toRemove--;
              return " ";
            }
            return m;
          });
        } else if (closes > opens) {
          let toRemove = closes - opens;
          const parts = fixed.split(closeRe);
          let rebuilt = parts[0];
          for (let i = 1; i < parts.length; i++) {
            if (toRemove > 0) {
              toRemove--;
              rebuilt += " " + parts[i];
            } else {
              rebuilt += "</" + tag + ">" + parts[i];
            }
          }
          fixed = rebuilt;
        }
      }
      fixed = fixed.replace(/\s+/g, " ").trim();
      if (fixed === content.replace(/\s+/g, " ").trim()) return match;
      return '<p class="normal">' + fixed + "</p>";
    }
  );
}

/* ---- 9: remove empty <p> of any class ---- */
function removeEmptyP(html) {
  const inner = "(?:&nbsp;|\\s)*";
  return html
    .replace(new RegExp('^[ \\t]*<p\\s+class="[^"]*"[^>]*>' + inner + "<\\/p>[ \\t]*\\r?\\n?", "gim"), "")
    .replace(new RegExp('<p\\s+class="[^"]*"[^>]*>' + inner + "<\\/p>", "gi"), "");
}

/* ---- 10: table cleanup ---- */
function cleanupTables(html) {
  // strip <p class="unknown"> wrappers around table-related tags
  html = html.replace(
    /<p\s+class="unknown"[^>]*>\s*(?=<\/?(?:table|tbody|thead|tfoot|tr|td|th)\b)([\s\S]*?)<\/p>/gi,
    "$1"
  );
  html = html.replace(
    /<p\s+class="unknown"[^>]*>((?:(?!<\/p>)[\s\S])*?<\/?(?:table|tr|td|th)\b[\s\S]*?)<\/p>/gi,
    "$1"
  );

  // rebuild every table block (handles missing </td>, </tr>, adds classes, indents)
  html = html.replace(/<table\b[^>]*>[\s\S]*?<\/table>/gi, rebuildTable);
  html = html.replace(/<table\b[^>]*>(?:(?!<\/table>)[\s\S])*$/i, rebuildTable);

  return html;
}

function unknownToNoindent(html) {
  return html.replace(
    /<p\s+class="unknown"[^>]*>([\s\S]*?)<\/p>/gi,
    '<p class="noindent">$1</p>'
  );
}

function stripClassAttr(attrs) {
  return attrs.replace(/\s*class="[^"]*"/gi, "").trim();
}

function rebuildTable(block) {
  const tokens = block.split(/(<[^>]+>)/).filter((t) => t !== "");

  let tableAttrs = "";
  const rows = [];
  let currentRow = null;
  let currentCell = null;

  const closeCell = () => {
    if (currentCell) {
      currentCell.content = currentCell.content.join("").trim();
      currentCell = null;
    }
  };
  const closeRow = () => {
    closeCell();
    if (currentRow) {
      if (currentRow.cells.length) rows.push(currentRow);
      currentRow = null;
    }
  };
  const openRow = (attrs) => {
    closeRow();
    currentRow = { attrs: stripClassAttr(attrs), cells: [] };
  };
  const openCell = (attrs) => {
    closeCell();
    if (!currentRow) openRow("");
    currentCell = { attrs: stripClassAttr(attrs), content: [] };
    currentRow.cells.push(currentCell);
  };

  for (const token of tokens) {
    const tagMatch = token.match(/^<(\/?)(\w+)([^>]*?)\/?>$/);
    if (tagMatch) {
      const closing = tagMatch[1] === "/";
      const name = tagMatch[2].toLowerCase();
      const attrs = tagMatch[3] || "";

      if (name === "table") {
        if (!closing) tableAttrs = stripClassAttr(attrs);
        else closeRow();
      } else if (name === "tbody" || name === "thead" || name === "tfoot") {
        // structural noise, skip
      } else if (name === "tr") {
        if (closing) closeRow();
        else openRow(attrs);
      } else if (name === "td" || name === "th") {
        if (closing) closeCell();
        else openCell(attrs);
      } else {
        if (currentCell) currentCell.content.push(token);
      }
    } else {
      if (currentCell) currentCell.content.push(token);
    }
  }
  closeRow();

  const attr = (a) => (a ? " " + a : "");
  const lines = [];
  lines.push('<table class="tbody"' + attr(tableAttrs) + ">");
  for (const row of rows) {
    lines.push('  <tr class="tr"' + attr(row.attrs) + ">");
    for (const cell of row.cells) {
      lines.push('    <td class="td">' + cell.content + "</td>");
    }
    lines.push("  </tr>");
  }
  lines.push("</table>");
  return lines.join("\n");
}

/* ---- 11: plain bodytext (no b/i) becomes indent ---- */
function bodytextToIndent(html) {
  return html.replace(
    /<p\s+class="bodytext"([^>]*)>([\s\S]*?)<\/p>/gi,
    (match, attrs, content) => {
      const trimmed = content.trim();
      // Only skip if content STARTS with <b> or <i> tag (heading pattern)
      if (/^<b\b/i.test(trimmed) || /^<i\b/i.test(trimmed)) return match;
      return '<p class="indent"' + attrs + '>' + content + '</p>';
    }
  );
}

/* ---- 12: plain normal (no b/i) becomes noindent ---- */
function normalToNoindent(html) {
  return html.replace(
    /<p\s+class="normal"([^>]*)>([\s\S]*?)<\/p>/gi,
    (match, attrs, content) => {
      const trimmed = content.trim();
      // Skip ONLY if entire content is wrapped in <b> or <i>
      // i.e. starts with tag AND ends with closing tag (pure heading pattern)
      const pureI = /^<i\b[^>]*>[\s\S]*<\/i>$/i.test(trimmed);
      const pureB = /^<b\b[^>]*>[\s\S]*<\/b>$/i.test(trimmed);
      if (pureI || pureB) return match;
      return '<p class="noindent"' + attrs + '>' + content + '</p>';
    }
  );
}

function finalBodytextCleanup(html) {
  // After all rules, any remaining <p class="bodytext">
  // that doesn't start with <b> or <i> → convert to <p class="indent">
  return html.replace(
    /<p\s+class="bodytext"([^>]*)>([\s\S]*?)<\/p>/gi,
    (match, attrs, content) => {
      const trimmed = content.trim();
      if (/^<b\b/i.test(trimmed) || /^<i\b/i.test(trimmed)) return match;
      return '<p class="indent"' + attrs + '>' + content + '</p>';
    }
  );
}

function mixedBodytextCleanup(html) {
  return html.replace(
    /<p\s+class="bodytext"([^>]*)>([\s\S]*?)<\/p>/gi,
    (_match, attrs, content) => {
      return '<p class="indent"' + attrs + '>' + content + '</p>';
    }
  );
}

function remainingNormalToNoindent(html) {
  return html.replace(
    /<p\s+class="normal"[^>]*>([\s\S]*?)<\/p>/gi,
    '<p class="noindent">$1</p>'
  );
}

function normalizeWhitespace(html) {
  return html.replace(/(<p[^>]*>)([\s\S]*?)(<\/p>)/gi, function(match, open, content, close) {
    content = content.replace(/\t+/g, ' ');     // tabs → space
    content = content.replace(/ {2,}/g, ' ');   // multiple spaces → single space
    content = content.trim();                    // trim ends
    return open + content + close;
  });
}

/* ---- 13: clean indentation of final HTML ---- */
const BLOCK_TAGS = new Set([
  "html", "head", "body", "table", "tr", "div", "section",
  "article", "header", "footer", "nav", "ul", "ol", "blockquote"
]);

function formatOutput(html) {
  const rawLines = html.split(/\r?\n/);
  const out = [];
  let depth = 0;

  for (let line of rawLines) {
    line = line.trim();
    if (line === "") continue;

    let opens = 0;
    let closes = 0;
    let leadingClose = false;
    const tagRe = /<(\/?)([a-zA-Z][\w:-]*)[^>]*?(\/?)>/g;
    let m;
    let first = true;
    while ((m = tagRe.exec(line)) !== null) {
      const closing = m[1] === "/";
      const name = m[2].toLowerCase();
      const selfClosed = m[3] === "/";
      if (!BLOCK_TAGS.has(name) || selfClosed) {
        first = false;
        continue;
      }
      if (closing) {
        closes++;
        if (first && line.indexOf(m[0]) === 0) leadingClose = true;
      } else {
        opens++;
      }
      first = false;
    }

    out.push(line);
  }

  return out.join("\n");
}
