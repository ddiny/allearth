# allearth · 지구 근황

## 인스타 카드뉴스 자동화 (비용 0원)

**AllEarth 앱에 보이는 화제가 그대로 인스타에 올라가요.**

```
app/assets/topics/topics.js   ← 앱 화면과 인스타 카드의 공통 원본 (제목·요약·카테고리·일정·사진·출처)
   ↓ 파일이 바뀌면 바로, 그리고 매일 아침 7:13 (KST)
매일 카드뉴스 만들기 (cards.yml)   표지 + 화제 9개 = 10장 → cards-images 브랜치
   ↓ 실행 결과 화면에서 미리보기 확인
내가 직접 실행 (=승인)   인스타에 올리기 (publish.yml) → 게시 기록 (같은 날짜 두 번 안 올라가요)
```

- 글은 **한 글자도 바꾸지 않아요.** 사진 출처 문구도 앱에 적힌 그대로 사진 아래와 캡션에 넣어요.
- 카드 디자인은 AllEarth 디자인 가이드(`docs/AllEarth_DESIGN_GUIDE.md`)의 색상·폰트·로고를 따라요.
- 인스타 API는 캐러셀 10장까지라, 화제가 9개면 마지막 장 없이 10장으로 만들어요.
- 화제 날짜가 지났으면 미리보기에 경고가 떠요. 요약에 '오늘'·'내일' 같은 표현이 있어서 늦게 올리면 틀린 말이 돼요.
- 이미지는 인스타가 공개 주소에서 가져가야 해서 **저장소가 공개(Public)여야 해요.**

### 필요한 설정 (Settings → Secrets and variables → Actions)
| 탭 | 이름 | 값 |
|---|---|---|
| Secrets | `IG_ACCESS_TOKEN` | Meta 개발자 앱에서 받은 토큰 (`EAA…`) |
| Variables | `IG_USER_ID` | 인스타 계정 번호 (1784…) |
| Variables (선택) | `CARDS_HANDLE` | 카드 아래 표시할 계정 이름 (예: `@glb.gummi`) |
| Secrets (선택) | `PIXABAY_API_KEY` | 사진이 없는 화제에 Pixabay 무료 사진을 찾아 넣어요 (pixabay.com 가입 후 pixabay.com/api/docs 에서 키 확인) |

### 매일 할 일
1. Actions → **매일 카드뉴스 만들기** 최근 실행 → 요약 화면의 미리보기 확인
2. 괜찮으면 Actions → **인스타에 올리기** → Run workflow
3. 문제가 있으면 올리지 않으면 돼요. 특정 나라를 빼려면 '매일 카드뉴스 만들기'를 직접 실행하면서 `exclude`에 나라 코드(예: `JP,US`)를 넣어요.

처음에는 '인스타에 올리기'를 **시험 실행** 체크로 먼저 돌려 계정이 맞는지 확인하세요.

### 장 수
- 자동 게시: 최대 10장 (표지 + 8개국 + 마지막 장). Meta API의 캐러셀 한도예요.
- 직접 올리기: '매일 카드뉴스 만들기'를 직접 실행하면서 `count`를 9~18로 넣으면 20장까지 만들어요. Artifacts에서 내려받아 앱으로 올려요.

### 안전장치
- 승인(직접 실행) 없이는 절대 올라가지 않아요.
- 같은 날짜는 두 번 올라가지 않아요 (`다시 올리기`를 체크해야만 돼요).
- 로또·복권·로그인 같은 도구성 검색어는 자동으로 빼요. 사건·사고 같은 민감한 검색어는 걸러지지 않으니 미리보기에서 꼭 확인하세요.

## topics.js 데이터 약속 (카드가 읽는 칸)
카드는 `app/assets/topics/topics.js`의 `window.AllEarthTopics`를 앱과 같은 방식으로 읽어요. 글은 바꾸지 않고 그대로 써요.

```js
window.AllEarthTopics = {
  date: '2026-11-18',          // 카드 날짜. 같은 날짜는 인스타에 한 번만 올라가요 (없으면 오늘)
  dateLabel: '2026.11.18',
  topics: {
    kr: {                      // 나라 코드: kr, jp, us, gb(또는 uk) … 대소문자 상관없음
      title: '제목',            // 필수
      summary: '한두 문장 요약',
      category: '테크',         // 사진 위 '# 테크'
      when: '11.18',           // 제목 아래 일정
      image: 'assets/topics/2026-11-18/kr.jpg',   // 앱 안 파일 또는 https:// 주소 둘 다 돼요
      imageAlt: '사진 설명', imagePosition: '50% 40%',
      imageCredit: '사진: 작가 / 출처',            // 사진 아래와 캡션에 그대로 들어가요
      source: 'https://…', sourceName: '출처 이름',
      status: 'rising'         // 또는 badges: ['Hot'] — hot, rising, new(=TODAY), talked(=ONGOING). 없으면 TODAY
    }
  }
};
```

- 나라당 화제가 여러 개면 `kr: [ {...}, {...} ]`처럼 배열로 둬도 돼요. 카드는 **첫 번째(대표) 화제**를 써요.
- 사진 주소가 깨져 있으면 그 장은 국기 그래픽으로 나오고 사진 출처도 빠져요.
- 카드에 들어가는 나라는 `collector/cards/template.mjs`의 `COUNTRY` 목록에 있는 나라예요 (예전 앱 19개국 + 중국). 새 나라는 거기에 이름·색·국기 파일을 추가해요.
- 화제가 9개 이하면 자동 게시(10장 이하)가 돼요. 10개 이상이면 '매일 카드뉴스 만들기'를 `count` 9로 실행하거나, 내려받아 앱에서 직접 올려요.

## 카드 디자인 고치기
카드는 순수 HTML/CSS (1080 × 1350, 인스타 4:5)이고 AllEarth 디자인 가이드를 따라요.

```
app/assets/topics/topics.js   카드 내용의 원본 (앱과 공통)
collector/
  allearth.mjs      topics.js 읽기
  cards.mjs         카드 만들기
  instagram.mjs     인스타 게시
  cards/
    cards.css       스타일 전부. 색은 맨 위 :root (가이드 4.1 토큰)
    template.mjs    HTML 구조와 고정 문구
    brand/          AllEarth 로고·Poppins (앱 파일 그대로)
    flags/          국기 SVG (flag-icons, MIT)
docs/               AllEarth 디자인 가이드, 패키지 안내
```

## 앱
`app/`: AllEarth 앱 프로토타입 (v8, 2026-11-08 팀 검토본). `app/preview.html`을 브라우저로 열어요.
