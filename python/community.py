"""Read public community LIST metadata; never fetch posts, comments or images."""
from __future__ import annotations

import re
from datetime import datetime, timedelta, timezone
from html.parser import HTMLParser
from urllib.parse import urljoin, urlparse, parse_qs, urlencode

from security import safe_text, validate_https_resource_url

KST = timezone(timedelta(hours=9))


class Node:
    def __init__(self, tag="", attrs=()):
        self.tag, self.attrs, self.children = tag, dict(attrs), []

    def text(self):
        return " ".join(x.text() if isinstance(x, Node) else x for x in self.children)

    def find(self, cls):
        return [n for n in self.walk() if cls in n.attrs.get("class", "").split()]

    def walk(self):
        yield self
        for child in self.children:
            if isinstance(child, Node):
                yield from child.walk()


class Tree(HTMLParser):
    def __init__(self):
        super().__init__(convert_charrefs=True)
        self.root = Node()
        self.stack = [self.root]

    def handle_starttag(self, tag, attrs):
        node = Node(tag, attrs)
        self.stack[-1].children.append(node)
        if tag not in {"area", "base", "br", "col", "embed", "hr", "img", "input", "link", "meta", "param", "source", "track", "wbr"}:
            self.stack.append(node)

    def handle_endtag(self, tag):
        for index in range(len(self.stack) - 1, 0, -1):
            if self.stack[index].tag == tag:
                self.stack = self.stack[:index]
                break

    def handle_data(self, data):
        if self.stack[-1].tag not in {"script", "style"}:
            self.stack[-1].children.append(data)


def community_site(url: str) -> str:
    parsed = urlparse(validate_https_resource_url(url))
    if parsed.hostname == "gall.dcinside.com" and re.fullmatch(r"/(?:mgallery|mini)/board/lists/", parsed.path):
        if re.fullmatch(r"[a-zA-Z0-9_]+", parse_qs(parsed.query).get("id", [""])[0]):
            return "dcinside"
    # Normal gallery path is /board/lists/.
    if parsed.hostname == "gall.dcinside.com" and parsed.path == "/board/lists/" and re.fullmatch(r"[a-zA-Z0-9_]+", parse_qs(parsed.query).get("id", [""])[0]):
        return "dcinside"
    if parsed.hostname == "bbs.ruliweb.com" and parsed.path in {"/best/humor", "/best/game", "/best/community"} and not parsed.query:
        return "ruliweb"
    if parsed.hostname == "www.fmkorea.com" and parsed.path in {"/best", "/best2", "/humor"} and not parsed.query:
        return "fmkorea"
    raise ValueError("지원하는 커뮤니티 공개 목록 URL이 아닙니다.")


def robots_allowed(robots: str, url: str) -> bool:
    """Apply longest-match wildcard rules in SignalDesk or wildcard groups."""
    groups, agents, rules = [], [], []
    for line in robots.splitlines() + ["User-agent: __end__"]:
        key, _, value = line.split("#", 1)[0].partition(":")
        key, value = key.strip().lower(), value.strip()
        if key == "user-agent":
            if rules:
                groups.append((agents, rules))
                agents, rules = [], []
            agents.append(value.lower())
        elif key in {"allow", "disallow"} and value:
            rules.append((key, value))
    exact = [r for a, r in groups if any(x == "signaldesk" for x in a)]
    selected = exact or [r for a, r in groups if "*" in a]
    parsed = urlparse(url)
    target = parsed.path + ("?" + parsed.query if parsed.query else "")
    matches = []
    for group in selected:
        for action, pattern in group:
            expression = "^" + re.escape(pattern).replace(r"\*", ".*")
            if pattern.endswith("$"):
                expression = expression[:-2] + "$"
            if re.search(expression, target):
                matches.append((len(pattern.replace("*", "").rstrip("$")), action == "allow"))
    return max(matches, default=(0, True))[1]


def number(row: Node, cls: str) -> int:
    nodes = row.find(cls)
    match = re.search(r"[\d,]+", nodes[0].text()) if nodes else None
    return min(10_000_000, int(match[0].replace(",", ""))) if match else 0


def posted_date(value: str, now: datetime) -> datetime | None:
    value = safe_text(value)
    try:
        if re.fullmatch(r"\d{4}-\d{2}-\d{2} \d{2}:\d{2}:\d{2}", value):
            return datetime.strptime(value, "%Y-%m-%d %H:%M:%S").replace(tzinfo=KST)
        relative = re.search(r"(\d+)\s*(분|시간|일)\s*전", value)
        if relative:
            amount, unit = int(relative[1]), relative[2]
            return now - timedelta(minutes=amount * {"분": 1, "시간": 60, "일": 1440}[unit])
        if value == "방금":
            return now
        if re.fullmatch(r"\d{2}:\d{2}", value):
            hour, minute = map(int, value.split(":"))
            result = now.astimezone(KST).replace(hour=hour, minute=minute, second=0, microsecond=0)
            return result - timedelta(days=1) if result > now + timedelta(minutes=5) else result
        if re.fullmatch(r"\d{2}\.\d{2}", value):
            month, day = map(int, value.split("."))
            result = now.astimezone(KST).replace(month=month, day=day, hour=0, minute=0, second=0, microsecond=0)
            return result.replace(year=result.year-1) if result > now + timedelta(days=1) else result
    except ValueError:
        pass
    return None


def parse_community(html: bytes, source: dict, now: datetime | None = None) -> list[dict]:
    now = now or datetime.now(timezone.utc)
    site = community_site(source["url"])
    tree = Tree()
    tree.feed(html.decode("utf-8", "strict"))
    rows = tree.root.find({"dcinside": "ub-content", "ruliweb": "table_body", "fmkorea": "li"}[site])
    out, seen = [], set()
    for row in rows:
        if site == "dcinside":
            if row.attrs.get("data-type") == "icon_notice" or row.find("icon_notice"):
                continue
            cells = row.find("gall_tit")
            anchors = [n for n in cells[0].walk() if n.tag == "a" and "/board/view/" in n.attrs.get("href", "")] if cells else []
            title = anchors[0].text() if anchors else ""
            dates = row.find("gall_date")
            date_text = dates[0].attrs.get("title", "") if dates else ""
            engagement = {"recommendations": number(row, "gall_recommend"), "comments": number(row, "reply_num"), "views": number(row, "gall_count")}
        elif site == "ruliweb":
            anchors = row.find("subject_link")
            strong = [n for n in anchors[0].walk() if n.tag == "strong"] if anchors else []
            title = strong[0].text() if strong else re.sub(r"\s*\(\d+\)\s*$", "", anchors[0].text()) if anchors else ""
            dates = row.find("time")
            date_text = dates[0].text() if dates else ""
            engagement = {"recommendations": number(row, "recomd"), "comments": number(row, "num_reply"), "views": number(row, "hit")}
        else:
            if "li_best2_politics1" in row.attrs.get("class", ""):
                continue
            heads = [n for n in row.walk() if n.tag == "h3" and "title" in n.attrs.get("class", "").split()]
            anchors = [n for n in heads[0].walk() if n.tag == "a"] if heads else []
            titles = row.find("ellipsis-target")
            title = titles[0].text() if titles else ""
            dates = row.find("regdate")
            date_text = dates[0].text() if dates else ""
            engagement = {"recommendations": number(row, "count"), "comments": number(row, "comment_count"), "views": 0}
        published = posted_date(date_text, now)
        if not anchors or not published or not title.strip():
            continue
        try:
            url = validate_https_resource_url(urljoin(source["url"], anchors[0].attrs.get("href", "")))
            parsed = urlparse(url)
            if parsed.hostname != urlparse(source["url"]).hostname:
                continue
            if site == "dcinside":
                params = parse_qs(parsed.query)
                if not re.fullmatch(r"\d+", params.get("no", [""])[0]):
                    continue
                url = parsed._replace(query=urlencode({"id": params.get("id", [""])[0], "no": params["no"][0]}), fragment="").geturl()
            elif site == "fmkorea":
                post_id = parse_qs(parsed.query).get("document_srl", [""])[0] or parsed.path.rstrip("/").split("/")[-1]
                if not post_id.isdigit():
                    continue
                url = "https://www.fmkorea.com/" + post_id
        except ValueError:
            continue
        if url in seen:
            continue
        seen.add(url)
        out.append({"title": safe_text(title, 500), "url": url, "published_at": published.isoformat(),
                    "summary": "공개 인기글 목록에서 발견한 화제입니다. 본문과 댓글은 수집하지 않았습니다. 원문에서 맥락을 확인하세요.",
                    "source_name": safe_text(source.get("name", site), 200), "tier": "community",
                    "category": source.get("category", "커뮤니티·밈"), "source_type": "community",
                    "content_type": "community", "collection_method": "public_list", "usage_status": "review_required",
                    "engagement": engagement, "caveats": ["제목과 인기 지표만 수집했습니다. 사실 여부·밈의 맥락·게시물 삭제 여부를 원문에서 확인하세요."]})
    return out[:60]
