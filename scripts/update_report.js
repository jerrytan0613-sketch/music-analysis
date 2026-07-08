const fs = require('fs');
const path = require('path');
const reportHtml = path.join(__dirname, '..', 'report', 'report.html');
let html = fs.readFileSync(reportHtml, 'utf-8');

const charts = [
  { id: 1, label: '音频特征分布直方图', caption: 'Danceability、Energy、Valence 等六维特征的分布形态' },
  { id: 2, label: '音频特征相关性热力图', caption: 'Pearson 相关系数矩阵' },
  { id: 3, label: '散点图矩阵', caption: 'Danceability、Energy、Valence 等六维特征的两两散点分布' },
  { id: 4, label: '流行度等级箱线图', caption: 'S/A/B/C 四级流行度的音频特征对比' },
  { id: 5, label: '流派分组对比', caption: '10 大流派的音频特征分布对比' },
  { id: 6, label: '流派-流行度小提琴图', caption: '不同流派的流行度分布形态与密度估计' },
  { id: 7, label: '能量 vs 舞蹈性散点图', caption: '高 Energy x 高 Danceability 区域的"热歌聚集效应"' },
  { id: 8, label: '音频特征年度趋势', caption: '1990-2024 年各音频特征的中位值变化曲线' },
  { id: 9, label: '各年代流派热度变迁', caption: '不同流派在各年代的热度变化热力图' },
  { id: 10, label: '流行度等级年度分布', caption: 'S/A/B/C 四级歌曲在各年份的占比变化' },
  { id: 11, label: '时长年度趋势', caption: '歌曲平均时长从 264 秒到 212 秒的演进' },
  { id: 12, label: 'Billboard 排名分析', caption: 'Hot 100 排名与音频特征的关系' },
  { id: 13, label: 'PCA 降维可视化', caption: '8 维音频特征降至 2 维主成分空间' },
  { id: 14, label: 'KMeans 聚类结果', caption: 'K=4 最优聚类，PCA 降维空间中的簇分布' },
  { id: 15, label: 'TF-IDF 曲关键词分析', caption: '不同流派和年代的曲名关键词权重对比' },
  { id: 16, label: 'AI 增强情绪分布', caption: 'LLM 标注的情感基调词云与频次分布' },
  { id: 17, label: 'AI 场景-情绪热力图', caption: '适合场景与情感基调的交叉分析' },
];

// Replace placeholder with real SVG for each chart
let count = 0;
for (const c of charts) {
  // Build the old placeholder block
  const oldBlock = `<div class="chart-card">
    <div class="chart-card-inner">
      <div class="chart-placeholder">
        <div class="chart-icon">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">`;
  // But each chart has different SVG icon content, so we need a smarter approach

  // Actually let's use a generic pattern: find chart-card-inner with chart-placeholder containing this label
  // Better: match by chart-card structure and label text
  
  // Simple approach: replace each chart-card with div.chart-placeholder containing the label
  const replacements = [
    // V1 - has chart-bars, different structure
    { old: /<div class="chart-card">\s*<div class="chart-card-inner">\s*<div class="chart-placeholder">\s*<div class="chart-bars">[\s\S]*?<\/div>\s*<\/div>\s*<div class="chart-icon">[\s\S]*?<\/svg>\s*<\/div>\s*<div class="chart-label">V1 - 音频特征分布直方图<\/div>\s*<div class="chart-sub">.*?<\/div>\s*<\/div>\s*<div class="chart-caption">Danceability、Energy、Valence 等六维特征的分布形态<\/div>\s*<\/div>\s*<\/div>/,
      new: `<div class="chart-card"><div class="chart-card-inner"><img src="figures/v1_distribution.svg" alt="V1 音频特征分布直方图" style="width:100%;border-radius:12px;display:block"><div class="chart-caption">Danceability、Energy、Valence 等六维特征的分布形态</div></div></div>` },
  ];

  for (const r of replacements) {
    const before = html.length;
    html = html.replace(r.old, r.new);
    if (html.length !== before) count++;
  }
}

// Second pass: replace remaining chart cards by matching their unique label text
for (let i = 1; i <= 17; i++) {
  const c = charts[i - 1];
  const v = `V${c.id}`;
  
  // Match from <div class="chart-card"> through </div></div> (the outer chart-card)
  // by finding the specific chart-label text
  const pattern = new RegExp(
    `<div class="chart-card">\\s*<div class="chart-card-inner">\\s*<div class="chart-placeholder">[\\s\\S]*?<div class="chart-label">${v} - [^<]+<\\/div>[\\s\\S]*?<\\/div>\\s*<div class="chart-caption">[^<]+<\\/div>\\s*<\\/div>\\s*<\\/div>`,
    'g'
  );
  
  const svgName = `v${c.id}_${['distribution','correlation_heatmap','scatter_matrix','popularity_boxplot','genre_boxplot','genre_popularity_violin','energy_danceability_scatter','temporal_trend','genre_year_heatmap','popularity_temporal','duration_temporal','billboard_rank_analysis','pca_clustering','kmeans_clusters','tfidf_keywords','ai_mood_distribution','ai_scene_mood_heatmap'][c.id-1]}.svg`;
  
  const replacement = `<div class="chart-card"><div class="chart-card-inner"><img src="figures/${svgName}" alt="${v} ${c.label}" style="width:100%;border-radius:12px;display:block"><div class="chart-caption">${c.caption}</div></div></div>`;
  
  const oldLen = html.length;
  html = html.replace(pattern, replacement);
  if (html.length !== oldLen) {
    count++;
    console.log(`Replaced V${c.id} - ${c.label}`);
  }
}

console.log(`\nReplaced ${count}/17 chart placeholders`);

// Clean up unused CSS for .chart-placeholder, .chart-bars, .chart-bar, .chart-icon, .chart-label, .chart-sub
// Also remove the @keyframes chart-bar animation
html = html.replace(/\/\* Chart decorative bars \*\/[\s\S]*?@keyframes chart-bar \{[\s\S]*?\}\s*\n\s*/g, '');
html = html.replace(/\.chart-placeholder[\s\S]*?\.chart-sub \{[\s\S]*?\}\s*\n\s*/g, '');

// Add img CSS
html = html.replace('/* ── Chart Cards ── */', 
`/* ── Chart Cards ── */
  .chart-card img {
    width: 100%;
    border-radius: var(--radius);
    display: block;
    background: rgba(0,0,0,0.2);
  }`);

fs.writeFileSync(reportHtml, html, 'utf-8');
console.log('report.html updated.');
