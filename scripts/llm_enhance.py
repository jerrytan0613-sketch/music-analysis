"""
================================================================================
《音乐平台热歌榜数据探索与可视化分析》
阶段三：AI 增强分析（LLM）
================================================================================
功能说明：
  调用 OpenAI API，根据歌曲名称和歌手生成增强标签。

  处理范围：清洗后的数据中取前 100 首（节省 API 费用）

  LLM 输出字段：
    - 情绪    ：快乐 / 悲伤 / 浪漫 / 励志 / 治愈 / 激情
    - 主题    ：爱情 / 成长 / 梦想 / 友情 / 生活 / 其他
    - 适合场景：运动 / 学习 / 睡前 / 开车 / 旅行 / 聚会
    - 一句话简介：对歌曲的简短描述（20 字内）
    - 关键词  ：3-5 个关键词数组

  机制：
    - 失败自动重试（最多 3 次）
    - 断点续跑（每首处理完即时保存，崩溃后可从中断处恢复）
    - 自动保存（每次 API 返回后立即写入 CSV）
================================================================================
"""

import json
import os
import sys
import time
from pathlib import Path
from datetime import datetime

import pandas as pd
from openai import OpenAI

# ------------------------------------------------------------------
# 路径配置
# ------------------------------------------------------------------
PROJECT_ROOT = Path(__file__).resolve().parent.parent
DATA_CLEAN_DIR = PROJECT_ROOT / "data" / "clean"
DATA_AI_DIR = PROJECT_ROOT / "data" / "ai"
DATA_AI_DIR.mkdir(parents=True, exist_ok=True)

# ------------------------------------------------------------------
# 常量
# ------------------------------------------------------------------
API_KEY = os.environ.get("OPENAI_API_KEY", "")

# LLM 配置
MODEL = "gpt-4o-mini"
TEMPERATURE = 0.3
MAX_TOKENS = 200

# 运行配置
BATCH_SIZE = 100          # 处理前 N 首歌
MAX_RETRIES = 3           # 单首最大重试次数
RETRY_DELAY = 3           # 重试间隔（秒）
SAVE_INTERVAL = 1         # 每处理 1 首即写入（即时保存）

# 输出文件
OUTPUT_CSV = DATA_AI_DIR / "music_ai.csv"
CHECKPOINT_FILE = DATA_AI_DIR / "checkpoint.json"  # 断点记录


# ==================================================================
# AI 增强引擎
# ==================================================================

class MusicLLMEnhancer:
    """
    调用 OpenAI API 对歌曲进行语义增强标注。
    支持断点续跑和失败重试。
    """

    def __init__(self):
        self.client = None
        self._init_client()

    def _init_client(self):
        """初始化 OpenAI 客户端"""
        if not API_KEY:
            raise ValueError(
                "未设置 OPENAI_API_KEY 环境变量。\n"
                "请运行: set OPENAI_API_KEY=sk-xxxxx  (Windows)\n"
                "  或  export OPENAI_API_KEY=sk-xxxxx  (Mac/Linux)"
            )
        self.client = OpenAI(api_key=API_KEY, timeout=30)

    # ----------------------------------------------------------------
    # 构造 Prompt
    # ----------------------------------------------------------------
    def build_prompt(self, track_name: str, artist: str) -> str:
        """为歌曲构造 LLM Prompt"""
        return f"""你是一位专业的音乐分析师。请根据以下歌曲信息，输出 JSON 格式的分析结果。

歌曲名称：{track_name}
歌手：{artist}

请严格按照以下 JSON 格式输出（不要包含 markdown 代码块标记，只输出纯 JSON）：

{{
    "情绪": "快乐/悲伤/浪漫/励志/治愈/激情",
    "主题": "爱情/成长/梦想/友情/生活/其他",
    "适合场景": "运动/学习/睡前/开车/旅行/聚会",
    "一句话简介": "不超过20字的中文简介",
    "关键词": ["词1", "词2", "词3"]
}}

注意：
1. "情绪" 只能从 [快乐, 悲伤, 浪漫, 励志, 治愈, 激情] 中选择一个
2. "主题" 只能从 [爱情, 成长, 梦想, 友情, 生活, 其他] 中选择一个
3. "适合场景" 只能从 [运动, 学习, 睡前, 开车, 旅行, 聚会] 中选择一个
4. "关键词" 为 3-5 个字符串的数组
"""

    # ----------------------------------------------------------------
    # 调用 LLM
    # ----------------------------------------------------------------
    def enhance_one(self, track_name: str, artist: str, retries: int = MAX_RETRIES) -> dict:
        """
        对一首歌曲进行 LLM 增强标注，失败时自动重试。

        参数:
            track_name: 歌曲名称
            artist:     歌手
            retries:    最大重试次数

        返回:
            {
                "情绪": "...",
                "主题": "...",
                "适合场景": "...",
                "一句话简介": "...",
                "关键词": [...]
            }
        """
        prompt = self.build_prompt(track_name, artist)

        for attempt in range(1, retries + 1):
            try:
                response = self.client.chat.completions.create(
                    model=MODEL,
                    messages=[{"role": "user", "content": prompt}],
                    temperature=TEMPERATURE,
                    max_tokens=MAX_TOKENS,
                )
                text = response.choices[0].message.content.strip()

                # 清理可能的 markdown 代码块标记
                text = text.replace("```json", "").replace("```", "").strip()

                result = json.loads(text)

                # 验证必需字段
                required = ["情绪", "主题", "适合场景", "一句话简介", "关键词"]
                for field in required:
                    if field not in result:
                        raise ValueError(f"缺少字段: {field}")

                # 验证枚举值
                valid_emotions = ["快乐", "悲伤", "浪漫", "励志", "治愈", "激情"]
                valid_themes = ["爱情", "成长", "梦想", "友情", "生活", "其他"]
                valid_scenes = ["运动", "学习", "睡前", "开车", "旅行", "聚会"]

                if result["情绪"] not in valid_emotions:
                    result["情绪"] = valid_emotions[0]
                if result["主题"] not in valid_themes:
                    result["主题"] = "其他"
                if result["适合场景"] not in valid_scenes:
                    result["适合场景"] = valid_scenes[0]

                if not isinstance(result["关键词"], list):
                    result["关键词"] = [str(result["关键词"])]

                return result

            except json.JSONDecodeError as e:
                print(f"      JSON 解析失败 (尝试 {attempt}/{retries}): {e}")
                if attempt == retries:
                    return self._default_result()
                time.sleep(RETRY_DELAY)

            except Exception as e:
                print(f"      API 错误 (尝试 {attempt}/{retries}): {type(e).__name__}: {e}")
                if attempt == retries:
                    return self._default_result()
                time.sleep(RETRY_DELAY * attempt)  # 递增等待

        return self._default_result()

    # ----------------------------------------------------------------
    # 默认结果（兜底）
    # ----------------------------------------------------------------
    @staticmethod
    def _default_result() -> dict:
        """API 全部失败时返回的兜底结果"""
        return {
            "情绪": "快乐",
            "主题": "其他",
            "适合场景": "旅行",
            "一句话简介": "暂无描述",
            "关键词": ["音乐"],
        }


# ==================================================================
# 断点续跑管理器
# ==================================================================

class CheckpointManager:
    """
    管理处理进度，支持断点续跑。

    checkpoint.json 格式:
    {
        "total": 100,
        "completed": 45,
        "last_index": 44,
        "last_track": "...",
        "timestamp": "..."
    }
    """

    @staticmethod
    def load() -> dict | None:
        """读取断点，返回 None 表示无断点"""
        if CHECKPOINT_FILE.exists():
            try:
                with open(CHECKPOINT_FILE, "r", encoding="utf-8") as f:
                    cp = json.load(f)
                print(f"  发现断点: 已完成 {cp.get('completed', 0)} / {cp.get('total', '?')} 首")
                print(f"    上次处理至: {cp.get('last_track', 'N/A')}")
                return cp
            except (json.JSONDecodeError, KeyError):
                print("  断点文件损坏，将重新开始")
        return None

    @staticmethod
    def save(total: int, completed: int, last_index: int, last_track: str):
        """保存断点"""
        cp = {
            "total": total,
            "completed": completed,
            "last_index": last_index,
            "last_track": last_track,
            "timestamp": datetime.now().isoformat(),
        }
        with open(CHECKPOINT_FILE, "w", encoding="utf-8") as f:
            json.dump(cp, f, ensure_ascii=False, indent=2)

    @staticmethod
    def clear():
        """清除断点（全部完成后调用）"""
        if CHECKPOINT_FILE.exists():
            CHECKPOINT_FILE.unlink()


# ==================================================================
# 主流程
# ==================================================================

def main():
    print("=" * 60)
    print("  《音乐平台热歌榜数据探索与可视化分析》")
    print("  阶段三：AI 增强分析（LLM）")
    print("=" * 60)
    print()

    # ----------------------------------------------------------------
    # 第一步：加载数据
    # ----------------------------------------------------------------
    # 优先使用清洗后的数据
    clean_path = DATA_CLEAN_DIR / "music_clean.csv"
    if not clean_path.exists():
        # 尝试 data/clean/cleaned_songs.csv（旧版本）
        clean_path = DATA_CLEAN_DIR / "cleaned_songs.csv"
    if not clean_path.exists():
        print(f"[错误] 未找到清洗数据: {clean_path}")
        print("[提示] 请先运行 python scripts/clean.py")
        sys.exit(1)

    print(f"[1/4] 加载清洗数据: {clean_path.name}")
    df = pd.read_csv(clean_path, encoding="utf-8")
    print(f"      总记录数: {len(df)}")

    # 只取前 BATCH_SIZE 首
    df_subset = df.head(BATCH_SIZE).copy()
    print(f"      本次处理: {len(df_subset)} 首（前 {BATCH_SIZE} 首）")

    # 检查必需字段
    if "track_name" not in df_subset.columns or "artist" not in df_subset.columns:
        print("[错误] 数据缺少 track_name 或 artist 列")
        sys.exit(1)

    # ----------------------------------------------------------------
    # 第二步：断点检测
    # ----------------------------------------------------------------
    print(f"\n[2/4] 检测断点...")

    start_index = 0
    checkpoint = CheckpointManager.load()
    if checkpoint is not None:
        # 从中断位置的下一个开始
        start_index = checkpoint.get("last_index", -1) + 1
        if start_index > 0 and start_index < len(df_subset):
            print(f"      从中断处恢复: index={start_index}")
            print(f"      歌曲: {df_subset.iloc[start_index]['track_name']}")

    # ----------------------------------------------------------------
    # 第三步：加载已有结果（如果存在 CSV）
    # ----------------------------------------------------------------
    results = []
    if OUTPUT_CSV.exists() and start_index > 0:
        try:
            existing_df = pd.read_csv(OUTPUT_CSV, encoding="utf-8")
            results = existing_df.to_dict("records")
            print(f"      已加载 {len(results)} 条已有结果")
        except Exception:
            print("      已有结果文件损坏，重新生成")

    # ----------------------------------------------------------------
    # 第四步：调用 LLM
    # ----------------------------------------------------------------
    print(f"\n[3/4] 调用 OpenAI API (模型: {MODEL})...")
    print(f"      单首最多重试 {MAX_RETRIES} 次")
    print()

    try:
        enhancer = MusicLLMEnhancer()
    except ValueError as e:
        print(f"[错误] {e}")
        sys.exit(1)

    total = len(df_subset)
    completed_count = len(results)

    for idx in range(start_index, total):
        row = df_subset.iloc[idx]
        track_name = str(row.get("track_name", ""))
        artist = str(row.get("artist", ""))

        print(f"  [{idx + 1}/{total}] {track_name[:25]:25s} | {artist[:18]:18s}", end="")

        # 调用 LLM
        llm_result = enhancer.enhance_one(track_name, artist)

        # 组装结果
        record = {
            "track_name": track_name,
            "artist": artist,
            "genre": row.get("genre", ""),
            "popularity": row.get("popularity", ""),
            "情绪": llm_result.get("情绪", ""),
            "主题": llm_result.get("主题", ""),
            "适合场景": llm_result.get("适合场景", ""),
            "一句话简介": llm_result.get("一句话简介", ""),
            "关键词": json.dumps(llm_result.get("关键词", []), ensure_ascii=False),
        }

        results.append(record)
        completed_count += 1

        print(f"  → {record['情绪']} | {record['主题']} | {record['适合场景']}")

        # ---- 即时保存（每处理 SAVE_INTERVAL 首） ----
        if (idx + 1) % SAVE_INTERVAL == 0 or idx == total - 1:
            temp_df = pd.DataFrame(results)
            temp_df.to_csv(OUTPUT_CSV, index=False, encoding="utf-8-sig")
            CheckpointManager.save(total, completed_count, idx, track_name)

            # 进度提示
            pct = (idx + 1) / total * 100
            print(f"     ↳ 已保存 ({completed_count}/{total}, {pct:.0f}%)")

    # ----------------------------------------------------------------
    # 完成
    # ----------------------------------------------------------------
    print(f"\n[4/4] 全部完成！")

    # 清除断点（全部成功）
    CheckpointManager.clear()

    # 最终保存
    final_df = pd.DataFrame(results)
    final_df.to_csv(OUTPUT_CSV, index=False, encoding="utf-8-sig")
    file_size = OUTPUT_CSV.stat().st_size / 1024

    print(f"\n  [成功] 输出文件: {OUTPUT_CSV}")
    print(f"         记录数: {len(final_df)}")
    print(f"         文件大小: {file_size:.1f} KB")
    print(f"         字段: {list(final_df.columns)}")

    # 打印统计摘要
    print()
    print("=" * 60)
    print("  AI 增强结果统计")
    print("=" * 60)

    # 情绪分布
    if "情绪" in final_df.columns:
        print("\n【情绪分布】")
        for val, cnt in final_df["情绪"].value_counts().items():
            print(f"  {val}: {cnt} 首 ({cnt/len(final_df)*100:.1f}%)")

    # 主题分布
    if "主题" in final_df.columns:
        print("\n【主题分布】")
        for val, cnt in final_df["主题"].value_counts().items():
            print(f"  {val}: {cnt} 首 ({cnt/len(final_df)*100:.1f}%)")

    # 场景分布
    if "适合场景" in final_df.columns:
        print("\n【适合场景分布】")
        for val, cnt in final_df["适合场景"].value_counts().items():
            print(f"  {val}: {cnt} 首 ({cnt/len(final_df)*100:.1f}%)")

    # 示例
    print("\n【示例记录】")
    print(final_df.head(3).to_string(index=False))

    print()
    print("=" * 60)
    print("  AI 增强分析完成！")
    print("=" * 60)


if __name__ == "__main__":
    main()
