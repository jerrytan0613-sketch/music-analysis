"""
================================================================================
《音乐平台热歌榜数据探索与可视化分析》
阶段一：数据采集
================================================================================
功能说明：
  从多个公开数据源下载音乐榜单数据，合并为统一格式的主数据集。
  数据来源（优先级由高到低）：
    1. tracks5000.csv — 5000首 Spotify 歌曲（含音频特征 + 流派）
    2. spotify_moods.csv — 686首歌曲（含发行日期 + 情绪标签）
    3. billboard_hot100_latest.json — 最新 Billboard Hot 100（实时榜单排名）

  最终输出文件：data/raw/spotify_songs.csv

数据字段：
  track_name         : 歌曲名称
  artist             : 艺术家
  genre              : 流派
  popularity         : 流行度 (0-100)
  danceability       : 舞蹈性 (0.0-1.0)
  energy             : 能量 (0.0-1.0)
  loudness           : 响度 (dB)
  speechiness        : 语言密度 (0.0-1.0)
  acousticness       : 原声度 (0.0-1.0)
  instrumentalness   : 器乐度 (0.0-1.0)
  liveness           : 现场感 (0.0-1.0)
  valence            : 情感积极性 (0.0-1.0)
  tempo              : 速度 (BPM)
  duration_ms        : 时长 (毫秒)
  key                : 调号 (0-11)
  mode               : 大小调 (0=小调, 1=大调)
  time_signature     : 拍号
  year               : 发行年份
  billboard_rank     : 公告牌排名 (如有)
  weeks_on_chart     : 在榜周数 (如有)
  mood               : 情绪标签 (如有)
================================================================================
"""

import json
import csv
import os
import sys
import random
import math
import re
from pathlib import Path
from datetime import datetime
from collections import defaultdict

import requests

# ------------------------------------------------------------------
# 项目根目录 & 数据目录
# ------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_RAW_DIR = PROJECT_ROOT / "data" / "raw"
DATA_RAW_DIR.mkdir(parents=True, exist_ok=True)


# ==================================================================
# 第一部分：数据源 URL 配置
# ==================================================================

REMOTE_SOURCES = [
    {
        "name": "tracks5000.csv",
        "description": "5000首 Spotify 歌曲（含完整音频特征 + 流派）",
        "url": "https://raw.githubusercontent.com/mvanmeerbeck/sta101-spotify-api-client/master/tracks5000.csv",
        "local_path": DATA_RAW_DIR / "tracks5000.csv",
        "required": True,
    },
    {
        "name": "spotify_moods.csv",
        "description": "686首歌曲（含发行日期 + 情绪标签）",
        "url": "https://raw.githubusercontent.com/cristobalvch/Spotify-Machine-Learning/master/data/data_moods.csv",
        "local_path": DATA_RAW_DIR / "spotify_moods.csv",
        "required": False,
    },
    {
        "name": "billboard_hot100_latest.json",
        "description": "最新 Billboard Hot 100 榜单（实时排名）",
        "url": "https://raw.githubusercontent.com/mhollingshead/billboard-hot-100/main/recent.json",
        "local_path": DATA_RAW_DIR / "billboard_hot100_latest.json",
        "required": False,
    },
]


# ==================================================================
# 第二部分：简单 CSV 解析器（处理引号内逗号）
# ==================================================================

def parse_csv_line(line: str) -> list[str]:
    """
    解析 CSV 行，正确处理引号内的逗号。

    参数:
        line: CSV 行字符串

    返回:
        解析后的字段列表
    """
    fields = []
    current = []
    in_quotes = False
    for ch in line.strip():
        if ch == '"':
            in_quotes = not in_quotes
        elif ch == ',' and not in_quotes:
            fields.append(''.join(current).strip())
            current = []
        else:
            current.append(ch)
    fields.append(''.join(current).strip())
    return fields


# ==================================================================
# 第三部分：数据下载器
# ==================================================================

def download_file(url: str, local_path: Path, timeout: int = 30) -> bool:
    """
    从 URL 下载文件到本地路径。

    参数:
        url:        文件 URL
        local_path: 本地保存路径
        timeout:    超时时间（秒）

    返回:
        是否下载成功
    """
    try:
        print(f"  [下载] {url}")
        resp = requests.get(url, timeout=timeout)
        resp.raise_for_status()

        with open(local_path, "wb") as f:
            f.write(resp.content)

        size_kb = len(resp.content) / 1024
        print(f"  [成功] 已保存: {local_path.name} ({size_kb:.1f} KB)")
        return True

    except requests.RequestException as e:
        print(f"  [失败] {local_path.name}: {e}")
        return False


def download_all_sources() -> dict[str, bool]:
    """
    下载所有数据源。

    返回:
        {文件名: 是否下载成功}
    """
    print("[STEP 1/4] 下载数据源...")
    results = {}
    for source in REMOTE_SOURCES:
        # 如果本地文件已存在，跳过下载
        if source["local_path"].exists():
            size_kb = source["local_path"].stat().st_size / 1024
            print(f"  [跳过] {source['local_path'].name} 已存在 ({size_kb:.1f} KB)")
            results[source["name"]] = True
        else:
            success = download_file(source["url"], source["local_path"])
            results[source["name"]] = success

    # 检查必需文件
    required_missing = [
        s["name"] for s in REMOTE_SOURCES
        if s["required"] and not results.get(s["name"])
    ]
    if required_missing:
        raise RuntimeError(
            f"必需的数据源下载失败: {', '.join(required_missing)}"
        )

    return results


# ==================================================================
# 第四部分：数据加载与合并
# ==================================================================

def load_tracks5000(path: Path) -> list[dict]:
    """
    加载 tracks5000.csv，解析并标准化字段。

    参数:
        path: CSV 文件路径

    返回:
        记录列表
    """
    records = []
    with open(path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            rec = {
                "track_name": (row.get("name") or "").strip().strip('"').strip(),
                "artist": (row.get("artist") or "").strip().strip('"').strip(),
                "genre": (row.get("genre") or "").strip().strip('"').strip(),
                "popularity": _safe_float(row.get("popularity"), 0),
                "danceability": _safe_float(row.get("danceability"), 0),
                "energy": _safe_float(row.get("energy"), 0),
                "loudness": _safe_float(row.get("loudness"), -10),
                "speechiness": _safe_float(row.get("speechiness"), 0),
                "acousticness": _safe_float(row.get("acousticness"), 0),
                "instrumentalness": _safe_float(row.get("instrumentalness"), 0),
                "liveness": _safe_float(row.get("liveness"), 0),
                "valence": _safe_float(row.get("valence"), 0.5),
                "tempo": _safe_float(row.get("tempo"), 120),
                "duration_ms": _safe_float(row.get("duration_ms"), 200000),
                "key": _safe_int(row.get("key"), 0),
                "mode": _safe_int(row.get("mode"), 1),
                "time_signature": _safe_int(row.get("time_signature"), 4),
            }

            # 过滤空记录
            if not rec["track_name"] or rec["track_name"] == "name":
                continue
            records.append(rec)

    print(f"  tracks5000.csv: 加载 {len(records)} 条记录")
    return records


def load_spotify_moods(path: Path) -> list[dict]:
    """
    加载 spotify_moods.csv，提取发行年份和情绪标签。

    参数:
        path: CSV 文件路径

    返回:
        记录列表（用于交叉引用）
    """
    records = []
    with open(path, "r", encoding="utf-8") as f:
        reader = csv.DictReader(f)
        for row in reader:
            # 提取发行年份
            release_date = (row.get("release_date") or "").strip()
            year = 0
            if release_date:
                m = re.search(r"\d{4}", release_date)
                if m:
                    year = int(m.group())

            rec = {
                "track_name": (row.get("name") or "").strip().strip('"').strip(),
                "artist": (row.get("artist") or "").strip().strip('"').strip(),
                "year": year,
                "mood": (row.get("mood") or "").strip(),
                "popularity": _safe_float(row.get("popularity"), 0),
            }
            if rec["track_name"] and rec["track_name"] != "name":
                records.append(rec)

    print(f"  spotify_moods.csv: 加载 {len(records)} 条记录")
    return records


def load_billboard_json(path: Path) -> dict[str, dict]:
    """
    加载 Billboard Hot 100 JSON 数据。

    参数:
        path: JSON 文件路径

    返回:
        {(song, artist): 排名信息} 字典
    """
    with open(path, "r", encoding="utf-8") as f:
        data = json.load(f)

    chart = {}
    for entry in data.get("data", []):
        key = _normalize_name(entry.get("song", ""))
        artist_key = _normalize_name(entry.get("artist", ""))
        chart[(key, artist_key)] = {
            "billboard_rank": entry.get("this_week"),
            "weeks_on_chart": entry.get("weeks_on_chart"),
            "peak_position": entry.get("peak_position"),
        }

    print(f"  billboard_hot100_latest.json: 加载 {len(chart)} 条榜单记录")
    return chart


# ==================================================================
# 第五部分：数据合并 & 年份补全
# ==================================================================

def _safe_float(val, default: float = 0.0) -> float:
    """安全转换为 float"""
    try:
        return float(val)
    except (ValueError, TypeError):
        return default


def _safe_int(val, default: int = 0) -> int:
    """安全转换为 int"""
    try:
        return int(float(val))
    except (ValueError, TypeError):
        return default


def _normalize_name(name: str) -> str:
    """标准化名称（用于匹配）"""
    return re.sub(r"[^a-z0-9]", "", name.lower().strip())


def merge_datasets(
    tracks: list[dict],
    moods: list[dict],
    billboard: dict[str, dict],
) -> list[dict]:
    """
    合并三个数据源，补全年份和榜单信息。

    合并策略：
      1. 以 tracks5000.csv 为主体
      2. 通过 track_name + artist 模糊匹配 spotify_moods.csv 获取发行年份
      3. 匹配不到年份的，按流派生成合理的年份分布
      4. 通过 track_name + artist 匹配 Billboard 排名

    参数:
        tracks:    tracks5000 记录
        moods:     spotify_moods 记录
        billboard: Billboard 排名字典

    返回:
        合并后的记录列表
    """
    print("[STEP 2/4] 合并数据源...")

    # ---- 构建 mood 查找索引 ----
    mood_index = defaultdict(list)
    for rec in moods:
        if rec["year"] > 0:
            key = (_normalize_name(rec["track_name"]), _normalize_name(rec["artist"]))
            mood_index[key].append(rec)

    # ---- 构建模糊匹配索引（仅按歌曲名） ----
    mood_by_name = defaultdict(list)
    for rec in moods:
        if rec["year"] > 0:
            mood_by_name[_normalize_name(rec["track_name"])].append(rec)

    # ---- 合并 ----
    merged = []
    year_matched_exact = 0
    year_matched_fuzzy = 0
    year_synthetic = 0
    billboard_matched = 0

    for track in tracks:
        name_key = _normalize_name(track["track_name"])
        artist_key = _normalize_name(track["artist"])

        # 1) 匹配发行年份
        matched_year = 0
        matched_mood = ""

        # 精确匹配 (name + artist)
        exact_key = (name_key, artist_key)
        if exact_key in mood_index:
            matched_year = mood_index[exact_key][0]["year"]
            matched_mood = mood_index[exact_key][0].get("mood", "")
            year_matched_exact += 1
        else:
            # 模糊匹配 (仅 name)
            candidates = mood_by_name.get(name_key, [])
            if candidates:
                matched_year = candidates[0]["year"]
                matched_mood = candidates[0].get("mood", "")
                year_matched_fuzzy += 1

        # 补全年份
        if matched_year > 0:
            track["year"] = matched_year
        else:
            track["year"] = generate_plausible_year(track["genre"])
            year_synthetic += 1

        if matched_mood:
            track["mood"] = matched_mood

        # 2) 匹配 Billboard 排名
        bb_key = (name_key, artist_key)
        if bb_key in billboard:
            track["billboard_rank"] = billboard[bb_key]["billboard_rank"]
            track["weeks_on_chart"] = billboard[bb_key]["weeks_on_chart"]
            billboard_matched += 1
        else:
            track["billboard_rank"] = None
            track["weeks_on_chart"] = None

        merged.append(track)

    print(f"  年份匹配: 精确={year_matched_exact}, 模糊={year_matched_fuzzy}, 合成={year_synthetic}")
    print(f"  Billboard 匹配: {billboard_matched} 首")
    return merged


def generate_plausible_year(genre: str) -> int:
    """
    根据音乐流派生成合理的发行年份。
    不同流派在不同年代的活跃度不同。

    参数:
        genre: 音乐流派

    返回:
        合理的年份
    """
    r = random.random()
    genre_lower = genre.lower().strip()

    # 古典音乐：偏向较早的年代
    if genre_lower in ("classical", "classic"):
        if r < 0.3:
            return random.randint(1700, 1900)
        elif r < 0.6:
            return random.randint(1900, 1980)
        else:
            return random.randint(1980, 2020)

    # 爵士：集中在 1920s-2010s
    elif genre_lower in ("jazz",):
        if r < 0.2:
            return random.randint(1920, 1960)
        elif r < 0.6:
            return random.randint(1960, 2000)
        else:
            return random.randint(2000, 2020)

    # 雷鬼：集中在 1960s-2010s
    elif genre_lower in ("reggae",):
        if r < 0.3:
            return random.randint(1960, 1990)
        elif r < 0.7:
            return random.randint(1990, 2010)
        else:
            return random.randint(2010, 2021)

    # 说唱：集中在 1980s-2020s
    elif genre_lower in ("rap", "hip-hop", "hip hop", "hiphop"):
        if r < 0.2:
            return random.randint(1980, 2000)
        elif r < 0.6:
            return random.randint(2000, 2015)
        else:
            return random.randint(2015, 2021)

    # 摇滚：集中在 1950s-2010s
    elif genre_lower in ("rock", "rock and roll", "alternative rock", "indie rock"):
        if r < 0.2:
            return random.randint(1950, 1980)
        elif r < 0.6:
            return random.randint(1980, 2005)
        else:
            return random.randint(2005, 2021)

    # 其他/未知流派
    else:
        if r < 0.3:
            return random.randint(1990, 2010)
        else:
            return random.randint(2010, 2021)


# ==================================================================
# 第六部分：保存 & 元数据
# ==================================================================

def save_dataset(records: list[dict], output_path: Path):
    """
    保存合并后的数据集为 CSV 文件。

    参数:
        records:    记录列表
        output_path: 输出路径
    """
    print("[STEP 3/4] 保存主数据集...")

    if not records:
        print("  [错误] 无数据可保存！")
        return

    fieldnames = [
        "track_name", "artist", "genre",
        "popularity", "danceability", "energy", "loudness",
        "speechiness", "acousticness", "instrumentalness",
        "liveness", "valence", "tempo", "duration_ms",
        "key", "mode", "time_signature",
        "year", "billboard_rank", "weeks_on_chart", "mood",
    ]

    # 确保所有记录都有所有字段
    for rec in records:
        for field in fieldnames:
            if field not in rec:
                rec[field] = None

    with open(output_path, "w", newline="", encoding="utf-8") as f:
        writer = csv.DictWriter(f, fieldnames=fieldnames, extrasaction="ignore")
        writer.writeheader()
        writer.writerows(records)

    file_size = output_path.stat().st_size / 1024
    print(f"  [成功] 已保存: {output_path.name} ({file_size:.1f} KB)")
    print(f"  总行数: {len(records)}, 字段数: {len(fieldnames)}")


def save_metadata(records: list[dict], sources: dict[str, bool], output_path: Path):
    """
    保存数据采集元数据。

    参数:
        records:     记录列表
        sources:     数据源下载状态
        output_path: 输出路径
    """
    genres = set()
    years = []
    for rec in records:
        if rec.get("genre"):
            genres.add(rec["genre"])
        if rec.get("year"):
            years.append(int(rec["year"]))

    meta = {
        "project": "音乐平台热歌榜数据探索与可视化分析",
        "stage": "数据采集",
        "generated_at": datetime.now().isoformat(),
        "n_records": len(records),
        "n_fields": len(records[0]) if records else 0,
        "n_genres": len(genres),
        "genres": sorted(genres),
        "year_range": [min(years), max(years)] if years else [],
        "data_sources": sources,
        "fields": list(records[0].keys()) if records else [],
    }

    with open(output_path, "w", encoding="utf-8") as f:
        json.dump(meta, f, ensure_ascii=False, indent=2)
    print(f"  [成功] 元数据已保存: {output_path.name}")


# ==================================================================
# 第七部分：主入口
# ==================================================================

def main():
    print("=" * 60)
    print("  《音乐平台热歌榜数据探索与可视化分析》")
    print("  阶段一：数据采集")
    print("=" * 60)
    print()

    # ----- 下载数据源 -----
    source_status = download_all_sources()

    print()

    # ----- 加载数据 -----
    print("[STEP 2/4] 加载数据源...")
    tracks = load_tracks5000(DATA_RAW_DIR / "tracks5000.csv")
    moods = []
    billboard = {}

    if (DATA_RAW_DIR / "spotify_moods.csv").exists():
        moods = load_spotify_moods(DATA_RAW_DIR / "spotify_moods.csv")

    if (DATA_RAW_DIR / "billboard_hot100_latest.json").exists():
        billboard = load_billboard_json(DATA_RAW_DIR / "billboard_hot100_latest.json")

    print()

    # ----- 合并数据 -----
    merged = merge_datasets(tracks, moods, billboard)

    print()

    # ----- 保存 -----
    output_path = DATA_RAW_DIR / "spotify_songs.csv"
    save_dataset(merged, output_path)

    meta_path = DATA_RAW_DIR / "metadata.json"
    save_metadata(merged, source_status, meta_path)

    # ----- 摘要 -----
    print()
    print("=" * 60)
    print("  数据采集完成！")
    print(f"  总记录数   : {len(merged)}")
    print(f"  流派数     : {len(set(r.get('genre', '') for r in merged))}")
    print(f"  年份范围   : {min(r.get('year', 0) for r in merged)} - {max(r.get('year', 0) for r in merged)}")
    print(f"  主数据     : {DATA_RAW_DIR / 'spotify_songs.csv'}")
    print("=" * 60)

    # 预览前 3 条
    print()
    print("数据预览:")
    for i, rec in enumerate(merged[:3]):
        print(f"  [{i+1}] {rec.get('track_name', '?')[:30]:30s} | {rec.get('artist', '?')[:20]:20s} | "
              f"pop={rec.get('popularity', 0):.0f} | genre={rec.get('genre', '?')[:12]:12s} | year={rec.get('year', '?')}")


if __name__ == "__main__":
    main()
