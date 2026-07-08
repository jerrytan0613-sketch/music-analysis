# 📝 Prompt Engineering Log

> 项目：音乐平台热歌榜数据探索与可视化分析  
> 用途：记录项目开发过程中使用的 AI Prompt，便于复现与教学

---

## 1. 项目规划 Prompt

**目标**：生成完整的课程项目方案

```
你是一名资深Python数据分析工程师、AI Agent开发工程师和可视化专家。
请帮我完成一个完整的课程项目《音乐平台热歌榜数据探索与可视化分析》。

目标：基于互联网公开数据集（Spotify Top Songs、Kaggle Music Dataset、Billboard等），
完成：①数据采集 ②数据清洗 ③AI增强（LLM） ④多维统计分析 ⑤数据可视化 ⑥Markdown分析报告
⑦HTML网页报告 ⑧GitHub Pages部署 ⑨README ⑩prompt-log

自动规划整个项目目录。
```

---

## 2. 数据采集 Prompt

**目标**：生成数据采集脚本 `download_data.py`

```python
"""
功能说明：
  1. 优先从 Kaggle/HuggingFace/公开URL下载真实榜单数据
  2. 若网络不可用则自动生成高仿真合成数据（基于真实音乐统计分布）
  3. 输出文件：data/raw/spotify_songs.csv

数据字段：
  track_name, artist, album_name, genre, popularity,
  danceability, energy, loudness, speechiness, acousticness,
  instrumentalness, liveness, valence, tempo, duration_ms,
  key, mode, time_signature, year, billboard_rank, weeks_on_chart
"""
```

**关键设计决策**：

| 决策 | 选择 | 理由 |
|------|------|------|
| 数据源策略 | 先网络后合成 | 保证在网络不可用时仍可运行 |
| 合成方式 | 基于统计分布的参数化生成 | 确保数据分布接近真实 Spotify 特征 |
| 流派权重 | 根据实际市场占比分配 | Pop 22%、Hip-Hop 16%、Rock 12% 等 |
| 年份分布 | 60% 近年 + 35% 1990-2019 + 5% 更早 | 反映热歌榜单以近年歌曲为主的特点 |

---

## 3. 数据清洗 Prompt

**目标**：生成数据清洗脚本 `clean.py`

**清洗流水线设计**：

```
STEP 0: 加载数据
STEP 1: 处理缺失值 (数值列→中位数, 类别列→Unknown)
STEP 2: 删除完全重复行
STEP 3: 处理异常值 (业务规则裁剪 + IQR 去极值)
STEP 4: 标准化文本字段 (去空格、统一大小写)
STEP 5: 归一化流派标签 (合并同义标签)
STEP 6: 提取时间特征 (decade, era)
STEP 7: 计算综合榜单得分 (chart_score)
STEP 8: 情绪分类 (Valence-Energy 四象限)
STEP 9: 整理列顺序
```

**异常值约束规则**：

```python
constraints = {
    "popularity": (0, 100),
    "danceability": (0.0, 1.0),
    "energy": (0.0, 1.0),
    "tempo": (40.0, 220.0),
    "duration_ms": (30000, 600000),   # 30s - 10min
    "year": (1950, 2026),
    "billboard_rank": (1, 100),
    # ...
}
```

---

## 4. AI 增强 Prompt

**目标**：生成 AI 增强脚本 `llm_enhance.py`

**LLM Prompt 模板**：

```
你是一位专业的音乐分析师。请根据以下歌曲信息，输出 JSON 格式的增强标签。

歌曲信息：
- 标题: {track_name}
- 艺术家: {artist}
- 流派: {genre}
- 发行年份: {year}
- 能量值: {energy}
- 效价值: {valence}
- 舞蹈性: {danceability}
- 速度: {tempo} BPM
- 原声度: {acousticness}
- 大小调: {大调/小调}
- 流行度: {popularity}

请输出 JSON：
{
  "emotion_tags": ["标签1", "标签2"],
  "style_tags": ["标签1", "标签2", "标签3"],
  "scene_tags": ["场景1", "场景2"],
  "theme_keywords": ["关键词1", "关键词2", "关键词3"],
  "brief_comment": "一句简短的中文点评（20字以内）"
}
```

**离线规则引擎设计**：

| 维度 | 规则依据 | 输出示例 |
|------|----------|----------|
| 情感标签 | Valence + Energy + Tempo + Mode | Joyful, Energetic, Bright |
| 风格标签 | Genre + Acousticness + Instrumentalness | Acoustic, Vocal, Groovy |
| 适合场景 | Energy + Danceability + Tempo | Party, Workout, Study |
| 主题关键词 | Valence + Energy + Genre | Love, Freedom, Heartbreak |

---

## 5. 统计分析 Prompt

**目标**：生成多维统计分析脚本 `analysis.py`

**7 大分析维度**：

| # | 维度 | 方法 | 图表 |
|---|------|------|------|
| 1 | 描述性统计 | describe(), mean(), std() | — |
| 2 | 流派分析 | groupby, value_counts | V1 饼图, V3 箱线图, V6 雷达图 |
| 3 | 时间趋势 | groupby year/decade | V4 折线图, V9 堆叠面积图 |
| 4 | 相关性分析 | corr(), heatmap | V5 热力图 |
| 5 | 情绪分析 | AI标签解析, Counter | V7 散点图, V12 饼图 |
| 6 | 艺术家分析 | value_counts | V10 柱状图 |
| 7 | 歌曲特征 | hist, boxplot | V2 直方图, V11 分布图 |

**情感象限模型** (Russell's Circumplex Model)：

```
Valence >= 0.5 & Energy >= 0.5  → Exuberant (兴奋)
Valence < 0.5  & Energy >= 0.5  → Angry (愤怒)
Valence >= 0.5 & Energy < 0.5   → Calm (平静)
Valence < 0.5  & Energy < 0.5   → Sad (忧郁)
```

---

## 6. 报告生成 Prompt

**目标**：生成报告构建脚本 `build_report.py`

**报告结构**：

1. 项目概述
2. 数据概况（含统计摘要表）
3. 流派分布分析（含图表）
4. 音频特征分析（含相关性热力图、雷达图）
5. 时间趋势分析（含折线图、堆叠面积图）
6. 情感分析（AI 增强，含散点图、饼图）
7. 艺术家分析（含柱状图）
8. 数据清洗说明
9. AI 增强说明
10. 结论与发现

**HTML 设计要点**：

- 响应式布局（移动端适配）
- 浅色主题 + 品牌色 (#e94560, #0f3460)
- 统计数据卡片概览
- 自动目录导航
- 圆角卡片阴影风格
- 表格斑马纹 + hover 高亮

---

## 7. 迭代优化记录

| 日期 | 版本 | 修改内容 |
|------|------|----------|
| 2026-07-07 | v1.0 | 初始版本，完成核心 5 阶段流水线 |
| — | — | 待补充后续优化记录 |

---

## 8. 使用建议

### 使用 LLM 模式的最佳实践

```bash
# 设置 OpenAI API Key
export OPENAI_API_KEY="sk-xxxxx"

# 控制 LLM 处理的样本量（在 llm_enhance.py 中修改 sample_size）
# sample_size = 200  # 默认处理 200 首
```

### 扩展方向

- [ ] 接入 Spotify API 获取实时榜单数据
- [ ] 增加歌词情感分析（NLP）
- [ ] 时间序列预测（流行度趋势预测）
- [ ] 推荐系统（基于音频特征的歌曲推荐）
- [ ] 交互式 Plotly 图表替换静态 Matplotlib

---

## 9. 音乐网站 UI 构建 Prompt

**目标**：基于 React + Next.js + Tailwind + Framer Motion 构建 Premium 音乐探索网站

**设计规格**：
- Spotify 风格黑绿配色 (#0B0B0F / #1DB954)
- 玻璃态设计 (backdrop-blur 24px)
- 12 个组件：Navbar / Hero / WaveformBackground / FloatingNotes / MouseGlow / SectionReveal / MusicCard / TrendingSongs / PopularArtists / Albums / Statistics / Recommendations / Footer
- 动画：Canvas 波形 / Aurora / 黑胶旋转 / Equalizer / 悬浮脉冲 / 渐变文字 / 滚动渐入

**技术栈**：Next.js 15 (App Router) + Tailwind CSS v4 + Framer Motion 12 + Lucide Icons

**输出**：构建成功，静态站点输出至 website/out/

---

## 10. 数据处理管线补全 Prompt（Node.js）

**目标**：在当前无 Python 运行时的环境下，用 Node.js 完成数据清洗与统计分析

**输入**：三个原始数据集（tracks5000.csv / spotify_moods.csv / billboard_hot100_latest.json）

**处理逻辑**：
- CSV 手动解析（支持引号转义、逗号分隔）
- 去重（track_id）、缺失值填充（中位数/众数）
- IQR 异常值裁剪、时长转换、流行度 S/A/B/C 分级
- 跨源合并（名称+艺术家匹配）
- 15 个分析维度的统计计算
- 输出 analysis_data.json（25KB）和 music_clean.csv

**关键决策**：全程使用 Node.js 内置模块（fs、path），零 npm 依赖

---

## 11. 17 张 SVG 图表生成 Prompt

**目标**：基于 analysis_data.json 生成 17 张 SVG 矢量图表

**技术要求**：
- 纯 SVG 字符串生成，零依赖
- 统一深色主题（#0B0B0F 背景、#1DB954 Spotify 绿、#A1A1AA 标签）
- 800x500 viewBox，统一字体层级（title 16px bold / axis 12px / tick 10px）
- 涉及图表类型：直方图、热力图、散点图矩阵、箱线图、条形图、小提琴图、折线图、堆叠面积图、分组柱状图

**输出**：17 个 SVG 文件，最小 2KB、最大 230KB，总计约 440KB

---

## 12. 报告占位图替换 Prompt

**目标**：将 report.html 中的 17 个占位卡片全部替换为真实 SVG 图表

**方法**：编写 `update_report.js`，使用正则匹配每个 chart-card 区块，替换为 `<img src="figures/v*.svg">`

**结果**：17/17 替换成功，report.html 体积 52KB，已同步至 Desktop/music-analysis/report/
