(() => {
  'use strict';
  // Regional posts use the shared Feed flow; country news retains its existing detail view.
  const entryParams = new URLSearchParams(location.search);
  if (document.getElementById('topic-standalone') && !entryParams.has('country') && !entryParams.has('fixture')) {
    location.replace('feed.html?region=seongsu&view=list');
    return;
  }
  const icon = name => `assets/figma/${name}`;
  const escape = value => String(value ?? '').replace(/[&<>"]/g, char => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[char]));
  const korea = { id: 'kr', name: '대한민국' };
  const barcelona = { title: '바르셀로나 8연승 행진', summary: '바르셀로나가 8경기 연승으로 라리가에서 좋은 흐름을 이어가고 있어요.' };
  const standaloneExamples = country => [
    { title: `${country.name}의 문화·일상 이야기`, summary: '현지의 문화와 일상을 살펴보는 편집 예시입니다.', category: '문화·일상', example: true },
    { title: `${country.name}에서 나누는 여행 팁`, summary: '여행자가 남긴 지역의 작은 팁을 모아 보는 편집 예시입니다.', category: '여행', example: true },
    { title: `${country.name}의 지역 커뮤니티`, summary: '지역의 대화 주제를 안내하는 편집 예시입니다.', category: '커뮤니티', example: true },
  ].map(item => ({ ...item, id: `${country.id}:${item.title}`, countryId: country.id, exampleStatus: '편집 예시' }));
  const standaloneTopics = (country, primary) => primary ? [primary, ...standaloneExamples(country).slice(0, 2)] : standaloneExamples(country);
  const reactionNames = ['도움돼요', '지금도 그래요', '상황이 달라졌어요', '잘 모르겠어요'];
  const states = new Map();
  let recordSequence = 2;
  function publish(action, detail) {
    const event = { channel: 'allearth-prototype', screen: 'topic-detail', action, timestamp: Date.now(), detail: { mode: 'preview', countryIcon: new URLSearchParams(location.search).get('pins') === 'flags' ? 'flag' : 'globe', authenticated: false, ...detail } };
    window.dispatchEvent(new CustomEvent('allearth:action', { detail: event }));
    if (parent !== window) parent.postMessage(event, location.protocol === 'file:' ? '*' : location.origin);
  }
  function normalize(options) {
    const country = options.country || korea;
    return options.topic ? { ...options.topic, id: `${country.id}:${options.topic.title}`, countryId: country.id, country, fixture: !!options.fixture, topics: options.topics || [], seongsu: false } : { country: korea, id: 'kr:성수동', countryId: 'kr', title: '성수동', fixture: true, topics: [], seongsu: true };
  }
  function initialState(data) {
    const records = data.seongsu ? [
      { id: 'first', name: '성수러버', initial: '성', date: '09.18 15:26', created: 2, text: '오늘 성수 팝업 웨이팅 2시간 넘게 걸렸어요. 평일 오전 10시 전에 가는 걸 추천해요. 현장 대기 말고 앱으로 미리 예약하는 게 좋아요. 방문 전에 예약 가능한 시간도 확인해 보세요.', tag: '팝업 웨이팅', photo: true, counts: [86, 41, 7, 3] },
      { id: 'second', name: '한강러너', initial: '한', date: '09.18 14:02', created: 1, text: '주말 오후에는 주변 골목까지 사람이 많아요.', counts: [], compact: true },
    ] : [
      { id: 'first', name: '현지 기록자', initial: '현', date: '편집 예시', created: 2, text: data.summary || `${data.title}에 관한 현지 기록 예시입니다.`, tag: data.category || '', photo: !!data.image, counts: [2, 1, 0, 0] },
      { id: 'second', name: '여행자', initial: '여', date: '편집 예시', created: 1, text: '다른 관점의 기록을 더해 보세요.', counts: [], compact: true },
    ];
    return { count: data.seongsu ? 128 : 2, order: 'popular', grid: false, records, scroll: 0, draft: { text: '', tag: '' }, related: undefined, notice: '' };
  }
  window.createTopicDetail = ({ onAction, onChange, onClose, onSelectTopic, mount } = {}) => {
    const dialog = document.createElement('dialog'), composer = document.createElement('dialog');
    dialog.className = 'topic-detail'; dialog.tabIndex = -1; dialog.setAttribute('aria-labelledby', 'topic-title');
    composer.className = 'topic-composer'; composer.setAttribute('aria-label', '새 기록');
    (mount || document.body).append(dialog, composer);
    let state, current, origin, closing = false, closeAnimation, renderVersion = 0;
    const emit = (action, detail = {}) => onAction ? onAction(action, detail) : publish(action, detail);
    const metadata = () => ({ countryId: current.country.id, fixture: current.fixture, topicTitle: current.title });
    const issueSaved = () => window.AllEarthStore?.read?.().issues?.some(item => item.id === current.id);
    const issueActivity = () => window.AllEarthStore?.read?.().issueActivity?.[current.id] || {};
    const commentCount = () => window.AllEarthComments?.getCount?.('issue', current.id) || 0;
    const total = record => record.counts.reduce((sum, count) => sum + count, 0);
    const sortedRecords = () => [...state.records].sort((a, b) => state.order === 'latest' ? b.created - a.created : total(b) - total(a) || b.created - a.created);
    function saveScroll() { const shell = dialog.querySelector('.topic-shell'); if (shell && state) state.scroll = shell.scrollTop; }
    function photoMarkup(record) {
      if (!record.photo) return '';
      return current.image ? `<img class="topic-photo" src="${escape(current.image)}" alt="${escape(current.imageAlt || `${current.title} 관련 이미지`)}" style="object-position:${escape(current.imagePosition || '50% 50%')}">` : '<div class="topic-photo" role="img" aria-label="기록 이미지 예시"></div>';
    }
    function recordMarkup(record) {
      const compact = record.compact && !state.grid;
      return `<article class="topic-record ${compact ? 'topic-compact' : ''}" data-record-id="${record.id}" tabindex="${state.grid ? '0' : '-1'}" ${state.grid ? `role="button" aria-label="${escape(record.name)} 기록 보기"` : ''}>
        <div class="topic-author" ${compact ? `data-topic="expand" role="button" tabindex="0" aria-label="${escape(record.name)} 기록 펼치기" aria-expanded="false"` : ''}><span class="topic-avatar">${escape(record.initial)}</span><strong>${escape(record.name)}</strong><time class="topic-date">${escape(record.date)}</time></div>
        ${compact ? '' : `${photoMarkup(record)}<button class="topic-copy ${record.expanded ? 'is-expanded' : ''}" data-topic="copy" aria-expanded="${!!record.expanded}">${escape(record.text)}</button>
        ${record.tag ? `<span class="topic-tag">${escape(record.tag)}</span>` : ''}
        ${record.counts.length ? `<div class="topic-reactions">${record.counts.map((count, index) => `<button class="topic-reaction" data-topic="reaction" data-record="${record.id}" data-reaction="${index}" aria-pressed="${!!record.votes?.[index]}"><span>${reactionNames[index]}</span><strong>${count}</strong></button>`).join('')}</div>` : ''}`}
      </article>`;
    }
    function sourceMarkup() {
      if (!current.source && !current.imageCredit && !current.publishedDate && !current.why && !current.whatsHappening) return '';
      const source = /^https?:\/\//.test(current.source || '') ? `<p><a href="${escape(current.source)}" target="_blank" rel="noopener noreferrer">${escape(current.sourceName || '원문 보기')} ↗</a></p>` : '';
      return `<details class="topic-source" open><summary>이 화제의 정보</summary>${current.publishedDate ? `<p><strong>게시 일시</strong> ${escape(current.publishedDate)}</p>` : ''}${current.summary ? `<p>${escape(current.summary)}</p>` : ''}${current.why ? `<h3>Why is this buzzing?</h3><p>${escape(current.why)}</p>` : ''}${current.whatsHappening ? `<h3>What’s happening</h3><p>${escape(current.whatsHappening)}</p>` : ''}${current.imageCredit ? `<p>${escape(current.imageCredit)}</p>` : ''}${source}${current.exampleStatus || current.example ? `<p>${escape(current.exampleStatus || '편집 예시')} · 실시간 뉴스가 아닙니다.</p>` : ''}</details>`;
    }
    function relatedMarkup() {
      if (state.related === undefined) state.related = window.AllEarthIssues?.related?.(current, current.topics || [], new URLSearchParams(location.search).get('related')) || [];
      const related = state.related;
      if (!related.length) return '';
      return `<aside class="topic-related" aria-label="관련 이슈"><h2>${related.length > 1 ? '관련·다음 이슈' : '다음 이슈'}</h2>${related.map((item, index) => `<button type="button" data-topic="related" data-issue-id="${escape(item.id)}"><span>${related.length === 1 || index ? '다음 이슈' : '관련 이슈'}</span><strong>${escape(item.title)}</strong><i>${item.example ? '편집 예시' : escape(item.category || '이슈')}</i></button>`).join('')}</aside>`;
    }
    function engagementMarkup() {
      const activity = issueActivity(), badges = current.badges || [];
      const badge = badges.includes('Rising') ? 'Rising' : badges.includes('Hot') ? 'Hot' : badges.includes('Today') ? 'Today' : '';
      return `<footer class="topic-engagement"><p class="topic-action-notice" role="status">${escape(state.notice || '')}</p><button type="button" data-topic="like" aria-pressed="${!!activity.liked}"><span>${activity.liked ? '♥' : '♡'}</span> 좋아요 <strong>${Number(activity.likes) || 0}</strong></button><button type="button" data-topic="comments"><span>○</span> 댓글 <strong>${commentCount()}</strong></button>${badge ? `<span class="topic-detail-badge">${badge}</span>` : ''}</footer>`;
    }
    function render({ preserveScroll = true, focus, reveal = false } = {}) {
      if (preserveScroll) saveScroll();
      const version = ++renderVersion, initial = current.seongsu ? '성' : current.country.name.slice(0, 1), headerBadge = current.badges?.includes('Rising') ? 'Rising' : current.badges?.includes('Hot') ? 'Hot' : current.badges?.includes('Today') ? 'Today' : '';
      dialog.innerHTML = `<div class="topic-shell"><div class="topic-status" aria-hidden="true"><span>9:41</span><img src="${icon('home-status.svg')}" alt=""></div>
        <nav class="topic-nav"><button class="topic-icon-button" data-topic="back" aria-label="뒤로"><img src="${icon('topic/back.svg')}" alt=""></button><span class="topic-nav-actions"><button class="topic-icon-button" data-topic="save" aria-label="이슈 저장" aria-pressed="${issueSaved()}"><img src="${icon('issue/star.svg')}" alt=""></button><button class="topic-icon-button" data-topic="add" aria-label="새 기록"><img src="${icon('issue/add.svg')}" alt=""></button></span></nav>
        <header class="topic-head"><p class="topic-breadcrumb">${escape(current.country.name)}${current.seongsu ? ' / 서울' : current.category ? ` / ${escape(current.category)}` : ''}${headerBadge ? `<span class="topic-header-badge">${headerBadge}</span>` : ''}</p><div class="topic-title-row"><img src="${icon('home-map-circle.svg')}" alt=""><h1 id="topic-title">${escape(current.title)}</h1></div>
        <div class="topic-meta"><span class="topic-members" aria-hidden="true"><i class="topic-avatar">${escape(initial)}</i><i class="topic-avatar">${escape(initial)}</i><i class="topic-avatar">${escape(initial)}</i></span><strong class="topic-member-count">${state.count}개의 기록</strong>${current.seongsu ? `<span class="topic-live"><img src="${icon('topic/live-dot.svg')}" alt="">12분 전 업데이트</span>` : ''}</div></header>
        <div class="topic-toolbar"><div class="topic-tabs" role="group" aria-label="기록 정렬"><button class="topic-tab" data-topic="sort" data-order="popular" aria-pressed="${state.order === 'popular'}">화제순</button><button class="topic-tab" data-topic="sort" data-order="latest" aria-pressed="${state.order === 'latest'}">최신순</button></div><button class="topic-icon-button" data-topic="grid" aria-label="${state.grid ? '목록' : '격자'} 보기"><span class="${state.grid ? 'topic-list-icon' : 'topic-grid-icon'}" aria-hidden="true"><i></i><i></i><i></i><i></i></span></button></div>
        <section class="topic-feed ${state.grid ? 'is-grid' : ''}" aria-label="기록">${sortedRecords().map(recordMarkup).join('')}${sourceMarkup()}${relatedMarkup()}</section>${engagementMarkup()}</div>`;
      requestAnimationFrame(() => {
        if (version !== renderVersion) return;
        dialog.querySelector('.topic-shell').scrollTop = state.scroll;
        const target = focus && dialog.querySelector(focus); target?.focus({ preventScroll: true });
        if (reveal) target?.scrollIntoView({ block: 'nearest' });
      });
    }
    function openComposer() {
      composer.innerHTML = `<form novalidate><header><button type="button" class="topic-icon-button" data-compose="cancel" aria-label="취소"><img src="${icon('issue/close.svg')}" alt=""></button><h2>새 기록</h2><span class="topic-icon-button" aria-hidden="true"></span></header><label for="topic-text">기록</label><textarea id="topic-text" maxlength="500" placeholder="지금의 이야기를 남겨 주세요">${escape(state.draft.text)}</textarea><label for="topic-tag">태그 (선택)</label><input id="topic-tag" maxlength="30" value="${escape(state.draft.tag)}" placeholder="예: 팝업 웨이팅"><p class="topic-note">미리보기 안에만 추가되며, 새로고침하면 사라집니다.</p><p class="topic-error" role="alert"></p><button class="topic-submit" type="submit">미리보기에 추가</button></form>`;
      composer.showModal(); composer.querySelector('#topic-text').focus();
    }
    function closeComposer() {
      if (!composer.open) return;
      state.draft = { text: composer.querySelector('#topic-text').value, tag: composer.querySelector('#topic-tag').value };
      composer.close(); dialog.querySelector('[data-topic="add"]')?.focus({ preventScroll: true });
    }
    function close() {
      if (!dialog.open || closing) return;
      saveScroll(); closing = true;
      const done = () => { dialog.close(); closing = false; onChange?.(false, metadata()); onClose?.(); origin?.focus?.({ preventScroll: true }); };
      if (matchMedia('(prefers-reduced-motion: reduce)').matches) done();
      else {
        closeAnimation = dialog.animate([{ opacity: 1, transform: 'translateY(0)' }, { opacity: 0, transform: 'translateY(10px)' }], { duration: 180, easing: 'ease-out', fill: 'forwards' });
        closeAnimation.finished.then(() => { closeAnimation.cancel(); done(); }, () => {});
      }
    }
    function showRecord(id) { state.records.find(record => record.id === id).compact = false; state.grid = false; render({ focus: `[data-record-id="${id}"]`, reveal: true }); }
    dialog.addEventListener('scroll', event => { if (event.target.matches('.topic-shell')) saveScroll(); }, true);
    dialog.addEventListener('click', event => {
      const card = event.target.closest('.topic-record');
      if (state.grid && card) { showRecord(card.dataset.recordId); emit('topic.view', { view: 'list' }); return; }
      const button = event.target.closest('[data-topic]'); if (!button) return;
      const action = button.dataset.topic;
      if (action === 'back') return close();
      if (action === 'add') return openComposer();
      if (action === 'save') {
        const result = window.AllEarthStore?.toggleSavedIssue?.({ id: current.id, title: current.title, countryId: current.country.id, fixture: current.fixture });
        state.notice = result?.ok ? (result.saved ? '저장했어요.' : '저장을 해제했어요.') : (result?.message || '저장하지 못했어요. 다시 시도해 주세요.');
        render({ focus: '[data-topic="save"]' }); emit(result?.ok ? 'topic.saved' : 'topic.save_failed', { saved: result?.saved });
      }
      if (action === 'like') {
        if (window.AllEarthStore?.read?.().account?.loggedIn === false) { state.notice = '좋아요는 로그인 후 이용할 수 있어요.'; render({ focus: '[data-topic="like"]' }); emit('topic.like_requires_login'); return; }
        const result = window.AllEarthStore?.perform?.('like-issue', () => {
          window.AllEarthStore.update(data => { data.issueActivity ||= {}; const row = data.issueActivity[current.id] ||= { liked: false, likes: 0, events: [] }; row.events ||= []; row.liked = !row.liked; row.likes = Math.max(0, (Number(row.likes) || 0) + (row.liked ? 1 : -1)); if (row.liked) { row.ownLikeAt=Date.now(); row.events.push({type:'like',created:row.ownLikeAt}); } else { row.events=row.events.filter(event=>!(event.type==='like'&&event.created===row.ownLikeAt)); delete row.ownLikeAt; } });
          return window.AllEarthStore.read().issueActivity[current.id];
        });
        state.notice = result?.ok ? '' : (result?.message || '좋아요를 반영하지 못했어요. 다시 시도해 주세요.'); render({ focus: '[data-topic="like"]' }); emit(result?.ok ? 'topic.liked' : 'topic.like_failed', { liked: result?.value?.liked });
      }
      if (action === 'comments') {
        const control = button; if (!window.AllEarthComments?.open) { state.notice = '댓글을 열 수 없어요. 다시 시도해 주세요.'; render({ focus: '[data-topic="comments"]' }); return; }
        saveScroll(); window.AllEarthComments.open({ kind: 'issue', id: current.id, origin: control, onChange: () => { const before = state.scroll; render({ preserveScroll: false, focus: '[data-topic="comments"]' }); state.scroll = before; } }); emit('topic.comments', { issueId: current.id });
      }
      if (action === 'sort') { state.order = button.dataset.order; render({ focus: `[data-order="${state.order}"]` }); emit('topic.sort', { order: state.order }); }
      if (action === 'grid') { state.grid = !state.grid; render({ focus: '[data-topic="grid"]' }); emit('topic.view', { view: state.grid ? 'grid' : 'list' }); }
      if (action === 'related') {
        const next = (current.topics || []).find(item => item.id === button.dataset.issueId);
        if (!next) return;
        onSelectTopic?.(current.country.id, next.id);
        emit('topic.related', { countryId: current.country.id, issueId: next.id });
      }
      if (action === 'reaction') {
        const record = state.records.find(item => item.id === button.dataset.record), index = Number(button.dataset.reaction);
        record.votes ||= {}; record.votes[index] = !record.votes[index]; record.counts[index] += record.votes[index] ? 1 : -1;
        render({ focus: `[data-record="${record.id}"][data-reaction="${index}"]` }); emit('topic.reaction', { reaction: reactionNames[index], selected: record.votes[index] });
      }
      if (action === 'copy') { const record = state.records.find(item => item.id === card.dataset.recordId); record.expanded = !record.expanded; render({ focus: `[data-record-id="${record.id}"] [data-topic="copy"]` }); }
      if (action === 'expand') showRecord(card.dataset.recordId);
    });
    dialog.addEventListener('keydown', event => { if ((event.key === 'Enter' || event.key === ' ') && event.target.matches('[data-topic="expand"],.topic-record[tabindex="0"]')) { event.preventDefault(); event.target.click(); } });
    dialog.addEventListener('cancel', event => { event.preventDefault(); close(); });
    composer.addEventListener('click', event => { if (event.target.closest('[data-compose="cancel"]')) closeComposer(); });
    composer.addEventListener('cancel', event => { event.preventDefault(); closeComposer(); });
    composer.addEventListener('input', () => { composer.querySelector('.topic-error').textContent = ''; });
    composer.addEventListener('submit', event => {
      event.preventDefault();
      const text = composer.querySelector('#topic-text').value.trim(), tag = composer.querySelector('#topic-tag').value.trim();
      if (!text) { composer.querySelector('.topic-error').textContent = '기록 내용을 입력해 주세요.'; composer.querySelector('#topic-text').focus(); return; }
      const sequence = ++recordSequence, id = `own-${sequence}`;
      state.records.push({ id, name: '나', initial: '나', date: '방금', text, tag, counts: [0, 0, 0, 0], created: sequence });
      state.count++; state.order = 'latest'; state.grid = false; state.draft = { text: '', tag: '' };
      composer.close(); render({ focus: `[data-record-id="${id}"]`, reveal: true }); emit('topic.post_added', { hasTag: !!tag });
    });
    return {
      open(options = {}) {
        saveScroll(); closeAnimation?.cancel(); closing = false; current = normalize(options);
        const key = current.id;
        state = states.get(key) || initialState(current); states.set(key, state); origin = options.origin || document.activeElement;
        render({ preserveScroll: false }); if (!dialog.open) dialog.showModal();
        if (onChange) onChange(true, metadata()); else emit('screen.ready', metadata());
        dialog.focus({ preventScroll: true });
      }, close,
    };
  };
  document.addEventListener('DOMContentLoaded', () => {
    if (!document.getElementById('topic-standalone')) return;
    const params = new URLSearchParams(location.search), requested = params.get('country');
    const country = (window.AllEarthGeo?.countries || []).find(item => item.id === requested) || korea;
    const requestedIssue = params.get('topic') || params.get('issue');
    const savedIssue = window.AllEarthStore?.read?.().issues?.find(item => item.id === requestedIssue);
    const fixture = params.get('fixture') === 'barcelona' || !!savedIssue?.fixture;
    const baseTopic = requested ? window.AllEarthTopics?.topics?.[country.id] : undefined;
    const requestedTitle = requestedIssue?.startsWith(`${country.id}:`) ? requestedIssue.slice(country.id.length + 1) : '';
    let selectedTopic = fixture ? { ...barcelona, id: `${country.id}:${barcelona.title}`, fixture: true }
      : savedIssue ? { ...(baseTopic || {}), id: savedIssue.id, title: savedIssue.title, summary: baseTopic?.title === savedIssue.title ? baseTopic.summary : "저장한 이슈의 편집 예시입니다." }
      : requestedTitle ? { ...(baseTopic?.title === requestedTitle ? baseTopic : {}), id: requestedIssue, title: requestedTitle, summary: baseTopic?.title === requestedTitle ? baseTopic.summary : "선택한 이슈의 편집 예시입니다." }
      : baseTopic;
    let availableTopics = standaloneTopics(country, selectedTopic);
    selectedTopic ||= availableTopics[0];
    const destination = params.get('return') === 'my-history'
      ? 'my.html?screen=history'
      : params.get('return') === 'saved'
        ? 'saved.html?tab=content'
        : `home.html?view=issue${params.get('pins') === 'flags' ? '&pins=flags' : ''}`;
    const record = item => window.AllEarthStore?.recordHistory?.({ type: 'issue', id: `${country.id}:${item.title}`, title: item.title, countryId: country.id, fixture: !!item.fixture, visited: Date.now() });
    const detail = window.createTopicDetail({
      onClose: () => { location.href = destination; },
      onSelectTopic: (_countryId, issueId) => {
        const next = availableTopics.find(item => item.id === issueId); if (!next) return;
        selectedTopic = next; record(next);
        detail.open({ country, topic: next, fixture: !!next.fixture, topics: availableTopics, origin: document.body });
      },
    });
    if (selectedTopic) record(selectedTopic);
    detail.open({ country, topic: selectedTopic, fixture: !!selectedTopic?.fixture, topics: availableTopics, origin: document.body });
  });
})();
