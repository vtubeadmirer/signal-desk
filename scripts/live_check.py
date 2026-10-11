import sys
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python"))

import agent

sources = [
    {"name": "전자신문 IT", "url": "https://rss.etnews.com/03.xml", "tier": "professional", "category": "IT·플랫폼", "enabled": True},
    {"name": "연합뉴스", "url": "https://www.yna.co.kr/rss/news.xml", "tier": "professional", "category": "사회·생활", "enabled": True},
    {"name": "경향신문", "url": "https://www.khan.co.kr/rss/rssdata/total_news.xml", "tier": "professional", "category": "사회·생활", "enabled": True},
    {"name": "동아일보", "url": "https://rss.donga.com/total.xml", "tier": "professional", "category": "사회·생활", "enabled": True},
    {"name": "한겨레", "url": "https://www.hani.co.kr/rss", "tier": "professional", "category": "사회·생활", "enabled": True},
    {"name": "IT동아", "url": "https://it.donga.com/feeds/rss/", "tier": "professional", "category": "IT·플랫폼", "enabled": True},
    {"name": "테크M", "url": "https://www.techm.kr/rss/allArticle.xml", "tier": "professional", "category": "IT·플랫폼", "enabled": True},
    {"name": "JTBC", "url": "https://fs.jtbc.co.kr/RSS/newsflash.xml", "tier": "professional", "category": "사회·생활", "enabled": True},
    {"name": "SBS", "url": "https://news.sbs.co.kr/news/SectionRssFeed.do?section=01", "tier": "professional", "category": "사회·생활", "enabled": True},
]

items = []
errors = []

for source in sources:
    try:
        fetched = agent.fetch_source(source)
        items.extend(fetched)
        print(f"[성공] {source['name']}: {len(fetched)}건")
    except Exception as exc:
        errors.append(source["name"])
        print(f"[실패] {source['name']}: {type(exc).__name__}: {exc!r}")

candidates = agent.build_candidates(items)

print(f"\n총 수집: {len(items)}건")
print(f"후보 기사: {len(candidates)}건")
print(f"실패한 피드: {', '.join(errors) if errors else '없음'}")
print("\n=== 상위 후보 20건 ===")

for i, item in enumerate(candidates[:20], 1):
    title = item.get("title", "(제목 없음)")
    score = item.get("score", item.get("priority", "?"))
    category = item.get("category", "?")
    source_name = item.get("source_name", "?")
    source_count = item.get("source_count", 1)
    print(
        f"{i:02}. [{score}] [{category}] {title} "
        f"| 대표 출처: {source_name} | 출처 수: {source_count}"
    )

print("\n=== 페이커 우표 중복 확인 ===")
faker_items = [
    item for item in candidates
    if "페이커" in item.get("title", "")
    and "우표" in item.get("title", "")
]
print(f"관련 후보 수: {len(faker_items)}")
for item in faker_items:
    print(
        f"- {item.get('title', '?')} "
        f"| 출처 수: {item.get('source_count', 1)}"
    )
