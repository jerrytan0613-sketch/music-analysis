"""
================================================================================
《音乐平台热歌榜数据探索与可视化分析》
阶段二：数据清洗
================================================================================
功能说明：
  1. 加载原始数据 data/raw/spotify_songs.csv
  2. 执行清洗流程：
     - 删除重复歌曲
     - 删除空值
     - 统一时间格式
     - 处理异常值
     - 规范字段名称
     - 新增：发行年份、歌曲时长（分钟）、热门程度等级
  3. 输出清洗报告 + 保存清洗后数据

输出：
  - data/clean/music_clean.csv    清洗后的数据文件
  - data/clean/cleaning_report.json  清洗报告
================================================================================
"""

import json
import re
import sys
import os
from pathlib import Path
from datetime import datetime

import numpy as np
import pandas as pd

# ------------------------------------------------------------------
# 路径配置
# ------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_RAW_DIR = PROJECT_ROOT / "data" / "raw"
DATA_CLEAN_DIR = PROJECT_ROOT / "data" / "clean"
DATA_CLEAN_DIR.mkdir(parents=True, exist_ok=True)


# ==================================================================
# 数据清洗器
# ==================================================================

class DataCleaner:
    """
    封装所有清洗步骤，记录每一步的操作信息，最终输出清洗报告和干净数据。
    """

    # ---------- 期望的最终字段（规范名称） ----------
    FINAL_COLUMNS = [
        "track_name",           # 歌曲名称
        "artist",               # 艺术家
        "genre",                # 流派
        "popularity",           # 流行度
        "danceability",         # 舞蹈性
        "energy",               # 能量
        "loudness",             # 响度 (dB)
        "speechiness",          # 语言密度
        "acousticness",         # 原声度
        "instrumentalness",     # 器乐度
        "liveness",             # 现场感
        "valence",              # 情感积极性
        "tempo",                # 速度 (BPM)
        "duration_ms",          # 时长 (毫秒)
        "duration_min",         # ★ 新增：时长 (分钟)
        "key",                  # 调号
        "mode",                 # 大小调
        "time_signature",       # 拍号
        "year",                 # ★ 新增：发行年份
        "popularity_level",     # ★ 新增：热门程度等级
        "billboard_rank",       # Billboard 排名
        "weeks_on_chart",       # 在榜周数
        "mood",                 # 情绪标签
    ]

    # 数值字段列表（用于异常值检测和缺失值填充）
    NUMERIC_COLS = [
        "popularity", "danceability", "energy", "loudness",
        "speechiness", "acousticness", "instrumentalness",
        "liveness", "valence", "tempo", "duration_ms",
        "key", "mode", "time_signature", "year",
        "billboard_rank", "weeks_on_chart",
    ]

    # 各字段的合理取值范围 [最小值, 最大值]
    RANGE_CONSTRAINTS = {
        "popularity":       (0, 100),
        "danceability":     (0.0, 1.0),
        "energy":           (0.0, 1.0),
        "acousticness":     (0.0, 1.0),
        "instrumentalness": (0.0, 1.0),
        "liveness":         (0.0, 1.0),
        "valence":          (0.0, 1.0),
        "speechiness":      (0.0, 1.0),
        "loudness":         (-40.0, 5.0),
        "tempo":            (40.0, 220.0),
        "duration_ms":      (30000, 600000),
        "key":              (0, 11),
        "mode":             (0, 1),
        "time_signature":   (1, 12),
        "year":             (1950, 2026),
        "billboard_rank":   (1, 100),
        "weeks_on_chart":   (1, 208),
    }

    def __init__(self, raw_path: str | Path):
        self.raw_path = Path(raw_path)
        self.df: pd.DataFrame | None = None
        self.cleaning_log: list[dict] = []  # 清洗步骤日志
        self.before_shape: tuple = (0, 0)

    # ----------------------------------------------------------------
    # 工具方法
    # ----------------------------------------------------------------
    def _log(self, step: str, action: str, detail: str = ""):
        """记录清洗日志"""
        entry = {
            "step": step,
            "action": action,
            "detail": detail,
            "timestamp": datetime.now().isoformat(),
        }
        self.cleaning_log.append(entry)
        print(f"  [{step}] {action}: {detail}")

    def _safe_to_numeric(self, col: str):
        """安全转换为数值类型，无法转换的置为 NaN"""
        if col in self.df.columns:
            self.df[col] = pd.to_numeric(self.df[col], errors="coerce")

    # ----------------------------------------------------------------
    # STEP 0: 加载数据
    # ----------------------------------------------------------------
    def load_data(self):
        print("\n[STEP 0/8] 加载原始数据...")
        self.df = pd.read_csv(self.raw_path, encoding="utf-8")
        self.before_shape = self.df.shape
        print(f"  原始形状: {self.df.shape[0]} 行 × {self.df.shape[1]} 列")
        print(f"  原始列名: {list(self.df.columns)}")

        # 统一列名：原始数据中的 name -> track_name
        col_rename = {
            "name": "track_name",
            "id": "track_id",
        }
        self.df.rename(columns=col_rename, inplace=True)

        self._log("0", "加载数据", f"原始形状: {self.before_shape}")

    # ----------------------------------------------------------------
    # STEP 1: 删除重复歌曲
    # ----------------------------------------------------------------
    def remove_duplicates(self):
        """
        删除重复的歌曲记录。
        判断依据：track_name + artist 同时重复视为重复。
        """
        print("\n[STEP 1/8] 删除重复歌曲...")

        if "track_name" not in self.df.columns or "artist" not in self.df.columns:
            self._log("1", "跳过", "缺少 track_name 或 artist 列")
            return

        before = len(self.df)

        # 以歌曲名+艺术家为去重依据，保留流行度最高的那条
        self.df = self.df.sort_values("popularity", ascending=False)
        self.df = self.df.drop_duplicates(subset=["track_name", "artist"], keep="first")

        after = len(self.df)
        removed = before - after
        self._log("1", "去重完成", f"删除 {removed} 条重复记录, 剩余 {after} 条")
        print(f"  删除 {removed} 条重复记录, 剩余 {after} 条")

    # ----------------------------------------------------------------
    # STEP 2: 处理缺失值
    # ----------------------------------------------------------------
    def handle_missing_values(self):
        """
        处理缺失值：
        - 如果某行 track_name 缺失，删除该行（核心字段不可缺失）
        - 数值列：用中位数填充
        - 类别列：用 "Unknown" 填充
        """
        print("\n[STEP 2/8] 处理缺失值...")

        # 统计缺失情况
        missing_before = self.df.isnull().sum()
        missing_before = missing_before[missing_before > 0]
        if len(missing_before) > 0:
            print("  填充前缺失统计:")
            for col, cnt in missing_before.items():
                print(f"    - {col}: {cnt} 个缺失")
        else:
            print("  无缺失值")

        # 删除 track_name 为空的行
        if "track_name" in self.df.columns:
            n_no_name = self.df["track_name"].isnull().sum()
            if n_no_name > 0:
                self.df.dropna(subset=["track_name"], inplace=True)
                self._log("2a", "删除无歌名行", f"删除了 {n_no_name} 行")
                print(f"  删除 {n_no_name} 行无歌名记录")

        # 数值列用中位数填充
        for col in self.NUMERIC_COLS:
            if col not in self.df.columns:
                continue
            self._safe_to_numeric(col)
            n_miss = self.df[col].isnull().sum()
            if n_miss > 0:
                median_val = self.df[col].median()
                self.df[col].fillna(median_val, inplace=True)
                self._log("2b", f"填充 {col}", f"用中位数 {median_val:.4f} 填充了 {n_miss} 个缺失值")

        # 类别列填充
        cat_cols = ["genre", "mood"]
        for col in cat_cols:
            if col in self.df.columns:
                n_miss = self.df[col].isnull().sum()
                if n_miss > 0:
                    self.df[col].fillna("Unknown", inplace=True)
                    self._log("2c", f"填充 {col}", f"填充了 {n_miss} 个缺失值")

        missing_after = self.df.isnull().sum().sum()
        self._log("2", "缺失值处理完成", f"处理后缺失总数: {missing_after}")

    # ----------------------------------------------------------------
    # STEP 3: 统一时间格式
    # ----------------------------------------------------------------
    def normalize_year(self):
        """
        统一时间格式：
        - 确保 year 列为整数类型
        - 如果存在 release_date 列，从中提取年份
        - 过滤掉 year 不在合理范围 (1950-2026) 的记录
        """
        print("\n[STEP 3/8] 统一时间格式...")

        # 从 release_date 中提取年份（如果有该列）
        if "release_date" in self.df.columns:
            self.df["release_date"] = self.df["release_date"].astype(str)
            # 尝试多种日期格式提取年份
            def extract_year(date_str):
                date_str = str(date_str).strip()
                # YYYY-MM-DD
                m = re.search(r"(\d{4})-\d{2}-\d{2}", date_str)
                if m:
                    return int(m.group(1))
                # MM/DD/YYYY
                m = re.search(r"\d{2}/\d{2}/(\d{4})", date_str)
                if m:
                    return int(m.group(1))
                # 纯 YYYY
                m = re.search(r"(\d{4})", date_str)
                if m:
                    return int(m.group(1))
                return None

            self.df["year"] = self.df["release_date"].apply(extract_year)
            self._log("3a", "从 release_date 提取年份", f"提取完成")

        # 确保 year 是数值
        self._safe_to_numeric("year")

        # 过滤年份不在合理范围的记录
        if "year" in self.df.columns:
            before = len(self.df)
            self.df = self.df[(self.df["year"] >= 1950) & (self.df["year"] <= 2026)]
            removed = before - len(self.df)
            if removed > 0:
                self._log("3b", "过滤年份", f"删除了 {removed} 条年份不在 [1950, 2026] 范围的记录")

            # 转换为整数
            self.df["year"] = self.df["year"].astype(int)

        print(f"  年份范围: {self.df['year'].min()} ~ {self.df['year'].max()}")

    # ----------------------------------------------------------------
    # STEP 4: 处理异常值
    # ----------------------------------------------------------------
    def handle_outliers(self):
        """
        处理异常值：
        - 基于业务规则裁剪超出合理范围的值
        - 使用 IQR 方法检测并裁剪极端值（针对连续型特征）
        """
        print("\n[STEP 4/8] 处理异常值...")

        # 4a) 业务规则裁剪
        for col, (lo, hi) in self.RANGE_CONSTRAINTS.items():
            if col not in self.df.columns:
                continue
            self._safe_to_numeric(col)
            n_before = ((self.df[col] < lo) | (self.df[col] > hi)).sum()
            if n_before > 0:
                self.df[col] = self.df[col].clip(lo, hi)
                self._log("4a", f"裁剪 {col}", f"将 {n_before} 个值限制在 [{lo}, {hi}]")

        # 4b) IQR 极端值裁剪（针对连续型特征）
        iqr_cols = ["popularity", "danceability", "energy", "valence", "tempo", "duration_ms"]
        for col in iqr_cols:
            if col not in self.df.columns:
                continue
            vals = self.df[col]
            q1 = vals.quantile(0.01)
            q99 = vals.quantile(0.99)
            n_clipped = ((vals < q1) | (vals > q99)).sum()
            if n_clipped > 0:
                self.df[col] = vals.clip(q1, q99)
                self._log("4b", f"IQR 裁剪 {col}", f"裁剪了 {n_clipped} 个极端值 (1%-99% 分位)")

        self._log("4", "异常值处理完成", "")

    # ----------------------------------------------------------------
    # STEP 5: 规范字段名称
    # ----------------------------------------------------------------
    def normalize_field_names(self):
        """
        规范字段名称：
        - 统一为小写 + 下划线格式
        - 重命名不符合规范的列
        """
        print("\n[STEP 5/8] 规范字段名称...")

        rename_map = {
            "track": "track_name",
            "title": "track_name",
            "song": "track_name",
            "trackname": "track_name",
            "artists": "artist",
            "artist_name": "artist",
            "genres": "genre",
            "duration": "duration_ms",
            "length": "duration_ms",
            "dur": "duration_ms",
            "pop": "popularity",
            "pop_score": "popularity",
            "dance": "danceability",
            "acoustic": "acousticness",
            "instrumental": "instrumentalness",
            "speech": "speechiness",
            "loud": "loudness",
            "billboard_rank_current": "billboard_rank",
            "rank": "billboard_rank",
            "chart_rank": "billboard_rank",
            "this_week": "billboard_rank",
            "peak_position": "peak_rank",
            "weeks": "weeks_on_chart",
            "weeks_on_board": "weeks_on_chart",
            "release_date": "release_date",  # 保留
            "tempo_bpm": "tempo",
        }

        applied = []
        for old_col in list(self.df.columns):
            col_lower = old_col.strip().lower()
            if col_lower in rename_map:
                new_name = rename_map[col_lower]
                if new_name != old_col:
                    self.df.rename(columns={old_col: new_name}, inplace=True)
                    applied.append(f"{old_col} → {new_name}")

        if applied:
            for a in applied:
                self._log("5", "重命名", a)
        else:
            self._log("5", "检查", "所有字段名已规范")

        # 只保留最终需要的列
        existing_cols = [c for c in self.FINAL_COLUMNS if c in self.df.columns]
        extra_cols = [c for c in self.df.columns if c not in self.FINAL_COLUMNS and c != "release_date"]
        if extra_cols:
            print(f"  移除多余列: {extra_cols}")
        self.df = self.df[existing_cols]

        print(f"  最终列数: {len(self.df.columns)}")
        print(f"  列名: {list(self.df.columns)}")

    # ----------------------------------------------------------------
    # STEP 6: 新增字段 — 发行年份（如果还不存在）
    # ----------------------------------------------------------------
    def add_year_column(self):
        """
        确保 year 列存在且完整。
        如果某些歌曲年份仍缺失（如古典音乐无法从 release_date 获取），
        用流派年代统计规律补全。
        """
        print("\n[STEP 6/8] 补全发行年份...")

        if "year" not in self.df.columns:
            self.df["year"] = 0

        missing_year = self.df["year"].isnull().sum()
        zero_year = (self.df["year"] == 0).sum()
        total_missing = missing_year + zero_year

        if total_missing == 0:
            print("  所有歌曲已有发行年份，无需补全")
            return

        print(f"  需补全年份的歌曲数: {total_missing}")

        # 按流派填充合理的年份
        genre_year_map = {
            "classical": 1990,
            "jazz": 1980,
            "reggae": 1990,
            "rap": 2010,
            "rock": 2000,
        }

        def fill_year(row):
            if pd.isna(row["year"]) or row["year"] == 0:
                genre = str(row.get("genre", "")).lower().strip()
                return genre_year_map.get(genre, 2000)
            return row["year"]

        self.df["year"] = self.df.apply(fill_year, axis=1)
        self.df["year"] = self.df["year"].astype(int)

        self._log("6", "补全年份", f"补全了 {total_missing} 条记录的年份")
        print(f"  补全后年份范围: {self.df['year'].min()} ~ {self.df['year'].max()}")

    # ----------------------------------------------------------------
    # STEP 7: 新增字段 — 歌曲时长（分钟）& 热门程度等级
    # ----------------------------------------------------------------
    def add_derived_columns(self):
        """
        新增字段：
          1. duration_min ： 歌曲时长（分钟），由 duration_ms 转换
          2. popularity_level ： 热门程度等级（5 级）
        """
        print("\n[STEP 7/8] 新增派生字段...")

        # 7a) 时长（分钟）
        if "duration_ms" in self.df.columns:
            self.df["duration_min"] = (self.df["duration_ms"] / 60000).round(2)
            self._log("7a", "新增 duration_min", "从 duration_ms 转换")
            print(f"  新增 duration_min (歌曲时长/分钟)")
            print(f"    范围: {self.df['duration_min'].min():.2f} ~ {self.df['duration_min'].max():.2f} 分钟")
            print(f"    均值: {self.df['duration_min'].mean():.2f} 分钟")

        # 7b) 热门程度等级
        if "popularity" in self.df.columns:
            def classify_popularity(score):
                if score >= 80:
                    return "S - 爆红"
                elif score >= 60:
                    return "A - 热门"
                elif score >= 40:
                    return "B - 中等"
                elif score >= 20:
                    return "C - 小众"
                else:
                    return "D - 冷门"

            self.df["popularity_level"] = self.df["popularity"].apply(classify_popularity)
            self._log("7b", "新增 popularity_level", "基于流行度分数分 5 级")
            print(f"  新增 popularity_level (热门程度等级)")
            print(f"    分布:")
            for level, count in self.df["popularity_level"].value_counts().items():
                print(f"      {level}: {count} 首 ({count/len(self.df)*100:.1f}%)")

    # ----------------------------------------------------------------
    # STEP 8: 最终检查
    # ----------------------------------------------------------------
    def final_check(self):
        """
        最终检查：
        - 确保所有列为正确的数据类型
        - 确保无缺失值
        - 整理列顺序
        """
        print("\n[STEP 8/8] 最终检查...")

        # 确保列顺序
        existing_cols = [c for c in self.FINAL_COLUMNS if c in self.df.columns]
        self.df = self.df[existing_cols]

        # 确保所有数值列为 float64 / int64
        for col in self.NUMERIC_COLS:
            if col in self.df.columns:
                self._safe_to_numeric(col)

        # 检查最终缺失值
        total_missing = self.df.isnull().sum().sum()
        if total_missing > 0:
            print(f"  [警告] 仍有 {total_missing} 个缺失值")
            missing_cols = self.df.isnull().sum()
            missing_cols = missing_cols[missing_cols > 0]
            for col, cnt in missing_cols.items():
                print(f"    {col}: {cnt}")
        else:
            print("  ✓ 无缺失值")

        print(f"  最终形状: {self.df.shape[0]} 行 × {self.df.shape[1]} 列")

        self._log("8", "最终检查", f"清洗后形状: {self.df.shape}")

    # ----------------------------------------------------------------
    # 完整清洗流水线
    # ----------------------------------------------------------------
    def run_pipeline(self):
        print("=" * 60)
        print("  开始数据清洗流水线")
        print("=" * 60)

        self.load_data()
        self.remove_duplicates()
        self.handle_missing_values()
        self.normalize_year()
        self.handle_outliers()
        self.normalize_field_names()
        self.add_year_column()
        self.add_derived_columns()
        self.final_check()

        print()
        print("=" * 60)
        print(f"  清洗完成！")
        print(f"  原始: {self.before_shape[0]} 行 → 最终: {self.df.shape[0]} 行")
        print(f"  原始: {self.before_shape[1]} 列 → 最终: {self.df.shape[1]} 列")
        print("=" * 60)

    # ----------------------------------------------------------------
    # 保存和报告
    # ----------------------------------------------------------------
    def save_clean_data(self, output_path: str | Path):
        """保存清洗后数据"""
        self.df.to_csv(output_path, index=False, encoding="utf-8-sig")
        print(f"\n[保存] 清洗后数据: {output_path}")
        print(f"       {self.df.shape[0]} 行 × {self.df.shape[1]} 列")

    def build_report(self, output_path: str | Path) -> dict:
        """
        生成清洗报告，包含：
        - 数据量
        - 缺失值统计
        - 字段说明
        - 描述性统计
        """
        report = {
            "报告标题": "数据清洗报告",
            "生成时间": datetime.now().strftime("%Y-%m-%d %H:%M:%S"),
            "流水线步骤": self.cleaning_log,
        }

        # ---- ① 数据量 ----
        report["数据量"] = {
            "原始行数": self.before_shape[0],
            "最终行数": self.df.shape[0],
            "删除行数": self.before_shape[0] - self.df.shape[0],
            "原始列数": self.before_shape[1],
            "最终列数": self.df.shape[1],
            "删除列数": self.before_shape[1] - self.df.shape[1],
        }

        # ---- ② 缺失值统计 ----
        missing_series = self.df.isnull().sum()
        missing_series = missing_series[missing_series > 0]
        report["缺失值统计"] = {
            "总缺失数": int(missing_series.sum()),
            "缺失率": f"{missing_series.sum() / (self.df.shape[0] * self.df.shape[1]) * 100:.4f}%",
            "各列缺失详情": {
                col: {
                    "缺失数": int(cnt),
                    "缺失率": f"{cnt / self.df.shape[0] * 100:.2f}%",
                }
                for col, cnt in missing_series.items()
            },
        }
        if len(missing_series) == 0:
            report["缺失值统计"]["各列缺失详情"] = "无缺失值"

        # ---- ③ 字段说明 ----
        field_descriptions = {
            "track_name": "歌曲名称",
            "artist": "艺术家",
            "genre": "音乐流派",
            "popularity": "流行度 (0-100)",
            "danceability": "舞蹈性 (0.0-1.0)",
            "energy": "能量 (0.0-1.0)",
            "loudness": "响度 (dB)",
            "speechiness": "语言密度 (0.0-1.0)",
            "acousticness": "原声度 (0.0-1.0)",
            "instrumentalness": "器乐度 (0.0-1.0)",
            "liveness": "现场感 (0.0-1.0)",
            "valence": "情感积极性 (0.0-1.0)",
            "tempo": "速度 (BPM)",
            "duration_ms": "时长 (毫秒)",
            "duration_min": "时长 (分钟)",
            "key": "调号 (0-11, C=0, C#=1, ...)",
            "mode": "大小调 (0=小调, 1=大调)",
            "time_signature": "拍号",
            "year": "发行年份",
            "popularity_level": "热门程度等级 (S/A/B/C/D)",
            "billboard_rank": "Billboard 峰值排名",
            "weeks_on_chart": "在榜周数",
            "mood": "情绪标签",
        }
        report["字段说明"] = {
            col: field_descriptions.get(col, "自定义字段")
            for col in self.df.columns
        }

        # ---- ④ 描述性统计 ----
        numeric_df = self.df.select_dtypes(include=[np.number])
        desc = numeric_df.describe().round(4)
        desc_dict = {}
        for col in desc.columns:
            desc_dict[col] = {
                "数量": int(desc[col]["count"]),
                "均值": float(desc[col]["mean"]),
                "标准差": float(desc[col]["std"]),
                "最小值": float(desc[col]["min"]),
                "25%分位": float(desc[col]["25%"]),
                "中位数": float(desc[col]["50%"]),
                "75%分位": float(desc[col]["75%"]),
                "最大值": float(desc[col]["max"]),
            }
        report["描述性统计"] = desc_dict

        # 额外分类统计
        report["分类统计"] = {}
        if "popularity_level" in self.df.columns:
            level_counts = self.df["popularity_level"].value_counts()
            report["分类统计"]["热门程度分布"] = {
                str(k): int(v) for k, v in level_counts.items()
            }
        if "genre" in self.df.columns:
            genre_counts = self.df["genre"].value_counts().head(10)
            report["分类统计"]["Top 10 流派分布"] = {
                str(k): int(v) for k, v in genre_counts.items()
            }

        # 保存报告
        with open(output_path, "w", encoding="utf-8") as f:
            json.dump(report, f, ensure_ascii=False, indent=2)

        print(f"\n[保存] 清洗报告: {output_path}")
        return report

    def print_summary(self, report: dict):
        """在终端输出报告摘要"""
        print()
        print("=" * 60)
        print("  数据清洗报告摘要")
        print("=" * 60)
        print()

        # 数据量
        vol = report["数据量"]
        print(f"【数据量】")
        print(f"  原始数据: {vol['原始行数']} 行 × {vol['原始列数']} 列")
        print(f"  清洗后  : {vol['最终行数']} 行 × {vol['最终列数']} 列")
        print(f"  删除    : {vol['删除行数']} 行, {vol['删除列数']} 列")

        # 缺失值
        miss = report["缺失值统计"]
        print(f"\n【缺失值统计】")
        print(f"  总缺失数: {miss['总缺失数']} ({miss['缺失率']})")
        if isinstance(miss["各列缺失详情"], dict):
            for col, info in miss["各列缺失详情"].items():
                print(f"  {col}: {info['缺失数']} ({info['缺失率']})")

        # 描述性统计（核心字段）
        print(f"\n【核心字段描述性统计】")
        key_cols = ["popularity", "danceability", "energy", "valence", "tempo", "duration_min", "year"]
        header = f"{'字段':<18} {'均值':<10} {'中位数':<10} {'标准差':<10} {'最小值':<8} {'最大值':<8}"
        print(header)
        print("-" * len(header))
        for col in key_cols:
            if col in report["描述性统计"]:
                d = report["描述性统计"][col]
                print(f"{col:<18} {d['均值']:<10.2f} {d['中位数']:<10.2f} {d['标准差']:<10.2f} {d['最小值']:<8.2f} {d['最大值']:<8.2f}")

        # 分类统计
        print(f"\n【热门程度分布】")
        if "热门程度分布" in report.get("分类统计", {}):
            for level, count in report["分类统计"]["热门程度分布"].items():
                print(f"  {level}: {count} 首")

        print()
        print("=" * 60)


# ==================================================================
# 主入口
# ==================================================================

def main():
    raw_path = DATA_RAW_DIR / "spotify_songs.csv"

    if not raw_path.exists():
        print(f"[错误] 原始数据不存在: {raw_path}")
        print("[提示] 请先运行 python scripts/download_data.py")
        sys.exit(1)

    # ----- 初始化清洗器 -----
    cleaner = DataCleaner(raw_path)

    # ----- 执行清洗 -----
    cleaner.run_pipeline()

    # ----- 保存 -----
    clean_path = DATA_CLEAN_DIR / "music_clean.csv"
    report_path = DATA_CLEAN_DIR / "cleaning_report.json"

    cleaner.save_clean_data(clean_path)
    report = cleaner.build_report(report_path)
    cleaner.print_summary(report)


if __name__ == "__main__":
    main()
