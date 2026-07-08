"""
===============================================================================
《音乐平台热歌榜数据探索与可视化分析》
阶段五：报告生成
===============================================================================
功能说明：
  1. 读取 report.md + analysis_summary.json（可选）
  2. 将 Markdown 解析为 HTML
  3. 自动生成目录、深色模式、代码高亮
  4. 输出 report/report.html
===============================================================================
"""

import json
import re
import sys
from pathlib import Path
from datetime import datetime

PROJECT_ROOT = Path(__file__).resolve().parent.parent
REPORT_DIR = PROJECT_ROOT / "report"
FIGURES_DIR = REPORT_DIR / "figures"
DATA_AI_DIR = PROJECT_ROOT / "data" / "ai"
REPORT_DIR.mkdir(parents=True, exist_ok=True)


# ==================================================================
# Markdown → HTML 解析器
# ==================================================================

class MarkdownParser:
    """将 Markdown 文本逐行解析为 HTML。"""

    def to_html(self, md: str) -> str:
        html_parts = []
        in_code = False
        in_table = False
        in_ol = False
        in_ul = False
        code_buffer = []
        table_align = []

        def _flush_code():
            nonlocal code_buffer
            if code_buffer:
                code = "\n".join(code_buffer)
                html_parts.append(f'<pre><code class="language-python">{_escape_html(code)}</code></pre>')
                code_buffer = []

        def _flush_table():
            nonlocal in_table
            if in_table:
                html_parts.append("</tbody></table>")
                in_table = False

        def _flush_list():
            nonlocal in_ul, in_ol
            if in_ul:
                html_parts.append("</ul>")
                in_ul = False
            if in_ol:
                html_parts.append("</ol>")
                in_ol = False

        for raw_line in md.split("\n"):
            stripped = raw_line.strip()

            # ── 代码块 ──
            if stripped.startswith("```"):
                if in_code:
                    _flush_code()
                    in_code = False
                else:
                    _flush_table()
                    _flush_list()
                    in_code = True
                continue
            if in_code:
                code_buffer.append(raw_line)
                continue

            # ── 空行 ──
            if not stripped:
                _flush_code()
                _flush_table()
                _flush_list()
                html_parts.append("<br>")
                continue

            # ── 分隔线 ──
            if re.match(r"^-{3,}$", stripped) or re.match(r"^\*{3,}$", stripped):
                _flush_table()
                _flush_list()
                html_parts.append("<hr>")
                continue

            # ── 表格 ──
            if stripped.startswith("|") and stripped.endswith("|"):
                cells = [c.strip() for c in stripped.strip("|").split("|")]
                # 分隔行
                if re.match(r"^[-:| ]+$", stripped.replace("|", "").strip()):
                    align = []
                    for c in cells:
                        left = c.startswith(":")
                        right = c.endswith(":")
                        if left and right:
                            align.append("center")
                        elif right:
                            align.append("right")
                        elif left:
                            align.append("left")
                        else:
                            align.append("left")
                    table_align = align
                    continue
                if not in_table:
                    html_parts.append('<div class="table-wrap"><table>')
                    html_parts.append("<thead><tr>")
                    for i, c in enumerate(cells):
                        a = f' style="text-align:{table_align[i]}"' if i < len(table_align) else ""
                        html_parts.append(f"<th{a}>{_inline_html(c)}</th>")
                    html_parts.append("</tr></thead><tbody>")
                    in_table = True
                else:
                    html_parts.append("<tr>")
                    for i, c in enumerate(cells):
                        a = f' style="text-align:{table_align[i]}"' if i < len(table_align) else ""
                        html_parts.append(f"<td{a}>{_inline_html(c)}</td>")
                    html_parts.append("</tr>")
                continue

            _flush_table()

            # ── 标题 ──
            m = re.match(r"^(#{1,3})\s+(.+)$", stripped)
            if m:
                _flush_list()
                level = len(m.group(1))
                text = _inline_html(m.group(2))
                id_attr = ""
                if level == 2:
                    slug = _slugify(m.group(2))
                    id_attr = f' id="{slug}"'
                html_parts.append(f"<h{level}{id_attr}>{text}</h{level}>")
                continue

            # ── 有序列表 ──
            m = re.match(r"^\d+\.\s+(.+)$", stripped)
            if m:
                if not in_ol:
                    _flush_list()
                    html_parts.append("<ol>")
                    in_ol = True
                html_parts.append(f"<li>{_inline_html(m.group(1))}</li>")
                continue
            if in_ol:
                html_parts.append("</ol>")
                in_ol = False

            # ── 无序列表 ──
            if stripped.startswith("- ") or stripped.startswith("* "):
                if not in_ul:
                    _flush_list()
                    html_parts.append("<ul>")
                    in_ul = True
                html_parts.append(f"<li>{_inline_html(stripped[2:])}</li>")
                continue
            if in_ul:
                html_parts.append("</ul>")
                in_ul = False

            # ── 引用 ──
            if stripped.startswith(">"):
                html_parts.append(f"<blockquote>{_inline_html(stripped[1:].strip())}</blockquote>")
                continue

            # ── 图片 ──
            img_match = re.match(r"^!\[(.+?)\]\((.+?)\)\s*$", stripped)
            if img_match:
                alt, src = img_match.group(1), img_match.group(2)
                html_parts.append(f'<figure><img src="{src}" alt="{alt}" loading="lazy"><figcaption>{alt}</figcaption></figure>')
                continue

            # ── 段落 ──
            html_parts.append(f"<p>{_inline_html(stripped)}</p>")

        _flush_code()
        _flush_table()
        _flush_list()
        return "\n".join(html_parts)


def _escape_html(text: str) -> str:
    return text.replace("&", "&amp;").replace("<", "&lt;").replace(">", "&gt;")


def _inline_html(text: str) -> str:
    """将行内 Markdown 转为 HTML：图片、粗体、斜体、行内代码、链接。"""
    # 图片（行内）
    text = re.sub(r"!\[(.+?)\]\((.+?)\)",
                  r'<img src="\2" alt="\1" class="inline-img" loading="lazy">', text)
    # 链接
    text = re.sub(r"\[(.+?)\]\((.+?)\)", r'<a href="\2" target="_blank">\1</a>', text)
    # 行内代码
    text = re.sub(r"`([^`]+)`", r"<code>\1</code>", text)
    # 粗体
    text = re.sub(r"\*\*(.+?)\*\*", r"<strong>\1</strong>", text)
    # 斜体（不干扰粗体已处理的内容）
    text = re.sub(r"(?<!\*)\*(?!\*)(.+?)(?<!\*)\*(?!\*)", r"<em>\1</em>", text)
    return text


def _slugify(text: str) -> str:
    s = text.lower()
    s = re.sub(r"[^\w\u4e00-\u9fff]+", "-", s)
    return s.strip("-")


# ==================================================================
# HTML 报告构建器
# ==================================================================

class HTMLReportBuilder:
    """将 Markdown 报告转换为现代 HTML 页面。"""

    def __init__(self, md_parser: MarkdownParser):
        self.parser = md_parser
        self.title = "音乐平台热歌榜数据探索与可视化分析报告"
        self.subtitle = "基于 Spotify / Billboard 公开数据集的多维分析与可视化"

    def _build_toc(self, md_text: str) -> str:
        items = []
        for line in md_text.split("\n"):
            m = re.match(r"^##\s+(.+)$", line.strip())
            if m:
                title = m.group(1).strip()
                slug = _slugify(title)
                items.append(f'<li><a href="#{slug}">{title}</a></li>')
        if not items:
            return ""
        lis = "\n".join(items)
        return f'<nav class="toc"><h2>&#x1F4CB; 目录</h2><ul>{lis}</ul></nav>'

    def build(self, md_path: Path) -> str:
        with open(md_path, "r", encoding="utf-8") as f:
            md_text = f.read()

        content_html = self.parser.to_html(md_text)
        toc_html = self._build_toc(md_text)

        now = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

        return HTML_TEMPLATE.format(
            title=self.title,
            subtitle=self.subtitle,
            toc=toc_html,
            content=content_html,
            gen_time=now,
        )


# ==================================================================
# HTML 模板（现代、深色模式、响应式）
# ==================================================================

HTML_TEMPLATE = r"""<!DOCTYPE html>
<html lang="zh-CN">
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width, initial-scale=1.0">
<title>{title}</title>
<link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css" id="hljs-theme">
<style>
  :root {{
    --bg: #ffffff;
    --bg-alt: #f8f9fa;
    --text: #1a1a2e;
    --text-muted: #6c757d;
    --accent: #e94560;
    --accent2: #0f3460;
    --border: #e9ecef;
    --shadow: 0 1px 3px rgba(0,0,0,0.08), 0 1px 2px rgba(0,0,0,0.06);
    --shadow-lg: 0 10px 40px rgba(0,0,0,0.12);
    --radius: 8px;
    --max-w: 880px;
    --font-sans: -apple-system, BlinkMacSystemFont, "Segoe UI", "PingFang SC", "Microsoft YaHei", "Noto Sans SC", sans-serif;
    --font-mono: "JetBrains Mono", "Fira Code", "SF Mono", Menlo, Consolas, monospace;
  }}

  [data-theme="dark"] {{
    --bg: #0d1117;
    --bg-alt: #161b22;
    --text: #e6edf3;
    --text-muted: #8b949e;
    --accent: #ff7b72;
    --accent2: #58a6ff;
    --border: #30363d;
    --shadow: 0 1px 3px rgba(0,0,0,0.3);
    --shadow-lg: 0 10px 40px rgba(0,0,0,0.5);
  }}

  * {{ margin: 0; padding: 0; box-sizing: border-box; }}
  html {{ scroll-behavior: smooth; }}
  body {{
    font-family: var(--font-sans);
    background: var(--bg);
    color: var(--text);
    line-height: 1.75;
    font-size: 16px;
    transition: background .3s, color .3s;
  }}
  a {{ color: var(--accent2); text-decoration: none; }}
  a:hover {{ text-decoration: underline; }}

  /* ── 头部 ── */
  .page-header {{
    background: linear-gradient(135deg, var(--accent2), #1a1a2e);
    color: #fff;
    padding: 64px 24px 48px;
    text-align: center;
    position: relative;
  }}
  .page-header h1 {{
    font-size: clamp(1.5rem, 4vw, 2.4rem);
    font-weight: 800;
    letter-spacing: 0.02em;
    max-width: 720px;
    margin: 0 auto;
  }}
  .page-header p {{
    color: rgba(255,255,255,.7);
    font-size: 1.05rem;
    margin-top: 12px;
  }}
  .dark-toggle {{
    position: absolute;
    top: 20px;
    right: 24px;
    background: rgba(255,255,255,.15);
    border: none;
    color: #fff;
    width: 40px;
    height: 40px;
    border-radius: 50%;
    cursor: pointer;
    font-size: 1.2rem;
    display: flex;
    align-items: center;
    justify-content: center;
    transition: background .2s;
  }}
  .dark-toggle:hover {{ background: rgba(255,255,255,.25); }}

  /* ── 主容器 ── */
  .container {{
    max-width: var(--max-w);
    margin: 0 auto;
    padding: 32px 20px 80px;
  }}

  /* ── 目录 ── */
  .toc {{
    background: var(--bg-alt);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 20px 24px;
    margin-bottom: 32px;
    box-shadow: var(--shadow);
  }}
  .toc h2 {{
    font-size: 1.1rem;
    color: var(--accent);
    margin-bottom: 12px;
  }}
  .toc ul {{ list-style: none; padding: 0; }}
  .toc li + li {{ margin-top: 6px; }}
  .toc a {{
    display: inline-block;
    font-size: 0.95rem;
    color: var(--text);
    border-bottom: 1px solid transparent;
    transition: color .15s, border-color .15s;
  }}
  .toc a:hover {{
    color: var(--accent2);
    border-bottom-color: var(--accent2);
    text-decoration: none;
  }}

  /* ── 标题 ── */
  h1 {{ font-size: 1.75rem; margin: 40px 0 16px; color: var(--accent2); }}
  h2 {{
    font-size: 1.4rem;
    margin: 36px 0 14px;
    padding-bottom: 8px;
    border-bottom: 2px solid var(--border);
    color: var(--accent2);
    scroll-margin-top: 16px;
  }}
  h3 {{ font-size: 1.15rem; margin: 24px 0 10px; color: var(--text); }}

  /* ── 段落 ── */
  p {{ margin: 12px 0; }}

  /* ── 表格 ── */
  .table-wrap {{ overflow-x: auto; margin: 16px 0; }}
  table {{
    width: 100%;
    border-collapse: collapse;
    font-size: 0.9rem;
    box-shadow: var(--shadow);
    border-radius: var(--radius);
    overflow: hidden;
  }}
  th, td {{
    padding: 10px 14px;
    text-align: left;
    border-bottom: 1px solid var(--border);
    white-space: nowrap;
  }}
  th {{
    background: var(--accent2);
    color: #fff;
    font-weight: 600;
  }}
  tr:last-child td {{ border-bottom: none; }}
  tr:nth-child(even) td {{ background: var(--bg-alt); }}

  /* ── 图片 ── */
  figure {{ margin: 24px 0; text-align: center; }}
  img {{
    max-width: 100%;
    height: auto;
    border-radius: var(--radius);
    box-shadow: var(--shadow-lg);
    display: block;
    margin: 0 auto;
  }}
  figcaption {{
    margin-top: 8px;
    font-size: 0.85rem;
    color: var(--text-muted);
  }}
  img.inline-img {{ display: inline; box-shadow: none; vertical-align: middle; }}

  /* ── 代码 ── */
  code {{
    font-family: var(--font-mono);
    background: var(--bg-alt);
    padding: 2px 6px;
    border-radius: 4px;
    font-size: 0.88em;
    border: 1px solid var(--border);
  }}
  pre {{
    background: var(--bg-alt);
    border: 1px solid var(--border);
    border-radius: var(--radius);
    padding: 16px 20px;
    overflow-x: auto;
    margin: 16px 0;
    box-shadow: var(--shadow);
  }}
  pre code {{
    background: none;
    border: none;
    padding: 0;
    font-size: 0.85rem;
    line-height: 1.6;
  }}

  /* ── 引用 ── */
  blockquote {{
    border-left: 4px solid var(--accent);
    background: var(--bg-alt);
    padding: 12px 20px;
    margin: 16px 0;
    border-radius: 0 var(--radius) var(--radius) 0;
    color: var(--text-muted);
  }}

  /* ── 列表 ── */
  ul, ol {{ margin: 8px 0 8px 24px; }}
  li {{ margin: 4px 0; }}

  /* ── 分隔线 ── */
  hr {{
    border: none;
    height: 1px;
    background: var(--border);
    margin: 32px 0;
  }}

  /* ── 页脚 ── */
  .page-footer {{
    text-align: center;
    padding: 28px 20px;
    color: var(--text-muted);
    font-size: 0.85rem;
    border-top: 1px solid var(--border);
    margin-top: 16px;
  }}

  /* ── 响应式 ── */
  @media (max-width: 640px) {{
    .page-header {{ padding: 40px 16px 32px; }}
    .container {{ padding: 20px 12px 60px; }}
    h1 {{ font-size: 1.4rem; }}
    h2 {{ font-size: 1.2rem; }}
    table {{ font-size: 0.8rem; }}
    th, td {{ padding: 6px 8px; }}
  }}

  /* ── 动画 ── */
  @keyframes fadeIn {{ from {{ opacity: 0; transform: translateY(8px); }} to {{ opacity: 1; transform: translateY(0); }} }}
  .container > * {{ animation: fadeIn .4s ease both; }}
  .container > *:nth-child(2) {{ animation-delay: .05s; }}
  .container > *:nth-child(3) {{ animation-delay: .1s; }}
</style>
</head>
<body>
<header class="page-header">
  <button class="dark-toggle" onclick="toggleDark()" aria-label="切换深色模式" id="darkBtn">&#x1F319;</button>
  <h1>{title}</h1>
  <p>{subtitle}</p>
</header>
<div class="container">
  {toc}
  {content}
</div>
<footer class="page-footer">
  <p>生成时间: {gen_time} | 数据来源: Spotify / Billboard | Music Analysis Pipeline</p>
</footer>
<script src="https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/highlight.min.js"></script>
<script>
  hljs.highlightAll();

  const DARK_KEY = "music-analysis-theme";
  const btn = document.getElementById("darkBtn");
  const hljsTheme = document.getElementById("hljs-theme");

  function getTheme() {{
    return localStorage.getItem(DARK_KEY) || "light";
  }}

  function applyTheme(theme) {{
    document.documentElement.setAttribute("data-theme", theme);
    btn.textContent = theme === "dark" ? "\\u2600\\uFE0F" : "\\u{1F319}";
    hljsTheme.href = theme === "dark"
      ? "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github-dark.min.css"
      : "https://cdnjs.cloudflare.com/ajax/libs/highlight.js/11.9.0/styles/github.min.css";
    localStorage.setItem(DARK_KEY, theme);
  }}

  function toggleDark() {{
    const next = getTheme() === "dark" ? "light" : "dark";
    applyTheme(next);
  }}

  // 遵循系统偏好
  const prefersDark = window.matchMedia("(prefers-color-scheme: dark)").matches;
  const saved = getTheme();
  if (saved === "light" || saved === "dark") {{
    applyTheme(saved);
  }} else {{
    applyTheme(prefersDark ? "dark" : "light");
  }}
</script>
</body>
</html>"""


# ==================================================================
# 主入口
# ==================================================================

def main():
    print("=" * 60)
    print("  《音乐平台热歌榜数据探索与可视化分析》")
    print("  阶段五：报告生成")
    print("=" * 60)
    print()

    md_path = REPORT_DIR / "report.md"
    if not md_path.exists():
        print(f"[ERROR] report.md 不存在: {md_path}")
        print("[INFO] 请先运行完整流水线生成 report.md")
        sys.exit(1)

    print(f"[STEP 1/2] 读取 {md_path} ...")
    parser = MarkdownParser()
    builder = HTMLReportBuilder(parser)

    print("[STEP 2/2] 生成 HTML 报告...")
    html_content = builder.build(md_path)

    html_path = REPORT_DIR / "report.html"
    with open(html_path, "w", encoding="utf-8") as f:
        f.write(html_content)

    print(f"  [SUCCESS] HTML 报告已保存: {html_path}")
    size_kb = len(html_content.encode("utf-8")) / 1024
    print(f"  [INFO] 文件大小: {size_kb:.0f} KB")
    print(f"  [INFO] 深色模式: 支持（切换按钮在页面右上角）")
    print(f"  [INFO] 代码高亮: highlight.js")
    print(f"  [INFO] 移动适配: 是")
    print()
    print("=" * 60)


if __name__ == "__main__":
    main()
