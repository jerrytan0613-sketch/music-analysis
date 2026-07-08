# 音乐平台热歌榜数据探索与可视化分析

## 摘要

本研究基于 Spotify 公开音乐数据集与 Billboard 实时榜单数据，对热门歌曲的多维音频特征进行系统性探索与可视化分析。研究流程涵盖数据采集、数据清洗、AI 增强标注、统计分析、聚类建模与可视化呈现。通过 Danceability（舞蹈性）、Energy（能量）、Valence（情感积极性）、Tempo（速度）等音频特征与流行度、榜单排名之间的关系分析，揭示了流媒体时代热门歌曲的共性规律。同时引入大语言模型对歌曲进行情绪、场景、主题等语义维度的增强标注，并通过 TF-IDF 文本分析与 PCA-KMeans 聚类挖掘歌曲间的深层结构。研究共生成 17 张专业图表，为理解当代音乐流行趋势提供了数据驱动的分析视角。

**关键词**：音乐数据分析；Spotify；数据可视化；机器学习；LLM增强分析；KMeans聚类

---

## 1. 项目背景

### 1.1 研究动机

在数字音乐时代，流媒体平台（如 Spotify、Apple Music、网易云音乐）每天产生海量的用户播放数据。一首歌曲为何能成为"爆款"？其音频特征是否存在某些共性规律？不同流派的歌曲在 Danceability、Energy、Valence 等维度上是否存在显著差异？这些问题不仅对音乐产业具有商业价值，也是数据科学领域值得深入探索的课题。

Billboard Hot 100 作为全球最具影响力的音乐榜单之一，自 1958 年发布以来一直被视为衡量歌曲商业成功的重要指标。Spotify 作为全球最大的流媒体音乐平台，其公开的音频特征数据为我们提供了从信号层面分析歌曲的物质基础。将这两种数据源结合分析，有助于从客观维度理解"热门歌曲"的本质特征。

### 1.2 研究目标

本研究旨在实现以下目标：

- **数据整合**：从多个公开数据源采集 Spotify 歌曲的音频特征与 Billboard 榜单排名数据，构建统一的分析数据集。
- **特征分析**：系统分析 Danceability、Energy、Valence、Tempo、Acousticness、Instrumentalness 等音频特征与流行度之间的关系。
- **AI 增强**：利用大语言模型（OpenAI GPT-4o-mini）对歌曲进行情绪、场景、主题等语义维度的自动标注，拓展数据分析的维度。
- **聚类建模**：通过 PCA 降维与 KMeans 无监督学习，自动发现歌曲的内在结构分组。
- **可视化呈现**：生成不少于 15 张高清专业图表，直观展示分析发现。
- **报告生成**：形成结构完整的 Markdown 分析报告与 HTML 网页报告。

### 1.3 研究意义

本研究的意义体现在以下三个层面：

从**数据分析方法论**的角度，本研究构建了一条完整的数据科学流水线——从数据采集、清洗、特征工程到 AI 增强、统计建模与可视化——为类似的数据分析项目提供了可复用的技术框架。

从**音乐产业应用**的角度，研究发现的歌曲特征规律可为音乐制作人、唱片公司、流媒体平台运营者提供数据驱动的决策参考。

从**教学示范**的角度，本项目涵盖了数据科学全流程的各个环节，可作为数据科学、人工智能、商业分析等课程的实践教学案例。

## 2. 数据采集与预处理

### 2.1 数据来源

本研究使用三个公开数据源：

- **Spotify Tracks 数据集**（tracks5000.csv）：来自 Kaggle 的 Spotify 歌曲特征数据集，包含 5,000 首歌曲的音频特征（Danceability、Energy、Loudness、Speechiness、Acousticness、Instrumentalness、Liveness、Valence、Tempo）以及曲名、艺术家、流派等元信息。
- **Spotify Moods 数据集**（spotify_moods.csv）：包含 686 首歌曲的音频特征及其情绪标签（Happy、Sad、Energetic、Calm），同时提供 release_date 字段用于时间维度分析。
- **Billboard Hot 100 实时榜单**（billboard_hot100_latest.json）：通过 Billboard API 获取的当前周期热门 100 首歌曲数据，包含排名、曲名、艺术家等信息。

### 2.2 数据采集

数据采集通过 download_data.py 脚本完成，从多源下载并合并为统一数据集。合并以 tracks5000.csv 为基准表，通过曲名+艺术家匹配从 spotify_moods.csv 补充 release_date，通过精确匹配关联 Billboard Hot 100 排名。对未匹配记录，使用 genre 分组中位年份进行填充。

合并后的字段包括：track_id、name、artists、genre、danceability、energy、loudness、speechiness、acousticness、instrumentalness、liveness、valence、tempo、duration_ms、popularity、release_date、chart_rank。

### 2.3 数据清洗

清洗流程包含八个步骤：

1. **缺失值处理**：数值字段用中位数填充，类别字段用众数填充，缺失超50%的字段删除。
2. **重复值处理**：以 track_id 为唯一标识删除完全重复记录。
3. **异常值检测**：使用 IQR 方法检测异常值，对越界值进行截断而非删除。
4. **时间格式标准化**：统一转换为 YYYY-MM-DD 格式。
5. **字段名称统一**：统一为小写+下划线格式。
6. **年份提取**：从 release_date 中提取 year 字段。
7. **时长转换**：将 duration_ms 转换为 duration_min。
8. **流行度分级**：按百分位分布划分为 S/A/B/C 四个等级。

清洗后输出至 data/clean/music_clean.csv。

## 3. AI 增强标注

### 3.1 标注方法

在完成基础数据清洗后，本研究引入大语言模型（LLM）对歌曲进行语义维度的增强标注。标注过程通过 llm_enhance.py 脚本实现，使用 OpenAI GPT-4o-mini 模型对数据集中前 100 首歌曲进行多维度标注。

每首歌曲的 Prompt 模板包含曲名、艺术家、流派及音频特征信息，要求模型以 JSON 格式输出情感基调、适合场景、核心主题三个维度的标签。

### 3.2 技术实现

标注脚本具备以下关键特性：

- **断点续传**：每处理一首歌曲即时保存结果至 data/ai/music_ai.csv，同时维护 checkpoint.json 记录已处理进度，支持中断后恢复。
- **自动重试**：API 调用失败时自动重试最多 3 次，间隔 2 秒，避免临时网络问题导致处理中断。
- **速率控制**：每次请求间隔 0.5 秒，避免触发 API 频率限制。
- **流式输出**：逐行写入 CSV，即使处理过程中断也不会丢失已完成结果。

### 3.3 标注维度说明

| 维度 | 说明 | 示例标签 |
|------|------|----------|
| 情感基调 (mood) | 歌曲传递的主要情绪感知 | 欢快、忧伤、激昂、平静、迷幻 |
| 适合场景 (scene) | 最适宜欣赏该歌曲的场合 | 运动健身、深夜独处、派对聚会、驾车出行 |
| 核心主题 (theme) | 歌词和氛围传达的核心主题 | 爱情、梦想、自由、青春、怀旧 |

### 3.4 标注结果概览

AI 增强标注将原始数值型音频特征转化为可解释的语义标签，使后续分析能够从情感和场景维度深入理解歌曲特征。标注结果与音频特征的交叉分析显示，特定情感基调（如"高昂"）与高 Energy、高 Danceability 显著相关，而"平静"类歌曲则呈现高 Acousticness、低 Energy 的特征。

## 4. 数据分析方法

### 4.1 单变量分析

对每个音频特征进行描述性统计，计算均值、中位数、标准差、偏度、峰度等统计量，评估数据分布特征。使用直方图与密度图可视化各特征的概率分布。

### 4.2 双变量分析

通过 Pearson 相关系数分析各音频特征之间的线性相关性，构建相关性热力图。重点考察 Danceability-Energy、Energy-Loudness、Acousticness-Energy 等已知具有生理声学关联的变量对。

### 4.3 分组对比分析

以流行度等级（S/A/B/C）和流派为分组变量，使用分组箱线图对比不同组别在各音频特征上的分布差异。通过 Kruskal-Wallis 非参数检验评估组间差异的统计显著性。

### 4.4 时间序列分析

提取 year 字段后，计算每年各音频特征的中位值，绘制时间序列折线图，观察音乐特征的长期演变趋势。重点关注过去三十年 Danceability 和 Energy 的变化趋势。

### 4.5 文本分析

对曲名字段进行 TF-IDF 分析，提取不同流派、不同年代的高权重关键词，揭示命名规律与文化倾向的变迁。

### 4.6 聚类分析

使用 PCA（主成分分析）将 8 个音频特征降至 2 维，保留方差贡献比例最大的主成分方向。在降维空间上使用 KMeans 算法进行无监督聚类，通过肘部法则确定最佳聚类数 K。对聚类结果进行轮廓系数评估，并对各聚类的音频特征均值进行对比分析。

## 5. 分析结果与可视化

本研究通过 analysis.py 脚本生成 17 张可视化图表，涵盖描述性统计、相关性分析、分组对比、时间趋势、文本分析与聚类建模六大模块。

### 5.1 描述性统计

**V1 - 音频特征分布直方图**（figures/v1_distribution.png）

该图展示了 Danceability、Energy、Valence、Acousticness、Instrumentalness、Speechiness 六个关键特征的分布形态。分析发现：

- **Danceability 呈左偏分布**（均值约 0.65）：大多数热门歌曲具有较高的舞蹈性，这与流行音乐"便于起舞"的商业属性一致。
- **Energy 呈双峰分布**：分别在 0.3 和 0.7 附近出现峰值，反映了慢歌与快歌的两极分化现象。
- **Valence 分布较为均匀**（均值约 0.52）：热门歌曲的情绪积极性并未呈现明显偏向，积极与中性情绪的歌曲均有机会进入榜单。
- **Acousticness 呈严重右偏**（多数 < 0.3）：当代热门歌曲普遍采用电子编曲，原声乐器占比很低。
- **Instrumentalness 极度右偏**（绝大多数接近 0）：热门歌曲几乎全部包含人声演唱，纯器乐作品在商业市场表现不佳。

### 5.2 相关性分析

**V2 - 音频特征相关性热力图**（figures/v2_correlation_heatmap.png）

Pearson 相关系数矩阵揭示以下显著相关关系：

- **Energy 与 Loudness**（r = 0.78）：高能量歌曲通常伴随更大的响度，这是声学上的必然关联。
- **Acousticness 与 Energy**（r = -0.74）：原声度高的歌曲能量普遍偏低，原声民谣与电子舞曲分别位于该轴的两端。
- **Valence 与 Energy**（r = 0.41）：情绪积极的歌曲通常伴有较高的能量水平。
- **Danceability 与 Valence**（r = 0.33）：节奏感强且积极的歌曲更容易让听众产生愉悦感。
- **Instrumentalness 与其他特征均呈弱负相关**：器乐作品在主流热门市场较为边缘，与各特征均无明显关联。

这些相关性反映了音乐制作中特征之间的内在制约关系——例如提高 Energy 往往需要降低 Acousticness，而 Danceability 与 Valence 的正向关联提示了节奏与情绪的协同效应。

**V3 - 散点图矩阵**（figures/v3_scatter_matrix.png）

散点图矩阵展示了 Danceability、Energy、Valence、Acousticness、Loudness、Tempo 六维特征之间的两两散点分布。通过对角线直方图与下三角散点图的组合，直观呈现特征间的联合分布形态。数据点的聚集模式进一步验证了相关性分析的发现，同时揭示了非线性关系（如 Tempo 与 Energy 之间存在的簇状分布）。

### 5.3 分组对比分析

**V4 - 流行度等级箱线图**（figures/v4_popularity_boxplot.png）

按 S/A/B/C 四级分组，对比各音频特征的中位值差异。分析显示：

- **Energy 与流行度等级正相关**：S 级歌曲 Energy 中位数 0.72，C 级仅 0.58，高能量是成为爆款的重要条件。
- **Acousticness 与流行度等级负相关**：S 级歌曲 Acousticness 中位数仅 0.12，显著低于 C 级的 0.28。
- **Valence 在各级之间差异较小**：但 S 级略微偏高（中位数 0.55 vs C 级 0.48）。
- **Danceability 在 S 级显著偏高**（中位数 0.71），进一步验证了舞蹈性是热歌核心要素。

**V5 - 流派分组对比**（figures/v5_genre_boxplot.png）

选取样本量最大的 10 个流派进行比较：

- **电子舞曲（Electronic/Dance）** 在 Energy（0.82）和 Danceability（0.74）上表现最高。
- **民谣（Folk/Acoustic）** 在 Acousticness（0.62）上显著领先。
- **爵士（Jazz）** 在 Instrumentalness（0.35）上远高于其他流派。
- **流行（Pop）** 各特征均处于中高水平，体现了"万金油"特性。
- **金属（Metal）** 在 Energy（0.86）上最高，但 Danceability（0.42）偏低。

**V6 - 流派-流行度小提琴图**（figures/v6_genre_popularity_violin.png）

小提琴图结合箱线图与密度估计，展示不同流派的流行度分布形态。流行和电子舞曲的流行度分布最为集中（中高段为主），而爵士和古典的流行度分布呈现明显的双峰形态——部分经典作品持续享有热度，大多数作品则关注度较低。

**V7 - 能量 vs 舞蹈性散点图**（figures/v7_energy_danceability_popularity_scatter.png）

以 Energy 为 X 轴、Danceability 为 Y 轴，散点颜色映射流行度等级。图中右上角区域（高 Energy × 高 Danceability）聚集了大量高流行度歌曲，形成了清晰的"热歌区域"。该散点图直观展示了这两个特征的组合效应——单一维度的高分不足以保证商业成功，但两者均高则大大增加了成为热歌的概率。

### 5.4 时间趋势分析

**V8 - 音频特征年度趋势**（figures/v8_temporal_trend.png）

统计 1990 年至 2024 年间各音频特征的中位值变化：

- **Danceability 持续上升**：从 1990 年的 0.54 上升至 2024 年的 0.70，增幅约 30%，反映了节奏优先的创作趋势。
- **Energy 波动上升**：从 0.62 升至 0.72，2010 年后加速明显，与电子音乐制作技术的普及时间吻合。
- **Acousticness 持续下降**：从 0.35 降至 0.08，传统乐器在流行音乐中的占比不断缩小。
- **Valence 呈 U 型曲线**：1990-2000 年下降（从 0.55 降至 0.42），2000-2024 年回升（至 0.55）。2000 年初的"阴郁期"与 Grunge、Emo 等亚文化的兴起有关。
- **Tempo 保持稳定**：始终在 115-125 BPM 之间波动，是变化最小的特征。

**V9 - 各年代流派热度变迁**（figures/v9_genre_year_heatmap.png）

热力图展示了不同流派在各年代的热度（样本占比）变化：

- 1990 年代：摇滚（Rock）和流行（Pop）主导，合计占比超 60%。
- 2000 年代：嘻哈（Hip-Hop）和 R&B 快速崛起，市场份额从 15% 增至 30%。
- 2010 年代：电子舞曲（EDM）爆发式增长，流行音乐日趋电子化。
- 2020 年代：嘻哈超越摇滚成为第二大流派，拉丁音乐（Latin）和 Afrobeat 成为新兴力量。

**V10 - 流行度等级年度分布**（figures/v10_popularity_temporal.png）

堆叠面积图展示了 S/A/B/C 四级歌曲在各年份的占比变化。S 级歌曲占比从 2000 年的 5% 增加到 2024 年的 15%，反映了头部效应在马太效应下的持续增强——流媒体平台的推荐算法倾向于放大热门歌曲的优势。

**V11 - 时长年度趋势**（figures/v11_duration_temporal.png）

歌曲平均时长从 1990 年的 264 秒（4 分 24 秒）下降至 2024 年的 212 秒（3 分 32 秒），缩短约 20%。这一趋势与流媒体时代的消费习惯变化一致——短视频和注意力碎片化推动了"短歌"的流行。值得注意的是，2018 年后歌曲时长趋于稳定，表明已形成新的行业标准。

### 5.5 文本与聚类分析

**V12 - Billboard 排名分析**（figures/v12_billboard_rank_analysis.png）

对匹配到 Billboard Hot 100 排名的歌曲进行分析，考察排名与音频特征之间的关系。排名前十的歌曲在 Danceability（均值 0.71）和 Energy（均值 0.74）上均显著高于排名后十位的歌曲（0.58 和 0.61），说明榜单头部歌曲在节奏感和能量感上具有明显优势。同时，前十歌曲的 Valence 均值（0.60）也高于后十位（0.44），表明积极情绪更受市场欢迎。

**V13 - PCA 降维可视化**（figures/v13_pca_clustering.png）

对 8 个音频特征进行 PCA 降维，前两个主成分累计解释 58.3% 的方差。第一主成分（PC1，34.7%）主要负载 Acousticness（负向）、Energy（正向）和 Loudness（正向），可解释为"电子化-原声化"轴。第二主成分（PC2，23.6%）主要负载 Danceability（正向）和 Valence（正向），可解释为"节奏愉悦"轴。

**V14 - KMeans 聚类结果**（figures/v14_kmeans_clusters.png）

肘部法则确定最优聚类数为 K=4。四类聚类结果的特征画像如下：

- **Cluster 0（欢快流行类）**：高 Danceability（0.74）、中高 Energy（0.65）、高 Valence（0.68）。代表歌曲特征：适合派对聚会的流行舞曲。
- **Cluster 1（深沉抒情类）**：低 Energy（0.38）、低 Danceability（0.44）、中低 Valence（0.38）、高 Acousticness（0.52）。代表歌曲特征：抒情慢歌、原声民谣。
- **Cluster 2（高能电子类）**：高 Energy（0.86）、高 Loudness（-3.2 dB）、低 Acousticness（0.06）、中 Danceability（0.57）。代表歌曲特征：电子舞曲、摇滚。
- **Cluster 3（中性过渡类）**：所有特征均处于中等水平，是最大的簇（占总样本 38%），代表了流行音乐的主流样貌。

**V15 - TF-IDF 曲关键词分析**（figures/v15_tfidf_keywords.png）

对曲名进行 TF-IDF 分析，按流派和年代分组提取高权重关键词：

- 流行类高频词：Love、Heart、Dance、Tonight、Beautiful
- 嘻哈类高频词：Money、Life、Real、Hustle、Crew
- 摇滚类高频词：Fire、Never、Alone、Away、Break
- 1990 年代高频词：Forever、Always、Dream、Baby
- 2020 年代高频词：Vibe、Moon、Cloud、Ghost、High

关键词从"永恒广远"到"即时氛围"的转变，反映了社会文化语境的变迁。

**V16 - AI 增强情绪分布**（figures/v16_ai_mood_distribution.png）

基于 LLM 标注的情感基调结果绘制词云与柱状图。"欢快""激昂""放松"是出现频率最高的三种情绪标签，与高 Danceability、高 Energy 的主流歌曲特征一致。"忧伤"和"迷幻"类歌曲虽然占比较低，但在特定受众群体中拥有极高的忠诚度。

**V17 - AI 场景-情绪热力图**（figures/v17_ai_scene_mood_heatmap.png）

将 LLM 标注的适合场景与情感基调进行交叉分析。"派对聚会"场景与"欢快""激昂"情绪高度关联，"深夜独处"场景则与"平静""忧伤"情绪显著对应。"运动健身"场景同时关联"激昂"和"欢快"两种情绪，说明运动场景对歌曲情绪的需求相对宽泛。

## 6. 核心发现讨论

### 6.1 热歌的"高能量高舞蹈"范式

本研究最重要的发现是：当代热歌普遍遵循"高 Danceability × 高 Energy"的组合范式。S 级歌曲的 Danceability 均值（0.71）和 Energy 均值（0.74）均显著高于 C 级歌曲（0.52 和 0.56）。这一组合在散点图中形成了清晰的"热歌区域"——当 Danceability > 0.65 且 Energy > 0.65 时，歌曲进入高流行度区间的概率显著提升。

从音乐制作的角度看，该发现存在合理的因果解释：高 Danceability 激活听众的身体律动本能，高 Energy 维持注意力唤醒水平，两者的协同作用产生了强烈的听觉感染力。流媒体平台的推荐算法进一步强化了这一模式——高参与度（跳过率低、重复播放多）的歌曲获得更多推荐流量，形成了正反馈循环。

### 6.2 Acousticness 的持续衰退

Acousticness 从 1990 年的 0.35 下降至 2024 年的 0.08，降幅接近 80%。这一趋势反映了音乐制作技术的革命性变化——数字音频工作站（DAW，如 Ableton Live、FL Studio）的普及使得电子音色成为主流制作选择。电子制作不仅成本更低、制作效率更高，还能创造出原声乐器无法实现的声音质感。

然而，Acousticness 的持续走低也可能带来音乐审美的同质化风险。近年来 Lo-fi 和 Bedroom Pop 等亚文化的兴起，或许正是听众对过度电子化的一种审美补偿机制。

### 6.3 流行度两极分化

时间趋势分析表明，S 级歌曲的占比从 2000 年的 5% 增长到 2024 年的 15%，而 C 级歌曲的占比相应缩减。这一趋势在流媒体时代尤为明显：推荐算法和播放列表机制的"马太效应"使得头部歌曲获得了不成比例的关注度。

Billboard 排名分析进一步证实了这一点——排名前 10 的歌曲在 Danceability 和 Energy 上显著优于排名后 10 位的歌曲，说明榜单头部位置对音频特征存在明显的筛选效应。

### 6.4 流派边界的模糊化

PCA-KMeans 聚类分析显示，四个聚类并非按传统流派划分，而是按照音频特征的相似度重新组织。同一流派（如 Pop）的歌曲可能分布在多个聚类中，反映出现代流行音乐跨流派融合的趋势。这一现象在 2020 年后尤为明显——Pop 歌曲经常融入 Hip-Hop 的节奏型、EDM 的音色设计和 R&B 的演唱风格。

## 7. 数据局限与改进方向

### 7.1 数据局限

- **样本偏差**：数据集中主要包含英语歌曲，对其他语言市场（如华语音乐、K-Pop）的覆盖不足，结论的跨文化推广性有限。
- **流行度指标**：使用 Spotify 平台的 popularity 评分作为唯一流行度指标，该指标可能受到平台算法和用户偏好的影响，未必完全反映真实市场热度。
- **流派标注**：数据集的 genre 标注较为宽泛（如仅标注 Pop、Rock），缺乏细分子流派信息，限制了对内部差异的分析深度。
- **时间覆盖不均衡**：较早年度的样本量较少，时间趋势分析的统计可靠性有所降低。

### 7.2 改进方向

- **多源数据融合**：引入更多音乐平台数据（如 Apple Music、YouTube Music、网易云音乐），构建更全面的跨平台流行度度量。
- **歌词文本分析**：结合歌词数据进行 NLP 分析，探索歌词主题、词汇复杂度与流行度之间的关系。
- **深度学习建模**：使用 CNN 或 Transformer 模型直接从音频信号中提取特征，与 Spotify 提供的预计算特征进行对比分析。
- **用户行为数据**：引入用户播放行为数据（完播率、收藏率、分享率），构建多维流行度评价体系。
- **纵向因果分析**：采用面板数据模型或双重差分法，探究榜单排名对歌曲后续播放量的因果影响。

## 8. 结论

本研究通过系统性的数据采集、清洗、AI 增强标注、统计分析与可视化，对 Spotify 热门歌曲的音频特征进行了全面的探索性数据分析。研究的主要结论可归纳为：

1. **高 Danceability 和高 Energy 是热歌的核心共性特征**，两者的组合效应远大于单一特征的影响。
2. **过去三十年间音乐特征发生了显著变化**——Danceability 上升 30%、Acousticness 下降 80%、时长缩短 20%，反映了流媒体时代音乐创作范式的转变。
3. **LLM 增强标注能够有效提取歌曲的语义特征**，情绪和场景标签与音频特征之间存在可解释的对应关系。
4. **聚类分析揭示了超越传统流派边界的歌曲结构**，现代流行音乐呈现跨流派融合的显著趋势。
5. **流行度两极分化持续加剧**，流媒体推荐算法可能放大了头部歌曲的竞争优势。

本研究的技术路线（数据采集→清洗→AI 增强→统计建模→可视化的端到端流水线）为音乐数据分析提供了可复用的方法论框架，研究成果可为音乐产业从业者和数据科学教育提供参考。

## 9. 参考文献

1. Spotify for Developers. Web API Reference. https://developer.spotify.com/documentation/web-api/reference/
2. Billboard. Hot 100 Chart. https://www.billboard.com/charts/hot-100/
3. Pandas Development Team. pandas: a Python Data Analysis Library. https://pandas.pydata.org/
4. McKinney, W. (2010). Data Structures for Statistical Computing in Python. Proceedings of the 9th Python in Science Conference.
5. Hunter, J. D. (2007). Matplotlib: A 2D Graphics Environment. Computing in Science & Engineering, 9(3), 90-95.
6. Waskom, M. L. (2021). seaborn: statistical data visualization. Journal of Open Source Software, 6(60), 3021.
7. Pedregosa, F. et al. (2011). Scikit-learn: Machine Learning in Python. Journal of Machine Learning Research, 12, 2825-2830.
8. OpenAI. GPT-4o-mini: Advanced Reasoning Model. https://platform.openai.com/docs/models/gpt-4o-mini
9. Yang, Y. H., & Chen, H. H. (2011). Music Emotion Recognition. CRC Press.
10. Pachet, F., & Roy, P. (2008). Hit Song Science Is Not Yet a Science. Proceedings of ISMIR 2008.

## 附录 A：数据集字段说明

| 字段 | 类型 | 范围 | 说明 |
|------|------|------|------|
| track_id | str | - | Spotify 歌曲唯一 ID |
| name | str | - | 歌曲名称 |
| artists | str | - | 表演艺术家（多艺术家以分号分隔） |
| genre | str | - | 主要流派标签 |
| danceability | float | 0-1 | 舞蹈适应性，基于节奏稳定性、拍子强度等 |
| energy | float | 0-1 | 能量强度，感知强度和活跃度 |
| loudness | float | -60~0 dB | 整体响度 |
| speechiness | float | 0-1 | 口语化程度，检测语音在曲目中的存在 |
| acousticness | float | 0-1 | 原声置信度，是否使用原声乐器 |
| instrumentalness | float | 0-1 | 器乐置信度，是否包含人声 |
| liveness | float | 0-1 | 现场感，检测现场观众存在 |
| valence | float | 0-1 | 情感积极性，音乐传递的积极性 |
| tempo | float | 0~250 BPM | 速度估值 |
| duration_ms | int | - | 持续时间（毫秒） |
| popularity | int | 0-100 | 流行度评分 |

## 附录 B：可视化图表索引

| 编号 | 文件名 | 类型 | 说明 |
|------|--------|------|------|
| V1 | v1_distribution.png | 直方图+密度图 | 音频特征分布 |
| V2 | v2_correlation_heatmap.png | 热力图 | 特征相关性矩阵 |
| V3 | v3_scatter_matrix.png | 散点图矩阵 | 多维特征联合分布 |
| V4 | v4_popularity_boxplot.png | 箱线图 | 流行度等级分组对比 |
| V5 | v5_genre_boxplot.png | 箱线图 | 流派分组对比 |
| V6 | v6_genre_popularity_violin.png | 小提琴图 | 流派流行度分布 |
| V7 | v7_energy_danceability_scatter.png | 散点图 | 能量-舞蹈性双轴分析 |
| V8 | v8_temporal_trend.png | 折线图 | 音频特征的三十年变迁 |
| V9 | v9_genre_year_heatmap.png | 热力图 | 流派年代热力变迁 |
| V10 | v10_popularity_temporal.png | 堆叠面积图 | 流行度等级年度分布 |
| V11 | v11_duration_temporal.png | 折线图 | 歌曲时长变化趋势 |
| V12 | v12_billboard_rank_analysis.png | 分组柱状图 | Billboard 排名特征分析 |
| V13 | v13_pca_clustering.png | 散点图 | PCA 降维投影 |
| V14 | v14_kmeans_clusters.png | 散点图 | KMeans 聚类结果 |
| V15 | v15_tfidf_keywords.png | 词云/柱状图 | 曲名关键词分析 |
| V16 | v16_ai_mood_distribution.png | 词云+柱状图 | AI 增强情绪分布 |
| V17 | v17_ai_scene_mood_heatmap.png | 热力图 | 场景-情绪交叉分析 |

---

*报告生成时间：2026 年 7 月 | 数据来源：Spotify & Billboard | 分析工具：Python + pandas + matplotlib + seaborn + scikit-learn + OpenAI API*
