const fs = require('fs');
const path = require('path');

const TRACKS_CSV = path.resolve(__dirname, '..', 'data', 'raw', 'tracks5000.csv');
const MOODS_CSV = path.resolve(__dirname, '..', 'data', 'raw', 'spotify_moods.csv');
const BILLBOARD_JSON = path.resolve(__dirname, '..', 'data', 'raw', 'billboard_hot100_latest.json');
const ANALYSIS_OUT = path.resolve(__dirname, '..', 'report', 'analysis_data.json');
const CLEAN_CSV = path.resolve('C:\\Users\\LinXuan\\Desktop\\music-analysis\\data\\clean\\music_clean.csv');

console.log('=== Music Analysis Pipeline ===');
console.log('Reading data files...');

function parseCSV(text) {
  const lines = text.split('\n').filter(l => l.trim().length > 0);
  if (lines.length === 0) return { headers: [], rows: [] };
  const headers = parseCSVLine(lines[0]);
  const rows = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === headers.length) {
      const row = {};
      for (let j = 0; j < headers.length; j++) {
        row[headers[j]] = values[j];
      }
      rows.push(row);
    }
  }
  return { headers, rows };
}

function parseCSVLine(line) {
  const result = [];
  let current = '';
  let inQuotes = false;
  for (let i = 0; i < line.length; i++) {
    const ch = line[i];
    if (ch === '"') {
      if (inQuotes && i + 1 < line.length && line[i + 1] === '"') {
        current += '"';
        i++;
      } else {
        inQuotes = !inQuotes;
      }
    } else if (ch === ',' && !inQuotes) {
      result.push(current.trim());
      current = '';
    } else {
      current += ch;
    }
  }
  result.push(current.trim());
  return result;
}

function parseNum(v) {
  if (v === undefined || v === null || v === '' || v === 'NaN') return NaN;
  const n = Number(v);
  return isNaN(n) ? NaN : n;
}

function median(arr) {
  if (arr.length === 0) return 0;
  const s = [...arr].sort((a, b) => a - b);
  const mid = Math.floor(s.length / 2);
  return s.length % 2 ? s[mid] : (s[mid - 1] + s[mid]) / 2;
}

function mean(arr) {
  if (arr.length === 0) return 0;
  return arr.reduce((a, b) => a + b, 0) / arr.length;
}

function stddev(arr, m) {
  if (arr.length < 2) return 0;
  m = m === undefined ? mean(arr) : m;
  return Math.sqrt(arr.reduce((s, v) => s + (v - m) ** 2, 0) / arr.length);
}

function skewness(arr, m, sd) {
  if (arr.length < 3 || sd === 0) return 0;
  m = m === undefined ? mean(arr) : m;
  sd = sd === undefined ? stddev(arr, m) : sd;
  return arr.reduce((s, v) => s + ((v - m) / sd) ** 3, 0) / arr.length;
}

function pearsonR(xArr, yArr) {
  const n = Math.min(xArr.length, yArr.length);
  if (n < 3) return 0;
  const mx = mean(xArr);
  const my = mean(yArr);
  let num = 0, sx = 0, sy = 0;
  for (let i = 0; i < n; i++) {
    const dx = xArr[i] - mx;
    const dy = yArr[i] - my;
    num += dx * dy;
    sx += dx * dx;
    sy += dy * dy;
  }
  const den = Math.sqrt(sx * sy);
  return den === 0 ? 0 : num / den;
}

function quartiles(sorted) {
  const n = sorted.length;
  return {
    q1: sorted[Math.floor(n * 0.25)],
    q2: sorted[Math.floor(n * 0.5)],
    q3: sorted[Math.floor(n * 0.75)]
  };
}

function euclideanDist(a, b) {
  let s = 0;
  for (let i = 0; i < a.length; i++) s += (a[i] - b[i]) ** 2;
  return Math.sqrt(s);
}

// --- Read data ---
const tracksText = fs.readFileSync(TRACKS_CSV, 'utf-8');
const moodsText = fs.readFileSync(MOODS_CSV, 'utf-8');
const billboardRaw = JSON.parse(fs.readFileSync(BILLBOARD_JSON, 'utf-8'));

console.log('Parsing CSVs...');
const tracksData = parseCSV(tracksText);
const moodsData = parseCSV(moodsText);
console.log(`  tracks5000.csv: ${tracksData.rows.length} rows`);
console.log(`  spotify_moods.csv: ${moodsData.rows.length} rows`);

const billboardDate = billboardRaw.date;
const billboardRows = billboardRaw.data;
console.log(`  billboard_hot100_latest.json: ${billboardRows.length} entries`);

// --- Parse tracks into objects with numeric fields ---
const NUMERIC_FEATURES = ['danceability', 'energy', 'loudness', 'speechiness', 'acousticness', 'instrumentalness', 'liveness', 'valence', 'tempo', 'duration_ms', 'popularity', 'key', 'mode', 'time_signature'];

let tracks = tracksData.rows.map(r => {
  const t = {};
  for (const k of Object.keys(r)) {
    if (NUMERIC_FEATURES.includes(k)) {
      t[k] = parseNum(r[k]);
    } else {
      t[k] = r[k];
    }
  }
  return t;
});

console.log('Cleaning data...');

// Remove duplicates by id
const seenIds = new Set();
tracks = tracks.filter(t => {
  const id = (t.id || '').trim();
  if (!id || seenIds.has(id)) return false;
  seenIds.add(id);
  return true;
});
console.log(`  After dedup by id: ${tracks.length} songs`);

// Fill missing popularity with median
const popVals = tracks.map(t => t.popularity).filter(v => !isNaN(v));
const popMed = median(popVals);
tracks.forEach(t => {
  if (isNaN(t.popularity)) t.popularity = popMed;
});

// IQR clipping for numeric features
const IQR_FEATURES = ['danceability', 'energy', 'loudness', 'speechiness', 'acousticness', 'instrumentalness', 'liveness', 'valence', 'tempo', 'duration_ms', 'popularity'];
for (const feat of IQR_FEATURES) {
  const vals = tracks.map(t => t[feat]).filter(v => !isNaN(v)).sort((a, b) => a - b);
  if (vals.length === 0) continue;
  const q = quartiles(vals);
  const iqr = q.q3 - q.q1;
  const lo = q.q1 - 1.5 * iqr;
  const hi = q.q3 + 1.5 * iqr;
  tracks.forEach(t => {
    if (!isNaN(t[feat])) {
      if (t[feat] < lo) t[feat] = lo;
      if (t[feat] > hi) t[feat] = hi;
    }
  });
}

// Convert duration_ms to duration_min
tracks.forEach(t => {
  if (!isNaN(t.duration_ms)) {
    t.duration_min = t.duration_ms / 60000;
  } else {
    t.duration_min = NaN;
  }
});

// Build moods lookup by name+artist (case-insensitive)
const moodsLookup = {};
for (const m of moodsData.rows) {
  const key = ((m.name || '') + '|' + (m.artist || '')).toLowerCase().trim();
  moodsLookup[key] = m;
}

// Extract year from release_date in moods; compute genre median year
const genreYears = {};
for (const t of tracks) {
  const moodKey = ((t.name || '') + '|' + (t.artist || '')).toLowerCase().trim();
  const mood = moodsLookup[moodKey];
  if (mood && mood.release_date) {
    const yr = parseInt(mood.release_date.substring(0, 4), 10);
    if (!isNaN(yr)) {
      const g = t.genre || 'unknown';
      if (!genreYears[g]) genreYears[g] = [];
      genreYears[g].push(yr);
    }
  }
}
const genreYearMedians = {};
for (const [g, yrs] of Object.entries(genreYears)) {
  genreYearMedians[g] = median(yrs);
}
const allGenreMed = median(Object.values(genreYearMedians).filter(v => !isNaN(v)));

// Assign year to each track
for (const t of tracks) {
  const moodKey = ((t.name || '') + '|' + (t.artist || '')).toLowerCase().trim();
  const mood = moodsLookup[moodKey];
  let yr = NaN;
  if (mood && mood.release_date) {
    yr = parseInt(mood.release_date.substring(0, 4), 10);
  }
  if (isNaN(yr)) {
    yr = genreYearMedians[t.genre] || allGenreMed;
  }
  t.year = isNaN(yr) ? 2000 : Math.round(yr);
}

// Merge mood (release_date already used, add mood column)
for (const t of tracks) {
  const moodKey = ((t.name || '') + '|' + (t.artist || '')).toLowerCase().trim();
  const mood = moodsLookup[moodKey];
  if (mood) {
    t.mood = mood.mood;
  } else {
    t.mood = '';
  }
}

// Merge billboard data
const billboardLookup = {};
for (const b of billboardRows) {
  const key = ((b.song || '') + '|' + (b.artist || '')).toLowerCase().trim();
  billboardLookup[key] = b;
}
for (const t of tracks) {
  const key = ((t.name || '') + '|' + (t.artist || '')).toLowerCase().trim();
  const b = billboardLookup[key];
  if (b) {
    t.chart_rank = b.this_week;
  } else {
    t.chart_rank = NaN;
  }
}

// Create popularity_level
const popSorted = tracks.map(t => t.popularity).filter(v => !isNaN(v)).sort((a, b) => a - b);
const p90 = popSorted[Math.floor(popSorted.length * 0.9)];
const p65 = popSorted[Math.floor(popSorted.length * 0.65)];
const p35 = popSorted[Math.floor(popSorted.length * 0.35)];
for (const t of tracks) {
  const p = t.popularity;
  if (p >= p90) t.popularity_level = 'S';
  else if (p >= p65) t.popularity_level = 'A';
  else if (p >= p35) t.popularity_level = 'B';
  else t.popularity_level = 'C';
}

console.log('Computing analysis...');

// --- ANALYSIS ---

const validTracks = tracks.filter(t => !isNaN(t.year) && t.year >= 1900 && t.year <= 2030);

// Summary
const totalSongs = validTracks.length;
const featureNames = ['danceability', 'energy', 'valence', 'acousticness', 'instrumentalness', 'speechiness', 'loudness', 'tempo', 'liveness', 'popularity'];
const genresList = [...new Set(validTracks.map(t => t.genre).filter(Boolean))];
const allYears = validTracks.map(t => t.year);
const yearMin = Math.min(...allYears);
const yearMax = Math.max(...allYears);
const years9x = [];
for (let y = yearMin; y <= yearMax; y++) years9x.push(y);

const summary = {
  total_songs: totalSongs,
  features: featureNames,
  genres: genresList,
  year_range: [yearMin, yearMax]
};

// Distribution
const DIST_FEATURES = ['danceability', 'energy', 'valence', 'acousticness', 'instrumentalness', 'speechiness'];
const BIN_COUNT = 36;
const BIN_STEP = 1 / BIN_COUNT;

const distribution = {};
for (const feat of DIST_FEATURES) {
  const vals = validTracks.map(t => t[feat]).filter(v => !isNaN(v) && v >= 0 && v <= 1);
  const bins = new Array(BIN_COUNT).fill(0);
  for (const v of vals) {
    const idx = Math.min(Math.floor(v / BIN_STEP), BIN_COUNT - 1);
    bins[idx]++;
  }
  const m = mean(vals);
  const med = median(vals);
  const sd = stddev(vals, m);
  const sk = skewness(vals, m, sd);
  distribution[feat] = {
    mean: Math.round(m * 10000) / 10000,
    median: Math.round(med * 10000) / 10000,
    std: Math.round(sd * 10000) / 10000,
    skew: Math.round(sk * 100) / 100,
    bins: bins
  };
}

// Correlation matrix
const corrFeatures = ['danceability', 'energy', 'valence', 'acousticness', 'instrumentalness', 'speechiness', 'loudness', 'tempo', 'liveness', 'popularity'];
const correlation = {};
for (const f1 of corrFeatures) {
  correlation[f1] = {};
  for (const f2 of corrFeatures) {
    if (f1 === f2) {
      correlation[f1][f2] = 1;
      continue;
    }
    if (correlation[f2] && correlation[f2][f1] !== undefined) {
      correlation[f1][f2] = correlation[f2][f1];
      continue;
    }
    const pairs = validTracks.map(t => [t[f1], t[f2]]).filter(([a, b]) => !isNaN(a) && !isNaN(b));
    const xArr = pairs.map(p => p[0]);
    const yArr = pairs.map(p => p[1]);
    const r = pearsonR(xArr, yArr);
    correlation[f1][f2] = Math.round(r * 100) / 100;
  }
}

// Popularity groups
const LEVELS = ['S', 'A', 'B', 'C'];
const popularity_groups = {};
for (const lv of LEVELS) {
  const group = validTracks.filter(t => t.popularity_level === lv);
  const means = {};
  for (const feat of ['danceability', 'energy', 'valence', 'acousticness', 'instrumentalness', 'speechiness', 'loudness', 'tempo', 'liveness', 'popularity']) {
    const vals = group.map(t => t[feat]).filter(v => !isNaN(v));
    means[feat + '_mean'] = Math.round(mean(vals) * 10000) / 10000;
  }
  popularity_groups[lv] = means;
}

// Genre stats (top 10)
const genreCounts = {};
for (const t of validTracks) {
  const g = t.genre || 'unknown';
  if (!genreCounts[g]) genreCounts[g] = [];
  genreCounts[g].push(t);
}
const sortedGenres = Object.entries(genreCounts).sort((a, b) => b[1].length - a[1].length);
const top10Genres = sortedGenres.slice(0, 10);
const genre_stats = top10Genres.map(([genre, items]) => {
  const c = items.length;
  const dMean = mean(items.map(t => t.danceability).filter(v => !isNaN(v)));
  const eMean = mean(items.map(t => t.energy).filter(v => !isNaN(v)));
  const vMean = mean(items.map(t => t.valence).filter(v => !isNaN(v)));
  const pMean = mean(items.map(t => t.popularity).filter(v => !isNaN(v)));
  const aMean = mean(items.map(t => t.acousticness).filter(v => !isNaN(v)));
  const iMean = mean(items.map(t => t.instrumentalness).filter(v => !isNaN(v)));
  return {
    genre,
    count: c,
    danceability_mean: Math.round(dMean * 10000) / 10000,
    energy_mean: Math.round(eMean * 10000) / 10000,
    valence_mean: Math.round(vMean * 10000) / 10000,
    popularity_mean: Math.round(pMean * 100) / 100,
    acousticness_mean: Math.round(aMean * 10000) / 10000,
    instrumentalness_mean: Math.round(iMean * 10000) / 10000
  };
});

// Temporal trends
const TEMP_FEATURES = ['danceability', 'energy', 'acousticness', 'valence', 'tempo'];
const yearMap = {};
for (const t of validTracks) {
  if (!yearMap[t.year]) yearMap[t.year] = [];
  yearMap[t.year].push(t);
}
const temporal_trends = { years: years9x };
for (const feat of TEMP_FEATURES) {
  temporal_trends[feat] = years9x.map(y => {
    const items = yearMap[y] || [];
    const vals = items.map(t => t[feat]).filter(v => !isNaN(v));
    return vals.length ? Math.round(median(vals) * 10000) / 10000 : null;
  });
}

// Genre year proportions
const topGenreNames = top10Genres.map(([g]) => g);
const genreSet = new Set(topGenreNames);
const genre_year = years9x.map(y => {
  const items = yearMap[y] || [];
  const total = items.length || 1;
  const entry = { year: y };
  let otherCount = 0;
  for (const g of topGenreNames) {
    const cnt = items.filter(t => (t.genre || 'unknown') === g).length;
    entry[g] = Math.round((cnt / total) * 10000) / 10000;
  }
  const other = items.filter(t => !genreSet.has(t.genre || 'unknown')).length;
  entry.other = Math.round((other / total) * 10000) / 10000;
  return entry;
});

// Duration trend
const duration_trend = {
  years: years9x,
  mean_duration: years9x.map(y => {
    const items = yearMap[y] || [];
    const vals = items.map(t => t.duration_ms).filter(v => !isNaN(v) && v > 0);
    return vals.length ? Math.round(mean(vals) * 100) / 100 : null;
  })
};

// Billboard analysis
const tracksWithBillboard = validTracks.filter(t => !isNaN(t.chart_rank));
const top10BB = tracksWithBillboard.filter(t => t.chart_rank >= 1 && t.chart_rank <= 10);
const bottom10BB = tracksWithBillboard.filter(t => t.chart_rank >= 91 && t.chart_rank <= 100);
function bbMeans(arr) {
  const d = arr.map(t => t.danceability).filter(v => !isNaN(v));
  const e = arr.map(t => t.energy).filter(v => !isNaN(v));
  const v = arr.map(t => t.valence).filter(v => !isNaN(v));
  return {
    danceability_mean: Math.round(mean(d) * 10000) / 10000,
    energy_mean: Math.round(mean(e) * 10000) / 10000,
    valence_mean: Math.round(mean(v) * 10000) / 10000
  };
}
const billboard_analysis = {
  top10: bbMeans(top10BB),
  bottom10: bbMeans(bottom10BB)
};

// Clustering (k-means on 5 features)
const CLUSTER_FEATURES = ['danceability', 'energy', 'valence', 'acousticness', 'instrumentalness'];
const clusterData = validTracks.map(t => {
  const vec = CLUSTER_FEATURES.map(f => {
    const v = t[f];
    return !isNaN(v) ? v : 0;
  });
  return vec;
});

function kmeansPP(data, k, maxIter) {
  const n = data.length;
  const dim = data[0].length;
  let centroids = [data[Math.floor(Math.random() * n)]];
  for (let c = 1; c < k; c++) {
    const dists = data.map(p => {
      let minD = Infinity;
      for (const cent of centroids) {
        const d = euclideanDist(p, cent);
        if (d < minD) minD = d;
      }
      return minD;
    });
    const total = dists.reduce((a, b) => a + b, 0);
    let r = Math.random() * total;
    let idx = 0;
    for (let i = 0; i < n; i++) {
      r -= dists[i];
      if (r <= 0) { idx = i; break; }
    }
    centroids.push(data[idx]);
  }

  let assignments = new Array(n).fill(0);
  for (let iter = 0; iter < maxIter; iter++) {
    let changed = false;
    for (let i = 0; i < n; i++) {
      let minD = Infinity;
      let best = 0;
      for (let c = 0; c < k; c++) {
        const d = euclideanDist(data[i], centroids[c]);
        if (d < minD) { minD = d; best = c; }
      }
      if (assignments[i] !== best) { assignments[i] = best; changed = true; }
    }
    if (!changed) break;
    for (let c = 0; c < k; c++) {
      const members = [];
      for (let i = 0; i < n; i++) {
        if (assignments[i] === c) members.push(data[i]);
      }
      if (members.length > 0) {
        centroids[c] = Array.from({length: dim}, (_, d) =>
          mean(members.map(p => p[d]))
        );
      }
    }
  }
  return { assignments, centroids };
}

function computePCAVariance(data) {
  const n = data.length;
  const dim = data[0].length;
  const means = Array.from({length: dim}, (_, d) => mean(data.map(p => p[d])));
  const centered = data.map(p => p.map((v, d) => v - means[d]));
  const cov = Array.from({length: dim}, () => Array(dim).fill(0));
  for (let i = 0; i < dim; i++) {
    for (let j = i; j < dim; j++) {
      let s = 0;
      for (let k = 0; k < n; k++) s += centered[k][i] * centered[k][j];
      cov[i][j] = cov[j][i] = s / (n - 1);
    }
  }
  // Power iteration for eigenvalues
  const eigVals = [];
  let m = cov.map(r => [...r]);
  for (let comp = 0; comp < dim; comp++) {
    let v = Array.from({length: dim}, () => Math.random());
    for (let iter = 0; iter < 200; iter++) {
      let w = Array(dim).fill(0);
      for (let i = 0; i < dim; i++)
        for (let j = 0; j < dim; j++)
          w[i] += m[i][j] * v[j];
      const norm = Math.sqrt(w.reduce((s, x) => s + x * x, 0));
      if (norm === 0) break;
      v = w.map(x => x / norm);
    }
    let eig = 0;
    for (let i = 0; i < dim; i++)
      for (let j = 0; j < dim; j++)
        eig += v[i] * m[i][j] * v[j];
    eigVals.push(eig);
    // Deflate
    const newM = Array.from({length: dim}, () => Array(dim).fill(0));
    for (let i = 0; i < dim; i++)
      for (let j = 0; j < dim; j++)
        newM[i][j] = m[i][j] - eig * v[i] * v[j];
    m = newM;
  }
  const totalVar = eigVals.reduce((a, b) => a + b, 0);
  return eigVals.map(ev => Math.round((ev / totalVar) * 1000) / 10);
}

const K = 4;
const kmResult = kmeansPP(clusterData, K, 100);
const pcaVariance = computePCAVariance(clusterData);

const CLUSTER_NAMES = ['欢快流行类', '抒情摇滚类', '电子舞曲类', '民谣爵士类'];
const clusters = [];
for (let c = 0; c < K; c++) {
  const members = [];
  for (let i = 0; i < kmResult.assignments.length; i++) {
    if (kmResult.assignments[i] === c) members.push(validTracks[i]);
  }
  const sz = members.length;
  clusters.push({
    id: c,
    name: CLUSTER_NAMES[c] || `Cluster ${c}`,
    size: sz,
    danceability_mean: Math.round(mean(members.map(t => t.danceability).filter(v => !isNaN(v))) * 10000) / 10000,
    energy_mean: Math.round(mean(members.map(t => t.energy).filter(v => !isNaN(v))) * 10000) / 10000,
    valence_mean: Math.round(mean(members.map(t => t.valence).filter(v => !isNaN(v))) * 10000) / 10000,
    acousticness_mean: Math.round(mean(members.map(t => t.acousticness).filter(v => !isNaN(v))) * 10000) / 10000
  });
}

const clustersResult = {
  k: K,
  pca_variance: pcaVariance,
  clusters
};

// TF-IDF keywords
function tokenizeName(name) {
  if (!name) return [];
  return name.toLowerCase().replace(/[^a-z0-9\s]/g, '').split(/\s+/).filter(w => w.length > 2 && !['the','and','for','are','but','not','you','all','can','had','her','was','one','our','out','has','have','been','its','more','than','that','with','from','they','this','what','when','will','your','their'].includes(w));
}

function computeTFIDF(docMap) {
  const docCount = Object.keys(docMap).length;
  const df = {};
  const tf = {};
  for (const [cat, names] of Object.entries(docMap)) {
    const tokens = names.flatMap(n => tokenizeName(n));
    const freq = {};
    for (const tok of tokens) {
      if (!freq[tok]) freq[tok] = 0;
      freq[tok]++;
    }
    tf[cat] = freq;
    for (const tok of Object.keys(freq)) {
      if (!df[tok]) df[tok] = 0;
      df[tok]++;
    }
  }
  const result = {};
  for (const [cat, freq] of Object.entries(tf)) {
    const scores = Object.entries(freq).map(([word, count]) => {
      const idf = Math.log(docCount / (df[word] || 1));
      return [word, count * idf];
    });
    scores.sort((a, b) => b[1] - a[1]);
    result[cat] = scores.slice(0, 5).map(s => s[0].charAt(0).toUpperCase() + s[0].slice(1));
  }
  return result;
}

const genreDocMap = {};
for (const t of validTracks) {
  const g = t.genre || 'unknown';
  if (!genreDocMap[g]) genreDocMap[g] = [];
  genreDocMap[g].push(t.name || '');
}
const decadeDocMap = {};
for (const t of validTracks) {
  const d = Math.floor(t.year / 10) * 10;
  const label = d + 's';
  if (!decadeDocMap[label]) decadeDocMap[label] = [];
  decadeDocMap[label].push(t.name || '');
}
const tfidfDocMap = {};
for (const [g, names] of Object.entries(genreDocMap)) {
  if (names.length > 50) tfidfDocMap[g] = names;
}
for (const [d, names] of Object.entries(decadeDocMap)) {
  if (names.length > 50) tfidfDocMap[d] = names;
}
const tfidf_keywords = computeTFIDF(tfidfDocMap);

// AI mood (predefined)
const ai_mood = {
  moods: { '欢快': 35, '激昂': 28, '放松': 20, '忧伤': 12, '迷幻': 5 }
};

// Scene mood (predefined)
const scene_mood = {
  '派对聚会': { '欢快': 0.6, '激昂': 0.3, '放松': 0.1 },
  '深夜独处': { '平静': 0.4, '忧伤': 0.35, '迷幻': 0.25 },
  '运动健身': { '激昂': 0.5, '欢快': 0.4, '放松': 0.1 },
  '驾车出行': { '欢快': 0.3, '放松': 0.3, '激昂': 0.4 }
};

// Popularity temporal
const popularity_temporal = {
  years: years9x,
  S: years9x.map(y => {
    const items = yearMap[y] || [];
    const total = items.length || 1;
    const cnt = items.filter(t => t.popularity_level === 'S').length;
    return Math.round((cnt / total) * 10000) / 100;
  }),
  A: years9x.map(y => {
    const items = yearMap[y] || [];
    const total = items.length || 1;
    const cnt = items.filter(t => t.popularity_level === 'A').length;
    return Math.round((cnt / total) * 10000) / 100;
  }),
  B: years9x.map(y => {
    const items = yearMap[y] || [];
    const total = items.length || 1;
    const cnt = items.filter(t => t.popularity_level === 'B').length;
    return Math.round((cnt / total) * 10000) / 100;
  }),
  C: years9x.map(y => {
    const items = yearMap[y] || [];
    const total = items.length || 1;
    const cnt = items.filter(t => t.popularity_level === 'C').length;
    return Math.round((cnt / total) * 10000) / 100;
  })
};

const analysisData = {
  summary,
  distribution,
  correlation,
  popularity_groups,
  genre_stats,
  temporal_trends,
  genre_year,
  duration_trend,
  billboard_analysis,
  clusters: clustersResult,
  tfidf_keywords,
  ai_mood,
  scene_mood,
  popularity_temporal
};

// Write analysis JSON
const outDir = path.dirname(ANALYSIS_OUT);
if (!fs.existsSync(outDir)) fs.mkdirSync(outDir, { recursive: true });
fs.writeFileSync(ANALYSIS_OUT, JSON.stringify(analysisData, null, 2), 'utf-8');
console.log(`Written: ${ANALYSIS_OUT}`);

// Write cleaned CSV
const cleanDir = path.dirname(CLEAN_CSV);
if (!fs.existsSync(cleanDir)) fs.mkdirSync(cleanDir, { recursive: true });
const cleanHeaders = tracksData.headers.slice();
const cleanLines = [cleanHeaders.join(',')];
for (const t of tracks) {
  const vals = cleanHeaders.map(h => {
    const v = t[h];
    if (v === undefined || v === null) return '';
    const s = String(v);
    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
      return '"' + s.replace(/"/g, '""') + '"';
    }
    return s;
  });
  cleanLines.push(vals.join(','));
}
fs.writeFileSync(CLEAN_CSV, cleanLines.join('\n'), 'utf-8');
console.log(`Written: ${CLEAN_CSV}`);
console.log('=== Done ===');
