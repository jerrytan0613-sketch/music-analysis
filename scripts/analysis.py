"""
================================================================================
《音乐平台热歌榜数据探索与可视化分析》
阶段四：多维统计分析 & 数据可视化
================================================================================
功能说明：
  加载清洗/AI增强后的数据，进行 15 维度分析并生成 15+ 张图表。

  分析清单：
    ① 热门歌曲年份分布    ② 热门歌手 Top20      ③ 热门流派占比
    ④ Popularity 分布      ⑤ Danceability 分析   ⑥ Energy 分析
    ⑦ Valence 分析         ⑧ Tempo 分布          ⑨ 歌曲时长分析
    ⑩ 情绪分类占比         ⑪ 场景分类占比        ⑫ 高频关键词
    ⑬ TF-IDF 分析          ⑭ PCA 降维            ⑮ KMeans 聚类

  输出：
    - report/figures/*.png    不少于 15 张高清图表
    - data/analysis/analysis_summary.json  分析摘要
================================================================================
"""

import json
import os
import sys
import warnings
import re
from pathlib import Path
from collections import Counter
from datetime import datetime

import numpy as np
import pandas as pd

from sklearn.feature_extraction.text import TfidfVectorizer
from sklearn.decomposition import PCA
from sklearn.cluster import KMeans
from sklearn.preprocessing import StandardScaler
from scipy import stats

import matplotlib
matplotlib.use("Agg")
import matplotlib.pyplot as plt
import matplotlib.ticker as ticker
from matplotlib.gridspec import GridSpec
import seaborn as sns

warnings.filterwarnings("ignore")

# ------------------------------------------------------------------
# 中文字体配置
# ------------------------------------------------------------------
_CN_FONTS = ["SimHei", "Microsoft YaHei", "PingFang SC",
             "Noto Sans CJK SC", "WenQuanYi Micro Hei", "DejaVu Sans"]
plt.rcParams["font.sans-serif"] = _CN_FONTS
plt.rcParams["axes.unicode_minus"] = False
plt.rcParams["figure.dpi"] = 150
plt.rcParams["savefig.dpi"] = 300
plt.rcParams["savefig.bbox"] = "tight"
plt.rcParams["font.size"] = 11

# ------------------------------------------------------------------
# 统一配色
# ------------------------------------------------------------------
C_PRIMARY = "#2E86AB"    # 主色（蓝）
C_SECONDARY = "#A23B72"  # 辅色（紫红）
C_ACCENT = "#F18F01"     # 强调色（橙）
C_GREEN = "#73AB84"      # 绿色
C_RED = "#C73E3E"        # 红色
C_GRAY = "#8D99AE"       # 灰色

PALETTE_6 = ["#2E86AB", "#A23B72", "#F18F01", "#73AB84", "#C73E3E", "#8D99AE"]
PALETTE_10 = ["#2E86AB", "#A23B72", "#F18F01", "#73AB84", "#C73E3E",
              "#8D99AE", "#E5989B", "#6D6875", "#B5838D", "#FFCDB2"]
PALETTE_20 = sns.color_palette("husl", 20).as_hex()

sns.set_palette(PALETTE_6)
sns.set_style("whitegrid", {"axes.facecolor": "#F8F9FA"})

# ------------------------------------------------------------------
# 路径
# ------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_AI_DIR = PROJECT_ROOT / "data" / "ai"
DATA_CLEAN_DIR = PROJECT_ROOT / "data" / "clean"
ANALYSIS_DIR = PROJECT_ROOT / "data" / "analysis"
FIGURES_DIR = PROJECT_ROOT / "report" / "figures"
for d in [ANALYSIS_DIR, FIGURES_DIR]:
    d.mkdir(parents=True, exist_ok=True)


# ==================================================================
# 分析器
# ==================================================================

class Analyzer:
    """数据加载 & 15 维度分析"""

    def __init__(self):
        self.df = None
        self.summary = {}

    def load_data(self) -> pd.DataFrame:
        """优先加载 AI 增强数据，无则用清洗数据"""
        paths = [
            DATA_AI_DIR / "music_ai.csv",
            DATA_AI_DIR / "enhanced_songs.csv",
            DATA_CLEAN_DIR / "music_clean.csv",
            DATA_CLEAN_DIR / "cleaned_songs.csv",
        ]
        for p in paths:
            if p.exists():
                self.df = pd.read_csv(p, encoding="utf-8")
                print(f"[加载] {p.name}  ({len(self.df)} 行)")
                break
        if self.df is None:
            print("[错误] 未找到数据，请先运行 clean.py")
            sys.exit(1)
        return self.df

    # ------ ①  年份分布 ------
    def year_distribution(self):
        cols = self._ensure_cols(["year"])
        if not cols:
            return {}
        year_series = self.df["year"].value_counts().sort_index()
        self.summary["year_distribution"] = {
            "min_year": int(year_series.index.min()),
            "max_year": int(year_series.index.max()),
            "top_years": year_series.head(10).to_dict(),
        }
        return year_series

    # ------ ②  热门歌手 Top20 ------
    def top_artists(self):
        cols = self._ensure_cols(["artist"])
        if not cols:
            return pd.Series()
        top = self.df["artist"].value_counts().head(20)
        self.summary["top_artists"] = top.to_dict()
        return top

    # ------ ③  流派占比 ------
    def genre_share(self):
        cols = self._ensure_cols(["genre"])
        if not cols:
            return pd.Series()
        g = self.df["genre"].value_counts()
        total = g.sum()
        self.summary["genre_share"] = {
            k: {"count": int(v), "pct": round(v / total * 100, 1)}
            for k, v in g.items()
        }
        return g

    # ------ ④~⑨  数值特征分布 ------
    def numeric_dist(self, col, label, bins=40):
        if col not in self.df.columns:
            return None
        vals = pd.to_numeric(self.df[col], errors="coerce").dropna()
        self.summary[f"{col}_dist"] = {
            "mean": float(vals.mean()),
            "median": float(vals.median()),
            "std": float(vals.std()),
            "min": float(vals.min()),
            "max": float(vals.max()),
        }
        return vals, label

    # ------ ⑩  情绪分布 ------
    def emotion_share(self):
        for c in ["情绪", "emotion_tags", "mood"]:
            if c in self.df.columns:
                s = self.df[c].astype(str)
                # 处理 JSON 数组格式
                if c in ("emotion_tags",):
                    all_tags = []
                    for v in s:
                        try:
                            all_tags.extend(json.loads(v))
                        except Exception:
                            all_tags.append(v)
                    cnt = Counter(all_tags)
                else:
                    cnt = s.value_counts()
                self.summary["emotion_share"] = {
                    k: int(v) for k, v in cnt.items()
                }
                return cnt
        return Counter()

    # ------ ⑪  场景分布 ------
    def scene_share(self):
        for c in ["适合场景", "scene_tags"]:
            if c in self.df.columns:
                s = self.df[c].astype(str)
                if c == "scene_tags":
                    all_tags = []
                    for v in s:
                        try:
                            all_tags.extend(json.loads(v))
                        except Exception:
                            all_tags.append(v)
                    cnt = Counter(all_tags)
                else:
                    cnt = s.value_counts()
                self.summary["scene_share"] = {
                    k: int(v) for k, v in cnt.items()
                }
                return cnt
        return Counter()

    # ------ ⑫  高频关键词 ------
    def keyword_freq(self):
        for col in ["关键词", "theme_keywords", "keywords"]:
            if col not in self.df.columns:
                continue
            all_kw = []
            for v in self.df[col].dropna().astype(str):
                try:
                    all_kw.extend(json.loads(v))
                except Exception:
                    for kw in re.split(r"[ ,，、;；]", v):
                        kw = kw.strip().strip("[]\"'")
                        if kw and kw != "音乐":
                            all_kw.append(kw)
            cnt = Counter(all_kw).most_common(20)
            self.summary["keyword_freq"] = {k: int(v) for k, v in cnt}
            return cnt
        return []

    # ------ ⑬  TF-IDF ------
    def tfidf_analysis(self):
        texts = []
        for col in ["track_name", "genre"]:
            if col in self.df.columns:
                texts.append(self.df[col].fillna("").astype(str))
        if not texts:
            return None, None
        corpus = (texts[0] + " " + texts[1]).tolist() if len(texts) > 1 else texts[0].tolist()
        vec = TfidfVectorizer(max_features=30, stop_words="english", token_pattern=r"(?u)\b\w+\b")
        try:
            mat = vec.fit_transform(corpus)
            words = vec.get_feature_names_out()
            avg_tfidf = np.array(mat.mean(axis=0)).flatten()
            top_idx = np.argsort(avg_tfidf)[-20:]
            self.summary["tfidf_top"] = {
                words[i]: round(float(avg_tfidf[i]), 4) for i in top_idx[::-1]
            }
            return words[top_idx], avg_tfidf[top_idx]
        except Exception:
            return None, None

    # ------ ⑭  PCA ------
    def pca_analysis(self):
        num_cols = ["danceability", "energy", "loudness", "speechiness",
                     "acousticness", "instrumentalness", "liveness",
                     "valence", "tempo", "popularity"]
        avail = [c for c in num_cols if c in self.df.columns]
        if len(avail) < 3:
            return None, None, None
        X = self.df[avail].fillna(0).values
        X_scaled = StandardScaler().fit_transform(X)
        pca = PCA(n_components=2, random_state=42)
        coords = pca.fit_transform(X_scaled)
        ratio = pca.explained_variance_ratio_
        self.summary["pca"] = {
            "explained_var_ratio": [round(float(r), 4) for r in ratio],
            "features": avail,
            "components": pca.components_.tolist(),
        }
        return coords, ratio, avail

    # ------ ⑮  KMeans ------
    def kmeans_analysis(self, n_clusters=4):
        num_cols = ["danceability", "energy", "loudness",
                     "acousticness", "valence", "tempo", "popularity"]
        avail = [c for c in num_cols if c in self.df.columns]
        if len(avail) < 3:
            return None, None, None
        X = self.df[avail].fillna(0).values
        X_scaled = StandardScaler().fit_transform(X)
        km = KMeans(n_clusters=n_clusters, random_state=42, n_init=10)
        labels = km.fit_predict(X_scaled)
        centers = StandardScaler().fit(X).inverse_transform(km.cluster_centers_)
        self.summary["kmeans"] = {
            "n_clusters": n_clusters,
            "cluster_sizes": {int(i): int((labels == i).sum()) for i in range(n_clusters)},
            "cluster_centers": centers.tolist(),
        }
        return labels, centers, avail

    def _ensure_cols(self, cols):
        return [c for c in cols if c in self.df.columns]

    def run_all(self):
        print("=" * 60)
        print("  开始 15 维度分析")
        print("=" * 60)
        self.year_distribution()
        self.top_artists()
        self.genre_share()
        self.emotion_share()
        self.scene_share()
        self.keyword_freq()
        self.tfidf_analysis()
        self.pca_analysis()
        self.kmeans_analysis()
        print()
        return self.summary


# ==================================================================
# 绘图器
# ==================================================================

class Plotter:
    """生成 15+ 张高清图表，统一风格"""

    def __init__(self, df, output_dir):
        self.df = df
        self.out = Path(output_dir)
        self.out.mkdir(parents=True, exist_ok=True)
        self.files = []

    def _save(self, fig, name):
        path = self.out / name
        fig.savefig(path, dpi=300, bbox_inches="tight",
                    facecolor="#F8F9FA", edgecolor="none")
        plt.close(fig)
        self.files.append(name)
        print(f"  ✓ {name}")

    def _val(self, col, default=0.0):
        if col in self.df.columns:
            return pd.to_numeric(self.df[col], errors="coerce").dropna()
        return pd.Series([default])

    def _setup_ax(self, ax, title, xlabel="", ylabel="数量"):
        ax.set_title(title, fontsize=14, fontweight="bold", pad=12,
                     color="#2B2D42")
        ax.set_xlabel(xlabel, fontsize=11)
        ax.set_ylabel(ylabel, fontsize=11)
        ax.tick_params(labelsize=9)
        for spine in ax.spines.values():
            spine.set_visible(False)
        ax.grid(axis="y", alpha=0.3)

    # ---------- ① 年份分布 ----------
    def plot_year_dist(self):
        fig, ax = plt.subplots(figsize=(12, 5))
        years = self._val("year").astype(int)
        if len(years) == 0:
            plt.close(fig); return
        bins = min(years.max() - years.min() + 1, 50)
        ax.hist(years, bins=bins, color=C_PRIMARY, edgecolor="white",
                alpha=0.85)
        self._setup_ax(ax, "① 热门歌曲年份分布", "发行年份")
        self._save(fig, "v1_year_distribution.png")

    # ---------- ② Top20 歌手 ----------
    def plot_top_artists(self):
        if "artist" not in self.df.columns:
            return
        top = self.df["artist"].value_counts().head(20)[::-1]
        fig, ax = plt.subplots(figsize=(10, 7))
        bars = ax.barh(range(len(top)), top.values, color=PALETTE_10[:len(top)],
                       edgecolor="white", linewidth=0.5)
        ax.set_yticks(range(len(top)))
        ax.set_yticklabels(top.index, fontsize=9)
        self._setup_ax(ax, "② 热门歌手 Top20", "歌曲数量")
        for bar, v in zip(bars, top.values):
            ax.text(bar.get_width() + 0.3, bar.get_y() + bar.get_height()/2,
                    str(v), va="center", fontsize=8, color="#2B2D42")
        ax.set_xlim(0, top.max() * 1.12)
        self._save(fig, "v2_top20_artists.png")

    # ---------- ③ 流派占比 ----------
    def plot_genre_share(self):
        if "genre" not in self.df.columns:
            return
        g = self.df["genre"].value_counts()
        top = g.head(8)
        others = pd.Series({"其他": g.iloc[8:].sum()}) if len(g) > 8 else pd.Series()
        plot_data = pd.concat([top, others])
        colors = PALETTE_10[:len(plot_data)]
        fig, ax = plt.subplots(figsize=(8, 8))
        wedges, texts, autotexts = ax.pie(
            plot_data.values, labels=None, autopct="%1.1f%%",
            startangle=90, colors=colors, pctdistance=0.82,
            wedgeprops={"linewidth": 1.5, "edgecolor": "white"},
        )
        for t in autotexts:
            t.set_fontsize(9); t.set_color("white")
        ax.legend(wedges,
                  [f"{k}  ({v:.0f}首)" for k, v in plot_data.items()],
                  title="流派", loc="center left",
                  bbox_to_anchor=(1, 0, 0.5, 1), fontsize=9)
        ax.set_title("③ 热门流派占比", fontsize=14, fontweight="bold", pad=20,
                     color="#2B2D42")
        self._save(fig, "v3_genre_pie.png")

    # ---------- ④ Popularity ----------
    def plot_popularity(self):
        fig, ax = plt.subplots(figsize=(10, 5))
        vals = self._val("popularity")
        if len(vals) == 0:
            plt.close(fig); return
        sns.histplot(vals, bins=35, color=C_PRIMARY, kde=True,
                     edgecolor="white", alpha=0.7, ax=ax)
        mean_v = vals.mean(); med_v = vals.median()
        ax.axvline(mean_v, color=C_RED, ls="--", lw=2,
                   label=f"均值 {mean_v:.1f}")
        ax.axvline(med_v, color=C_GREEN, ls=":", lw=2,
                   label=f"中位数 {med_v:.1f}")
        self._setup_ax(ax, "④ Popularity 分布", "流行度")
        ax.legend(fontsize=10)
        self._save(fig, "v4_popularity_hist.png")

    # ---------- ⑤ Danceability ----------
    def plot_danceability(self):
        fig, axes = plt.subplots(1, 2, figsize=(14, 5))
        vals = self._val("danceability")
        if len(vals) == 0:
            plt.close(fig); return
        # 直方图
        sns.histplot(vals, bins=35, color=C_PRIMARY, kde=True,
                     edgecolor="white", alpha=0.7, ax=axes[0])
        self._setup_ax(axes[0], "⑤a Danceability 分布", "Danceability")
        # 按流派箱线图
        if "genre" in self.df.columns:
            top5 = self.df["genre"].value_counts().head(5).index
            sub = self.df[self.df["genre"].isin(top5)]
            sns.boxplot(data=sub, x="genre", y="danceability",
                        palette=PALETTE_6[:5], ax=axes[1])
            axes[1].set_title("⑤b Danceability × 流派", fontsize=13,
                              fontweight="bold", color="#2B2D42")
            axes[1].set_xlabel(""); axes[1].tick_params(axis="x", rotation=25)
        fig.tight_layout()
        self._save(fig, "v5_danceability.png")

    # ---------- ⑥ Energy ----------
    def plot_energy(self):
        fig, axes = plt.subplots(1, 2, figsize=(14, 5))
        vals = self._val("energy")
        if len(vals) == 0:
            plt.close(fig); return
        sns.histplot(vals, bins=35, color=C_SECONDARY, kde=True,
                     edgecolor="white", alpha=0.7, ax=axes[0])
        self._setup_ax(axes[0], "⑥a Energy 分布", "Energy")
        # 按流派
        if "genre" in self.df.columns:
            top5 = self.df["genre"].value_counts().head(5).index
            sub = self.df[self.df["genre"].isin(top5)]
            sns.boxplot(data=sub, x="genre", y="energy",
                        palette=PALETTE_6[:5], ax=axes[1])
            axes[1].set_title("⑥b Energy × 流派", fontsize=13,
                              fontweight="bold", color="#2B2D42")
            axes[1].set_xlabel(""); axes[1].tick_params(axis="x", rotation=25)
        fig.tight_layout()
        self._save(fig, "v6_energy.png")

    # ---------- ⑦ Valence ----------
    def plot_valence(self):
        fig, ax = plt.subplots(figsize=(10, 5))
        vals = self._val("valence")
        if len(vals) == 0:
            plt.close(fig); return
        sns.histplot(vals, bins=35, color=C_GREEN, kde=True,
                     edgecolor="white", alpha=0.7, ax=ax)
        self._setup_ax(ax, "⑦ Valence 分布", "Valence (情感积极性)")
        for v, txt, c in [(0.25, "消极", C_RED), (0.5, "中性", C_GRAY),
                          (0.75, "积极", C_GREEN)]:
            ax.axvline(v, color=c, ls="--", lw=1, alpha=0.5)
            ax.text(v, ax.get_ylim()[1]*0.95, txt, ha="center", fontsize=10,
                    color=c, fontweight="bold")
        self._save(fig, "v7_valence.png")

    # ---------- ⑧ Tempo ----------
    def plot_tempo(self):
        fig, ax = plt.subplots(figsize=(10, 5))
        vals = self._val("tempo")
        if len(vals) == 0:
            plt.close(fig); return
        sns.histplot(vals, bins=45, color=C_ACCENT, kde=True,
                     edgecolor="white", alpha=0.7, ax=ax)
        self._setup_ax(ax, "⑧ Tempo (BPM) 分布", "Tempo (BPM)")
        self._save(fig, "v8_tempo.png")

    # ---------- ⑨ 时长分析 ----------
    def plot_duration(self):
        fig, axes = plt.subplots(1, 2, figsize=(14, 5))
        # 分钟
        if "duration_min" in self.df.columns:
            vals = pd.to_numeric(self.df["duration_min"], errors="coerce").dropna()
        elif "duration_ms" in self.df.columns:
            vals = pd.to_numeric(self.df["duration_ms"], errors="coerce").dropna() / 60000
        else:
            plt.close(fig); return
        sns.histplot(vals, bins=40, color=C_SECONDARY, kde=True,
                     edgecolor="white", alpha=0.7, ax=axes[0])
        self._setup_ax(axes[0], "⑨a 歌曲时长分布", "时长 (分钟)")
        # 箱线图按流派
        if "genre" in self.df.columns:
            top5 = self.df["genre"].value_counts().head(5).index
            sub = self.df[self.df["genre"].isin(top5)].copy()
            sub["duration_min"] = vals.loc[sub.index]
            sns.boxplot(data=sub, x="genre", y="duration_min",
                        palette=PALETTE_6[:5], ax=axes[1])
            axes[1].set_title("⑨b 时长 × 流派", fontsize=13,
                              fontweight="bold", color="#2B2D42")
            axes[1].set_xlabel(""); axes[1].tick_params(axis="x", rotation=25)
        fig.tight_layout()
        self._save(fig, "v9_duration.png")

    # ---------- ⑩ 情绪分类 ----------
    def plot_emotion(self):
        cnt = Counter()
        for col in ["情绪", "mood", "emotion_tags"]:
            if col not in self.df.columns:
                continue
            if col == "emotion_tags":
                for v in self.df[col].dropna():
                    try:
                        cnt.update(json.loads(v))
                    except Exception:
                        cnt[v] += 1
            else:
                cnt.update(self.df[col].dropna().astype(str))
        if not cnt:
            return
        items = cnt.most_common(8)
        labels = [x[0][:8] for x in items]
        values = [x[1] for x in items]
        colors = PALETTE_10[:len(labels)]
        fig, ax = plt.subplots(figsize=(7, 7))
        wedges, _, autotexts = ax.pie(
            values, labels=None, autopct="%1.1f%%",
            startangle=90, colors=colors, pctdistance=0.8,
            wedgeprops={"linewidth": 1.5, "edgecolor": "white"},
        )
        for t in autotexts:
            t.set_fontsize(9); t.set_color("white")
        ax.legend(wedges, [f"{l}  ({v}首)" for l, v in zip(labels, values)],
                  title="情绪", loc="center left",
                  bbox_to_anchor=(1, 0, 0.5, 1), fontsize=9)
        ax.set_title("⑩ 情绪分类占比", fontsize=14, fontweight="bold", pad=20,
                     color="#2B2D42")
        self._save(fig, "v10_emotion_pie.png")

    # ---------- ⑪ 场景分类 ----------
    def plot_scene(self):
        cnt = Counter()
        for col in ["适合场景", "scene_tags"]:
            if col not in self.df.columns:
                continue
            if col == "scene_tags":
                for v in self.df[col].dropna():
                    try:
                        cnt.update(json.loads(v))
                    except Exception:
                        cnt[v] += 1
            else:
                cnt.update(self.df[col].dropna().astype(str))
        if not cnt:
            return
        items = cnt.most_common(8)
        labels = [x[0] for x in items]
        values = [x[1] for x in items]
        colors = PALETTE_10[:len(labels)]
        fig, ax = plt.subplots(figsize=(10, 5))
        bars = ax.bar(range(len(labels)), values, color=colors, edgecolor="white")
        ax.set_xticks(range(len(labels)))
        ax.set_xticklabels(labels, fontsize=10)
        self._setup_ax(ax, "⑪ 场景分类占比", "场景")
        for bar, v in zip(bars, values):
            ax.text(bar.get_x()+bar.get_width()/2, bar.get_height()+0.5,
                    str(v), ha="center", fontsize=9)
        self._save(fig, "v11_scene_bar.png")

    # ---------- ⑫ 高频关键词 ----------
    def plot_keyword(self):
        all_kw = []
        for col in ["关键词", "theme_keywords", "keywords"]:
            if col not in self.df.columns:
                continue
            for v in self.df[col].dropna().astype(str):
                try:
                    all_kw.extend(json.loads(v))
                except Exception:
                    for kw in re.split(r"[ ,，、;；]", v):
                        kw = kw.strip().strip("[]\"'")
                        if kw and len(kw) > 0:
                            all_kw.append(kw)
        if not all_kw:
            return
        cnt = Counter(all_kw).most_common(15)
        labels = [x[0] for x in cnt[::-1]]
        values = [x[1] for x in cnt[::-1]]
        colors = PALETTE_10[:len(labels)][::-1]
        fig, ax = plt.subplots(figsize=(10, 6))
        ax.barh(range(len(labels)), values, color=colors, edgecolor="white")
        ax.set_yticks(range(len(labels)))
        ax.set_yticklabels(labels, fontsize=9)
        self._setup_ax(ax, "⑫ 高频关键词 Top15", "出现次数")
        for i, v in enumerate(values):
            ax.text(v + 0.3, i, str(v), va="center", fontsize=8)
        ax.set_xlim(0, max(values) * 1.12)
        self._save(fig, "v12_keyword_bar.png")

    # ---------- ⑬ TF-IDF ----------
    def plot_tfidf(self, words, values):
        if words is None or len(words) == 0:
            return
        w = [x[:15] for x in words[::-1]]
        v = values[::-1]
        colors = PALETTE_10[:len(w)][::-1]
        fig, ax = plt.subplots(figsize=(10, 6))
        ax.barh(range(len(w)), v, color=colors, edgecolor="white")
        ax.set_yticks(range(len(w)))
        ax.set_yticklabels(w, fontsize=9)
        self._setup_ax(ax, "⑬ TF-IDF 高频词", "TF-IDF 均值")
        for i, val in enumerate(v):
            ax.text(val + 0.001, i, f"{val:.4f}", va="center", fontsize=8)
        ax.set_xlim(0, max(v) * 1.15)
        self._save(fig, "v13_tfidf.png")

    # ---------- ⑭ PCA ----------
    def plot_pca(self, coords, ratio, features):
        if coords is None:
            return
        have_cluster = "genre" in self.df.columns
        fig, axes = plt.subplots(1, 2 if have_cluster else 1,
                                 figsize=(14 if have_cluster else 7, 5.5))
        if have_cluster:
            ax1, ax2 = axes
        else:
            ax1 = axes
        # 散点图
        ax1.scatter(coords[:, 0], coords[:, 1], c=C_PRIMARY, alpha=0.4,
                    s=12, edgecolors="none")
        ax1.set_xlabel(f"PC1 ({ratio[0]*100:.1f}%)", fontsize=11)
        ax1.set_ylabel(f"PC2 ({ratio[1]*100:.1f}%)", fontsize=11)
        ax1.set_title("⑭a PCA 降维可视化", fontsize=13, fontweight="bold",
                      color="#2B2D42")
        ax1.grid(alpha=0.2)
        # 按流派着色
        if have_cluster:
            genres = self.df["genre"].values
            unique_g = np.unique(genres)
            for i, ug in enumerate(unique_g):
                mask = genres == ug
                ax2.scatter(coords[mask, 0], coords[mask, 1],
                            s=10, alpha=0.5, label=ug[:12],
                            color=PALETTE_20[i % 20])
            ax2.set_xlabel(f"PC1 ({ratio[0]*100:.1f}%)", fontsize=11)
            ax2.set_ylabel(f"PC2 ({ratio[1]*100:.1f}%)", fontsize=11)
            ax2.set_title("⑭b PCA (按流派着色)", fontsize=13, fontweight="bold",
                          color="#2B2D42")
            ax2.legend(fontsize=7, ncol=2, loc="best")
            ax2.grid(alpha=0.2)
        fig.tight_layout()
        self._save(fig, "v14_pca.png")

    # ---------- ⑮ KMeans ----------
    def plot_kmeans(self, labels, centers, features, pca_coords=None):
        if labels is None:
            return
        n = len(np.unique(labels))
        colors = PALETTE_10[:n]
        fig, axes = plt.subplots(1, 2, figsize=(14, 5.5))
        # 二维特征散点（用前两维 PCA）
        if pca_coords is not None:
            for i in range(n):
                mask = labels == i
                axes[0].scatter(pca_coords[mask, 0], pca_coords[mask, 1],
                                s=12, alpha=0.5, label=f"簇{i+1}",
                                color=colors[i])
            axes[0].set_xlabel("PC1", fontsize=11)
            axes[0].set_ylabel("PC2", fontsize=11)
            axes[0].set_title("⑮a KMeans 聚类 (PCA投影)", fontsize=13,
                              fontweight="bold", color="#2B2D42")
            axes[0].legend(fontsize=9)
            axes[0].grid(alpha=0.2)
        # 簇大小
        sizes = [int((labels == i).sum()) for i in range(n)]
        axes[1].bar(range(n), sizes, color=colors[:n], edgecolor="white")
        axes[1].set_xticks(range(n))
        axes[1].set_xticklabels([f"簇{i+1}" for i in range(n)], fontsize=11)
        self._setup_ax(axes[1], "⑮b 各簇歌曲数量", "簇")
        for i, v in enumerate(sizes):
            axes[1].text(i, v + 0.5, str(v), ha="center", fontsize=10)
        fig.tight_layout()
        self._save(fig, "v15_kmeans.png")

    # ---------- 额外：相关性热力图 ----------
    def plot_corr(self):
        num_cols = ["popularity", "danceability", "energy", "loudness",
                     "acousticness", "valence", "tempo", "duration_ms"]
        avail = [c for c in num_cols if c in self.df.columns]
        if len(avail) < 3:
            return
        corr = self.df[avail].corr()
        fig, ax = plt.subplots(figsize=(9, 7))
        mask = np.triu(np.ones_like(corr, dtype=bool), k=1)
        sns.heatmap(corr, mask=mask, annot=True, fmt=".2f", cmap="RdBu_r",
                    center=0, square=True, linewidths=0.8,
                    cbar_kws={"shrink": 0.7, "label": "Pearson r"},
                    ax=ax)
        ax.set_title("相关性热力图", fontsize=14, fontweight="bold", pad=15,
                     color="#2B2D42")
        ax.tick_params(axis="x", rotation=30)
        self._save(fig, "v16_correlation_heatmap.png")

    # ---------- 额外：前 5 流派雷达图 ----------
    def plot_radar(self):
        features = ["danceability", "energy", "acousticness", "valence", "liveness"]
        avail = [c for c in features if c in self.df.columns]
        if len(avail) < 3 or "genre" not in self.df.columns:
            return
        top5 = self.df["genre"].value_counts().head(5).index
        means = self.df[self.df["genre"].isin(top5)].groupby("genre")[avail].mean()
        n = len(avail)
        angles = np.linspace(0, 2*np.pi, n, endpoint=False).tolist() + [0]
        fig, ax = plt.subplots(figsize=(8, 8), subplot_kw={"projection": "polar"})
        for i, genre in enumerate(means.index):
            vals = means.loc[genre].values.tolist() + [means.loc[genre].values[0]]
            ax.plot(angles, vals, "o-", lw=2, label=genre, color=PALETTE_6[i % 6])
            ax.fill(angles, vals, alpha=0.08, color=PALETTE_6[i % 6])
        ax.set_xticks(angles[:-1])
        ax.set_xticklabels([f.capitalize() for f in avail], fontsize=10)
        ax.set_ylim(0, 1)
        ax.set_yticks([0.2, 0.4, 0.6, 0.8])
        ax.set_yticklabels(["0.2", "0.4", "0.6", "0.8"], fontsize=8)
        ax.legend(loc="upper right", bbox_to_anchor=(1.3, 1.1), fontsize=10)
        ax.set_title("Top5 流派音频特征雷达图", fontsize=14, fontweight="bold",
                     pad=25, color="#2B2D42")
        self._save(fig, "v17_radar_genre.png")

    def generate_all(self, analyzer):
        print("\n" + "=" * 60)
        print("  开始生成可视化图表（15+ 张）")
        print("=" * 60 + "\n")

        self.plot_year_dist()
        self.plot_top_artists()
        self.plot_genre_share()
        self.plot_popularity()
        self.plot_danceability()
        self.plot_energy()
        self.plot_valence()
        self.plot_tempo()
        self.plot_duration()
        self.plot_emotion()
        self.plot_scene()
        self.plot_keyword()

        words, vals = analyzer.tfidf_analysis()
        self.plot_tfidf(words, vals)

        coords, ratio, feat = analyzer.pca_analysis()
        self.plot_pca(coords, ratio, feat)

        labels, centers, feat2 = analyzer.kmeans_analysis()
        self.plot_kmeans(labels, centers, feat2, coords)

        self.plot_corr()
        self.plot_radar()

        print(f"\n✓ 完成！共生成 {len(self.files)} 张图表")


# ==================================================================
# 保存分析摘要
# ==================================================================

def save_summary(summary):
    path = ANALYSIS_DIR / "analysis_summary.json"
    with open(path, "w", encoding="utf-8") as f:
        json.dump(summary, f, ensure_ascii=False, indent=2, default=str)
    print(f"\n[摘要] 已保存: {path}")


def print_summary(summary):
    print("\n" + "=" * 60)
    print("  分析结果摘要")
    print("=" * 60)

    # 年份
    yd = summary.get("year_distribution", {})
    if yd:
        print(f"\n① 年份: {yd.get('min_year')} ~ {yd.get('max_year')}")

    # 歌手
    ta = summary.get("top_artists", {})
    if ta:
        print(f"② Top3 歌手: {', '.join(list(ta.keys())[:3])}")

    # 流派
    gs = summary.get("genre_share", {})
    if gs:
        top3 = sorted(gs.items(), key=lambda x: x[1]["count"], reverse=True)[:3]
        print(f"③ Top3 流派: {', '.join(f'{k}({v[\"pct\"]}%)' for k,v in top3)}")

    # 情绪
    es = summary.get("emotion_share", {})
    if es:
        top3 = sorted(es.items(), key=lambda x: x[1], reverse=True)[:3]
        print(f"⑩ Top3 情绪: {', '.join(f'{k}({v})' for k,v in top3)}")

    # 场景
    ss = summary.get("scene_share", {})
    if ss:
        top3 = sorted(ss.items(), key=lambda x: x[1], reverse=True)[:3]
        print(f"⑪ Top3 场景: {', '.join(f'{k}({v})' for k,v in top3)}")

    # 关键词
    kw = summary.get("keyword_freq", {})
    if kw:
        top5 = list(kw.keys())[:5]
        print(f"⑫ Top5 关键词: {', '.join(top5)}")

    # PCA
    pca = summary.get("pca", {})
    if pca:
        r = pca.get("explained_var_ratio", [])
        if r:
            print(f"⑭ PCA 解释方差: PC1={r[0]*100:.1f}%, PC2={r[1]*100:.1f}%")

    # KMeans
    km = summary.get("kmeans", {})
    if km:
        cs = km.get("cluster_sizes", {})
        print(f"⑮ KMeans 簇大小: {cs}")

    print()


# ==================================================================
# 主入口
# ==================================================================

def main():
    print("=" * 60)
    print("  《音乐平台热歌榜数据探索与可视化分析》")
    print("  阶段四：多维统计分析 & 数据可视化")
    print("=" * 60)

    # 1. 分析
    analyzer = Analyzer()
    df = analyzer.load_data()
    summary = analyzer.run_all()

    # 2. 保存摘要
    save_summary(summary)

    # 3. 绘图
    plotter = Plotter(df, FIGURES_DIR)
    plotter.generate_all(analyzer)

    # 4. 打印摘要
    print_summary(summary)

    # 5. 打印文件清单
    print(f"\n输出图表 ({FIGURES_DIR}):")
    for f in sorted(plotter.files):
        size = (FIGURES_DIR / f).stat().st_size / 1024
        print(f"  {f:<35s} {size:>7.1f} KB")
    print(f"\n共 {len(plotter.files)} 张图表")


if __name__ == "__main__":
    main()
