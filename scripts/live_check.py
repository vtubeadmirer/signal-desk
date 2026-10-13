"""Live collection smoke test against the default news feeds and community lists.

Run manually or from the scheduled live-check workflow. Exits non-zero when a
community parser returns nothing (page layout probably changed) or when more
than half of the RSS feeds fail, so breakage is noticed before users hit it.
"""
import os
import sys
import time
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(ROOT / "python"))

import agent

if hasattr(sys.stdout, "reconfigure"):
    sys.stdout.reconfigure(encoding="utf-8", errors="replace")  # Windows consoles default to a legacy code page

NEWS_SOURCES = [
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

COMMUNITY_SOURCES = [
    {"name": "디시 버츄얼 스트리머 개념글", "url": "https://gall.dcinside.com/mini/board/lists/?id=virtual_streamer&exception_mode=recommend", "kind": "community", "tier": "approved_feed", "category": "버튜버·크리에이터", "enabled": True},
    {"name": "디시 치지직 개념글", "url": "https://gall.dcinside.com/mgallery/board/lists/?id=chzzk&exception_mode=recommend", "kind": "community", "tier": "approved_feed", "category": "IT·플랫폼", "enabled": True},
    {"name": "루리웹 유머 베스트", "url": "https://bbs.ruliweb.com/best/humor", "kind": "community", "tier": "approved_feed", "category": "커뮤니티·밈", "enabled": True},
    {"name": "펨코 포텐 화제순", "url": "https://www.fmkorea.com/best2", "kind": "community", "tier": "approved_feed", "category": "커뮤니티·밈", "enabled": True},
]


def run(label: str, sources: list[dict]) -> tuple[list[dict], list[str]]:
    started = time.monotonic()
    items, errors, _cancelled = agent.collect_sources(sources)
    per_source = {}
    for item in items:
        per_source[item["source_name"]] = per_source.get(item["source_name"], 0) + 1
    print(f"=== {label} ({time.monotonic() - started:.1f}s) ===")
    for source in sources:
        count = per_source.get(source["name"], 0)
        print(f"[{'성공' if count else '실패'}] {source['name']}: {count}건")
    for error in errors:
        print(f"  ! {error}")
    return items, errors


news_items, news_errors = run("일반 뉴스", NEWS_SOURCES)
community_items, community_errors = run("커뮤니티", COMMUNITY_SOURCES)

candidates = agent.build_candidates(news_items)
print(f"\n총 수집: 뉴스 {len(news_items)}건 · 커뮤니티 {len(community_items)}건")
print(f"뉴스 후보: {len(candidates)}건")
print("\n=== 상위 뉴스 후보 ===")
for i, item in enumerate(candidates[:20], 1):
    print(f"{i:02}. [{item['score']}] [{item['category']}] {item['title']} | {item['source_name']} | 출처 {item['source_count']}")

failures = []
warnings = []
if len(news_errors) * 2 > len(NEWS_SOURCES):
    failures.append(f"RSS 피드 {len(news_errors)}/{len(NEWS_SOURCES)}개가 실패했습니다.")

# Korean community sites block or challenge many datacenter IPs, so a GitHub runner
# cannot tell "site blocked us" from "page layout changed". On CI, and for plain
# access errors anywhere, community problems are warnings; run this script from a
# residential (Korean) connection for the strict parser check.
ACCESS_MARKERS = ("HTTP 4", "HTTP 5", "연결하지 못했습니다", "응답이", "robots.txt")
on_ci = bool(os.environ.get("GITHUB_ACTIONS"))
broken_communities = []
for source in COMMUNITY_SOURCES:
    if any(item["source_name"] == source["name"] for item in community_items):
        continue
    reason = next((error.split(": ", 1)[1] for error in community_errors if error.startswith(source["name"] + ":")), "결과 없음")
    access_problem = any(marker in reason for marker in ACCESS_MARKERS)
    if on_ci or access_problem:
        warnings.append(f"{source['name']}: {reason} ({'러너 IP 차단 가능' if on_ci else '접근 문제'})")
    else:
        broken_communities.append(f"{source['name']}: {reason}")
if broken_communities:
    failures.append("커뮤니티 목록을 읽지 못했습니다 (페이지 구조 변경 가능): " + ", ".join(broken_communities))

for warning in warnings:
    print(f"\nWARNING {warning}")
if failures:
    print("\nLIVE CHECK FAILED")
    for failure in failures:
        print(" - " + failure)
    sys.exit(1)
print("\nLIVE CHECK PASSED" + (" (커뮤니티 경고 있음)" if warnings else ""))
