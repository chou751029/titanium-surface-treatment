#!/usr/bin/env python3
"""
從 Notion 資料庫同步產業新聞資料，產生對應的 JS 資料檔。

支援兩個資料庫：
  1. 表面處理產業新聞 → assets/js/news-data.js       (NOTION_DATABASE_ID)
  2. 鈦金屬相關新聞   → assets/js/titanium-data.js   (TITANIUM_DATABASE_ID)

使用方式：
    python3 scripts/sync_notion.py

需要的環境變數（可放在專案根目錄的 .env 檔）：
    NOTION_TOKEN          - Notion Integration token
    NOTION_DATABASE_ID    - 表面處理產業新聞資料庫 ID
    TITANIUM_DATABASE_ID  - 鈦金屬相關新聞資料庫 ID（選填）
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
OUTPUT_FILE         = ROOT / "assets" / "js" / "news-data.js"
TITANIUM_OUTPUT_FILE = ROOT / "assets" / "js" / "titanium-data.js"
IMAGE_DIR = ROOT / "assets" / "images" / "synced"
FEED_FILE = ROOT / "feed.xml"

# 部署網址（用於 RSS feed 的連結）。換網域時改這裡，或用環境變數 SITE_URL 覆寫。
SITE_URL = os.environ.get("SITE_URL", "https://chou751029.github.io/titanium-surface-treatment/")
SITE_TITLE = "Chou's 金屬產業分享園地"
SITE_DESC  = "彙整金屬表面處理與鈦產業的最新新聞、技術趨勢與案例分析。"
FEED_MAX_ITEMS = 40

NOTION_VERSION = "2022-06-28"
NOTION_DATA_SOURCE_VERSION = "2025-09-03"
REQUEST_DELAY = 0.34  # 避免超過 Notion API 速率限制 (~3 req/s)

TITLE_PROPERTY      = "名稱"
REGION_PROPERTY     = "國家"
SOURCE_URL_PROPERTY = "網站連結"
TAG_PROPERTIES      = ["案例類型", "應用領域", "關鍵字"]

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
JPEG_QUALITY    = 82


# ── 工具函式 ──────────────────────────────────────────────

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
        if not resp.ok:
            detail = resp.text.strip()
            if len(detail) > 2000:
                detail = detail[:2000] + "..."
            print(
                f"[Notion API 錯誤] {method} {url} -> {resp.status_code}: {detail}",
                file=sys.stderr,
            )
        resp.raise_for_status()
        return resp.json()
    resp.raise_for_status()


def headers_for_version(headers, version):
    updated = dict(headers)
    updated["Notion-Version"] = version
    return updated


def http_error_text(exc):
    if exc.response is None:
        return ""
    return exc.response.text or ""


def find_child_database_id(headers, page_id):
    """使用者若貼到父頁面 ID，嘗試從頁面 blocks 找 inline/child database。"""
    blocks = get_page_blocks(headers, page_id)
    child_databases = [block for block in blocks if block.get("type") == "child_database"]
    if not child_databases:
        raise RuntimeError(
            f"Notion ID {page_id} 是頁面，不是資料庫，而且此頁面底下找不到 child_database。"
        )

    if len(child_databases) > 1:
        titles = [
            block.get("child_database", {}).get("title", "(未命名資料庫)")
            for block in child_databases
        ]
        print(f"此頁面含多個 child database，將使用第一個：{titles[0]}；全部候選：{titles}")

    child = child_databases[0]
    child_id = child["id"]
    child_title = child.get("child_database", {}).get("title", "(未命名資料庫)")
    print(f"偵測到頁面底下的 Notion child database：{child_title} ({child_id})")
    return child_id


def resolve_data_source_id(headers, database_or_data_source_id):
    """Notion 2025-09-03 起 database 下面可能有 data source；query 要用 data_source_id。"""
    new_headers = headers_for_version(headers, NOTION_DATA_SOURCE_VERSION)
    database_url = f"https://api.notion.com/v1/databases/{database_or_data_source_id}"

    try:
        database = notion_request("GET", database_url, new_headers)
        data_sources = database.get("data_sources") or []
        if data_sources:
            data_source_id = data_sources[0]["id"]
            print(f"偵測到 Notion data source ID: {data_source_id}")
            return data_source_id
    except requests.HTTPError as exc:
        if "is a page, not a database" in http_error_text(exc):
            child_database_id = find_child_database_id(headers, database_or_data_source_id)
            return resolve_data_source_id(headers, child_database_id)
        # 若使用者已直接填入 data_source_id，GET database 會失敗；下面再驗證 data source。
        pass

    data_source_url = f"https://api.notion.com/v1/data_sources/{database_or_data_source_id}"
    data_source = notion_request("GET", data_source_url, new_headers)
    if data_source.get("object") == "data_source":
        print(f"使用 GitHub secret 中提供的 Notion data source ID: {database_or_data_source_id}")
        return database_or_data_source_id

    raise RuntimeError(f"無法解析 Notion database/data source ID: {database_or_data_source_id}")


def query_data_source(headers, data_source_id):
    results = []
    cursor  = None
    url = f"https://api.notion.com/v1/data_sources/{data_source_id}/query"
    query_headers = headers_for_version(headers, NOTION_DATA_SOURCE_VERSION)
    while True:
        payload = {"page_size": 100}
        if cursor:
            payload["start_cursor"] = cursor
        data = notion_request("POST", url, query_headers, json=payload)
        results.extend(data["results"])
        if not data.get("has_more"):
            break
        cursor = data["next_cursor"]
        time.sleep(REQUEST_DELAY)
    return results


def query_database(headers, database_id):
    try:
        results = []
        cursor  = None
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
    except requests.HTTPError as exc:
        status = exc.response.status_code if exc.response is not None else None
        if status != 400:
            raise
        if "is a page, not a database" in http_error_text(exc):
            print("提供的 Notion ID 是頁面，嘗試從頁面底下尋找 child database。")
            child_database_id = find_child_database_id(headers, database_id)
            return query_database(headers, child_database_id)
        print("舊版 database query 回傳 400，改用新版 Notion data source API 重試。")
        data_source_id = resolve_data_source_id(headers, database_id)
        return query_data_source(headers, data_source_id)


def get_page_blocks(headers, page_id):
    results = []
    cursor  = None
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
        "image/jpeg":   ".jpg",
        "image/png":    ".png",
        "image/gif":    ".gif",
        "image/webp":   ".webp",
        "image/svg+xml": ".svg",
    }
    if content_type in ext_map:
        return ext_map[content_type]
    path_ext = Path(url.split("?")[0]).suffix
    return path_ext if path_ext else ".jpg"


def shrink_image(raw_bytes, ext):
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
        bg = Image.new("RGB", img.size, (255, 255, 255))
        bg.paste(img.convert("RGBA"), mask=img.convert("RGBA").split()[-1])
        img = bg
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
    """回傳 (封面圖路徑, 純文字摘要, 結構化內文陣列)。
    content 每一項是 {"type": ..., "text": ...}，供前端文章頁產生目錄與段落。
    """
    image_path = ""
    texts = []
    content = []
    type_map = {
        "heading_1": "h",
        "heading_2": "h",
        "heading_3": "h",
        "bulleted_list_item": "bulleted_list_item",
        "numbered_list_item": "numbered_list_item",
        "quote": "quote",
    }
    for block in blocks:
        btype = block["type"]
        if btype == "image" and not image_path:
            image = block["image"]
            url = image["external"]["url"] if image["type"] == "external" else image["file"]["url"]
            image_path = download_image(url, page_slug)
            continue
        if btype in TEXT_BLOCK_TYPES:
            rich_text = block.get(btype, {}).get("rich_text", [])
            text = rich_text_to_plain(rich_text).strip()
            if text:
                texts.append(text)
                content.append({"type": type_map.get(btype, "p"), "text": text})

    summary = "\n\n".join(texts)
    if len(summary) > SUMMARY_MAX_LEN:
        summary = summary[:SUMMARY_MAX_LEN].rsplit(" ", 1)[0] + "..."
    return image_path, summary, content


def build_item(headers, page):
    props   = page["properties"]
    page_id = page["id"]
    slug    = page_id.replace("-", "")

    title  = rich_text_to_plain(props.get(TITLE_PROPERTY, {}).get("title", []))
    region_select = props.get(REGION_PROPERTY, {}).get("select")
    region = region_select["name"] if region_select else ""

    tags = []
    for prop_name in TAG_PROPERTIES:
        for option in props.get(prop_name, {}).get("multi_select", []):
            if option["name"] not in tags:
                tags.append(option["name"])

    source_url = (
        props.get(SOURCE_URL_PROPERTY, {}).get("url")
        or page.get("public_url")
        or page.get("url")
        or ""
    )
    date = page["created_time"][:10]

    print(f"  抓取頁面內容: {title[:40] or '(無標題)'}")
    blocks = get_page_blocks(headers, page_id)
    image_path, summary, content = extract_image_and_summary(blocks, slug)
    time.sleep(REQUEST_DELAY)

    if not title:
        first_line = summary.split("\n", 1)[0].strip()
        title = first_line[:80] if first_line else "未命名項目"

    return {
        "id":       slug,
        "title":    title,
        "date":     date,
        "region":   region,
        "tags":     tags,
        "image":    image_path,
        "sourceUrl": source_url,
        "summary":  summary,
        "content":  content,
    }


def build_titanium_item(headers, page):
    """鈦新聞資料庫的欄位解析（與表面處理資料庫不同）。"""
    props   = page["properties"]
    page_id = page["id"]
    slug    = page_id.replace("-", "")

    # 鈦新聞：標題欄位名稱是 "Name"
    title = rich_text_to_plain(props.get("Name", {}).get("title", []))

    # 鈦新聞：國家是 multi_select，取前兩個合併
    region_opts = props.get("國家", {}).get("multi_select", [])
    region = "／".join(o["name"] for o in region_opts[:2]) if region_opts else ""

    # 鈦新聞：標籤來自 Tags + keyword
    tags = []
    for prop_name in ("Tags", "keyword"):
        for option in props.get(prop_name, {}).get("multi_select", []):
            if option["name"] not in tags:
                tags.append(option["name"])

    # 鈦新聞：原文連結是 "URL" 欄位
    source_url = (
        props.get("URL", {}).get("url")
        or props.get("URL_2", {}).get("url")
        or page.get("public_url")
        or page.get("url")
        or ""
    )

    date = page["created_time"][:10]

    # 鈦新聞：先嘗試從「圖片」屬性取圖（property 上傳的圖片）
    image_path = ""
    file_prop = props.get("圖片", {}).get("files", [])
    if file_prop:
        f = file_prop[0]
        url = f["file"]["url"] if f["type"] == "file" else f.get("external", {}).get("url", "")
        if url:
            image_path = download_image(url, slug)

    # 若屬性欄位無圖，再從頁面 block 找
    print(f"  抓取頁面內容: {title[:40] or '(無標題)'}")
    blocks = get_page_blocks(headers, page_id)
    block_image, summary, content = extract_image_and_summary(blocks, slug)
    if not image_path:
        image_path = block_image
    time.sleep(REQUEST_DELAY)

    if not title:
        first_line = summary.split("\n", 1)[0].strip()
        title = first_line[:80] if first_line else "未命名項目"

    return {
        "id":        slug,
        "title":     title,
        "date":      date,
        "region":    region,
        "tags":      tags,
        "image":     image_path,
        "sourceUrl": source_url,
        "summary":   summary,
        "content":   content,
    }


def sync_database(headers, database_id, output_file, label, js_var, build_fn=None):
    """同步一個 Notion 資料庫，寫出 JS 資料檔。"""
    if build_fn is None:
        build_fn = build_item
    print(f"\n=== 同步「{label}」===")
    print(f"資料庫 ID: {database_id}")
    pages = query_database(headers, database_id)
    print(f"共 {len(pages)} 筆，開始抓取每篇內容與圖片…")
    items = [build_fn(headers, page) for page in pages]
    items_sorted = sorted(items, key=lambda x: x["date"], reverse=True)

    header_comment = (
        f"// {label}\n"
        f"// 此檔案由 scripts/sync_notion.py 自動產生，請勿手動編輯。\n"
        f"// 若要新增/修改內容，請直接在 Notion 資料庫操作，然後重新執行：\n"
        f"//   python3 scripts/sync_notion.py\n"
        f"{js_var} = "
    )
    body = json.dumps(items_sorted, ensure_ascii=False, indent=2)
    output_file.write_text(header_comment + body + ";\n", encoding="utf-8")
    print(f"完成，已寫入 {output_file.relative_to(ROOT)}（共 {len(items)} 筆）")
    return items_sorted


# ── RSS feed ──────────────────────────────────────

def _xml_escape(s):
    s = str(s or "")
    return (s.replace("&", "&amp;").replace("<", "&lt;")
             .replace(">", "&gt;").replace('"', "&quot;"))


def _clip(s, n):
    s = re.sub(r"\s+", " ", (s or "")).strip()
    return s[:n] + "…" if len(s) > n else s


def build_feed(all_items):
    """由全部分類的文章產生 RSS feed.xml。"""
    from email.utils import format_datetime
    from datetime import datetime, timezone

    base = SITE_URL.rstrip("/") + "/"
    items = sorted(all_items, key=lambda x: x.get("date", ""), reverse=True)[:FEED_MAX_ITEMS]
    parts = []
    for it in items:
        link = base + "article.html?id=" + it.get("id", "")
        try:
            dt = datetime.strptime(it.get("date", "") + " +0800", "%Y-%m-%d %z")
        except ValueError:
            dt = datetime.now(timezone.utc)
        cats = [it.get("region", "")] + (it.get("tags") or [])
        cat_xml = "".join(
            f"    <category>{_xml_escape(c)}</category>\n" for c in cats if c
        )
        parts.append(
            "  <item>\n"
            f"    <title>{_xml_escape(it.get('title'))}</title>\n"
            f"    <link>{_xml_escape(link)}</link>\n"
            f"    <guid isPermaLink=\"false\">{_xml_escape(it.get('id'))}</guid>\n"
            f"    <pubDate>{format_datetime(dt)}</pubDate>\n"
            f"{cat_xml}"
            f"    <description>{_xml_escape(_clip(it.get('summary'), 300))}</description>\n"
            "  </item>"
        )
    from datetime import datetime as _dt, timezone as _tz
    now = format_datetime(_dt.now(_tz.utc))
    xml = (
        '<?xml version="1.0" encoding="UTF-8"?>\n'
        '<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">\n'
        "<channel>\n"
        f"  <title>{_xml_escape(SITE_TITLE)}</title>\n"
        f"  <link>{_xml_escape(base)}</link>\n"
        f'  <atom:link href="{_xml_escape(base + "feed.xml")}" rel="self" type="application/rss+xml" />\n'
        f"  <description>{_xml_escape(SITE_DESC)}</description>\n"
        "  <language>zh-Hant</language>\n"
        f"  <lastBuildDate>{now}</lastBuildDate>\n"
        + "\n".join(parts) + "\n"
        "</channel>\n</rss>\n"
    )
    FEED_FILE.write_text(xml, encoding="utf-8")
    print(f"已寫入 RSS feed: {FEED_FILE.relative_to(ROOT)}（共 {len(items)} 筆）")


# ── 主程式 ────────────────────────────────────────────────

def main():
    load_env_file()

    token = os.environ.get("NOTION_TOKEN")
    if not token:
        print("錯誤：請在 .env 設定 NOTION_TOKEN", file=sys.stderr)
        sys.exit(1)

    surface_db_id  = os.environ.get("NOTION_DATABASE_ID")
    titanium_db_id = os.environ.get("TITANIUM_DATABASE_ID")

    if not surface_db_id and not titanium_db_id:
        print("錯誤：請在 .env 設定 NOTION_DATABASE_ID 或 TITANIUM_DATABASE_ID", file=sys.stderr)
        sys.exit(1)

    headers = {
        "Authorization":  f"Bearer {token}",
        "Notion-Version": NOTION_VERSION,
        "Content-Type":   "application/json",
    }
    IMAGE_DIR.mkdir(parents=True, exist_ok=True)

    all_items = []

    if surface_db_id:
        all_items += sync_database(
            headers,
            normalize_id(surface_db_id),
            OUTPUT_FILE,
            "表面處理產業新聞/案例資料",
            "window.NEWS_DATA",
        ) or []

    if titanium_db_id:
        all_items += sync_database(
            headers,
            normalize_id(titanium_db_id),
            TITANIUM_OUTPUT_FILE,
            "鈦金屬相關新聞資料",
            "window.TITANIUM_DATA",
            build_fn=build_titanium_item,
        ) or []

    # 產生 RSS feed（結合所有分類的最新文章）
    if all_items:
        build_feed(all_items)

    print("\n所有同步完成！")


if __name__ == "__main__":
    main()
