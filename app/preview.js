(() => {
  "use strict";
  const frame = document.getElementById("app-preview");
  const stage = document.querySelector(".device-stage");
  const log = document.getElementById("event-log");
  const empty = document.getElementById("event-empty");
  const counter = document.getElementById("event-count");
  const viewportLabel = document.getElementById("viewport-label");
  const standaloneLink = document.getElementById("standalone-link");
  const screenLabel = document.getElementById("screen-label");
  const scenarioSelect = document.getElementById("auth-scenario");
  const testFirst = document.getElementById("test-first");
  const testSecond = document.getElementById("test-second");
  const testThird = document.getElementById("test-third");
  const scopeNote = document.getElementById("scope-note");
  const screens = {
    "login-a": { group: "login", label: "로그인 A", title: "AllEarth 로그인 A 화면" },
    "login-b": { group: "login", label: "로그인 B", title: "AllEarth 로그인 B 화면" },
    signup: { group: "signup", label: "가입 정보", title: "AllEarth 가입 정보 화면" },
    complete: { group: "signup", label: "가입 완료", title: "AllEarth 완료 화면" },
    home: { group: "home", label: "홈 A · 이슈 이미지", title: "AllEarth 홈 A · 이슈 이미지" },
    "home-flags": { group: "home", label: "홈 B · 국기", title: "AllEarth 홈 B · 국기" },
    issue: { group: "issue", label: "이슈 · 나라 시트", title: "AllEarth 국가별 이슈 화면" },
    "topic-detail": { group: "issue", label: "화제 디테일", title: "AllEarth 화제 디테일 화면" },
    "feed-list": { group: "feed", label: "지역 Feed · 목록", title: "AllEarth 지역 Feed 목록" },
    "feed-grid": { group: "feed", label: "지역 Feed · 그리드", title: "AllEarth 지역 Feed 그리드" },
    "feed-full": { group: "feed", label: "Feed · 전체 본문 목록", title: "AllEarth Feed 전체 본문 목록" },
    "feed-world": { group: "feed", label: "World Feed", title: "AllEarth World Feed" },
    "feed-saved": { group: "saved", label: "Saved · 저장한 기록", title: "AllEarth 저장한 기록" },
    "saved-countries": { group: "saved", label: "Saved · 국가 예시", title: "AllEarth 저장한 국가" },
    "saved-posts": { group: "saved", label: "Saved · 게시글 예시", title: "AllEarth 저장한 게시글" },
    "saved-empty": { group: "saved", label: "Saved · 빈 상태", title: "AllEarth 저장한 항목 없음" },
    "saved-error": { group: "saved", label: "Saved · 오류", title: "AllEarth 저장 불러오기 오류" },
    "my-profile": { group: "my", label: "My · 프로필", title: "AllEarth My 프로필" },
    "my-grid": { group: "my", label: "My · 그리드", title: "AllEarth My 그리드" },
    "my-list": { group: "my", label: "My · 목록", title: "AllEarth My 목록" },
    "my-posts-grid": { group: "my", label: "My · 게시글 있음 · 격자", title: "AllEarth My 게시글 격자 예시" },
    "my-posts-list": { group: "my", label: "My · 게시글 있음 · 목록", title: "AllEarth My 게시글 목록 예시" },
    "my-settings": { group: "my", label: "My · 설정", title: "AllEarth My 설정" },
    "my-history": { group: "my", label: "My · 시청내역", title: "AllEarth My 시청내역" },
    "my-nickname": { group: "my", label: "My · 닉네임 변경", title: "AllEarth 닉네임 변경" },
    "my-terms": { group: "my", label: "My · 이용약관", title: "AllEarth 이용약관 안내" },
    "my-privacy": { group: "my", label: "My · 개인정보", title: "AllEarth 개인정보 안내" },
    "my-loggedout": { group: "my", label: "My · 로그아웃", title: "AllEarth My 로그아웃" },
  };
  const groupLabels = { login: "로그인 타입", signup: "가입 화면", home: "홈 타입", issue: "이슈 화면", feed: "지역 Feed · 11월 6일 업데이트", saved: "Saved", my: "My" };
  const lastScreen = { login: "login-a", signup: "signup", home: "home", issue: "issue", feed: "feed-list", saved: "feed-saved", my: "my-profile" };
  const lastMeta = {};
  let selectedLogin = "a";
  let selectedScenario = "new";
  let currentScreen = "home";
  let currentMeta = { from: "a", scenario: "new" };
  const events = {
    "feed.view": ["Feed 보기 전환", "같은 위치·정렬의 기록을 목록 또는 그리드로 봅니다."],
    "feed.sort": ["Feed 정렬", "화제순·최신순으로 같은 기록을 정렬합니다."],
    "feed.open": ["전체 본문 목록", "선택한 기록 위치에서 앞뒤 기록을 이어 봅니다."],
    "feed.back": ["Feed 복귀", "이전 보기와 스크롤 위치로 돌아갑니다."],
    "feed.post_added": ["기록 등록", "작성 전 위치·정렬·보기로 돌아갑니다. 입력 내용은 로그에 남기지 않습니다."],
    "feed.reaction": ["기록 반응", "좋아요·저장·댓글·반응을 보기 사이에서 공유합니다."],
    "feed.location": ["Feed 위치 적용", "선택한 지역의 화제순으로 진입합니다. 지역 저장 기능은 없습니다."],
    "auth.requested": ["Google 로그인 요청", "로딩 표시와 중복 클릭 방지를 확인합니다. 실제 계정 인증은 하지 않습니다."],
    "auth.preview_succeeded": ["신규 회원 확인", "가입 정보 화면으로 이동합니다. 실제 인증이나 계정 생성은 하지 않습니다."],
    "auth.returning": ["기존 회원 확인", "기존 로그인 완료 화면으로 이동합니다. 실제 인증이나 세션 생성은 하지 않습니다."],
    "auth.cancelled": ["인증 취소", "로그인 화면에 그대로 남습니다."],
    "auth.failed": ["인증 실패", "테스트용 실패 상태이며 로그인 화면에 그대로 남습니다."],
    "login.dismiss": ["닫기 요청", "이전 화면 또는 홈으로 연결할 이벤트입니다. 현재 첫 화면은 유지됩니다."],
    "legal.requested": ["문서 열기 요청", "약관 원문은 아직 연결되지 않았으며 동의도 처리하지 않습니다."],
    "signup.completed": ["가입 정보 완료", "입력값을 저장하지 않는 로컬 목업 흐름으로 완료 화면에 이동합니다."],
    "signup.cancelled": ["가입 취소", "선택한 로그인 화면으로 돌아갑니다."],
    "complete.entered": ["내 지구로 이동", "완료 화면에서 내 지구 홈으로 이동합니다."],
    "country.selected": ["국가 선택", "선택한 국가의 이슈를 확인하는 로컬 홈 동작입니다."],
    "home.zoom": ["지구본 확대·축소", "선택한 확대 단계로 지구본을 조절합니다."],
    "home.world": ["지구 전체 보기", "현재 방향을 유지하며 지구 전체를 보여 줍니다."],
    "home.countries": ["전체 국가 목록", "전 세계 국가·지역을 한글과 영문명으로 검색할 수 있습니다."],
    "home.globe_unavailable": ["지구본 표시 불가", "국가 목록과 검색으로 계속 탐색할 수 있습니다."],
    "home.search": ["지역 검색", "검색어는 이벤트 로그에 기록하지 않습니다."],
    "home.random": ["랜덤 이슈", "랜덤 이슈를 보여 주는 로컬 홈 동작입니다."],
    "home.recenter": ["기본 보기로", "대한민국의 처음 보기로 돌아갑니다. 기기 위치는 요청하지 않습니다."],
    "home.nav": ["하단 메뉴", "선택한 메뉴 이름은 이벤트 로그에 기록하지 않습니다."],
    "home.keep": ["Keep", "이슈 저장을 흉내 내는 로컬 홈 동작입니다."],
    "issue.opened": ["이슈 시트", "선택한 나라의 화제와 이야기 카드를 보여 줍니다."],
    "issue.country_saved": ["국가 저장", "국가 저장 상태를 이 화면 안에서 유지합니다."],
    "issue.saved": ["이슈 저장", "선택한 이슈의 저장 상태를 변경합니다."],
    "issue.detail": ["화제 디테일", "선택한 화제의 기록과 반응을 확인합니다."],
    "topic.sort": ["기록 정렬", "화제순·최신순으로 기록을 정렬합니다."],
    "topic.view": ["보기 전환", "목록과 그리드를 전환합니다."],
    "topic.reaction": ["기록에 반응", "반응을 선택하거나 취소합니다."],
    "topic.post_added": ["기록 추가", "현재 미리보기에만 추가합니다. 작성 내용은 로그에 남기지 않습니다."],
    "issue.records": ["기록 보기", "이 나라의 예시 기록과 직접 추가한 이야기를 확인합니다."],
    "issue.post_added": ["이야기 추가", "미리보기에만 추가됩니다. 입력 내용은 로그에 남기지 않습니다."],
  };

  function resetLog() {
    log.replaceChildren();
    counter.textContent = "0";
    empty.hidden = false;
  }

  function screenUrl(screen, meta = currentMeta) {
    const params = new URLSearchParams();
    if (screens[screen]?.group === "saved") {
      params.set("tab", screen === "saved-posts" ? "content" : screen === "saved-countries" ? "countries" : meta.tab || "content");
      if (["saved-countries", "saved-posts"].includes(screen)) params.set("example", "saved");
      if (["saved-empty", "saved-error"].includes(screen)) params.set("state", screen.slice(6));
      return `saved.html?${params}`;
    }
    if (screens[screen]?.group === "my") {
      const params = new URLSearchParams();
      if (screen === "my-settings") params.set("screen", "settings");
      else if (screen === "my-history") params.set("screen", "history");
      else if (screen === "my-loggedout") params.set("screen", "loggedout");
      else if (["my-nickname", "my-terms", "my-privacy"].includes(screen)) params.set("screen", screen.slice(3));
      if (screen === "my-list" || screen === "my-posts-list") params.set("view", "list");
      if (["my-profile", "my-grid", "my-posts-grid"].includes(screen)) params.set("view", "grid");
      if (screen.startsWith("my-posts-")) params.set("example", "posts");
      return `my.html${params.size ? `?${params}` : ""}`;
    }
    if (screens[screen]?.group === "feed") {
      params.set("region", meta.region || (screen === "feed-world" ? "world" : "seongsu"));
      params.set("view", screen === "feed-grid" ? "grid" : meta.view || "list");
      if (meta.sort) params.set("sort", meta.sort);
      if (screen === "feed-full" && meta.postId) params.set("post", meta.postId);
      params.set("v", "20261106");
      return `feed.html?${params}`;
    }
    if (screen === "topic-detail") {
      if (!meta.countryId && !meta.topicTitle) return "topic.html?fixture=barcelona";
      if (meta.countryId && meta.fixture === false) params.set("country", meta.countryId);
      if (meta.fixture && meta.topicTitle && meta.topicTitle !== "성수동") params.set("fixture", "barcelona");
      if (meta.countryIcon === "flag") params.set("pins", "flags");
      return `topic.html${params.size ? `?${params}` : ""}`;
    }
    if (screen === "login-a" || screen === "login-b") {
      params.set("scenario", meta.scenario || selectedScenario);
      return `${screen === "login-a" ? "index.html" : "index-b.html"}?${params}`;
    }
    if (screen === "signup") {
      params.set("from", meta.from || selectedLogin);
      return `signup.html?${params}`;
    }
    if (screen === "complete") {
      params.set("kind", meta.kind || "new");
      params.set("from", meta.from || selectedLogin);
      return `complete.html?${params}`;
    }
    if (screens[screen]?.group === "home" || screen === "issue") {
      params.set("from", meta.from || selectedLogin);
      if (screen === "home-flags" || (screen === "issue" && meta.countryIcon === "flag")) params.set("pins", "flags");
      if (screen === "issue") params.set("view", "issue");
      params.set("v", "20261102-issue");
      return `home.html?${params}`;
    }
    return "index.html";
  }

  function previewUrl(screen, meta) {
    const url = new URL(screenUrl(screen, meta), location.href);
    if (["home", "issue", "feed", "saved", "my"].includes(screens[screen]?.group)) {
      url.searchParams.set("previewAuth", screen === "my-loggedout" ? "out" : "in");
    }
    return url;
  }

  function testCopy(screen, meta = currentMeta) {
    if (screens[screen]?.group === "feed") return ["목록↔그리드·화제순/최신순·지역 변경", "카드 선택 → 전체 본문 목록 → 원래 보기·스크롤 복귀", "작성·취소·등록과 좋아요·Saved·My 시청내역"];
    if (screens[screen]?.group === "saved") return ["국가·게시글 탭과 저장한 순서 확인", "게시글 100개 한도·저장 해제와 My 합산 수", "국가 시트·게시글 본문을 열고 Saved로 복귀"];
    if (screens[screen]?.group === "my") return ["프로필과 내 기록 보기 전환", "설정·시청내역과 하단 메뉴 이동", "로그인 상태별 화면 확인"];
    if (screen === "topic-detail") return ["화제 제목·기록 목록과 이미지", "화제순/최신순·목록/그리드 전환과 반응", "기록 추가·본문 펼치기·이전 이슈로 복귀"];
    if (screen === "issue") return ["나라 시트·이슈 요약·글 카드", "국가/이슈 저장과 이야기 추가·기록 보기", "이슈 상세와 닫기·홈 복귀"];
    if (screen === "signup") return ["닉네임과 선택 사용자명 형식", "필수 체크 두 개와 전체 체크", "가입 완료와 취소 복귀"];
    if (screen === "complete") return [meta.kind === "returning" ? "기존 로그인 완료 표시" : "새 가입 완료 표시", "내 지구 홈으로 이동", meta.kind === "returning" ? "기존 회원의 가입 정보 입력 생략" : "가입 필수 조건을 채운 뒤 완료"];
    if (screens[screen]?.group === "home") return [screen === "home-flags" ? "국가명 옆 국기와 이슈 이미지 동그라미" : "이슈 이미지 표시·선택과 동그라미 간 간격", "전체 국가 검색·선택과 이슈 시트", "회전·확대/축소·전체 보기와 Keep"];
    return ["Google 버튼 클릭과 로딩 표시", "로딩 중 중복 클릭 방지", screen === "login-a" ? "닫기(타입 A)와 약관 문구의 클릭 이벤트" : "약관 문구의 클릭 이벤트 (타입 B에는 닫기 없음)"];
  }

  function updateScreenMeta(screen, meta = currentMeta) {
    const settings = screens[screen];
    if (!settings) return;
    currentScreen = screen;
    currentMeta = meta;
    lastScreen[settings.group] = screen;
    lastMeta[settings.group] = { ...meta };
    const isLogin = screen === "login-a" || screen === "login-b";
    const label = screen === "complete" && meta.kind === "returning" ? "로그인 완료" : settings.label;
    frame.title = settings.title;
    standaloneLink.href = previewUrl(screen, meta);
    screenLabel.textContent = label;
    scenarioSelect.disabled = !isLogin;
    scenarioSelect.closest(".scenario-control").hidden = !isLogin;
    document.getElementById("variant-label").textContent = groupLabels[settings.group];
    document.querySelectorAll("[data-group]").forEach(option => option.setAttribute("aria-pressed", String(option.dataset.group === settings.group)));
    document.querySelectorAll("[data-variants]").forEach(options => { options.hidden = options.dataset.variants !== settings.group; });
    document.querySelectorAll("[data-screen]").forEach(option => {
      option.setAttribute("aria-pressed", String(option.dataset.screen === screen));
    });
    [testFirst.textContent, testSecond.textContent, testThird.textContent] = testCopy(screen, meta);
      scopeNote.textContent = screen === "topic-detail" ? ((meta.topicTitle && meta.topicTitle !== "성수동") ? "선택한 화제의 제목·이미지와 샘플 기록을 보여 줍니다. 작성과 반응은 현재 미리보기에서만 유지되며, 뒤로 가면 기존 이슈 시트로 돌아갑니다." : "첨부·Figma 원본의 성수동 예시입니다. 128개 기록 표시는 디자인 예시이며, 샘플 기록으로 동작을 확인합니다. 홈에서 들어오면 선택한 화제가 표시됩니다. 작성과 반응은 현재 미리보기에서만 유지됩니다.")
      : settings.group === "issue" ? "Figma의 나라 시트를 구현했습니다. 별도로 여는 이슈 화면은 디자인 원본의 예시 콘텐츠·순위이며, 홈에서 열면 선택한 나라의 편집 예시가 표시됩니다. 저장과 글 추가는 현재 미리보기에서만 유지됩니다."
      : settings.group === "home"
      ? "전 세계 지형과 국가 검색은 로컬 데이터로 작동합니다. 이슈는 예시이며 Keep은 이 화면에서만 유지됩니다. 검색어와 좌표는 로그에 기록하지 않습니다."
      : "입력과 동의는 로컬 목업입니다. 실제 계정·로그인·약관 동의·정보 저장은 처리하지 않습니다.";
    if (settings.group === "feed") scopeNote.textContent = "11월 6일 지역 Feed HTML입니다. 목록/그리드와 전체 본문을 연결했습니다. 글·반응·시청내역은 이 브라우저 탭의 미리보기에서만 유지되며 서버에 전송하지 않습니다.";
    if (settings.group === "saved") scopeNote.textContent = "Saved는 저장한 게시글·이슈·나라를 이 브라우저 탭에서 함께 보여 주는 목업입니다.";
    if (settings.group === "my") scopeNote.textContent = "게시글 격자·목록은 샘플 6개를 한 번 추가합니다. 작성·수정·삭제한 내용은 탭 안에서 유지됩니다. 왼쪽 화면 선택은 각 예시의 로그인 상태를 적용하며, 앱 안의 로그아웃은 로그인 전까지 유지됩니다.";
    const url = new URL(location.href);
    url.searchParams.set("screen", screen);
    history.replaceState(null, "", url);
  }

  function openScreen(screen, meta) {
    updateScreenMeta(screen, meta);
    frame.src = previewUrl(screen, meta);
  }

  function chooseScreen(screen) {
    if (screen === "login-a" || screen === "login-b") selectedLogin = screen.slice(-1);
    resetLog();
    openScreen(screen, { from: selectedLogin, scenario: selectedScenario });
  }
  document.querySelectorAll("[data-screen]").forEach(button => {
    button.addEventListener("click", () => chooseScreen(button.dataset.screen));
  });
  document.querySelectorAll("[data-group]").forEach(button => {
    button.addEventListener("click", () => {
      const group = button.dataset.group;
      resetLog();
      openScreen(lastScreen[group], lastMeta[group] || { from: selectedLogin, scenario: selectedScenario });
    });
  });

  scenarioSelect.addEventListener("change", () => {
    selectedScenario = scenarioSelect.value;
    if (currentScreen === "login-a" || currentScreen === "login-b") {
      const meta = { from: selectedLogin, scenario: selectedScenario };
      openScreen(currentScreen, meta);
    }
  });

  document.querySelectorAll("[data-width]").forEach(button => {
    button.addEventListener("click", () => {
      frame.width = button.dataset.width;
      frame.height = button.dataset.height;
      stage.style.setProperty("--device-width", `${button.dataset.width}px`);
      viewportLabel.textContent = `${button.dataset.width} × ${button.dataset.height}`;
      document.querySelectorAll("[data-width]").forEach(option => {
        option.setAttribute("aria-pressed", String(option === button));
      });
    });
  });

  document.getElementById("reset").addEventListener("click", () => {
    resetLog();
    const target = previewUrl(currentScreen, currentMeta);
    if (["feed", "my", "saved"].includes(screens[currentScreen]?.group)) target.searchParams.set("reset", "1");
    frame.src = target.href;
  });

  const requestedScreen = new URLSearchParams(location.search).get("screen");
  chooseScreen(Object.hasOwn(screens, requestedScreen) ? requestedScreen : "my-profile");

  window.addEventListener("message", event => {
    const expectedOrigin = location.protocol === "file:" ? "null" : location.origin;
    if (event.source !== frame.contentWindow || event.origin !== expectedOrigin) return;
    const data = event.data;
    if (!data || data.channel !== "allearth-prototype") return;
    if (data.action === "screen.ready") {
      const detail = data.detail || {};
      const childScreen = data.screen === "saved" ? (detail.example === "saved" ? (detail.tab === "countries" ? "saved-countries" : "saved-posts") : ["saved-empty", "saved-error"].includes(currentScreen) && detail.state === currentScreen.slice(6) ? currentScreen : "feed-saved")
        : data.screen === "my" ? (detail.example === "posts" ? (detail.view === "list" ? "my-posts-list" : "my-posts-grid") : detail.view === "list" ? "my-list" : currentScreen === "my-grid" ? "my-grid" : "my-profile")
        : data.screen;
      if (!screens[childScreen]) return;
      if (detail.from === "a" || detail.from === "b") selectedLogin = detail.from;
      if ((data.screen === "login-a" || data.screen === "login-b") && ["new", "existing", "cancel", "error"].includes(detail.scenario)) {
        selectedScenario = detail.scenario;
        scenarioSelect.value = selectedScenario;
      }
      updateScreenMeta(childScreen, detail);
      return;
    }
    if (!events[data.action]) return;
    const [title, description] = events[data.action];
    const item = document.createElement("li");
    const heading = document.createElement("strong");
    const text = document.createElement("span");
    const time = document.createElement("time");
    heading.textContent = data.action === "legal.requested"
      ? `${title} · ${data.detail.document === "terms" ? "이용약관" : "개인정보 처리방침"}`
      : title;
    text.textContent = description;
    time.dateTime = new Date(data.timestamp).toISOString();
    time.textContent = new Date(data.timestamp).toLocaleTimeString("ko-KR", { hour12: false });
    item.append(heading, text, time);
    log.prepend(item);
    while (log.children.length > 12) log.lastElementChild.remove();
    counter.textContent = String(Number(counter.textContent) + 1);
    empty.hidden = true;
  });
})();
