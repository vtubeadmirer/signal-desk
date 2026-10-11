"""Broadcast editorial gates, applied before popularity or personalization."""
import re

EMERGENCY_TERMS = (
    "비상계엄", "계엄령", "계엄 선포", "국가 비상사태", "국가비상사태",
    "국가안보 위기", "국가 안보 위기", "국가재난사태", "국가 재난 사태",
    "대규모 국가 재난", "전쟁 발발", "전면전", "군사 침공", "쿠데타",
)
KOREA = r"(?:대한민국|한국|남한|우리나라|국내)"
FOREIGN = r"(?:미국|중국|일본|러시아|우크라이나|이스라엘|이란|파키스탄|네팔|방글라데시|미얀마|태국|필리핀|인도|프랑스|독일|영국|북한|대만|베네수엘라|아르헨티나|페루|브라질|에콰도르|튀르키예|터키|스리랑카|레바논|수단|시리아|아프가니스탄)"


def emergency_scope(item: dict) -> str | None:
    title = str(item.get("title", ""))
    summary = str(item.get("summary", ""))
    text = title + " " + summary
    if not any(term in text for term in EMERGENCY_TERMS):
        return None
    emergency = "(?:" + "|".join(map(re.escape, EMERGENCY_TERMS)) + ")"
    # Country and emergency must occur in the same short clause. Mentioning
    # Korean travellers in a foreign emergency report is not domestic scope.
    for field in (title, summary):
        for clause in re.split(r"[.!?。…;\n]", field):
            if not re.search(KOREA, clause) or not re.search(emergency, clause):
                continue
            if re.search(FOREIGN, clause):
                # Only unambiguous domestic phrasing overrides a foreign mention.
                if re.search(KOREA + r"(?:에서|에|의)?\s*(?:전역에?\s*)?" + emergency, clause):
                    return "domestic"
                continue
            if re.search(KOREA + r"[^.!?。…;]{0,35}" + emergency, clause) or re.search(emergency + r"[^.!?。…;]{0,35}" + KOREA, clause):
                return "domestic"
    return "foreign_or_unknown"


def excluded_topic(item: dict) -> bool:
    text = (str(item.get("title", "")) + " " + str(item.get("summary", ""))).lower()
    crime = ("살해", "살인", "살인미수", "실종", "시신", "변사체", "흉기", "칼부림", "성폭행", "성범죄", "강간", "납치", "자살", "극단적 선택", "아동학대", "폭행", "총격", "인명 사고", "사망 사고")
    harassment = ("신상털", "신상 공개", "피해자 신상", "사생활 폭로", "혐오", "인종차별", "남혐", "여혐")
    adult = ("야짤", "후방주의", "후방 주의", "성인물", "성인만화", "떡툰", "노출짤", "19금")
    return any(term in text for term in crime + harassment + adult)
