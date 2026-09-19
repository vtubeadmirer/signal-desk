from __future__ import annotations

import ipaddress
import socket
from urllib.parse import urlparse

MAX_INPUT_BYTES = 512 * 1024
MAX_FEED_BYTES = 2 * 1024 * 1024
ALLOWED_SCHEMES = {"https"}
ALLOWED_PORTS = {443, None}


def resolve_public_url(raw: str) -> tuple[str, str, list[str]]:
    """Validate an HTTPS URL and return a DNS-pinned list of public IPs."""
    parsed = urlparse(raw.strip())
    if parsed.scheme not in ALLOWED_SCHEMES:
        raise ValueError("RSS URL은 HTTPS만 허용합니다.")
    if not parsed.hostname:
        raise ValueError("호스트가 없는 URL입니다.")
    if parsed.username or parsed.password:
        raise ValueError("URL 사용자 인증정보는 허용하지 않습니다.")
    if parsed.port not in ALLOWED_PORTS:
        raise ValueError("표준 HTTPS 포트만 허용합니다.")

    host = parsed.hostname
    try:
        infos = socket.getaddrinfo(host, 443, type=socket.SOCK_STREAM)
    except OSError as exc:
        raise ValueError("피드 호스트를 확인할 수 없습니다.") from exc

    addresses: list[str] = []
    for info in infos:
        address = info[4][0]
        try:
            ip = ipaddress.ip_address(address)
        except ValueError:
            continue
        if not ip.is_global:
            raise ValueError("공용 인터넷 주소가 아닌 호스트는 허용하지 않습니다.")
        if address not in addresses:
            addresses.append(address)

    if not addresses:
        raise ValueError("피드 호스트 주소를 확인할 수 없습니다.")
    return parsed.geturl(), host, addresses


def validate_public_url(raw: str) -> str:
    return resolve_public_url(raw)[0]


def validate_https_resource_url(raw: str) -> str:
    """Validate a user-facing external URL without performing DNS resolution."""
    parsed = urlparse(raw.strip())
    if parsed.scheme != "https":
        raise ValueError("외부 링크는 HTTPS만 허용합니다.")
    if not parsed.hostname:
        raise ValueError("링크 호스트가 없습니다.")
    if parsed.username or parsed.password:
        raise ValueError("링크에 사용자 인증정보를 넣을 수 없습니다.")
    if parsed.port not in ALLOWED_PORTS:
        raise ValueError("표준 HTTPS 포트만 허용합니다.")
    return parsed.geturl()


def safe_text(text: str, limit: int = 4000) -> str:
    return " ".join((text or "").replace("\x00", " ").split())[:limit]
