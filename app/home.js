(() => {
  "use strict";
  const from = new URLSearchParams(location.search).get("from") === "b" ? "b" : "a";
  const showCountryFlag = new URLSearchParams(location.search).get("pins") === "flags";
  const homeType = showCountryFlag ? "home-flags" : "home";
  const issuePreview = new URLSearchParams(location.search).get("view") === "issue";
  let screenType = issuePreview ? "issue" : homeType;
  document.querySelector(".home-screen").dataset.screen = homeType;
  if (showCountryFlag) document.title = "AllEarth · 내 지구 홈 B · 국가명 옆 국기";
  const countries = (window.AllEarthGeo?.countries || []).slice().sort((a, b) => a.name.localeCompare(b.name, "ko"));
  const byId = new Map(countries.map(country => [country.id, country]));
  const topicData = window.AllEarthTopics || { dateLabel: "", topics: {} };
  const samples = new Map(Object.entries(topicData.topics));
  const $ = id => document.getElementById(id);
  const search = $("country-search"), results = $("search-results");
  const panel = $("nav-panel"), stage = $("globe-stage"), resultList = $("search-list");
  const origins = new WeakMap();
  const homeParams = new URLSearchParams(location.search);
  const requestedCountry = homeParams.get("country");
  let savedSelection = null;
  try { savedSelection = sessionStorage.getItem("allearth.home.selected"); } catch (_) {}
  let selected = byId.has(requestedCountry) ? requestedCountry : (byId.has(savedSelection) ? savedSelection : "kr"), globe = null, ready = false;
  let searchRetrySucceeded = false, previousRandom = null;
  let restoringFocus = false;
  const zoomIn = document.querySelector('[data-action="zoom-in"]');
  const zoomOut = document.querySelector('[data-action="zoom-out"]');
  const world = document.querySelector('[data-action="world"]');
  const issueSheet = window.createCountryIssueSheet({
    showFlag: showCountryFlag,
    onDetail: openTopic, onAction: publish,
    onTransition: open => globe?.setIssueView(open),
    isKept: () => false,
    onKeep: () => {},
    onChange: open => {
      screenType = open ? "issue" : homeType;
      if (!open) { restoringFocus = true; requestAnimationFrame(() => { restoringFocus = false; hideResults(); }); }
      publish("screen.ready", { countryCount: countries.length });
    },
  });
  const topicDetail = window.createTopicDetail({
    onAction: publish,
    onSelectTopic: (countryId, issueId) => {
      issueSheet.selectTopic(issueId);
      const selectedTopic = issueSheet.currentTopic?.() || samples.get(countryId);
      openTopic(countryId, document.activeElement, selectedTopic, !!selectedTopic?.fixture, issueSheet.topics?.());
    },
    onChange: (open, detail) => {
      screenType = open ? "topic-detail" : "issue";
      publish("screen.ready", detail);
    },
  });

  function publish(action, detail = {}) {
    const event = { channel: "allearth-prototype", screen: screenType, action, timestamp: Date.now(), detail: { mode: "preview", from, countryIcon: showCountryFlag ? "flag" : "globe", authenticated: false, ...detail } };
    window.dispatchEvent(new CustomEvent("allearth:action", { detail: event }));
    if (window.parent !== window) window.parent.postMessage(event, location.protocol === "file:" ? "*" : location.origin);
  }
  function coordinates(country) {
    return `${Math.abs(country.lat).toFixed(2)}°${country.lat < 0 ? "S" : "N"} ${Math.abs(country.lng).toFixed(2)}°${country.lng < 0 ? "W" : "E"}`;
  }
  function showSelection(id) {
    const country = byId.get(id);
    if (!country) return;
    selected = id;
    try { sessionStorage.setItem("allearth.home.selected", id); } catch (_) {}
    stage.dataset.selectedId = id;
    $("country-name").textContent = country.name;
    $("country-name").title = country.name;
    $("country-coordinates").textContent = coordinates(country);
    if (showCountryFlag) document.querySelector(".home-map-icon img").src = `assets/flags/${id}.svg`;
  }
  function openDialog(dialog, origin = document.activeElement) {
    origins.set(dialog, origin);
    if (!dialog.open) dialog.showModal();
  }
  function openTopic(id, origin, chosenTopic, fixtureTopic = false, availableTopics) {
    const country = byId.get(id);
    if (!country) return;
    const topic = chosenTopic || samples.get(id);
    if (!topic) return;
    window.AllEarthStore?.recordHistory?.({ type: "issue", id: `${id}:${topic.title}`, title: topic.title, countryId: id, fixture: !!fixtureTopic, visited: Date.now() });
    topicDetail.open({ country, topic, fixture: !!fixtureTopic, topics: availableTopics, origin });
  }
  function select(id, source, origin = document.activeElement, sheetMode = "half") {
    if (!byId.has(id)) return;
    hideResults();
    showSelection(id);
    if (ready && source !== "globe" && source !== "marker") globe.select(id);
    publish("country.selected", { countryId: id, source });
    issueSheet.open(byId.get(id), samples.get(id), origin, false, { mode: sheetMode });
  }
  const normalize = value => value.toLocaleLowerCase().normalize("NFKC").replace(/[\s._'-]/g, "");
  function matching(query, fixture) { return window.AllEarthIssues?.search?.(countries, query, { fixture }) || { status: "ready", countries: [], issues: [] }; }
  function countryButton(country, source) {
    const li = document.createElement("li"), button = document.createElement("button");
    button.type = "button";
    const title = document.createElement("span"), subtitle = document.createElement("small");
    title.textContent = country.name;
    subtitle.textContent = country.en || country.iso3 || country.id.toUpperCase();
    button.append(title, subtitle);
    button.addEventListener("click", () => {
      search.value = "";
      select(country.id, source, search, source === "search" ? "full" : "half");
    });
    li.append(button);
    return li;
  }
  function hideResults() {
    results.hidden = true;
    search.setAttribute("aria-expanded", "false");
  }
  function group(titleText, rows) {
    const section = document.createElement("section"), title = document.createElement("h2"), list = document.createElement("ul");
    section.className = "home-result-group"; title.textContent = titleText; list.setAttribute("aria-label", `${titleText} 검색 결과`);
    rows.forEach(row => list.append(row)); section.append(title, list); return section;
  }
  function issueButton(item) {
    const li = document.createElement("li"), button = document.createElement("button"), title = document.createElement("span"), subtitle = document.createElement("small");
    button.type = "button"; button.dataset.searchIssue = item.id; title.textContent = item.title;
    subtitle.textContent = `${item.country.name} · ${item.exampleStatus || item.category || "이슈"}`;
    button.append(title, subtitle); button.addEventListener("click", () => {
      const query = search.value; hideResults(); showSelection(item.country.id);
      openTopic(item.country.id, search, item, !!item.example, window.AllEarthIssues.allForCountry(item.country, samples.get(item.country.id)));
      search.value = query; syncSearchClear(); publish("home.search_issue", { issueId: item.id, countryId: item.country.id });
    });
    li.append(button); return li;
  }
  function stateMessage(title, copy, retry) {
    const wrap = document.createElement("div"), heading = document.createElement("strong"), text = document.createElement("p");
    wrap.className = "home-search-state"; wrap.setAttribute("role", retry ? "alert" : "status"); heading.textContent = title; text.textContent = copy; wrap.append(heading, text);
    if (retry) { const button = document.createElement("button"); button.type = "button"; button.className = "home-search-retry"; button.textContent = "다시 시도"; button.addEventListener("click", () => { searchRetrySucceeded = true; renderResults(); }); wrap.append(button); }
    return wrap;
  }
  function syncSearchClear() { document.querySelector('[data-action="clear-search"]').hidden = !search.value; }
  function renderResults() {
    resultList.replaceChildren();
    syncSearchClear();
    const found = matching(search.value, searchRetrySucceeded ? "ready" : undefined);
    const isAll = !search.value.trim();
    const count = (found.countries?.length || 0) + (found.issues?.length || 0);
    $("search-summary").textContent = `${isAll ? "전체 국가·지역" : "검색 결과"} · ${count}개`;
    results.hidden = false;
    search.setAttribute("aria-expanded", "true");
    if (found.status === "error") resultList.append(stateMessage("검색 결과를 불러오지 못했어요", "입력한 검색어는 유지됩니다. 잠시 후 다시 시도해 주세요.", true));
    else if (!count) resultList.append(stateMessage("검색 결과가 없어요", `‘${search.value.trim()}’과 일치하는 국가 또는 이슈가 없습니다. 다른 검색어를 입력해 주세요.`, false));
    else {
      if (found.countries.length) resultList.append(group("국가", found.countries.map(country => countryButton(country, "search"))));
      if (found.issues.length) resultList.append(group("이슈", found.issues.map(issueButton)));
    }
    resultList.scrollTop = 0;
    publish("home.search", { count, status: found.status });
  }
  function openSearch() {
    search.focus();
    renderResults();
    publish("home.countries");
  }
  function reset() {
    hideResults();
    showSelection("kr");
    if (ready) globe.reset();
    publish("home.recenter", { countryId: "kr" });
  }
  function onChange(state) {
    // Expose view state for DOM-based interaction verification, without reaching into WebGL.
    stage.dataset.latitude = Number(state.lat).toFixed(3);
    stage.dataset.longitude = Number(state.lng).toFixed(3);
    stage.dataset.altitude = Number(state.altitude).toFixed(3);
    zoomIn.disabled = !ready || !state.canZoomIn;
    zoomOut.disabled = !ready || !state.canZoomOut;
  }
  function failGlobe() {
    ready = false;
    stage.dataset.ready = "false";
    $("globe-loading").hidden = false;
    $("globe-loading").textContent = "지구본을 표시할 수 없어요.\n검색창에서 전체 국가를 둘러보세요.";
    stage.tabIndex = -1;
    stage.setAttribute("aria-disabled", "true");
    document.querySelector(".home-helper").textContent = "검색창에서 나라를 찾아 선택해 보세요";
    $("globe-instructions").textContent = "지구본을 사용할 수 없습니다. 전체 국가 목록과 검색은 계속 사용할 수 있습니다.";
    zoomIn.disabled = zoomOut.disabled = world.disabled = true;
    publish("home.globe_unavailable");
  }
  document.querySelector(".home-search").addEventListener("submit", event => {
    event.preventDefault();
    if (search.value.trim()) { renderResults(); results.querySelector("button")?.click(); }
    else openSearch();
  });
  search.addEventListener("input", () => { searchRetrySucceeded = false; renderResults(); });
  search.addEventListener("focus", () => { if (!restoringFocus) renderResults(); });
  search.addEventListener("click", () => { if (results.hidden) renderResults(); });
  search.addEventListener("keydown", event => {
    if (event.key === "ArrowDown") { if (results.hidden) renderResults(); results.querySelector("button")?.focus(); event.preventDefault(); }
    if (event.key === "Escape") { hideResults(); event.preventDefault(); }
  });
  results.addEventListener("keydown", event => {
    const buttons = [...results.querySelectorAll("button")], index = buttons.indexOf(document.activeElement);
    if (event.key === "ArrowDown" || event.key === "ArrowUp") {
      const next = index + (event.key === "ArrowDown" ? 1 : -1);
      (buttons[next] || search).focus(); event.preventDefault();
    }
    if (event.key === "Escape") { search.focus(); hideResults(); event.preventDefault(); }
  });
  document.querySelector('[data-action="clear-search"]').addEventListener("click", () => { search.value = ""; searchRetrySucceeded = false; renderResults(); search.focus(); });
  document.addEventListener("pointerdown", event => { if (!event.target.closest(".home-search")) hideResults(); });
  document.addEventListener("focusin", event => { if (!event.target.closest(".home-search")) hideResults(); });
  document.querySelector('[data-action="random"]').addEventListener("click", () => {
    const ids = [...samples.keys()].filter(id => byId.has(id));
    if (!ids.length) return;
    const eligible = ids.filter(id => id !== previousRandom && (ids.length < 2 || id !== selected));
    const pool = eligible.length ? eligible : ids;
    const bytes = new Uint32Array(1); crypto.getRandomValues?.(bytes);
    const next = pool[(crypto.getRandomValues ? bytes[0] : Math.floor(Math.random() * pool.length)) % pool.length];
    previousRandom = next; select(next, "random", document.activeElement, "half"); publish("home.random", { countryId: selected });
  });
  document.querySelector('[data-action="recenter"]').addEventListener("click", reset);
  stage.addEventListener("keydown", event => {
    if (event.key === "Home") {
      showSelection("kr");
      publish("home.recenter", { countryId: "kr" });
    }
  });
  zoomIn.addEventListener("click", () => { if (ready) { globe.zoom(1); publish("home.zoom", { direction: "in" }); } });
  zoomOut.addEventListener("click", () => { if (ready) { globe.zoom(-1); publish("home.zoom", { direction: "out" }); } });
  world.addEventListener("click", () => { if (ready) { globe.world(); publish("home.world"); } });
  [panel].forEach(dialog => {
    dialog.addEventListener("click", event => {
      if (event.target !== dialog) return;
      const rect = dialog.getBoundingClientRect();
      if (event.clientX < rect.left || event.clientX > rect.right || event.clientY < rect.top || event.clientY > rect.bottom) dialog.close();
    });
    dialog.addEventListener("close", () => {
      if (document.querySelector("dialog[open]")) return;
      const origin = origins.get(dialog);
      if (origin && document.contains(origin)) {
        restoringFocus = true; origin.focus({ preventScroll: true }); restoringFocus = false;
        hideResults();
      }
    });
  });
  window.AllEarthShell?.mount("earth");
  showSelection(selected);
  if (samples.size) document.querySelector(".home-helper").textContent = `${topicData.shortDate} 이슈 예시 · 동그라미를 눌러 이야기를 만나보세요`;
  try {
    if (!countries.length || !window.createAllEarthGlobe) throw new Error("Globe assets missing");
    globe = window.createAllEarthGlobe({
      element: stage, countries, features: window.AllEarthGeo.features, topics: topicData.topics,
      pinObstacles: [document.querySelector('.home-zoom')],
      onSelect: (id, source) => select(id, source || "globe", stage), onChange,
      onReady: () => {
        ready = true; stage.dataset.ready = "true"; $("globe-loading").hidden = true; world.disabled = false;
        // Some renderers report readiness synchronously before createAllEarthGlobe returns.
        requestAnimationFrame(() => { if (!globe) return; if (selected !== "kr") globe.select(selected); onChange(globe.getState()); });
      }, onError: failGlobe,
    });
  } catch (error) { console.error("AllEarth globe could not start:", error); failGlobe(); }
  document.fonts.ready.then(() => {
    if (issuePreview) {
      const id = byId.has(requestedCountry) ? requestedCountry : "kr";
      issueSheet.open(byId.get(id), samples.get(id), stage, homeParams.get("fixture") === "barcelona" || !requestedCountry, { mode: homeParams.get("mode") === "full" ? "full" : "half" });
    }
    else publish("screen.ready", { countryCount: countries.length });
  });
  window.addEventListener("pagehide", event => { if (!event.persisted) globe?.destroy(); });
})();
