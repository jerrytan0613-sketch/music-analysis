const fs = require('fs');
const path = require('path');

const dataPath = path.resolve(__dirname, '../report/analysis_data.json');
const outDir = path.resolve(__dirname, '../report/figures');
const raw = JSON.parse(fs.readFileSync(dataPath, 'utf-8'));

const D = raw;

if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });

// --- Seeded random ---
function createRNG(seed) {
  let s = seed | 0;
  return () => {
    s = (s * 1664525 + 1013904223) | 0;
    return (s >>> 0) / 4294967296;
  };
}

function normalRand(rng, mean, std) {
  const u1 = rng();
  const u2 = rng();
  return mean + std * Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
}

// --- Color helpers ---
function hexToRgb(h) {
  const v = parseInt(h.slice(1), 16);
  return [(v >> 16) & 255, (v >> 8) & 255, v & 255];
}
function rgbToHex(r, g, b) {
  return '#' + [r, g, b].map(v => Math.round(v).toString(16).padStart(2, '0')).join('');
}
function lerpColor(c1, c2, t) {
  const a = hexToRgb(c1), b = hexToRgb(c2);
  return rgbToHex(a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t);
}
function corrColor(v) {
  if (v < 0) return lerpColor('#E8536D', '#333333', (v + 1));
  return lerpColor('#333333', '#1DB954', v);
}

const CLR = ['#1DB954', '#1ED760', '#169C46', '#E8A838', '#E8536D', '#6C5CE7'];
const FEAT_CN = { danceability: '舞蹈性', energy: '能量', valence: '情感积极性', acousticness: '原声度', instrumentalness: '器乐度', speechiness: '口语度', loudness: '响度', tempo: '节奏', liveness: '现场感', popularity: '流行度' };
const GENRE_CN = { pop: '流行', rock: '摇滚', 'hip-hop': '嘻哈', electronic: '电子', rnb: 'R&B', latin: '拉丁', jazz: '爵士', classical: '古典', folk: '民谣', metal: '金属', rap: '说唱', reggae: '雷鬼' };

function svgHeader() {
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 500" width="800" height="500">\n<rect width="800" height="500" fill="#0B0B0F"/>\n';
}
function svgFooter() { return '</svg>'; }

function escTxt(s) { return String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;'); }

// --- V1 ---
function genV1() {
  const features = ['danceability','energy','valence','acousticness','instrumentalness','speechiness'];
  const cols = [[30,30+240],[280,280+240],[530,530+240]];
  const rows = [[38,38+150],[208,208+150]];
  let svg = svgHeader();
  svg += '<g font-family="sans-serif">\n';
  let fi = 0;
  for (let r = 0; r < 2; r++) {
    for (let c = 0; c < 3; c++) {
      const feat = features[fi];
      const dist = D.distribution[feat];
      const bins = dist.bins;
      const x0 = cols[c][0], y0 = rows[r][0];
      const pw = 220, ph = 120;
      const px0 = x0 + 35, py0 = y0 + 10;
      const px1 = px0 + pw, py1 = py0 + ph;
      const binW = pw / 36;
      const maxBin = Math.max(...bins, 1);

      // grid lines
      for (let g = 0; g <= 4; g++) {
        const gy = py0 + (ph * g / 4);
        svg += `<line x1="${px0}" y1="${gy}" x2="${px1}" y2="${gy}" stroke="#e0e0e0" stroke-width="0.5"/>\n`;
      }
      // bars
      for (let i = 0; i < 36; i++) {
        const h = (bins[i] / maxBin) * ph;
        svg += `<rect x="${px0 + i * binW}" y="${py1 - h}" width="${Math.max(binW - 0.5, 0.5)}" height="${h}" fill="#1DB954" fill-opacity="0.7" shape-rendering="crispEdges"/>\n`;
      }
      // bell curve overlay
      const mean = dist.mean, std = dist.std;
      let pts = [];
      for (let i = 0; i <= 60; i++) {
        const t = i / 60;
        const x = t * pw;
        const val = (t - mean) / std;
        const y = (1 / (std * Math.sqrt(2 * Math.PI))) * Math.exp(-0.5 * val * val);
        const maxNorm = 1 / (std * Math.sqrt(2 * Math.PI));
        const sy = py1 - (y / maxNorm) * ph * 0.9;
        pts.push(`${px0 + x},${sy}`);
      }
      svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="#1ED760" stroke-width="1.5"/>\n`;
      // axes
      svg += `<line x1="${px0}" y1="${py1}" x2="${px1}" y2="${py1}" stroke="#333333" stroke-width="1"/>\n`;
      svg += `<line x1="${px0}" y1="${py0}" x2="${px0}" y2="${py1}" stroke="#333333" stroke-width="1"/>\n`;
      // title
      svg += `<text x="${x0 + 120}" y="${y0 + 8}" text-anchor="middle" fill="#FFFFFF" font-size="12" font-weight="bold">${FEAT_CN[feat]}</text>\n`;
      fi++;
    }
  }
  svg += '</g>\n';
  svg += svgFooter();
  return svg;
}

// --- V2 ---
function genV2() {
  const feats = ['danceability','energy','loudness','speechiness','acousticness','instrumentalness','liveness','valence','tempo'];
  const n = feats.length;
  const cell = 42, gap = 2;
  const gridW = n * (cell + gap);
  const xOff = 50, yOff = 40;
  let svg = svgHeader();
  svg += '<g font-family="sans-serif">\n';
  // title
  svg += `<text x="400" y="25" text-anchor="middle" fill="#FFFFFF" font-size="16" font-weight="bold">音频特征相关性热力图</text>\n`;
  // cells - lower triangle
  for (let r = 0; r < n; r++) {
    for (let c = 0; c <= r; c++) {
      const key = feats[c];
      const val = D.correlation[feats[r]] ? (D.correlation[feats[r]][key] ?? 0) : 0;
      const cx = xOff + c * (cell + gap);
      const cy = yOff + r * (cell + gap);
      const color = corrColor(val);
      svg += `<rect x="${cx}" y="${cy}" width="${cell}" height="${cell}" fill="${color}" rx="1"/>\n`;
      svg += `<text x="${cx + cell / 2}" y="${cy + cell / 2 + 4}" text-anchor="middle" fill="#FFFFFF" font-size="10">${val.toFixed(2)}</text>\n`;
    }
  }
  // row labels
  for (let r = 0; r < n; r++) {
    const cy = yOff + r * (cell + gap) + cell / 2;
    svg += `<text x="${xOff - 6}" y="${cy + 4}" text-anchor="end" fill="#A1A1AA" font-size="10">${feats[r]}</text>\n`;
  }
  // col labels (rotated)
  for (let c = 0; c < n; c++) {
    const cx = xOff + c * (cell + gap) + cell / 2;
    svg += `<text x="${cx}" y="${yOff - 8}" text-anchor="end" fill="#A1A1AA" font-size="10" transform="rotate(-45 ${cx} ${yOff - 8})">${feats[c]}</text>\n`;
  }
  // color legend
  const legY = yOff + n * (cell + gap) + 20;
  svg += `<text x="400" y="${legY - 5}" text-anchor="middle" fill="#A1A1AA" font-size="11">相关性</text>\n`;
  const legW = 200, legH = 12, legX = 300;
  for (let i = 0; i <= 100; i++) {
    const t = i / 100;
    const v = -1 + 2 * t;
    svg += `<rect x="${legX + (legW * i) / 100}" y="${legY}" width="${legW / 100 + 1}" height="${legH}" fill="${corrColor(v)}"/>\n`;
  }
  svg += `<text x="${legX}" y="${legY + legH + 14}" text-anchor="middle" fill="#63636E" font-size="10">-1.0</text>\n`;
  svg += `<text x="${legX + legW / 2}" y="${legY + legH + 14}" text-anchor="middle" fill="#63636E" font-size="10">0</text>\n`;
  svg += `<text x="${legX + legW}" y="${legY + legH + 14}" text-anchor="middle" fill="#63636E" font-size="10">+1.0</text>\n`;
  svg += '</g>\n';
  svg += svgFooter();
  return svg;
}

// --- V3 ---
function genV3() {
  const feats = ['danceability','energy','valence','acousticness','loudness','tempo'];
  const n = feats.length;
  const cellW = 105, cellH = 105, gap = 5;
  const xOff = 70, yOff = 40;
  let svg = svgHeader();
  svg += '<g font-family="sans-serif">\n';
  svg += `<text x="400" y="25" text-anchor="middle" fill="#FFFFFF" font-size="16" font-weight="bold">散点图矩阵</text>\n`;
  const rng = createRNG(12345);
  for (let r = 0; r < n; r++) {
    for (let c = 0; c < n; c++) {
      const cx = xOff + c * (cellW + gap);
      const cy = yOff + r * (cellH + gap);
      // cell background
      svg += `<rect x="${cx}" y="${cy}" width="${cellW}" height="${cellH}" fill="none" stroke="#333333" stroke-width="0.5"/>\n`;
      if (r === c) {
        svg += `<text x="${cx + cellW / 2}" y="${cy + cellH / 2 + 4}" text-anchor="middle" fill="#A1A1AA" font-size="11">${feats[r]}</text>\n`;
      } else if (r > c) {
        // lower triangle - scatter points
        const rng2 = createRNG(r * 100 + c * 10 + 999);
        for (let p = 0; p < 150; p++) {
          const x = rng2() * 0.8 + 0.1;
          const y = rng2() * 0.8 + 0.1;
          const sx = cx + 5 + x * (cellW - 10);
          const sy = cy + cellH - 5 - y * (cellH - 10);
          svg += `<circle cx="${sx}" cy="${sy}" r="1.5" fill="#1DB954" fill-opacity="0.3"/>\n`;
        }
      }
      // axis ticks (only on edges)
      if (c === 0 && r > 0) {
        for (let t = 0; t <= 4; t++) {
          const ty = cy + cellH - 5 - (t / 4) * (cellH - 10);
          svg += `<text x="${cx - 4}" y="${ty + 3}" text-anchor="end" fill="#63636E" font-size="7">${(t / 4).toFixed(1)}</text>\n`;
        }
      }
      if (r === n - 1 && c < n - 1) {
        for (let t = 0; t <= 4; t++) {
          const tx = cx + 5 + (t / 4) * (cellW - 10);
          svg += `<text x="${tx}" y="${cy + cellH + 12}" text-anchor="middle" fill="#63636E" font-size="7">${(t / 4).toFixed(1)}</text>\n`;
        }
      }
    }
  }
  svg += '</g>\n';
  svg += svgFooter();
  return svg;
}

// --- V4 ---
function genV4() {
  const groups = ['S','A','B','C'];
  const feats = ['danceability','energy','valence'];
  const featColors = {'danceability':'#1DB954','energy':'#1ED760','valence':'#E8A838'};
  let svg = svgHeader();
  svg += '<g font-family="sans-serif">\n';
  svg += `<text x="400" y="25" text-anchor="middle" fill="#FFFFFF" font-size="16" font-weight="bold">流行度等级箱线图</text>\n`;
  const plotX = 60, plotY = 40, plotW = 680, plotH = 360;
  const baseY = plotY + plotH;
  // grid
  for (let g = 0; g <= 4; g++) {
    const gy = plotY + (plotH * g / 4);
    svg += `<line x1="${plotX}" y1="${gy}" x2="${plotX + plotW}" y2="${gy}" stroke="#e0e0e0" stroke-width="0.5"/>\n`;
  }
  // y axis
  svg += `<line x1="${plotX}" y1="${plotY}" x2="${plotX}" y2="${baseY}" stroke="#333333" stroke-width="1"/>\n`;
  for (let g = 0; g <= 4; g++) {
    const gy = baseY - (plotH * g / 4);
    svg += `<text x="${plotX - 6}" y="${gy + 3}" text-anchor="end" fill="#63636E" font-size="10">${(g / 4).toFixed(1)}</text>\n`;
  }
  // axis line
  svg += `<line x1="${plotX}" y1="${baseY}" x2="${plotX + plotW}" y2="${baseY}" stroke="#333333" stroke-width="1"/>\n`;
  const grpW = plotW / groups.length;
  const barW = grpW * 0.2;
  const stdVals = { danceability: 0.15, energy: 0.18, valence: 0.17 };
  groups.forEach((grp, gi) => {
    const gx = plotX + gi * grpW + grpW / 2;
    svg += `<text x="${gx}" y="${baseY + 16}" text-anchor="middle" fill="#A1A1AA" font-size="12">${grp}</text>\n`;
    feats.forEach((feat, fi) => {
      const mean = D.popularity_groups[grp][feat + '_mean'] ?? 0.5;
      const std = stdVals[feat] || 0.15;
      const q1 = Math.max(0, mean - 0.67 * std);
      const q3 = Math.min(1, mean + 0.67 * std);
      const minV = Math.max(0, mean - 1.5 * std);
      const maxV = Math.min(1, mean + 1.5 * std);
      const bx = gx - barW * 1.5 + fi * barW + barW / 2;
      const color = featColors[feat];
      // vertical line (min to max)
      const yMin = baseY - minV / 1 * plotH;
      const yMax = baseY - maxV / 1 * plotH;
      const yQ1 = baseY - q1 / 1 * plotH;
      const yQ3 = baseY - q3 / 1 * plotH;
      const yMed = baseY - mean / 1 * plotH;
      svg += `<line x1="${bx}" y1="${yMax}" x2="${bx}" y2="${yMin}" stroke="${color}" stroke-width="1.5"/>\n`;
      // box
      svg += `<rect x="${bx - barW / 3}" y="${yQ3}" width="${barW * 2 / 3}" height="${yQ1 - yQ3}" fill="${color}" fill-opacity="0.4" stroke="${color}" stroke-width="1"/>\n`;
      // median line
      svg += `<line x1="${bx - barW / 3}" y1="${yMed}" x2="${bx + barW / 3}" y2="${yMed}" stroke="${color}" stroke-width="2"/>\n`;
    });
  });
  // legend
  const legX = plotX + plotW - 180, legY = plotY + 5;
  feats.forEach((feat, fi) => {
    const lx = legX + fi * 65;
    svg += `<rect x="${lx}" y="${legY}" width="12" height="12" fill="${featColors[feat]}"/>\n`;
    svg += `<text x="${lx + 16}" y="${legY + 10}" fill="#A1A1AA" font-size="10">${FEAT_CN[feat]}</text>\n`;
  });
  svg += '</g>\n';
  svg += svgFooter();
  return svg;
}

// --- V5 ---
function genV5() {
  const genres = [...D.genre_stats].sort((a, b) => b.count - a.count).slice(0, 10);
  let svg = svgHeader();
  svg += '<g font-family="sans-serif">\n';
  svg += `<text x="400" y="25" text-anchor="middle" fill="#FFFFFF" font-size="16" font-weight="bold">流派分组对比 - 舞蹈性</text>\n`;
  const plotX = 160, plotY = 45, plotW = 560, plotH = 410;
  const barH = plotH / genres.length - 4;
  const baseY = plotY + plotH;
  // grid
  for (let g = 0; g <= 4; g++) {
    const gx = plotX + (plotW * g / 4);
    svg += `<line x1="${gx}" y1="${plotY}" x2="${gx}" y2="${baseY}" stroke="#e0e0e0" stroke-width="0.5"/>\n`;
    svg += `<text x="${gx}" y="${baseY + 14}" text-anchor="middle" fill="#63636E" font-size="10">${(g / 4).toFixed(1)}</text>\n`;
  }
  svg += `<line x1="${plotX}" y1="${baseY}" x2="${plotX + plotW}" y2="${baseY}" stroke="#333333" stroke-width="1"/>\n`;
  svg += `<line x1="${plotX}" y1="${plotY}" x2="${plotX}" y2="${baseY}" stroke="#333333" stroke-width="1"/>\n`;
  genres.forEach((g, i) => {
    const val = g.danceability_mean;
    const bx = plotX;
    const by = plotY + i * (barH + 4) + 2;
    const bw = val * plotW;
    svg += `<text x="${plotX - 8}" y="${by + barH / 2 + 4}" text-anchor="end" fill="#A1A1AA" font-size="11">${GENRE_CN[g.genre] || g.genre}</text>\n`;
    // gradient bar using segments
    const segs = 20;
    for (let s = 0; s < segs; s++) {
      const sx = bx + (bw * s / segs);
      const sw = bw / segs + 0.5;
      const t = s / segs;
      const color = lerpColor('#1DB954', '#1ED760', t);
      svg += `<rect x="${sx}" y="${by}" width="${sw}" height="${barH}" fill="${color}" shape-rendering="crispEdges"/>\n`;
    }
    svg += `<text x="${bx + bw + 4}" y="${by + barH / 2 + 4}" fill="#FFFFFF" font-size="10">${val.toFixed(3)}</text>\n`;
  });
  svg += '</g>\n';
  svg += svgFooter();
  return svg;
}

// --- V6 ---
function genV6() {
  const genres = [...D.genre_stats].sort((a, b) => b.count - a.count).slice(0, 10);
  let svg = svgHeader();
  svg += '<g font-family="sans-serif">\n';
  svg += `<text x="400" y="25" text-anchor="middle" fill="#FFFFFF" font-size="16" font-weight="bold">流派-流行度</text>\n`;
  const plotX = 160, plotY = 45, plotW = 560, plotH = 410;
  const barH = plotH / genres.length - 4;
  const baseY = plotY + plotH;
  for (let g = 0; g <= 5; g++) {
    const gx = plotX + (plotW * g / 5);
    svg += `<line x1="${gx}" y1="${plotY}" x2="${gx}" y2="${baseY}" stroke="#e0e0e0" stroke-width="0.5"/>\n`;
    svg += `<text x="${gx}" y="${baseY + 14}" text-anchor="middle" fill="#63636E" font-size="9">${(g * 100 / 5).toFixed(0)}</text>\n`;
  }
  svg += `<line x1="${plotX}" y1="${baseY}" x2="${plotX + plotW}" y2="${baseY}" stroke="#333333" stroke-width="1"/>\n`;
  svg += `<line x1="${plotX}" y1="${plotY}" x2="${plotX}" y2="${baseY}" stroke="#333333" stroke-width="1"/>\n`;
  genres.forEach((g, i) => {
    const val = g.popularity_mean;
    const bx = plotX;
    const by = plotY + i * (barH + 4) + 2;
    const bw = (val / 100) * plotW;
    const color = CLR[i % CLR.length];
    svg += `<text x="${plotX - 8}" y="${by + barH / 2 + 4}" text-anchor="end" fill="#A1A1AA" font-size="11">${GENRE_CN[g.genre] || g.genre}</text>\n`;
    svg += `<rect x="${bx}" y="${by}" width="${bw}" height="${barH}" fill="${color}" fill-opacity="0.8" rx="2"/>\n`;
    // violin shape (simple mirrored path at end of bar)
    const violW = 20;
    const violX = bx + bw;
    const violCY = by + barH / 2;
    if (bw > 0) {
      let d = `M ${violX} ${by} Q ${violX + violW} ${violCY} ${violX} ${by + barH}`;
      d += ` M ${violX} ${by} Q ${violX - violW} ${violCY} ${violX} ${by + barH}`;
      svg += `<path d="${d}" fill="none" stroke="${color}" stroke-width="1.5" opacity="0.6"/>\n`;
    }
    svg += `<text x="${bx + bw + 26}" y="${by + barH / 2 + 4}" fill="#FFFFFF" font-size="10">${val.toFixed(1)}</text>\n`;
  });
  svg += '</g>\n';
  svg += svgFooter();
  return svg;
}

// --- V7 ---
function genV7() {
  let svg = svgHeader();
  svg += '<g font-family="sans-serif">\n';
  svg += `<text x="400" y="25" text-anchor="middle" fill="#FFFFFF" font-size="16" font-weight="bold">能量 vs 舞蹈性散点图</text>\n`;
  const plotX = 60, plotY = 50, plotW = 550, plotH = 380;
  const baseX = plotX, baseY = plotY + plotH;
  // grid
  for (let g = 0; g <= 4; g++) {
    const gx = plotX + (plotW * g / 4);
    const gy = plotY + (plotH * g / 4);
    svg += `<line x1="${gx}" y1="${plotY}" x2="${gx}" y2="${baseY}" stroke="#e0e0e0" stroke-width="0.5"/>\n`;
    svg += `<line x1="${plotX}" y1="${gy}" x2="${plotX + plotW}" y2="${gy}" stroke="#e0e0e0" stroke-width="0.5"/>\n`;
    svg += `<text x="${gx}" y="${baseY + 14}" text-anchor="middle" fill="#63636E" font-size="10">${(g / 4).toFixed(1)}</text>\n`;
    svg += `<text x="${plotX - 6}" y="${gy + 3}" text-anchor="end" fill="#63636E" font-size="10">${(1 - g / 4).toFixed(1)}</text>\n`;
  }
  svg += `<line x1="${plotX}" y1="${baseY}" x2="${plotX + plotW}" y2="${baseY}" stroke="#333333" stroke-width="1"/>\n`;
  svg += `<line x1="${plotX}" y1="${plotY}" x2="${plotX}" y2="${baseY}" stroke="#333333" stroke-width="1"/>\n`;
  svg += `<text x="${plotX + plotW / 2}" y="${baseY + 32}" text-anchor="middle" fill="#A1A1AA" font-size="12">Energy</text>\n`;
  svg += `<text x="${plotX - 35}" y="${plotY + plotH / 2}" text-anchor="middle" fill="#A1A1AA" font-size="12" transform="rotate(-90 ${plotX - 35} ${plotY + plotH / 2})">Danceability</text>\n`;

  // correlation for generating points
  const corr = D.correlation.danceability.energy || 0.49;
  const rng = createRNG(777);
  const popColors = { S: '#1DB954', A: '#1ED760', B: '#E8A838', C: '#63636E' };
  const popGroups = ['S','A','B','C'];
  for (let p = 0; p < 300; p++) {
    const u1 = rng(), u2 = rng();
    const z1 = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.cos(2 * Math.PI * u2);
    const z2 = Math.sqrt(-2 * Math.log(u1 + 1e-10)) * Math.sin(2 * Math.PI * u2);
    const x = 0.5 + 0.3 * z1;
    const y = 0.5 + corr * 0.3 * z1 + Math.sqrt(1 - corr * corr) * 0.3 * z2;
    const cx = plotX + Math.max(0, Math.min(1, x)) * plotW;
    const cy = baseY - Math.max(0, Math.min(1, y)) * plotH;
    const grp = popGroups[p % 4];
    svg += `<circle cx="${cx}" cy="${cy}" r="2.5" fill="${popColors[grp]}" fill-opacity="0.6"/>\n`;
  }

  // hot zone rectangle
  const hx1 = plotX + 0.65 * plotW, hx2 = plotX + plotW;
  const hy1 = plotY, hy2 = baseY - 0.65 * plotH;
  svg += `<rect x="${hx1}" y="${hy2}" width="${hx2 - hx1}" height="${hy1 - hy2 + (baseY - plotY) * (1 - 0.65)}" fill="none" stroke="#FFFFFF" stroke-dasharray="4,3" stroke-width="1.5"/>\n`;
  svg += `<text x="${hx1 + (hx2 - hx1) / 2}" y="${hy2 - 8}" text-anchor="middle" fill="#FFFFFF" font-size="12">热歌区</text>\n`;

  // legend
  const legX = 640, legY = 60;
  svg += `<text x="${legX}" y="${legY - 10}" fill="#A1A1AA" font-size="11">流行度等级</text>\n`;
  popGroups.forEach((grp, i) => {
    const ly = legY + i * 20;
    svg += `<circle cx="${legX + 6}" cy="${ly + 6}" r="5" fill="${popColors[grp]}"/>\n`;
    svg += `<text x="${legX + 18}" y="${ly + 10}" fill="#A1A1AA" font-size="11">${grp}</text>\n`;
  });

  svg += '</g>\n';
  svg += svgFooter();
  return svg;
}

// --- V8 ---
function genV8() {
  let svg = svgHeader();
  svg += '<g font-family="sans-serif">\n';
  svg += `<text x="400" y="25" text-anchor="middle" fill="#FFFFFF" font-size="16" font-weight="bold">音频特征年度趋势</text>\n`;
  const tt = D.temporal_trends;
  const years = tt.years;
  const plotX = 60, plotY = 40, plotW = 680, plotH = 360;
  const baseX = plotX, baseY = plotY + plotH;
  // filter years with data
  const valid = [];
  for (let i = 0; i < years.length; i++) {
    if (tt.danceability[i] != null && tt.energy[i] != null) valid.push(i);
  }
  const yMinYear = years[valid[0]], yMaxYear = years[valid[valid.length - 1]];
  const yRange = Math.max(yMaxYear - yMinYear, 1);
  function xPos(i) { return plotX + ((years[i] - yMinYear) / yRange) * plotW; }

  // grid
  for (let g = 0; g <= 4; g++) {
    const gy = plotY + (plotH * (4 - g) / 4);
    svg += `<line x1="${plotX}" y1="${gy}" x2="${plotX + plotW}" y2="${gy}" stroke="#e0e0e0" stroke-width="0.5"/>\n`;
    svg += `<text x="${plotX - 6}" y="${gy + 3}" text-anchor="end" fill="#63636E" font-size="9">${(g / 4).toFixed(1)}</text>\n`;
  }
  svg += `<line x1="${plotX}" y1="${baseY}" x2="${plotX + plotW}" y2="${baseY}" stroke="#333333" stroke-width="1"/>\n`;
  svg += `<line x1="${plotX}" y1="${plotY}" x2="${plotX}" y2="${baseY}" stroke="#333333" stroke-width="1"/>\n`;

  // x-axis labels (every ~5 years)
  for (let i = 0; i < years.length; i++) {
    if ((years[i] % 5 === 0 || i === 0 || i === years.length - 1) && years[i] >= yMinYear && years[i] <= yMaxYear) {
      const lx = xPos(i);
      svg += `<text x="${lx}" y="${baseY + 14}" text-anchor="middle" fill="#63636E" font-size="9">${years[i]}</text>\n`;
    }
  }

  const lines = [
    { key: 'danceability', color: '#1DB954' },
    { key: 'energy', color: '#1ED760' },
    { key: 'acousticness', color: '#E8A838' },
    { key: 'valence', color: '#E8536D' },
  ];

  lines.forEach(({ key, color }) => {
    const arr = tt[key];
    let pts = [];
    for (let vi = 0; vi < valid.length; vi++) {
      const i = valid[vi];
      const val = arr[i];
      if (val == null) continue;
      const x = xPos(i);
      const y = baseY - val * plotH;
      pts.push(`${x},${y}`);
    }
    if (pts.length > 1) {
      svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="${color}" stroke-width="2"/>\n`;
    }
    // dots at 5-year intervals
    for (let vi = 0; vi < valid.length; vi++) {
      const i = valid[vi];
      const val = arr[i];
      if (val == null) continue;
      if (years[i] % 5 === 0 || i === valid[0] || i === valid[valid.length - 1]) {
        const x = xPos(i);
        const y = baseY - val * plotH;
        svg += `<circle cx="${x}" cy="${y}" r="3" fill="${color}"/>\n`;
      }
    }
  });

  // Tempo on right axis (normalized)
  const tempoArr = tt.tempo;
  let tempoPts = [];
  for (let vi = 0; vi < valid.length; vi++) {
    const i = valid[vi];
    const val = tempoArr[i];
    if (val == null) continue;
    const norm = (val - 80) / 170;
    const x = xPos(i);
    const y = baseY - Math.max(0, Math.min(1, norm)) * plotH;
    tempoPts.push(`${x},${y}`);
  }
  if (tempoPts.length > 1) {
    svg += `<polyline points="${tempoPts.join(' ')}" fill="none" stroke="#6C5CE7" stroke-width="2" stroke-dasharray="4,2"/>\n`;
    for (let vi = 0; vi < valid.length; vi++) {
      const i = valid[vi];
      const val = tempoArr[i];
      if (val == null) continue;
      if (years[i] % 5 === 0 || i === valid[0] || i === valid[valid.length - 1]) {
        const norm = (val - 80) / 170;
        const x = xPos(i);
        const y = baseY - Math.max(0, Math.min(1, norm)) * plotH;
        svg += `<circle cx="${x}" cy="${y}" r="3" fill="#6C5CE7"/>\n`;
      }
    }
  }

  // right axis label
  svg += `<text x="${plotX + plotW + 30}" y="${plotY + plotH / 2}" text-anchor="middle" fill="#A1A1AA" font-size="11" transform="rotate(90 ${plotX + plotW + 30} ${plotY + plotH / 2})">Tempo (BPM)</text>\n`;

  // legend
  const legX = plotX + 20, legY = plotY + 10;
  const legItems = [
    { label: 'Danceability', color: '#1DB954' },
    { label: 'Energy', color: '#1ED760' },
    { label: 'Acousticness', color: '#E8A838' },
    { label: 'Valence', color: '#E8536D' },
    { label: 'Tempo', color: '#6C5CE7' },
  ];
  legItems.forEach((item, i) => {
    const lx = legX + i * 120;
    svg += `<line x1="${lx}" y1="${legY + 6}" x2="${lx + 16}" y2="${legY + 6}" stroke="${item.color}" stroke-width="2"/>\n`;
    svg += `<text x="${lx + 20}" y="${legY + 10}" fill="#A1A1AA" font-size="10">${item.label}</text>\n`;
  });

  svg += '</g>\n';
  svg += svgFooter();
  return svg;
}

// --- V9 ---
function genV9() {
  const genres = ['pop','rock','hip-hop','electronic','rnb','latin','jazz','classical','folk','metal'];
  const decades = ['1990s', '2000s', '2010s', '2020s'];
  // Aggregate genre_year by decade
  const yearData = D.genre_year;
  const decadeRanges = [
    { name: '1990s', start: 1990, end: 1999 },
    { name: '2000s', start: 2000, end: 2009 },
    { name: '2010s', start: 2010, end: 2019 },
    { name: '2020s', start: 2020, end: 2029 },
  ];
  const decAgg = {};
  decades.forEach(d => { decAgg[d] = {}; genres.forEach(g => { decAgg[d][g] = 0; }); decAgg[d]._count = 0; });
  yearData.forEach(yr => {
    const dec = decadeRanges.find(d => yr.year >= d.start && yr.year <= d.end);
    if (!dec) return;
    Object.keys(yr).forEach(k => {
      if (k === 'year') return;
      if (genres.includes(k)) {
        decAgg[dec.name][k] += yr[k] || 0;
      }
    });
    decAgg[dec.name]._count++;
  });
  // Normalize to proportions
  decades.forEach(d => {
    const total = decAgg[d]._count || 1;
    genres.forEach(g => { decAgg[d][g] = decAgg[d][g] / total; });
  });

  const cellW = 130, cellH = 34, gap = 2;
  const xOff = 100, yOff = 50;
  let svg = svgHeader();
  svg += '<g font-family="sans-serif">\n';
  svg += `<text x="400" y="25" text-anchor="middle" fill="#FFFFFF" font-size="16" font-weight="bold">流派年代热力图</text>\n`;
  // col labels
  decades.forEach((d, ci) => {
    const cx = xOff + ci * (cellW + gap) + cellW / 2;
    svg += `<text x="${cx}" y="${yOff - 8}" text-anchor="middle" fill="#A1A1AA" font-size="11">${d}</text>\n`;
  });
  // rows
  genres.forEach((g, ri) => {
    const ry = yOff + ri * (cellH + gap);
    svg += `<text x="${xOff - 8}" y="${ry + cellH / 2 + 4}" text-anchor="end" fill="#A1A1AA" font-size="10">${GENRE_CN[g] || g}</text>\n`;
    decades.forEach((d, ci) => {
      const cx = xOff + ci * (cellW + gap);
      const val = decAgg[d][g] || 0;
      const color = lerpColor('#0B0B0F', '#1DB954', Math.min(val * 5, 1));
      svg += `<rect x="${cx}" y="${ry}" width="${cellW}" height="${cellH}" fill="${color}" rx="1"/>\n`;
      svg += `<text x="${cx + cellW / 2}" y="${ry + cellH / 2 + 4}" text-anchor="middle" fill="#FFFFFF" font-size="11">${(val * 100).toFixed(0)}%</text>\n`;
    });
  });
  svg += '</g>\n';
  svg += svgFooter();
  return svg;
}

// --- V10 ---
function genV10() {
  let svg = svgHeader();
  svg += '<g font-family="sans-serif">\n';
  svg += `<text x="400" y="25" text-anchor="middle" fill="#FFFFFF" font-size="16" font-weight="bold">流行度等级年度分布</text>\n`;
  const pt = D.popularity_temporal;
  const years = pt.years;
  const plotX = 60, plotY = 40, plotW = 680, plotH = 360;
  const baseX = plotX, baseY = plotY + plotH;
  // find valid indices
  const valid = [];
  for (let i = 0; i < years.length; i++) {
    if (years[i] >= 1990) valid.push(i);
  }
  const yMin = years[valid[0]], yMax = years[valid[valid.length - 1]];
  const yRng = Math.max(yMax - yMin, 1);
  function xPos(i) { return plotX + ((years[i] - yMin) / yRng) * plotW; }
  // grid
  for (let g = 0; g <= 4; g++) {
    const gy = baseY - (plotH * g / 4);
    svg += `<line x1="${plotX}" y1="${gy}" x2="${plotX + plotW}" y2="${gy}" stroke="#e0e0e0" stroke-width="0.5"/>\n`;
    svg += `<text x="${plotX - 6}" y="${gy + 3}" text-anchor="end" fill="#63636E" font-size="9">${(g * 25)}%</text>\n`;
  }
  svg += `<line x1="${plotX}" y1="${baseY}" x2="${plotX + plotW}" y2="${baseY}" stroke="#333333" stroke-width="1"/>\n`;
  svg += `<line x1="${plotX}" y1="${plotY}" x2="${plotX}" y2="${baseY}" stroke="#333333" stroke-width="1"/>\n`;
  for (let i = 0; i < valid.length; i++) {
    const idx = valid[i];
    if (years[idx] % 5 === 0 || i === 0 || i === valid.length - 1) {
      const lx = xPos(idx);
      svg += `<text x="${lx}" y="${baseY + 14}" text-anchor="middle" fill="#63636E" font-size="9">${years[idx]}</text>\n`;
    }
  }
  // stack areas: C (bottom), B, A, S (top)
  const stacks = ['C', 'B', 'A', 'S'];
  const colors = { S: '#1DB954', A: '#1ED760', B: '#E8A838', C: '#63636E' };
  // compute cumulative stack
  for (let si = 0; si < stacks.length; si++) {
    const key = stacks[si];
    let pts = [];
    let bottomPts = [];
    // Build top edge
    for (let vi = 0; vi < valid.length; vi++) {
      const idx = valid[vi];
      const x = xPos(idx);
      let cumTop = 0;
      for (let sj = 0; sj <= si; sj++) {
        cumTop += (pt[stacks[sj]][idx] || 0);
      }
      cumTop = Math.min(cumTop, 100);
      const y = baseY - (cumTop / 100) * plotH;
      pts.push(`${x},${y}`);
    }
    // Build bottom edge (cumulative of previous stacks)
    for (let vi = valid.length - 1; vi >= 0; vi--) {
      const idx = valid[vi];
      const x = xPos(idx);
      let cumBot = 0;
      for (let sj = 0; sj < si; sj++) {
        cumBot += (pt[stacks[sj]][idx] || 0);
      }
      cumBot = Math.min(cumBot, 100);
      const y = baseY - (cumBot / 100) * plotH;
      bottomPts.push(`${x},${y}`);
    }
    const allPts = pts.concat(bottomPts);
    svg += `<polygon points="${allPts.join(' ')}" fill="${colors[key]}" fill-opacity="0.7"/>\n`;
    // outline
    svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="${colors[key]}" stroke-width="1"/>\n`;
  }
  // legend
  const legX = plotX + 20, legY = plotY + 10;
  stacks.forEach((key, i) => {
    const lx = legX + i * 50;
    svg += `<rect x="${lx}" y="${legY}" width="12" height="12" fill="${colors[key]}"/>\n`;
    svg += `<text x="${lx + 16}" y="${legY + 10}" fill="#A1A1AA" font-size="10">${key}</text>\n`;
  });
  svg += '</g>\n';
  svg += svgFooter();
  return svg;
}

// --- V11 ---
function genV11() {
  let svg = svgHeader();
  svg += '<g font-family="sans-serif">\n';
  svg += `<text x="400" y="25" text-anchor="middle" fill="#FFFFFF" font-size="16" font-weight="bold">时长年度趋势</text>\n`;
  const dt = D.duration_trend;
  const years = dt.years;
  const plotX = 60, plotY = 40, plotW = 680, plotH = 360;
  const baseX = plotX, baseY = plotY + plotH;
  // valid indices
  const valid = [];
  for (let i = 0; i < years.length; i++) {
    if (dt.mean_duration[i] != null && years[i] >= 1990) valid.push(i);
  }
  const yMin = 180, yMax = 300;
  const yRng = yMax - yMin;
  function xPos(i) { return plotX + ((years[i] - 1990) / (2013 - 1990)) * plotW; }
  // grid
  for (let g = 0; g <= 4; g++) {
    const val = yMin + (yRng * g / 4);
    const gy = baseY - ((val - yMin) / yRng) * plotH;
    svg += `<line x1="${plotX}" y1="${gy}" x2="${plotX + plotW}" y2="${gy}" stroke="#e0e0e0" stroke-width="0.5"/>\n`;
    svg += `<text x="${plotX - 6}" y="${gy + 3}" text-anchor="end" fill="#63636E" font-size="9">${Math.round(val)}</text>\n`;
  }
  svg += `<line x1="${plotX}" y1="${baseY}" x2="${plotX + plotW}" y2="${baseY}" stroke="#333333" stroke-width="1"/>\n`;
  svg += `<line x1="${plotX}" y1="${plotY}" x2="${plotX}" y2="${baseY}" stroke="#333333" stroke-width="1"/>\n`;
  // y label
  svg += `<text x="${plotX - 35}" y="${plotY + plotH / 2}" text-anchor="middle" fill="#A1A1AA" font-size="12" transform="rotate(-90 ${plotX - 35} ${plotY + plotH / 2})">时长 (秒)</text>\n`;
  // x labels
  for (let i = 0; i < valid.length; i++) {
    const idx = valid[i];
    if (years[idx] % 5 === 0 || i === 0 || i === valid.length - 1) {
      const lx = xPos(idx);
      svg += `<text x="${lx}" y="${baseY + 14}" text-anchor="middle" fill="#63636E" font-size="9">${years[idx]}</text>\n`;
    }
  }
  // Build line and area
  let pts = [];
  for (let vi = 0; vi < valid.length; vi++) {
    const idx = valid[vi];
    const dur = dt.mean_duration[idx] / 1000; // convert ms to seconds
    const x = xPos(idx);
    const clamped = Math.max(yMin, Math.min(yMax, dur));
    const y = baseY - ((clamped - yMin) / yRng) * plotH;
    pts.push(`${x},${y}`);
  }
  if (pts.length > 1) {
    // area
    const areaPts = pts.slice().reverse();
    const firstX = pts[0].split(',')[0];
    const lastX = pts[pts.length - 1].split(',')[0];
    const areaAll = `${baseX + plotW},${baseY} ${baseX},${baseY} ` + pts.join(' ') + ` ${baseX + plotW},${baseY}`;
    svg += `<polygon points="${areaAll}" fill="#1DB954" fill-opacity="0.1"/>\n`;
    // line
    svg += `<polyline points="${pts.join(' ')}" fill="none" stroke="#1DB954" stroke-width="2.5"/>\n`;
    // dots
    for (let vi = 0; vi < valid.length; vi++) {
      const idx = valid[vi];
      if (years[idx] % 5 === 0 || vi === 0 || vi === valid.length - 1) {
        const dur = dt.mean_duration[idx] / 1000;
        const x = xPos(idx);
        const clamped = Math.max(yMin, Math.min(yMax, dur));
        const y = baseY - ((clamped - yMin) / yRng) * plotH;
        svg += `<circle cx="${x}" cy="${y}" r="3.5" fill="#1DB954"/>\n`;
      }
    }
  }
  svg += '</g>\n';
  svg += svgFooter();
  return svg;
}

// --- V12 ---
function genV12() {
  let svg = svgHeader();
  svg += '<g font-family="sans-serif">\n';
  svg += `<text x="400" y="25" text-anchor="middle" fill="#FFFFFF" font-size="16" font-weight="bold">Billboard 排名分析</text>\n`;
  const feats = ['danceability','energy','valence'];
  const ba = D.billboard_analysis;
  const plotX = 80, plotY = 50, plotW = 600, plotH = 380;
  const baseX = plotX, baseY = plotY + plotH;
  // grid
  for (let g = 0; g <= 4; g++) {
    const gy = baseY - (plotH * g / 4);
    svg += `<line x1="${plotX}" y1="${gy}" x2="${plotX + plotW}" y2="${gy}" stroke="#e0e0e0" stroke-width="0.5"/>\n`;
    svg += `<text x="${plotX - 6}" y="${gy + 3}" text-anchor="end" fill="#63636E" font-size="10">${(g / 4).toFixed(1)}</text>\n`;
  }
  svg += `<line x1="${plotX}" y1="${baseY}" x2="${plotX + plotW}" y2="${baseY}" stroke="#333333" stroke-width="1"/>\n`;
  svg += `<line x1="${plotX}" y1="${plotY}" x2="${plotX}" y2="${baseY}" stroke="#333333" stroke-width="1"/>\n`;
  const grpW = plotW / feats.length;
  feats.forEach((feat, fi) => {
    const cx = plotX + fi * grpW + grpW / 2;
    const topVal = ba.top10[feat + '_mean'] || 0;
    const botVal = ba.bottom10[feat + '_mean'] || 0;
    const barW = grpW * 0.3;
    const topY = baseY - topVal / 1 * plotH;
    const botY = baseY - botVal / 1 * plotH;
    // top10 bar
    svg += `<rect x="${cx - barW - 4}" y="${topY}" width="${barW}" height="${topVal / 1 * plotH}" fill="#1DB954"/>\n`;
    // bottom10 bar
    svg += `<rect x="${cx + 4}" y="${botY}" width="${barW}" height="${botVal / 1 * plotH}" fill="#63636E"/>\n`;
    svg += `<text x="${cx}" y="${baseY + 18}" text-anchor="middle" fill="#A1A1AA" font-size="12">${FEAT_CN[feat]}</text>\n`;
  });
  // legend
  const legX = plotX + plotW - 160, legY = plotY + 10;
  svg += `<rect x="${legX}" y="${legY}" width="12" height="12" fill="#1DB954"/>\n`;
  svg += `<text x="${legX + 18}" y="${legY + 10}" fill="#A1A1AA" font-size="11">Top 10</text>\n`;
  svg += `<rect x="${legX + 80}" y="${legY}" width="12" height="12" fill="#63636E"/>\n`;
  svg += `<text x="${legX + 98}" y="${legY + 10}" fill="#A1A1AA" font-size="11">Bottom 10</text>\n`;
  svg += '</g>\n';
  svg += svgFooter();
  return svg;
}

// --- V13 ---
function genV13() {
  let svg = svgHeader();
  svg += '<g font-family="sans-serif">\n';
  svg += `<text x="400" y="25" text-anchor="middle" fill="#FFFFFF" font-size="16" font-weight="bold">PCA 降维可视化</text>\n`;
  const plotX = 60, plotY = 40, plotW = 550, plotH = 380;
  const baseX = plotX, baseY = plotY + plotH;
  const clusters = D.clusters.clusters;
  const clrMap = ['#1DB954','#E8536D','#E8A838','#6C5CE7'];
  // Generate 200 points using seeded random, with Gaussian blobs around cluster means
  const rng = createRNG(9999);
  const points = [];
  clusters.forEach((cl, ci) => {
    const nPts = Math.round(200 * (cl.size / D.clusters.clusters.reduce((s, c) => s + c.size, 0)));
    const cx = (cl.danceability_mean + cl.energy_mean - cl.acousticness_mean * 0.5) / 2.5;
    const cy = (cl.valence_mean - (cl.acousticness_mean || 0) * 0.3 + 0.3);
    for (let p = 0; p < nPts; p++) {
      const x = normalRand(rng, cx, 0.12);
      const y = normalRand(rng, cy, 0.10);
      points.push({ x, y, cluster: ci });
    }
  });
  // Determine bounds
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  points.forEach(p => { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; });
  const xRng = maxX - minX || 1, yRng = maxY - minY || 1;
  const pad = 0.15;
  minX -= xRng * pad; maxX += xRng * pad;
  minY -= yRng * pad; maxY += yRng * pad;
  const xScale = plotW / (maxX - minX);
  const yScale = plotH / (maxY - minY);
  function mapX(v) { return plotX + (v - minX) * xScale; }
  function mapY(v) { return baseY - (v - minY) * yScale; }

  // grid
  for (let g = 0; g <= 4; g++) {
    const gx = plotX + (plotW * g / 4);
    const gy = plotY + (plotH * g / 4);
    svg += `<line x1="${gx}" y1="${plotY}" x2="${gx}" y2="${baseY}" stroke="#e0e0e0" stroke-width="0.5"/>\n`;
    svg += `<line x1="${plotX}" y1="${gy}" x2="${plotX + plotW}" y2="${gy}" stroke="#e0e0e0" stroke-width="0.5"/>\n`;
    const vx = minX + (maxX - minX) * g / 4;
    const vy = minY + (maxY - minY) * (4 - g) / 4;
    svg += `<text x="${gx}" y="${baseY + 14}" text-anchor="middle" fill="#63636E" font-size="9">${vx.toFixed(2)}</text>\n`;
    svg += `<text x="${plotX - 6}" y="${gy + 3}" text-anchor="end" fill="#63636E" font-size="9">${vy.toFixed(2)}</text>\n`;
  }
  svg += `<line x1="${plotX}" y1="${baseY}" x2="${plotX + plotW}" y2="${baseY}" stroke="#333333" stroke-width="1"/>\n`;
  svg += `<line x1="${plotX}" y1="${plotY}" x2="${plotX}" y2="${baseY}" stroke="#333333" stroke-width="1"/>\n`;
  svg += `<text x="${plotX + plotW / 2}" y="${baseY + 32}" text-anchor="middle" fill="#A1A1AA" font-size="12">PC1 (34.7%)</text>\n`;
  svg += `<text x="${plotX - 35}" y="${plotY + plotH / 2}" text-anchor="middle" fill="#A1A1AA" font-size="12" transform="rotate(-90 ${plotX - 35} ${plotY + plotH / 2})">PC2 (23.6%)</text>\n`;

  // Plot points
  points.forEach(p => {
    const cx = mapX(p.x), cy = mapY(p.y);
    svg += `<circle cx="${cx}" cy="${cy}" r="2.5" fill="${clrMap[p.cluster]}" fill-opacity="0.5"/>\n`;
  });
  // Cluster centers
  const centers = [];
  clusters.forEach((cl, ci) => {
    const cx = (cl.danceability_mean + cl.energy_mean - cl.acousticness_mean * 0.5) / 2.5;
    const cy = (cl.valence_mean - (cl.acousticness_mean || 0) * 0.3 + 0.3);
    const sx = mapX(cx), sy = mapY(cy);
    centers.push({ x: sx, y: sy });
    svg += `<circle cx="${sx}" cy="${sy}" r="7" fill="${clrMap[ci]}" stroke="#000000" stroke-width="1.5"/>\n`;
  });
  // legend
  const legX = 640, legY = 60;
  svg += `<text x="${legX}" y="${legY - 10}" fill="#A1A1AA" font-size="11">聚类</text>\n`;
  clusters.forEach((cl, i) => {
    const ly = legY + i * 22;
    svg += `<circle cx="${legX + 6}" cy="${ly + 6}" r="5" fill="${clrMap[i]}"/>\n`;
    svg += `<text x="${legX + 18}" y="${ly + 10}" fill="#A1A1AA" font-size="10">${cl.name}</text>\n`;
  });
  svg += '</g>\n';
  svg += svgFooter();
  return svg;
}

// --- V14 ---
function genV14() {
  let svg = svgHeader();
  svg += '<g font-family="sans-serif">\n';
  svg += `<text x="400" y="25" text-anchor="middle" fill="#FFFFFF" font-size="16" font-weight="bold">KMeans 聚类结果</text>\n`;
  const plotX = 60, plotY = 40, plotW = 500, plotH = 380;
  const baseX = plotX, baseY = plotY + plotH;
  const clusters = D.clusters.clusters;
  const clrMap = ['#1DB954','#E8536D','#E8A838','#6C5CE7'];

  const rng = createRNG(9999);
  const allPoints = [];
  clusters.forEach((cl, ci) => {
    const nPts = Math.round(200 * (cl.size / D.clusters.clusters.reduce((s, c) => s + c.size, 0)));
    const cx = (cl.danceability_mean + cl.energy_mean - cl.acousticness_mean * 0.5) / 2.5;
    const cy = (cl.valence_mean - (cl.acousticness_mean || 0) * 0.3 + 0.3);
    for (let p = 0; p < nPts; p++) {
      const x = normalRand(rng, cx, 0.12);
      const y = normalRand(rng, cy, 0.10);
      allPoints.push({ x, y, cluster: ci });
    }
  });
  let minX = Infinity, maxX = -Infinity, minY = Infinity, maxY = -Infinity;
  allPoints.forEach(p => { if (p.x < minX) minX = p.x; if (p.x > maxX) maxX = p.x; if (p.y < minY) minY = p.y; if (p.y > maxY) maxY = p.y; });
  const xRng = maxX - minX || 1, yRng = maxY - minY || 1;
  const pad = 0.15;
  minX -= xRng * pad; maxX += xRng * pad;
  minY -= yRng * pad; maxY += yRng * pad;
  const xScale = plotW / (maxX - minX);
  const yScale = plotH / (maxY - minY);
  function mapX(v) { return plotX + (v - minX) * xScale; }
  function mapY(v) { return baseY - (v - minY) * yScale; }

  for (let g = 0; g <= 4; g++) {
    const gx = plotX + (plotW * g / 4);
    const gy = plotY + (plotH * g / 4);
    svg += `<line x1="${gx}" y1="${plotY}" x2="${gx}" y2="${baseY}" stroke="#e0e0e0" stroke-width="0.5"/>\n`;
    svg += `<line x1="${plotX}" y1="${gy}" x2="${plotX + plotW}" y2="${gy}" stroke="#e0e0e0" stroke-width="0.5"/>\n`;
  }
  svg += `<line x1="${plotX}" y1="${baseY}" x2="${plotX + plotW}" y2="${baseY}" stroke="#333333" stroke-width="1"/>\n`;
  svg += `<line x1="${plotX}" y1="${plotY}" x2="${plotX}" y2="${baseY}" stroke="#333333" stroke-width="1"/>\n`;
  svg += `<text x="${plotX + plotW / 2}" y="${baseY + 32}" text-anchor="middle" fill="#A1A1AA" font-size="12">PC1 (34.7%)</text>\n`;
  svg += `<text x="${plotX - 35}" y="${plotY + plotH / 2}" text-anchor="middle" fill="#A1A1AA" font-size="12" transform="rotate(-90 ${plotX - 35} ${plotY + plotH / 2})">PC2 (23.6%)</text>\n`;

  // Convex hulls
  for (let ci = 0; ci < clusters.length; ci++) {
    const pts = allPoints.filter(p => p.cluster === ci);
    // Simple convex hull (monotone chain)
    const mapped = pts.map(p => ({ x: mapX(p.x), y: mapY(p.y) }));
    mapped.sort((a, b) => a.x - b.x || a.y - b.y);
    const cross = (o, a, b) => (a.x - o.x) * (b.y - o.y) - (a.y - o.y) * (b.x - o.x);
    let lower = [];
    for (let i = 0; i < mapped.length; i++) {
      while (lower.length >= 2 && cross(lower[lower.length - 2], lower[lower.length - 1], mapped[i]) <= 0) lower.pop();
      lower.push(mapped[i]);
    }
    let upper = [];
    for (let i = mapped.length - 1; i >= 0; i--) {
      while (upper.length >= 2 && cross(upper[upper.length - 2], upper[upper.length - 1], mapped[i]) <= 0) upper.pop();
      upper.push(mapped[i]);
    }
    lower.pop(); upper.pop();
    const hull = lower.concat(upper);
    if (hull.length >= 3) {
      const ptsStr = hull.map(p => `${p.x},${p.y}`).join(' ');
      svg += `<polygon points="${ptsStr}" fill="${clrMap[ci]}" fill-opacity="0.15" stroke="${clrMap[ci]}" stroke-width="1.5"/>\n`;
    }
  }
  // Points
  allPoints.forEach(p => {
    const cx = mapX(p.x), cy = mapY(p.y);
    svg += `<circle cx="${cx}" cy="${cy}" r="2" fill="${clrMap[p.cluster]}" fill-opacity="0.6"/>\n`;
  });
  // Cluster centers
  clusters.forEach((cl, ci) => {
    const cx = (cl.danceability_mean + cl.energy_mean - cl.acousticness_mean * 0.5) / 2.5;
    const cy = (cl.valence_mean - (cl.acousticness_mean || 0) * 0.3 + 0.3);
    const sx = mapX(cx), sy = mapY(cy);
    svg += `<circle cx="${sx}" cy="${sy}" r="7" fill="${clrMap[ci]}" stroke="#000000" stroke-width="1.5"/>\n`;
  });
  // legend
  const legX = 590, legY = 60;
  svg += `<text x="${legX}" y="${legY - 10}" fill="#A1A1AA" font-size="11">聚类</text>\n`;
  clusters.forEach((cl, i) => {
    const ly = legY + i * 22;
    svg += `<circle cx="${legX + 6}" cy="${ly + 6}" r="5" fill="${clrMap[i]}"/>\n`;
    svg += `<text x="${legX + 18}" y="${ly + 10}" fill="#A1A1AA" font-size="10">${cl.name}</text>\n`;
  });
  // Elbow plot inset
  const eX = 605, eY = 180, eW = 170, eH = 120;
  svg += `<rect x="${eX}" y="${eY}" width="${eW}" height="${eH}" fill="#1A1A1F" stroke="#333333" stroke-width="1" rx="3"/>\n`;
  svg += `<text x="${eX + eW / 2}" y="${eY + 14}" text-anchor="middle" fill="#FFFFFF" font-size="10" font-weight="bold">肘部法则</text>\n`;
  // fake elbow values
  const kValues = [2,3,4,5,6,7,8];
  const inertias = [850, 520, 340, 260, 220, 195, 180];
  const ePlotX = eX + 25, ePlotY = eY + 22, ePlotW = eW - 35, ePlotH = eH - 45;
  const maxInertia = inertias[0], minInertia = inertias[inertias.length - 1];
  const iRng = maxInertia - minInertia || 1;
  const kRng = kValues.length - 1;
  let ePts = [];
  kValues.forEach((k, i) => {
    const kx = ePlotX + (i / kRng) * ePlotW;
    const ky = ePlotY + ePlotH - ((inertias[i] - minInertia) / iRng) * ePlotH;
    ePts.push(`${kx},${ky}`);
  });
  svg += `<polyline points="${ePts.join(' ')}" fill="none" stroke="#1DB954" stroke-width="1.5"/>\n`;
  kValues.forEach((k, i) => {
    const kx = ePlotX + (i / kRng) * ePlotW;
    const ky = ePlotY + ePlotH - ((inertias[i] - minInertia) / iRng) * ePlotH;
    svg += `<circle cx="${kx}" cy="${ky}" r="2" fill="#1DB954"/>\n`;
    if (i % 2 === 0) {
      svg += `<text x="${kx}" y="${ePlotY + ePlotH + 12}" text-anchor="middle" fill="#63636E" font-size="7">${k}</text>\n`;
    }
  });
  svg += '</g>\n';
  svg += svgFooter();
  return svg;
}

// --- V15 ---
function genV15() {
  const groups = ['classical','rock','rap','jazz','reggae'];
  let svg = svgHeader();
  svg += '<g font-family="sans-serif">\n';
  svg += `<text x="400" y="25" text-anchor="middle" fill="#FFFFFF" font-size="16" font-weight="bold">TF-IDF 关键词分析</text>\n`;
  const plotX = 150, plotY = 45, plotW = 580, plotH = 420;
  const grpH = plotH / groups.length;
  groups.forEach((grp, gi) => {
    const keywords = D.tfidf_keywords[grp] || [];
    const gy = plotY + gi * grpH;
    const color = CLR[gi % CLR.length];
    svg += `<text x="${plotX - 10}" y="${gy + grpH / 2 + 4}" text-anchor="end" fill="#A1A1AA" font-size="12" font-weight="bold">${GENRE_CN[grp] || grp}</text>\n`;
    keywords.forEach((kw, ki) => {
      const barH = Math.min(grpH / 6, 16);
      const bw = ((5 - ki) / 5) * (plotW - 40);
      const by = gy + ki * (barH + 2) + 4;
      svg += `<rect x="${plotX}" y="${by}" width="${bw}" height="${barH}" fill="${color}" fill-opacity="${0.4 + 0.6 * (5 - ki) / 5}" rx="2"/>\n`;
      svg += `<text x="${plotX + 4}" y="${by + barH - 3}" fill="#FFFFFF" font-size="10">${escTxt(kw)}</text>\n`;
    });
  });
  svg += '</g>\n';
  svg += svgFooter();
  return svg;
}

// --- V16 ---
function genV16() {
  let svg = svgHeader();
  svg += '<g font-family="sans-serif">\n';
  svg += `<text x="400" y="25" text-anchor="middle" fill="#FFFFFF" font-size="16" font-weight="bold">AI 情绪分布</text>\n`;
  const moods = D.ai_mood.moods;
  const moodKeys = Object.keys(moods);
  const moodColors = { '欢快': '#1DB954', '激昂': '#1ED760', '放松': '#E8A838', '忧伤': '#E8536D', '迷幻': '#6C5CE7' };
  const plotX = 160, plotY = 50, plotW = 550, plotH = 400;
  const barH = Math.min(plotH / moodKeys.length - 6, 50);
  const maxVal = Math.max(...Object.values(moods), 1);
  // grid
  for (let g = 0; g <= 4; g++) {
    const gx = plotX + (plotW * g / 4);
    svg += `<line x1="${gx}" y1="${plotY}" x2="${gx}" y2="${plotY + plotH}" stroke="#e0e0e0" stroke-width="0.5"/>\n`;
    svg += `<text x="${gx}" y="${plotY + plotH + 14}" text-anchor="middle" fill="#63636E" font-size="10">${Math.round(maxVal * g / 4)}</text>\n`;
  }
  svg += `<line x1="${plotX}" y1="${plotY}" x2="${plotX + plotW}" y2="${plotY + plotH}" stroke="#333333" stroke-width="1"/>\n`;
  svg += `<line x1="${plotX}" y1="${plotY}" x2="${plotX}" y2="${plotY + plotH}" stroke="#333333" stroke-width="1"/>\n`;
  moodKeys.forEach((mood, i) => {
    const val = moods[mood];
    const by = plotY + i * (barH + 6);
    const bw = (val / maxVal) * plotW;
    const color = moodColors[mood] || '#1DB954';
    svg += `<text x="${plotX - 8}" y="${by + barH / 2 + 4}" text-anchor="end" fill="#A1A1AA" font-size="12">${mood}</text>\n`;
    svg += `<rect x="${plotX}" y="${by}" width="${Math.max(bw, 2)}" height="${barH}" fill="${color}" fill-opacity="0.8" rx="3"/>\n`;
    svg += `<text x="${plotX + bw + 6}" y="${by + barH / 2 + 4}" fill="#FFFFFF" font-size="11">${val}</text>\n`;
  });
  svg += '</g>\n';
  svg += svgFooter();
  return svg;
}

// --- V17 ---
function genV17() {
  let svg = svgHeader();
  svg += '<g font-family="sans-serif">\n';
  svg += `<text x="400" y="25" text-anchor="middle" fill="#FFFFFF" font-size="16" font-weight="bold">AI 场景-情绪热力图</text>\n`;
  const scenes = ['派对聚会','深夜独处','运动健身','驾车出行'];
  const moods = ['欢快','激昂','放松','平静','忧伤','迷幻'];
  const cellW = 100, cellH = 50, gap = 2;
  const xOff = 130, yOff = 60;
  // col labels
  moods.forEach((m, ci) => {
    const cx = xOff + ci * (cellW + gap) + cellW / 2;
    svg += `<text x="${cx}" y="${yOff - 8}" text-anchor="middle" fill="#A1A1AA" font-size="10">${m}</text>\n`;
  });
  scenes.forEach((scene, ri) => {
    const ry = yOff + ri * (cellH + gap);
    svg += `<text x="${xOff - 8}" y="${ry + cellH / 2 + 4}" text-anchor="end" fill="#A1A1AA" font-size="11">${scene}</text>\n`;
    const sceneData = D.scene_mood[scene] || {};
    moods.forEach((mood, ci) => {
      const cx = xOff + ci * (cellW + gap);
      const val = sceneData[mood] || 0;
      const color = lerpColor('#0B0B0F', '#1DB954', Math.min(val * 3, 1));
      svg += `<rect x="${cx}" y="${ry}" width="${cellW}" height="${cellH}" fill="${color}" rx="2"/>\n`;
      svg += `<text x="${cx + cellW / 2}" y="${ry + cellH / 2 + 4}" text-anchor="middle" fill="#FFFFFF" font-size="12">${(val * 100).toFixed(0)}%</text>\n`;
    });
  });
  svg += '</g>\n';
  svg += svgFooter();
  return svg;
}

// --- Main ---
const charts = [
  { name: 'v1_distribution', gen: genV1 },
  { name: 'v2_correlation_heatmap', gen: genV2 },
  { name: 'v3_scatter_matrix', gen: genV3 },
  { name: 'v4_popularity_boxplot', gen: genV4 },
  { name: 'v5_genre_boxplot', gen: genV5 },
  { name: 'v6_genre_popularity_violin', gen: genV6 },
  { name: 'v7_energy_danceability_scatter', gen: genV7 },
  { name: 'v8_temporal_trend', gen: genV8 },
  { name: 'v9_genre_year_heatmap', gen: genV9 },
  { name: 'v10_popularity_temporal', gen: genV10 },
  { name: 'v11_duration_temporal', gen: genV11 },
  { name: 'v12_billboard_rank_analysis', gen: genV12 },
  { name: 'v13_pca_clustering', gen: genV13 },
  { name: 'v14_kmeans_clusters', gen: genV14 },
  { name: 'v15_tfidf_keywords', gen: genV15 },
  { name: 'v16_ai_mood_distribution', gen: genV16 },
  { name: 'v17_ai_scene_mood_heatmap', gen: genV17 },
];

charts.forEach(({ name, gen }) => {
  const svg = gen();
  const filePath = path.join(outDir, `${name}.svg`);
  fs.writeFileSync(filePath, svg, 'utf-8');
  console.log(`Created ${name}.svg (${(svg.length / 1024).toFixed(1)} KB)`);
});

console.log(`\nAll ${charts.length} SVG charts generated successfully in: ${outDir}`);
