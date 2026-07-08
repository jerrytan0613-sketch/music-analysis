const fs = require("fs");
const path = require("path");

const ROOT = path.resolve(__dirname, "..");
const mdPath = path.join(ROOT, "report", "report.md");
const htmlPath = path.join(ROOT, "report", "report.html");

// ── inline markdown → html ──
function inlineHtml(t) {
  t = t.replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" loading="lazy">');
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank">$1</a>');
  t = t.replace(/`([^`]+)`/g, "<code>$1</code>");
  t = t.replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>");
  t = t.replace(/(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)/g, "<em>$1</em>");
  return t;
}

function escapeHtml(t) {
  return t.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function slugify(t) {
  return t.toLowerCase().replace(/[^\w\u4e00-\u9fff]+/g, "-").replace(/^-+|-+$/g, "");
}

// ── block-level parser ──
function mdToHtml(md) {
  const lines = md.split("\n");
  const out = [];
  let inCode = false, inTable = false, inUl = false, inOl = false;
  let codeBuf = [], tableAlign = [];

  const flushCode = () => {
    if (codeBuf.length) {
      out.push(`<pre><code>${escapeHtml(codeBuf.join("\n"))}</code></pre>`);
      codeBuf = [];
    }
  };
  const flushTable = () => {
    if (inTable) { out.push("</tbody></table>"); inTable = false; }
  };
  const flushList = () => {
    if (inUl) { out.push("</ul>"); inUl = false; }
    if (inOl) { out.push("</ol>"); inOl = false; }
  };

  for (const raw of lines) {
    const s = raw.trim();

    // code block
    if (s.startsWith("```")) {
      if (inCode) { flushCode(); inCode = false; }
      else { flushTable(); flushList(); inCode = true; }
      continue;
    }
    if (inCode) { codeBuf.push(raw); continue; }

    // blank
    if (!s) { flushCode(); flushTable(); flushList(); out.push("<br>"); continue; }

    // hr
    if (/^-{3,}$/.test(s) || /^\*{3,}$/.test(s)) { flushTable(); flushList(); out.push("<hr>"); continue; }

    // table
    if (s.startsWith("|") && s.endsWith("|")) {
      const cells = s.slice(1, -1).split("|").map(c => c.trim());
      // separator row
      if (/^[-:| ]+$/.test(s.replace(/\|/g, "").trim())) {
        tableAlign = cells.map(c => {
          const l = c.startsWith(":"), r = c.endsWith(":");
          return l && r ? "center" : r ? "right" : "left";
        });
        continue;
      }
      if (!inTable) {
        out.push('<div class="table-wrap"><table><thead><tr>');
        cells.forEach((c, i) => {
          const a = i < tableAlign.length ? ` style="text-align:${tableAlign[i]}"` : "";
          out.push(`<th${a}>${inlineHtml(c)}</th>`);
        });
        out.push("</tr></thead><tbody>");
        inTable = true;
      } else {
        out.push("<tr>");
        cells.forEach((c, i) => {
          const a = i < tableAlign.length ? ` style="text-align:${tableAlign[i]}"` : "";
          out.push(`<td${a}>${inlineHtml(c)}</td>`);
        });
        out.push("</tr>");
      }
      continue;
    }
    flushTable();

    // heading
    const hm = s.match(/^(#{1,3})\s+(.+)$/);
    if (hm) {
      flushList();
      const lv = hm[1].length;
      const txt = inlineHtml(hm[2]);
      const id = lv === 2 ? ` id="${slugify(hm[2])}"` : "";
      out.push(`<h${lv}${id}>${txt}</h${lv}>`);
      continue;
    }

    // ordered list
    const om = s.match(/^\d+\.\s+(.+)$/);
    if (om) {
      if (!inOl) { flushList(); out.push("<ol>"); inOl = true; }
      out.push(`<li>${inlineHtml(om[1])}</li>`);
      continue;
    }
    if (inOl) { out.push("</ol>"); inOl = false; }

    // unordered list
    if (s.startsWith("- ") || s.startsWith("* ")) {
      if (!inUl) { flushList(); out.push("<ul>"); inUl = true; }
      out.push(`<li>${inlineHtml(s.slice(2))}</li>`);
      continue;
    }
    if (inUl) { out.push("</ul>"); inUl = false; }

    // blockquote
    if (s.startsWith(">")) {
      out.push(`<blockquote>${inlineHtml(s.slice(1).trim())}</blockquote>`);
      continue;
    }

    // standalone image
    const im = s.match(/^!\[([^\]]*)\]\(([^)]+)\)\s*$/);
    if (im) {
      out.push(`<figure><img src="${im[2]}" alt="${im[1]}" loading="lazy"><figcaption>${im[1]}</figcaption></figure>`);
      continue;
    }

    // paragraph
    out.push(`<p>${inlineHtml(s)}</p>`);
  }

  flushCode(); flushTable(); flushList();
  return out.join("\n");
}

// ── TOC ──
function buildToc(md) {
  const items = [];
  for (const line of md.split("\n")) {
    const m = line.trim().match(/^##\s+(.+)$/);
    if (m) {
      const title = m[1].trim();
      items.push(`<li><a href="#${slugify(title)}">${title}</a></li>`);
    }
  }
  if (!items.length) return "";
  return `<nav class="toc"><h2>目录</h2><ul>${items.join("\n")}</ul></nav>`;
}

// ── TEMPLATE (Spotify-inspired black & green) ──
function template(title, subtitle, toc, content, genTime) {
  return `<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>${title}</title>
<link rel="preconnect" href="https://fonts.googleapis.com">
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin>
<link href="https://fonts.googleapis.com/css2?family=Inter:opsz,wght@14..32,400;14..32,500;14..32,600;14..32,700;14..32,800;14..32,900&display=swap" rel="stylesheet">
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css" id="hljs-theme">
<style>
  :root {
    --bg: #121212;
    --bg-alt: #1A1A1A;
    --bg-card: #181818;
    --bg-hover: #282828;
    --text: #FFFFFF;
    --text-secondary: #B3B3B3;
    --text-dim: #727272;
    --accent: #1DB954;
    --accent-hover: #1ED760;
    --accent-dim: #169C46;
    --border: #333333;
    --shadow: 0 4px 12px rgba(0,0,0,0.4);
    --shadow-lg: 0 8px 30px rgba(0,0,0,0.6);
    --radius: 12px;
    --radius-sm: 8px;
    --max-w: 960px;
    --font-sans: "Inter", -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif;
    --font-mono: "JetBrains Mono", "Fira Code", "SF Mono", Menlo, Consolas, monospace;
    --space-unit: 8px;
    --space-card: 24px;
    --space-section: 120px;
  }
  [data-theme="light"] {
    --bg: #FFFFFF;
    --bg-alt: #F5F5F5;
    --bg-card: #FAFAFA;
    --bg-hover: #EEEEEE;
    --text: #1A1A1A;
    --text-secondary: #666666;
    --text-dim: #999999;
    --accent: #1DB954;
    --accent-hover: #169C46;
    --accent-dim: #1DB954;
    --border: #E0E0E0;
    --shadow: 0 2px 8px rgba(0,0,0,0.08);
    --shadow-lg: 0 4px 20px rgba(0,0,0,0.1);
  }

  /* ── Reset & Base ── */
  * { margin: 0; padding: 0; box-sizing: border-box; }
  html { scroll-behavior: smooth; }

  body {
    font-family: var(--font-sans);
    background: var(--bg);
    color: var(--text);
    font-size: 16px;
    font-weight: 400;
    line-height: 1.8;
    transition: background .3s ease, color .3s ease;
    -webkit-font-smoothing: antialiased;
    -moz-osx-font-smoothing: grayscale;
  }

  a {
    color: var(--accent);
    text-decoration: none;
    transition: color .15s;
    font-weight: 500;
  }
  a:hover { color: var(--accent-hover); text-decoration: underline; }

  /* ── Header / Hero ── */
  .page-header {
    background: linear-gradient(180deg, #000000 0%, var(--bg) 100%);
    padding: 120px 24px 100px;
    text-align: center;
    position: relative;
    border-bottom: 1px solid var(--border);
  }
  .page-header::before {
    content: '';
    position: absolute;
    top: 0; left: 50%; transform: translateX(-50%);
    width: 2px; height: 64px;
    background: linear-gradient(180deg, var(--accent), transparent);
  }
  .page-header h1 {
    font-size: clamp(42px, 5.5vw, 72px);
    font-weight: 800;
    line-height: 1.1;
    letter-spacing: -2px;
    max-width: 800px;
    margin: 0 auto;
    background: linear-gradient(135deg, #FFFFFF 30%, var(--accent) 100%);
    -webkit-background-clip: text;
    -webkit-text-fill-color: transparent;
    background-clip: text;
  }
  .page-header p {
    color: var(--text-secondary);
    font-size: 18px;
    font-weight: 500;
    margin-top: 20px;
    letter-spacing: -0.01em;
    max-width: 600px;
    margin-left: auto;
    margin-right: auto;
  }

  /* ── Theme Toggle ── */
  .dark-toggle {
    position: absolute;
    top: 32px;
    right: 32px;
    background: var(--bg-alt);
    border: 1px solid var(--border);
    color: var(--text-secondary);
    width: 44px;
    height: 44px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 18px;
    font-weight: 500;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: all .2s;
  }
  .dark-toggle:hover {
    background: var(--bg-hover);
    color: var(--text);
    border-color: var(--accent);
  }

  /* ── Container ── */
  .container {
    max-width: var(--max-w);
    margin: 0 auto;
    padding: 80px 24px 120px;
  }

  /* ── TOC ── */
  .toc {
    background: var(--bg-card);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: var(--space-card) 28px;
    margin-bottom: var(--space-section);
    box-shadow: var(--shadow);
  }
  .toc h2 {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    color: var(--accent);
    opacity: 0.7;
    margin-bottom: 16px;
    border: none;
    padding: 0;
  }
  .toc ul { list-style: none; padding: 0; column-count: 2; column-gap: 32px; }
  .toc li { break-inside: avoid; margin-bottom: 4px; }
  .toc a {
    display: inline-block;
    font-size: 14px;
    font-weight: 400;
    color: var(--text-secondary);
    padding: 6px 0;
    border-bottom: 1px solid transparent;
    transition: color .15s, border-color .15s;
  }
  .toc a:hover {
    color: var(--accent);
    border-bottom-color: var(--accent);
    text-decoration: none;
  }
  @media (max-width: 640px) { .toc ul { column-count: 1; } }

  /* ── H1 (inside report body) ── */
  .container h1 {
    font-size: 48px;
    font-weight: 700;
    line-height: 1.15;
    letter-spacing: -1px;
    margin: 0 0 24px 0;
    padding: 0;
    border: none;
    color: var(--text);
  }
  .container h1:first-of-type { margin-top: 0; }

  /* ── H2 (Section Title) ── */
  .container h2 {
    font-size: 42px;
    font-weight: 700;
    line-height: 1.2;
    letter-spacing: -0.5px;
    margin: var(--space-section) 0 24px 0;
    padding: 0 0 0 0;
    border: none;
    color: var(--text);
    scroll-margin-top: 32px;
  }
  .container h2::after {
    content: '';
    display: block;
    width: 64px;
    height: 3px;
    background: var(--accent);
    margin-top: 16px;
    border-radius: 2px;
  }
  .container h2:first-of-type { margin-top: 0; }

  /* ── H3 (Card Title) ── */
  .container h3 {
    font-size: 24px;
    font-weight: 700;
    line-height: 1.3;
    letter-spacing: -0.01em;
    margin: 40px 0 16px 0;
    color: var(--text);
  }

  /* ── Body Text ── */
  .container p {
    font-size: 16px;
    font-weight: 400;
    line-height: 1.8;
    margin: 16px 0;
    color: var(--text);
  }

  /* ── Small Text (used by list items, secondary info) ── */
  .container li {
    font-size: 14px;
    font-weight: 400;
    line-height: 1.7;
    margin: 6px 0;
  }
  .container li::marker { color: var(--accent); }

  /* ── Tables ── */
  .table-wrap {
    overflow-x: auto;
    margin: 32px 0;
    border-radius: var(--radius);
    border: 1px solid var(--border);
  }
  table {
    width: 100%;
    border-collapse: collapse;
  }
  th {
    font-size: 12px;
    font-weight: 600;
    text-transform: uppercase;
    letter-spacing: 1px;
    opacity: 0.7;
    color: var(--accent);
    background: var(--bg-alt);
    padding: 14px 18px;
    text-align: left;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  td {
    font-size: 14px;
    font-weight: 400;
    padding: 12px 18px;
    text-align: left;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }
  tr:last-child td { border-bottom: none; }
  tr:hover td { background: var(--bg-hover); }

  /* ── Figures & Images ── */
  figure {
    margin: 48px 0;
    text-align: center;
    background: var(--bg-card);
    border-radius: var(--radius);
    padding: var(--space-card);
    border: 1px solid var(--border);
    box-shadow: var(--shadow);
  }
  img {
    max-width: 100%;
    height: auto;
    border-radius: var(--radius-sm);
    display: block;
    margin: 0 auto;
  }
  figcaption {
    margin-top: 16px;
    font-size: 12px;
    font-weight: 400;
    text-transform: uppercase;
    letter-spacing: 1px;
    opacity: 0.7;
    color: var(--text-dim);
  }

  /* ── Code ── */
  code {
    font-family: var(--font-mono);
    background: var(--bg-alt);
    padding: 3px 8px;
    border-radius: 4px;
    font-size: 0.88em;
    border: 1px solid var(--border);
    color: var(--accent);
    font-weight: 500;
  }
  pre {
    background: #0A0A0A;
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 24px 28px;
    overflow-x: auto;
    margin: 32px 0;
    box-shadow: var(--shadow);
  }
  pre code {
    background: none;
    border: none;
    padding: 0;
    font-size: 14px;
    font-weight: 400;
    line-height: 1.7;
    color: var(--text);
  }

  /* ── Blockquote ── */
  blockquote {
    border-left: 3px solid var(--accent);
    background: var(--bg-card);
    padding: 16px 24px;
    margin: 24px 0;
    border-radius: 0 var(--radius-sm) var(--radius-sm) 0;
    color: var(--text-secondary);
    font-style: italic;
    font-size: 16px;
    font-weight: 400;
    line-height: 1.7;
  }

  /* ── Lists ── */
  ul, ol { margin: 12px 0 12px 28px; }

  /* ── HR ── */
  hr {
    border: none;
    height: 1px;
    background: linear-gradient(90deg, transparent, var(--border), transparent);
    margin: 64px 0;
  }

  /* ── Footer ── */
  .page-footer {
    text-align: center;
    padding: 48px 24px;
    color: var(--text-dim);
    font-size: 14px;
    font-weight: 400;
    border-top: 1px solid var(--border);
    margin-top: 0;
  }
  .page-footer strong { color: var(--accent); font-weight: 600; }

  /* ── Responsive ── */
  @media (max-width: 768px) {
    .page-header { padding: 80px 20px 64px; }
    .page-header h1 { font-size: 42px; letter-spacing: -1px; }
    .page-header p { font-size: 16px; }
    .container { padding: 48px 16px 80px; }
    .container h1 { font-size: 36px; }
    .container h2 { font-size: 32px; margin-top: 80px; }
    .container h3 { font-size: 20px; }
    figure { padding: 16px; margin: 32px 0; }
    pre { padding: 16px 18px; }
    th, td { padding: 10px 12px; font-size: 13px; }
  }

  @media (max-width: 480px) {
    .page-header { padding: 60px 16px 48px; }
    .page-header h1 { font-size: 32px; }
    .container h1 { font-size: 28px; }
    .container h2 { font-size: 26px; margin-top: 60px; }
    .container h3 { font-size: 18px; }
    .dark-toggle { top: 16px; right: 16px; width: 40px; height: 40px; }
  }

  /* ── Fade-in Animation ── */
  @keyframes fadeIn {
    from { opacity: 0; transform: translateY(16px); }
    to { opacity: 1; transform: translateY(0); }
  }
  .container > * { animation: fadeIn .5s ease both; }
  .container > *:nth-child(2) { animation-delay: .08s; }
  .container > *:nth-child(3) { animation-delay: .16s; }
</style>
</head>
<body>
<header class="page-header">
  <button class="dark-toggle" onclick="toggleDark()" aria-label="Toggle theme" id="darkBtn">&#x2600;&#xFE0F;</button>
  <h1>${title}</h1>
  <p>${subtitle}</p>
</header>
<div class="container">
  ${toc}
  ${content}
</div>
<footer class="page-footer">
  <p>生成时间: ${genTime} &mdash; 数据来源: Spotify / Billboard &mdash; Music Analysis Pipeline</p>
</footer>
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
<script>
  hljs.highlightAll();

  const STORAGE_KEY = "ma-theme";
  const btn = document.getElementById("darkBtn");
  const hlTheme = document.getElementById("hljs-theme");

  function getTheme() { return localStorage.getItem(STORAGE_KEY) || "dark"; }
  function applyTheme(t) {
    document.documentElement.setAttribute("data-theme", t);
    btn.textContent = t === "light" ? "\\u{1F319}" : "\\u2600\\uFE0F";
    hlTheme.href = "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github" +
      (t === "dark" ? "-dark" : "") + ".min.css";
    localStorage.setItem(STORAGE_KEY, t);
  }
  function toggleDark() { applyTheme(getTheme() === "dark" ? "light" : "dark"); }

  const saved = getTheme();
  applyTheme(saved);
</script>
</body>
</html>`;
}

// ── main ──
const md = fs.readFileSync(mdPath, "utf8");
const content = mdToHtml(md);
const toc = buildToc(md);
const now = new Date().toISOString().slice(0, 19).replace("T", " ");
const html = template(
  "音乐平台热歌榜数据探索与可视化分析报告",
  "基于 Spotify / Billboard 公开数据集的多维分析与可视化",
  toc,
  content,
  now
);
fs.writeFileSync(htmlPath, html, "utf8");
console.log(`[SUCCESS] ${htmlPath} (${(html.length / 1024).toFixed(0)} KB)`);
