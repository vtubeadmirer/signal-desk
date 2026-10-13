<!-- Generated 2026-10-13 by a 9-agent ideation workflow (5 lenses → 3 judges → synthesis). Kept as the product direction for the "daily/weekly just-chatting topic engine" goal. What v0.7.0 shipped from it is listed in README. -->

# Signal Desk를 "매일/주간 저스트채팅 주제 엔진"으로 — 아이디어 정리

## 1. 핵심 (심사위원 합의)

세 심사위원이 공통으로 꼽은 것은 하나입니다. 이 도구가 저챗 주제 엔진이 되려면 **"후보 20개"를 "오늘 할 얘기 5개 + 각 얘기에 붙은 채팅 질문"으로 바꿔 큐시트까지 한 번에 잇는 순수 프런트 함수**가 중심이어야 하고, 그 주제의 공급원은 (1) 사이드카가 이미 계산하는 frames·category·engagement를 질문·투표 템플릿으로 바꾸는 것, (2) 방송 이력을 '중복 경고'가 아니라 '후속 소재'로 뒤집는 것, (3) 48시간 필터 때문에 사라지던 수집 결과를 가벼운 로그로 남겨 "N일째 떠도는 얘기 / 많이 떴는데 안 다룬 얘기"라는 주간 재료를 만드는 것, 이 세 가지입니다. 제약에 대한 합의도 분명했습니다. 사이드카·권한·보안 경계는 거의 건드리지 않고, Codex는 있으면 더 좋은 보너스로만 두며, 트레이·스케줄러·AI 스키마 확장처럼 "주제는 늘리지 않으면서 외부 의존만 늘리는" 안은 뒤로 미룹니다. 참고로 지금 작업 트리(커밋 전)에는 이미 `python/talk_angles.py` + `shared/talk_angles.json`(채팅 질문·투표), `src/history.ts`의 후속(followUp) 배지, `src/weekly.ts` + `DeskState.collectionLog`(수집 기록·주간 리포트)가 들어와 있어 상위 세 묶음의 절반은 시작된 상태이고, 아직 `App.tsx`에 연결되지 않았을 뿐입니다.

## 2. 상위 아이디어 12개

### 매일 루틴

**① 오늘의 토크 5 브리핑 + 「방송 전 루틴」 버튼** (합침: 오늘의 토크 5 브리핑 탭 · 오늘의 토크 세트 원클릭)
- 보게 되는 것: 수집이 끝나면 '브리핑' 탭이 열리고 오늘 바로 꺼낼 5개가 번호 붙은 큰 카드로 서 있습니다. 「5개 모두 방송 준비에 담기」 한 번으로 오늘 큐시트가 채워지고, 「교체」로 다음 후보와 바꾸고, 「브리핑 복사」로 마크다운을 메모 앱이나 OBS 텍스트 소스에 붙입니다. 「방송 전 루틴」 버튼 하나면 뉴스→커뮤니티 수집→5개 선정→담기→방송 준비 탭까지 자동으로 갑니다.
- 왜: 지금은 20장을 훑고 고르는 일이 매번 사용자 몫이라 '수집은 했는데 주제는 아직'인 상태가 생기는데, 선정 규칙(워치리스트 고정 → 이미 방송 제외 → 카테고리당 2개 → 커뮤니티 1개 이상 → 후속 1자리)을 고정하면 매일 같은 양식의 '오늘 할 얘기'가 클릭 없이 나옵니다.
- 구현: `src/briefing.ts`에 순수 함수 `buildBriefing(candidates, records, watchlist, today) → {picks, alternates}`와 `briefingMarkdown()`(`cuesheet.ts` 포맷 + `talk.questions`/`poll`), `tests/briefing.test.cjs`. `App.tsx`에 `Tab "briefing"`, `runCollection(stream)` 인자화 후 `runRoutine()`이 news→community→`toggleBroadcastDate`→`setTab("prep")`. 숫자키 1~5는 기존 keydown 훅 확장. 사이드카 변경 없음.
- 난이도 M · 점수 16.0 (원클릭 세트 안 15.0)

**② 지난 방송 후속 소식** (합침: 지난 방송 후속 소식 모아보기 · 지난 방송 이어가기(스토리 아크) · 후속 소식 추적과 후속 대기 목록)
- 보게 되는 것: 14일 안에 방송한 주제의 더 새 기사가 오면 「이미 방송」 대신 「후속 · 10/03 방송」 배지와 그때 남긴 메모가 접힌 채 보이고, 뉴스 탭 상단에 '지난 방송 후속 N건' 스트립, 방송 준비 탭에는 '후속 대기'(방송 3~30일, 아직 후속 없음)와 날짜순 '이어가는 이야기' 타임라인이 생깁니다. 큐시트엔 "- 이어서: 10/03 「이전 제목」 / 내 메모: …" 줄이 붙습니다.
- 왜: "저번에 얘기한 그거 어떻게 됐냐면"은 준비 비용이 가장 낮고 반응이 가장 확실한 오프너인데, 지금은 같은 매칭을 '중복'으로만 써서 오히려 묻힙니다.
- 구현: 배지·메모는 이미 작업 트리에 있음(`history.ts`의 `PriorBroadcast.followUp/note`, `CandidateCard.tsx`). 남은 것은 `history.ts`에 `followUps()`·`storyArcs(records, 14)`·`pendingFollowups()`, `cuesheet.ts` 후속 줄, `PrepTab.tsx` 섹션, `briefing.ts` 후속 슬롯 1개, `tests/watchlist-history.test.cjs` 확장. windowDays를 30으로 올리면 '이미 방송' 오탐도 늘어나므로 30일은 후속 대기 목록에만 적용.
- 난이도 S · 점수 15.6

**③ 수집 기록 + 모멘텀 배지** (합침: 수집 기록과 키워드 모멘텀 배지 · 수집 인박스와 '새 후보' 다이제스트의 배지 부분)
- 보게 되는 것: 수집할 때마다 상위 20개의 제목·토큰·점수·댓글 수가 30일 기록으로 남고, 다음 날부터 카드에 「3일째 화제」「오늘 처음」「지난번 이후 새로 등장」「댓글 +240」 배지와 「상승 중 먼저」 정렬이 생깁니다.
- 왜: 며칠째 반복되는 주제는 시청자도 이미 알아 설명 없이 대화가 붙고, 오늘 처음 뜬 것은 '방금 들어온 소식' 코너가 되며, 매일 수집 버튼을 누를 이유가 생깁니다.
- 구현: `src/weekly.ts`의 `CollectionEntry`·`appendRun`·`pruneLog`(30일·2,000건)·`persistentTerms/persistentHit`와 `DeskState.collectionLog`(`state.ts`·`backup.ts`)는 이미 있음. 남은 것은 `App.tsx runCollection` 성공 직후 `appendRun` 호출, `CandidateCard.tsx` 배지, `streams.ts streamCandidates`에 `sortMode` 인자와 탭 토글, `tests/weekly.test.cjs`. 댓글 증가량은 같은 날 두 번 수집할 때만 의미가 있습니다.
- 난이도 M(남은 작업은 S) · 점수 14.47

**④ 방송 후 30초 랩업** (합침: 방송 후 30초 랩업 · 방송 후 반응 기록과 반응 배지 · 방송 후 결산: 터진 주제 기록)
- 보게 되는 것: 방송 준비 탭에서 「방송 마무리」를 누르면 오늘 담은 주제마다 잘됨/별로/못 다룸 버튼이 나옵니다. 못 다룬 것은 다음 방송일로 이월돼 다음 브리핑 맨 앞에 서고, 비슷한 주제가 다시 뜨면 「지난번 반응 좋았음」 배지가 붙고, 보관함에 '반응 좋았던 것만' 필터, 끝으로 '오늘 다룬 주제' 마크다운 복사.
- 왜: '어제 못 한 얘기'가 가장 쉬운 다음 날 오프닝이고, 어떤 주제가 채팅을 살렸는지는 지금 어디에도 남지 않습니다.
- 구현: `src/types.ts ArticleRecord.reactions?: Record<YYYY-MM-DD, "hot"|"flat"|"skipped">`(optional, `state.ts articleRecordValid`·`backup.ts` v1 유지), `src/components/WrapPanel.tsx`(PrepTab 하단), 이월은 `updateRecord`로 `broadcastDates`에 다음 날짜 추가, `history.ts PriorBroadcast.reaction`, `cuesheet.ts buildCueSheet(coveredOnly)`. 심사 경고대로 '별로'는 제외 학습(`addRejections`)에 넣지 않고 긍정 집계에서만 빼며, '반응좋음' 라벨 방식은 personalization에 실효가 없어 쓰지 않습니다.
- 난이도 S · 점수 14.13 (반응 기록 14.0 · 결산 13.67)

### 주간 루틴

**⑤ 주간 흐름 보드 + 주간 리캡** (합침: 수집 로그로 주간 흐름 만들기 · 일별 수집 기록과 주간 보드 · 주간 흐름 탭과 주간 리캡 큐시트 · 방송 요일 달력과 주간 지속 화제 집계 · 주간 리캡 공유 텍스트 · 반복 등장 이름 → 워치리스트 제안)
- 보게 되는 것: 방송 준비 탭의 '주간' 토글에서 「이번 주 계속 올라온 것 / 지난주보다 커진 것 / 처음 나온 이름 / 이번 주 방송한 것 / 많이 떴는데 안 다룬 것」을 한 화면에 보고 각 항목을 바로 담습니다. 「주간 리캡 복사」는 '이번 주 정리' 코너 대본용 마크다운과 디스코드·카페용 평문("다음 주 뭐 할까 투표" 포함) 두 가지. 반복 등장 이름 옆엔 「워치리스트에 추가」 칩.
- 왜: 48시간 필터 때문에 주간 소재가 남지 않는데, 로그가 있으면 "이번 주 제일 많이 나온 이름 TOP5"와 "이거 왜 안 했냐"가 그대로 주 1회 코너가 됩니다. 주 1회 방송이면 `window_hours`(24~168)만 열어서는 RSS가 최근 수십 건만 남기므로 로그와 결합해야 진짜 주간이 됩니다.
- 구현: `weekly.ts weeklyReport`·`weeklyRecapMarkdown`은 이미 있음. 남은 것은 `src/components/WeeklyPanel.tsx`(PrepTab 상단 토글), 항목별 「담기」(`updateRecord` 경로), 평문 템플릿 한 벌, `SettingsPanels.tsx RulesPanel`의 제안 칩(`addWatchTerm`, MAX_WATCHLIST 50 준수). 첫 주는 "비교할 지난주가 없습니다" 빈 상태. 선택: `python/agent.py handle("collect")`에 `window_hours` 정수(24~168)를 검증해 `build_candidates`의 `timedelta(hours=48)` 한 줄을 대체.
- 난이도 M · 점수 14.47 (주간 흐름 탭 14.13 · 리캡 공유 13.6 · 워치리스트 제안 12.94)

**⑥ 일정 인식 주제 (출시·패치·대회·기념일)**
- 보게 되는 것: 환경설정에 일정(날짜·이름·종류·매년 반복)을 두면 뉴스 탭 상단에 '오늘·이번 주 일정' 띠가 뜨고, 맞는 후보에 「D-2 출시」 배지, 후보 제목에서 "10월 15일 출시" 같은 날짜가 잡히면 버튼 한 번으로 일정 등록. 방송 이력에서 '1년 전 오늘 다룬 주제'도 같은 띠에 나옵니다.
- 왜: 출시·패치·결승은 날짜가 정해진 소재라 하루 앞서 "내일 패치 뭐 기대돼?"를 만들 수 있고, 외부 연동이 없어 깨질 게 없습니다(대신 입력한 만큼만 나옵니다).
- 구현: `DeskState.calendar: CalendarEntry[]`(≤200, `state.ts`·`backup.ts` optional), `src/calendar.ts`의 `upcoming()`·`detectDates(title)`·`calendarMatches()`(`watchlist.ts watchMatches` 패턴), `App.tsx` 띠 섹션, `CandidateCard.tsx` 배지, `SettingsPanels.tsx RulesPanel` 편집 UI. 선택: collect 요청에 `calendar_terms`를 보내 `validate_watchlist` 재사용으로 ≤10점 가산.
- 난이도 M · 점수 14.47

### 주제 생성·형식

**⑦ 채팅 질문·투표 템플릿 (AI 없이)** (합침: 채팅 각도·질문 자동 생성 · 프레임별 토크 앵글 템플릿 · 규칙 기반 토크 앵글 템플릿 · 프레임 기반 찬반 투표 카드)
- 보게 되는 것: 모든 후보 카드와 큐시트 아래에 '채팅에 던질 질문' 2~3개와 투표 문구("…납득 가나요? 1 납득 2 과하다 3 플랫폼 바꾼다")가 붙고, 「복사」로 치지직·SOOP·유튜브 채팅 투표에 그대로 붙입니다. Codex가 있으면 `discussion_points`가 같은 자리 위에 함께 보입니다.
- 왜: 저챗은 기사 요약이 아니라 "채팅이 답하고 싶어지는 질문"으로 굴러가는데, 사이드카가 이미 계산하는 frames·category·engagement가 그 뼈대를 그대로 제공합니다.
- 구현: 작업 트리에 이미 들어와 있음. `python/talk_angles.py`(URL 해시 기반 결정적 선택, `engagement_profile`), `shared/talk_angles.json`, `build_candidates`의 `talk` 필드, `types.ts TalkAngles`, `CandidateCard.tsx` 블록 + 투표 복사, `cuesheet.ts pollText`. 남은 것은 `python/tests/test_talk_angles.py`에 "FRAMES 모든 키에 템플릿 2개 이상, 슬롯 치환 후 `{` 없음, 카테고리 폴백 존재" 테스트와 `backup.ts talkValid` 테스트. 사이드카에 두었으므로 문구 수정마다 `scripts/build-sidecar.ps1` 재빌드가 따릅니다(심사 지적). 템플릿을 늘릴 때는 몇 주 단위로 묶어 릴리스.
- 난이도 S · 점수 14.53 (투표 카드 14.53 · 사이드카 템플릿 안 13.86)

**⑧ 코너 자동 편성 큐시트**
- 보게 되는 것: 큐시트가 점수순 나열 대신 「뉴스 브리핑 → 밈 리뷰 → 찬반 토론 → 시청자 투표 → 사연·내 경험 → 이어가기」 코너별로 묶이고 코너마다 분 배정(브리핑 3분, 찬반 8분 등)과 총 분이 붙습니다. 카드에서 코너를 직접 바꿀 수 있습니다.
- 왜: 1~2시간 저챗을 코너로 나누면 "다음에 뭐 하지"가 사라지고, 코너는 이미 있는 필드(stream·frames·`talk.profile`·후속 여부)만으로 정해집니다.
- 구현: `src/segments.ts assignSegment(candidate, record, priorBroadcast)` + 코너별 기본 분 상수, `ArticleRecord.segment?: string`(optional), `cuesheet.ts buildCueSheet`가 "## 코너: 찬반 토론 (약 16분)" 헤더로 그룹화(`prep_minutes` 있으면 우선), `PrepTab.tsx` 코너 select와 소계, `tests/cuesheet.test.cjs` 신설. 사이드카 변경 없음.
- 난이도 M · 점수 14.8

**⑨ 토론형·공감형·정보형 태그 + 「채팅 터질 순」 정렬** (합침: 채팅 점수와 토론형·공감형 태그 · 커뮤니티 반응 프로필로 밈·논쟁 구분)
- 보게 되는 것: 카드마다 「토론형 / 공감형 / 정보형」 태그와 채팅 점수, 탭 상단에 「채팅 터질 순」 정렬 토글과 「토론형만」 칩. 큐시트엔 "- 반응: 논쟁형(추천 120 · 댓글 300)" 줄.
- 왜: 지금 score는 신선도·출처 중심이라 "오늘은 토론형 2 + 공감형 2"처럼 채팅 반응 유형으로 편성할 수가 없습니다.
- 구현: 분류 자체는 이미 `talk_angles.py engagement_profile`이 `talk.profile`로 내려주므로 프런트만 손댑니다. `streams.ts chatScore(candidate)`(댓글/추천 비율, views가 0인 소스는 절대 댓글 수만)와 `streamCandidates(sortMode)`, `CandidateCard.tsx` 태그, `App.tsx` 필터 칩, `tests/streams.test.cjs`. 심사 지적대로 '커뮤니티 공통 화제' 배지는 사이트 간 제목이 달라 거의 안 뜨므로 보류.
- 난이도 S · 점수 14.47 (사이드카 프로필 안 12.8)

**⑩ 내 메모·라벨로 "비슷한 일" 연결**
- 보게 되는 것: 새 후보가 예전에 라벨·메모를 남긴 기사와 같은 주제면 카드에 「전에 남긴 메모 N개」가 접혀 뜨고, 큐시트에 "- 내 경험 메모: …"로 들어갑니다. 라벨에 "내 경험 — 환불 사기 당함"처럼 써 두면 경험담 창고가 됩니다.
- 왜: 저챗의 핵심은 "나도 비슷한 일 있었는데"인데 메모는 보관함 검색으로만 찾을 수 있어 방송 중엔 못 꺼냅니다(대신 메모를 꾸준히 써야 쌓이는 느린 축적형입니다).
- 구현: `history.ts relatedNotes(candidate, records, 3)`(`preferenceTokens` 2개 이상 공유 또는 라벨이 제목에 포함, note 비어 있지 않음), `App.tsx`에서 `priorBroadcast`와 같은 useMemo 패턴으로 prop 전달, `CandidateCard.tsx` details, `cuesheet.ts` 줄, 라벨 placeholder 안내. `tests/agent.test.cjs`에 메모가 analyze payload에 안 들어감을 고정.
- 난이도 S · 점수 14.0

### 시청자 참여

**⑪ 온에어 모드 + OBS 텍스트 파일** (합침: 온에어 모드 + OBS 텍스트 파일 · 방송 중 라이브 모드 창 · 온에어 뷰와 방송 후 반응 기록)
- 보게 되는 것: 방송 준비 탭 「온에어」를 켜면 선택 날짜의 주제가 큰 글씨로 한 장씩(N/P 또는 J/K) 넘어가고 훅·채팅 질문·투표·주의사항·링크만 보입니다. 넘길 때마다 앱 데이터 폴더의 `overlay/now.txt`·`next.txt`·`poll.txt`가 갱신돼 OBS 텍스트 소스 '파일에서 읽기'만으로 화면에 "지금 주제 / 다음 주제 / 투표"가 뜹니다. 「다뤘음」 체크가 ④ 랩업의 입력이 됩니다.
- 왜: 늦게 들어온 시청자도 지금 무슨 얘기인지 바로 끼어들고, 투표 문구가 화면에 있으면 채팅이 답을 쏟아냅니다. 주제를 만들진 않지만 ⑦의 질문·투표를 실제로 쓰는 자리입니다.
- 구현: `src/overlay.ts writeOverlay(current, next, poll)`(`persist.ts`와 같은 `BaseDirectory.AppLocalData` + `signal-desk/overlay/`, 기존 `fs:allow-applocaldata-write-recursive`로 충분), `src/components/LiveView.tsx`(PrepTab 안 토글, planned 목록 재사용), `App.tsx` keydown 훅에 prep 탭 분기, 마운트 시와 「방송 종료」에 파일 비우기. 창 축소(항상 위 420×720)는 `tauri.conf.json`의 minWidth 980 때문에 `set-min-size` 권한까지 필요하므로 1차에서는 제외. obs-websocket은 비밀번호 저장이 필요해 쓰지 않음.
- 난이도 M · 점수 13.6 (온에어 뷰 13.73 · 라이브 모드 창 12.27)

**⑫ 시청자 제보 링크 → 후보 합류**
- 보게 되는 것: 탭 상단 「제보 붙여넣기」 상자에 채팅·디스코드에서 받은 링크를 "URL 제목 닉네임" 줄 단위로 붙이면 다음 수집 때 일반 후보와 같은 중복 묶기·편집 게이트를 거쳐 카드로 나오고, 여러 명이 보낸 기사엔 「제보 3명」 배지가 붙어 위로 올라갑니다.
- 왜: 시청자가 보낸 소재는 방송에서 꺼내는 순간 "내가 보낸 거다" 반응이 나오고, 수집기가 못 잡는 틈새를 메웁니다(매일 손으로 붙여 넣는 수고는 남습니다).
- 구현: `DeskState.submissions`(≤200, 7일 후 `sanitizeState`에서 제거), `src/agent.ts collect()`에 `manual_items`, `python/agent.py handle("collect")`에서 `validate_https_resource_url` + `resolve_public_url` 검증 후 `collection_method:"manual"`, `usage_status:"review_required"`, `engagement.recommendations=제보 수`로 `build_candidates`에 합류. 심사 합의대로 임의 URL의 `<title>` 자동 가져오기는 넣지 않고(승인 소스 밖 접속) 제목은 사용자가 쓴 것만 씁니다. `python/tests/test_agent.py`에 사설 IP·http 거부 케이스.
- 난이도 M · 점수 13.14

## 3. 추천 실행 순서 (첫 2주, 하루 단위)

**1단계 · 1~2일차: 작업 트리에 있는 것을 마무리해 v0.7.0으로 묶기** (⑦ 채팅 질문·투표 + ② 후속 배지)
- 1일차: `python/tests/test_talk_angles.py`에 FRAMES 키 전수 커버리지·슬롯 빈 문자열 없음·카테고리 폴백 테스트, `tests/watchlist-history.test.cjs`에 followUp 케이스 보강, `cuesheet.ts`에 "- 이어서: MM/DD 「이전 제목」 / 내 메모" 줄 추가.
- 2일차: `scripts/build-sidecar.ps1`로 `shared/talk_angles.json`이 번들되는지 확인, `python -m unittest` · `node --test` · `npm run build`, README에 "채팅 질문·투표는 규칙 기반, Codex 불필요" 한 줄, 커밋. 이 시점부터 모든 후보에 질문·투표가 붙고 후속이 표시됩니다.

**2단계 · 3~5일차: 수집 기록 연결 + 오늘의 토크 5 브리핑** (③ + ①의 브리핑 부분)
- 3일차: `App.tsx runCollection` 성공 직후 `appendRun`으로 `collectionLog` 갱신, `CandidateCard.tsx`에 `persistentHit` 기반 「N일째 화제」·「오늘 처음」 배지, `tests/weekly.test.cjs`.
- 4일차: `src/briefing.ts buildBriefing`(워치리스트 고정 → 후속 슬롯 1 → 이미 방송 제외 → 카테고리당 2 → 커뮤니티 1 이상 → score·talkability 순)과 `briefingMarkdown`, `tests/briefing.test.cjs`.
- 5일차: `App.tsx` 'briefing' 탭(후보 있으면 기본 탭), 「5개 모두 담기」(`updateArticleRecord`로 `selectedBroadcastDate` 추가), 「교체」, 「브리핑 복사」, 숫자키 1~5.

**3단계 · 6~8일차: 방송 전 루틴 버튼 + 코너 편성 큐시트** (①의 원클릭 부분 + ⑧ + 방송 전 자동 수집 타이머에서 '시작 시 바로 수집'만)
- 6일차: `runCollection(stream)` 인자화, `runRoutine()`(news→community→`buildBriefing`→담기→`setTab("prep")`), `RulesPanel`에 세트 정원 입력과 "앱 실행 시 루틴 자동 시작"(기본 꺼짐).
- 7일차: `src/segments.ts assignSegment` + 코너별 분, `ArticleRecord.segment?` optional, `state.ts`·`backup.ts` 허용.
- 8일차: `cuesheet.ts` 코너 헤더 그룹화·총 분, `PrepTab.tsx` 코너 select, `tests/cuesheet.test.cjs` 신설.

**4단계 · 9~10일차: 주간 흐름 패널 + 방송 후 랩업** (⑤ + ④)
- 9일차: `src/components/WeeklyPanel.tsx`(PrepTab '주간' 토글; `weeklyReport`의 다섯 묶음, 항목별 「담기」, 「주간 리캡 복사」=`weeklyRecapMarkdown`, 반복 등장 이름 옆 「워치리스트에 추가」 칩).
- 10일차: `WrapPanel.tsx` 「방송 마무리」(잘됨/별로/못 다룸 → `reactions` optional 필드), 못 다룸 → 다음 방송일 이월 + `buildBriefing` 맨 앞 고정, `PriorBroadcast.reaction` 배지, 「오늘 다룬 주제 복사」. '별로'는 제외 학습과 분리.

2주가 끝나면 "루틴 버튼 → 브리핑 5개(질문·투표·후속 포함) → 코너별 큐시트 → 방송 후 랩업 → 다음 날 이월·주간 보드"가 한 바퀴 돕니다. ⑥ 일정, ⑨ 채팅 터질 순, ⑩ 메모 연결, ⑪ 온에어, ⑫ 제보는 3주차 이후 S/M 단위로 하나씩 붙입니다.

## 4. 제외한 아이디어와 이유

- **Codex 선택적 야간 배치 분석 (8.93)** — 로그인 만료·쿼터·CLI 옵션 드리프트로 조용히 건너뛰는 날이 잦아 매일 믿고 쓸 수 없고, 자동 수집이 먼저 있어야 의미가 있음.
- **트레이 상주와 윈도우 알림 / 트레이 상주형 앱 내 스케줄러 / 헤드리스 수집과 작업 스케줄러 등록 (8.73 / 10.27 / 10.6)** — 비어 있는 `lib.rs`에 Rust 트레이 코드를 넣어야 하는데 로컬에 Rust가 없어 CI로만 검증되고, `schtasks` 호출은 '임의 셸 없음' 원칙과 충돌하며, 주제 자체는 하나도 늘지 않음. 방송 전 자동 수집 타이머(12.94)에서는 '시작 시 바로 수집' 옵트인만 3단계에 흡수.
- **AI 분석 스키마를 라이브용으로 확장 / 핫테이크 카드 (10.53 / 11.2)** — `codex exec --output-schema`가 strict라 'optional 필드만 추가' 설계는 깨지기 쉽고 required로 넣으면 한 항목 실패가 15건 전체 실패가 됨; 유료 로그인·CLI 의존이 그대로. ⑦ 템플릿이 자리 잡은 뒤 보너스로.
- **조건부 GET 캐시와 오프라인 재생 (10.33)** — 국내 피드·커뮤니티가 ETag를 잘 주지 않아 이득이 작고, DNS 일시 장애 때 묵은 수신본을 '오늘 후보'처럼 보여 주는 새 고장 모드를 추가.
- **방송 이력 기반 선호 규칙 학습 (11.94)** — 상위 20개를 과거 취향으로 수렴시키는 필터 버블 위험에 사이드카 가산 로직·새 패널까지 M 이상; ④ 랩업의 반응 기록이 몇 주 쌓인 뒤 근거를 갖고 착수. (셀렉터 외부화 11.4는 주제 생산이 없어 보류하되, 주간 live-check가 파서 깨짐을 알리면 그때 가장 먼저.)
