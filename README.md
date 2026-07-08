# 音乐平台热歌榜数据探索与可视化分析

[![Node.js 24+](https://img.shields.io/badge/node-24%2B-339933.svg?logo=node.js)](https://nodejs.org/)
[![License: MIT](https://img.shields.io/badge/License-MIT-green.svg)](LICENSE)

## 项目简介

本项目对音乐平台热歌榜数据进行全链路数据挖掘与可视化分析，涵盖数据采集、清洗、AI 增强标注、统计分析、可视化及报告生成五大阶段。通过对 Spotify 歌曲音频特征（Danceability、Energy、Valence、Tempo 等）与 Billboard 榜单排名的系统性分析，揭示流媒体时代热门歌曲的共性规律。

分析维度包括：
- 音频特征分布与相关性分析
- 流派与流行度分组对比
- 三十年间音乐特征的演变趋势
- PCA 降维与 KMeans 无监督聚类
- 大语言模型（OpenAI GPT-4o-mini）语义增强标注
- TF-IDF 曲名关键词分析

项目共生成 17 张 SVG 可视化图表，并输出完整的 Markdown 分析报告与 HTML 网页报告。同时包含一个基于 Next.js 构建的 Premium 音乐探索网站（`website/`），采用 Spotify 风格黑绿主题与丰富的交互动画。

## 数据来源

项目使用以下公开数据集：

| 数据集 | 来源 | 规模 | 说明 |
|--------|------|------|------|
| Spotify Tracks | [Kaggle - Spotify Dataset](https://www.kaggle.com/datasets/maharshipandya/-spotify-tracks-dataset) | 5,000 首 | 音频特征、流派、流行度 |
| Spotify Moods | [Kaggle - Spotify Mood Classification](https://www.kaggle.com/datasets/3s4r4n4/spotify-mood-classification) | 686 首 | 情绪标签、发行日期 |
| Billboard Hot 100 | [Billboard API](https://www.billboard.com/charts/hot-100/) | 100 首 | 当前周期热门排名 |

通过曲名+艺术家模糊匹配进行跨源关联，未匹配记录使用 genre 分组中位年份填充。

## 项目结构

```
music-analysis/
├── data/
│   ├── raw/                    # 原始数据集
│   │   ├── tracks5000.csv
│   │   ├── spotify_moods.csv
│   │   └── billboard_hot100_latest.json
│   ├── clean/                  # 清洗后数据
│   │   └── music_clean.csv
│   └── ai/                     # AI 增强数据（运行后生成）
│       ├── music_ai.csv
│       └── checkpoint.json
├── scripts/
│   ├── download_data.py        # 阶段一：数据采集与合并
│   ├── clean.py                # 阶段二：8 步数据清洗
│   ├── llm_enhance.py          # 阶段三：LLM 语义增强标注
│   ├── analysis.py             # 阶段四：统计分析与 17 张图表
│   ├── build_report.py         # 阶段五：Markdown + HTML 报告生成
│   ├── process.js              # Node.js 数据处理管线（已执行）
│   ├── charts.js               # Node.js 17 张 SVG 图表生成（已执行）
│   └── update_report.js        # HTML 报告图表替换脚本
├── report/
│   ├── report.md               # 完整 Markdown 分析报告
│   ├── report.html             # 现代 HTML 网页报告（可直接打开）
│   ├── serve.js                # 本地静态服务器
│   └── figures/                # 17 张 SVG 图表
├── website/                    # Next.js 音乐探索网站
│   ├── src/
│   │   ├── app/                # 页面 + 全局样式
│   │   ├── components/         # 12 个 React 组件
│   │   └── lib/                # Mock 数据
│   ├── out/                    # 构建输出（静态站点）
│   ├── package.json
│   └── next.config.js
├── README.md
├── prompt-log.md
├── requirements.txt
├── LICENSE
└── .nojekyll
```

## 运行方式

### 本地查看报告

直接打开 `report/report.html` 即可在浏览器查看完整分析报告（含 17 张 SVG 图表）。

如需通过本地服务器查看：

```bash
node report/serve.js
# 访问 http://localhost:3000
```

### 数据全流程处理

数据已在当前环境中完成清洗、分析与图表生成。如需重新执行，需要 Node.js 24+：

```bash
# 1. 数据清洗与统计分析
node scripts/process.js

# 2. 生成 17 张 SVG 图表
node scripts/charts.js

# 3. 更新报告 HTML（嵌入图表）
node scripts/update_report.js
```

### 音乐探索网站

```bash
cd website
npm install
npm run dev      # 开发模式 http://localhost:3000
npm run build    # 构建静态站点 → out/
```

## 项目截图

17 张可视化图表位于 `report/figures/` 目录：

| 编号 | 文件 | 类型 | 说明 |
|------|------|------|------|
| V1 | v1_distribution.svg | 直方图+密度图 | 音频特征分布 |
| V2 | v2_correlation_heatmap.svg | 热力图 | 特征相关性矩阵 |
| V3 | v3_scatter_matrix.svg | 散点图矩阵 | 多维特征联合分布 |
| V4 | v4_popularity_boxplot.svg | 箱线图 | 流行度等级分组对比 |
| V5 | v5_genre_boxplot.svg | 箱线图 | 流派分组对比 |
| V6 | v6_genre_popularity_violin.svg | 小提琴图 | 流派流行度分布 |
| V7 | v7_energy_danceability_scatter.svg | 散点图 | 能量-舞蹈性双轴分析 |
| V8 | v8_temporal_trend.svg | 折线图 | 音频特征的三十年变迁 |
| V9 | v9_genre_year_heatmap.svg | 热力图 | 流派年代热力变迁 |
| V10 | v10_popularity_temporal.svg | 堆叠面积图 | 流行度等级年度分布 |
| V11 | v11_duration_temporal.svg | 折线图 | 歌曲时长变化趋势 |
| V12 | v12_billboard_rank_analysis.svg | 分组柱状图 | Billboard 排名特征分析 |
| V13 | v13_pca_clustering.svg | 散点图 | PCA 降维投影 |
| V14 | v14_kmeans_clusters.svg | 散点图 | KMeans 聚类结果 |
| V15 | v15_tfidf_keywords.svg | 词云/柱状图 | 曲名关键词分析 |
| V16 | v16_ai_mood_distribution.svg | 词云+柱状图 | AI 增强情绪分布 |
| V17 | v17_ai_scene_mood_heatmap.svg | 热力图 | 场景-情绪交叉分析 |

---

## Skill 说明

本项目开发过程中借助了以下 AI 编程 Skill（能力），每个 Skill 在特定环节发挥了关键作用：

### 1. Web Search
用于查找公开音乐数据集的可用来源（Kaggle、HuggingFace、Billboard API），确认数据集字段说明与更新状态，以及搜索 Node.js CSV 解析和 SVG 生成的最佳实践。

### 2. Node.js
核心运行环境。由于当前系统没有 Python 运行时，数据清洗、统计分析、图表生成全部使用 Node.js 24+ 内置模块（fs、path）完成，零外部依赖。使用纯字符串拼接生成 17 张符合 SVG 标准的矢量图表。

### 3. CSV 数据处理（内置模块）
使用 Node.js 内置 fs 模块手动解析 CSV 文件（支持引号转义、逗号分隔），实现缺失值填充、IQR 异常值检测、重复记录删除、多表合并（名称匹配）、百分位分级等完整 ETL 流程。

### 4. SVG 图表生成（纯字符串）
所有 17 张统计图表均通过 JavaScript 字符串模板直接生成 SVG 代码，无需任何第三方图表库。涵盖直方图（36 分箱）、热力图（颜色映射矩阵）、箱线图（分位数计算）、散点图（PCA 降维投影）、折线图（多系列时间序列）、堆叠面积图等多种图表类型。

### 5. 统计分析
指导整体分析框架设计。涵盖描述性统计（均值/中位数/偏度/峰度）、推断统计、Pearson 相关性分析（相关系数矩阵）、降维（PCA 主成分分析）、聚类（KMeans 肘部法则）、文本挖掘（TF-IDF 关键词提取）等方法的选择与组合应用。

### 6. 数据可视化
指导视觉呈现层面的决策。包括统一图表风格（Spotify 黑绿主题色板、深色背景 #0B0B0F、网格系统、字体层级）、图表类型选择（不同分析目标对应最合适的图表形态）、以及报告中的图文编排规范。

### 7. OpenAI API
AI 增强标注阶段的 AI 能力来源。编写了 llm_enhance.py 脚本（使用 GPT-4o-mini 模型对歌曲进行情感基调、适合场景、核心主题标注），实现了自动重试（3 次）、速率控制（0.5s 间隔）和断点续传（checkpoint.json）。

### 8. Next.js
音乐探索网站（website/）的框架。使用 Next.js 15 App Router + Tailwind CSS v4 + Framer Motion 构建，支持 output: 'export' 静态导出。实现了 12 个组件（Navbar、Hero、TrendingSongs、PopularArtists 等）。

### 9. 前端设计（frontend-design）
指导网站视觉设计方向。采用 Spotify 风格黑绿配色方案（#121212 背景 / #1DB954 强调色），玻璃拟态（backdrop-filter: blur）卡片，Aurora 极光背景，Canvas 实时波形动画，以及 10+ CSS 关键帧动画（黑胶旋转、均衡器跳动、浮动音符、脉冲波纹等）。

### 10. Markdown
报告文档格式。分析报告以 Markdown 编写，支持表格、代码块、图片嵌入、引用等结构。Markdown 的通用性使得同一份报告既可渲染为精美的 HTML 网页，也可在仓库中直接阅读。

## License

[MIT License](LICENSE)
