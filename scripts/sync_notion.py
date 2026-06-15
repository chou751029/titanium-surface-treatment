#!/usr/bin/env python3
"""
從 Notion 資料庫同步「表面處理產業新聞/案例」內容，產生 assets/js/news-data.js。

使用方式：
    python3 scripts/sync_notion.py

需要的環境變數（可放在專案根目錄的 .env 檔）：
    NOTION_TOKEN        - Notion Integration token
    NOTION_DATABASE_ID  - 資料庫 ID（含或不含連字號皆可）
"""

import io
import json
import os
import re
import sys
import time
from pathlib import Path

import requests

try:
    from PIL import Image
    HAS_PIL = True
except ImportError:
    HAS_PIL = False

ROOT = Path(__file__).resolve().parent.parent
ENV_FILE = ROOT / ".env"
OUTPUT_FILE = ROOT / "assets" / "js" / "news-data.js"
IMAGE_DIR = ROOT / "assets" / "images" / "synced"

NOTION_VERSION = "2022-06-28"
REQUEST_DELAY = 0.34  # 避免超過 Notion API 速率限制 (~3 req/s)

TITLE_PROPERTY = "名稱"
REGION_PROPERTY = "國家"
SOURCE_URL_PROPERTY = "網站連結"
TAG_PROPERTIES = ["案例類型", "應用領域", "關鍵字"]

TEXT_BLOCK_TYPES = (
    "paragraph",
    "heading_1",
    "heading_2",
    "heading_3",
    "bulleted_list_item",
    "numbered_list_item",
    "quote",
    "callout",
)

SUMMARY_MAX_LEN = 1500
MAX_IMAGE_WIDTH = 1280
JPEG_QUALITY = 82


def load_env_file():
    if not ENV_FILE.exists():
        return
    for line in ENV_FILE.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        os.environ.setdefault(key.strip(), value.strip())


def normalize_id(raw_id):
    raw_id = raw_id.replace("-", "")
    if len(raw_id) != 32:
        return raw_id
    return f"{raw_id[0:8]}-{raw_id[8:12]}-{raw_id[12:16]}-{raw_id[16:20]}-{raw_id[20:32]}"


def notion_request(method, url, headers, **kwargs):
    for attempt in range(5):
        resp = requests.request(method, url, headers=headers, timeout=30, **kwargs)
        if resp.status_code == 429:
            wait = float(resp.headers.get("Retry-After", "1"))
            time.sleep(wait)
            continue
        resp.raise_for_status()
        return resp.json()
    resp.raise_for_status()


def query_database(headers, database_id):
    results = []
    cursor = None
    url = f"https://api.notion.com/v1/databases/{database_id}/query"
    while True:
        payload = {"page_size": 100}
        if cursor:
            payload["start_cursor"] = cursor
        data = notion_request("POST", url, headers, json=payload)
        results.extend(data["results"])
        if not data.get("has_more"):
            break
        cursor = data["next_cursor"]
        time.sleep(REQUEST_DELAY)
    return results


def get_page_blocks(headers, page_id):
    results = []
    cursor = None
    url = f"https://api.notion.com/v1/blocks/{page_id}/children"
    while True:
        params = {"page_size": 100}
        if cursor:
            params["start_cursor"] = cursor
        data = notion_request("GET", url, headers, params=params)
        results.extend(data["results"])
        if not data.get("has_more"):
            break
        cursor = data["next_cursor"]
        time.sleep(REQUEST_DELAY)
    return results


def rich_text_to_plain(rich_text):
    return "".join(t.get("plain_text", "") for t in rich_text or [])


def guess_extension(url, content_type):
    ext_map = {
        "image/jpeg": ".jpg",
        "image/png": ".png",
        "image/gif": ".gif",
        "image/webp": ".webp",
        "image/svg+xml": ".svg",
    }
    if content_type in ext_map:
        return ext_map[content_type]
    path_ext = Path(url.split("?")[0]).suffix
    return path_ext if path_ext else ".jpg"


def shrink_image(raw_bytes, ext):
    """縮小過大的圖片並轉成 JPEG 以降低檔案大小。SVG/GIF/已夠小的圖片維持原樣。"""
    if not HAS_PIL or ext.lower() in (".svg", ".gif"):
        return raw_bytes, ext

    try:
        img = Image.open(io.BytesIO(raw_bytes))
        img.load()
    except Exception:
        return raw_bytes, ext

    width, height = img.size
    if width <= MAX_IMAGE_WIDTH and len(raw_bytes) < 300_000:
        return raw_bytes, ext

    if width > MAX_IMAGE_WIDTH:
        new_height = round(height * MAX_IMAGE_WIDTH / width)
        img = img.resize((MAX_IMAGE_WIDTH, new_height), Image.LANCZOS)

    if img.mode in ("RGBA", "P"):
        background = Image.new("RGB", img.size, (255, 255, 255))
        background.paste(img.convert("RGBA"), mask=img.convert("RGBA").split()[-1])
        img = background
    elif img.mode != "RGB":
        img = img.convert("RGB")

    buf = io.BytesIO()
    img.save(buf, format="JPEG", quality=JPEG_QUALITY, optimize=True)
    return buf.getvalue(), ".jpg"


def download_image(url, dest_stem):
    try:
        resp = requests.get(url, timeout=30)
        resp.raise_for_status()
    except requests.RequestException as exc:
        print(f"  [警告] 下載圖片失敗 ({dest_stem}): {exc}", file=sys.stderr)
        return ""

    ext = guess_extension(url, resp.headers.get("Content-Type", ""))
    content, ext = shrink_image(resp.content, ext)
    dest_path = IMAGE_DIR / f"{dest_stem}{ext}"
    dest_path.write_bytes(content)
    return f"assets/images/synced/{dest_path.name}"


def extract_image_and_summary(blocks, page_slug):
    image_path = ""
    texts = []

    for block in blocks:
        btype = block["type"]

        if btype == "image" and not image_path:
            image = block["image"]
            if image["type"] == "external":
                url = image["external"]["url"]
            else:
                url = image["file"]["url"]
            image_path = download_image(url, page_slug)
            continue

        if btype in TEXT_BLOCK_TYPES:
            rich_text = block.get(btype, {}).get("rich_text", [])
            text = rich_text_to_plain(rich_text).strip()
            if text:
                texts.append(text)

    summary = "\n\n".join(texts)
    if len(summary) > SUMMARY_MAX_LEN:
        summary = summary[:SUMMARY_MAX_LEN].rsplit(" ", 1)[0] + "..."

    return image_path, summary


def build_item(headers, page):
    props = page["properties"]
    page_id = page["id"]
    slug = page_id.replace("-", "")

    title = rich_text_to_plain(props.get(TITLE_PROPERTY, {}).get("title", []))

    region_select = props.get(REGION_PROPERTY, {}).get("select")
    region = region_select["name"] if region_select else ""

    tags = []
    for prop_name in TAG_PROPERTIES:
        for option in props.get(prop_name, {}).get("multi_select", []):
            if option["name"] not in tags:
                tags.append(option["name"])

    source_url = props.get(SOURCE_URL_PROPERTY, {}).get("url") or page.get("public_url") or page.get("url") or ""

    date = page["created_time"][:10]

    print(f"  抓取頁面內容: {title[:40] or '(無標題)'}")
    blocks = get_page_blocks(headers, page_id)
    image_path, summary = extract_image_and_summary(blocks, slug)
    time.sleep(REQUEST_DELAY)

    if not title:
        first_line = summary.split("\n", 1)[0].strip()
        title = first_line[:80] if first_line else "未命名項目"

    return {
        "id": slug,
        "title": title,
        "date": date,
        "region": region,
        "tags": tags,
        "image": image_path,
        "sourceUrl": source_url,
        "summary": summary,
    }


def write_news_data(items):
    items_sorted = sorted(items, key=lambda x: x["date"], reverse=True)
    header = (
        "// 表面處理產業新聞/案例資料\n"
        "// 此檔案由 scripts/sync_notion.py 自動產生，請勿手動編輯。\n"
        "// 若要新增/修改內容，請直接在 Notion 資料庫操作，然後重新執行：\n"
        "//   python3 scripts/sync_notion.py\n"
        "window.NEWS_DATA = "
    )
    body = json.dumps(items_sorted, ensure_ascii=False, indent=2)
    OUTPUT_FILE.write_text(header + body + ";\n", encoding="utf-8")


def main():
    load_env_file()
    token = os.environ.get("NOTION_TOKEN")
    database_id = os.environ.get("NOTION_DATABASE_ID")
    if not token or not database_id:
        print("錯誤：請在 .env 設定 NOTION_TOKEN 與 NOTION_DATABASE_ID", file=sys.stderr)
        sys.exit(1)

    database_id = normalize_id(database_id)
    headers = {
        "Authorization": f"Bearer {token}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type": "application/json",
    }

    IMAGE_DIR.mkdir(parents=True, exist_ok=True)

    print("查詢 Notion 資料庫...")
    pages = query_database(headers, database_id)
    print(f"共 {len(pages)} 筆，開始抓取每篇內容與圖片...")

    items = [build_item(headers, page) for page in pages]

    write_news_data(items)
    print(f"完成，已寫入 {OUTPUT_FILE.relative_to(ROOT)}（共 {len(items)} 筆）")


if __name__ == "__main__":
    main()
