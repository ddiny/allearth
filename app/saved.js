(() => {
  'use strict';
  const app = document.getElementById('saved-app');
  const query = new URLSearchParams(location.search);
  const store = () => window.AllEarthStore;
  if (query.get('reset') === '1') {
    store()?.reset?.();
    query.delete('reset');
    history.replaceState(null, '', `${location.pathname}${query.size ? `?${query}` : ''}`);
  }
  function prepareInitialContent() {
    const current=store().read();
    if (!current.account.loggedIn || query.has('state') || current.saved?.contentPreviewReady) return false;
    // Populate the first normal visit only. Explicitly emptied examples stay empty.
    if (!current.saved?.examplesAdded && store().savedContentCount() === 0) store().addSavedExamples();
    store().update(data => { data.saved = { ...data.saved, contentPreviewReady:true, tab:'content', scroll:0 }; });
    return true;
  }
  prepareInitialContent();
  if (query.has('example')) store().addSavedExamples();
  store().ensureSavedRefs();
  const storedSaved = () => store()?.read?.().saved || {};
  let tab = ['content', 'countries'].includes(query.get('tab')) ? query.get('tab') : (storedSaved().tab || 'content');
  let restoreScroll = Number(storedSaved().scroll || 0);
  let focusTab = null;
  let notice=null, pending=false;
  const esc = value => String(value ?? '').replace(/[&<>"']/g, char => ({ '&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;' }[char]));
  const state = () => store()?.read?.() || { account:{ loggedIn:true }, countries:[], issues:[] };
  const posts = () => (store()?.posts?.() || []).filter(post => post && post.saved);
  const savedTotal = () => state().account.loggedIn ? (store()?.savedContentCount?.() ?? (posts().length + state().issues.length)) : 0;
  const flagId = country => String(country.flag || country.code || country.id || '').toLowerCase().replace(/[^a-z]/g, '');
  const imageFor = post => post.images?.[0]?.src || post.imageUrl || '';
  const postHref = id => `feed.html?tab=saved&post=${encodeURIComponent(id)}&return=saved`;
  const issueHref = issue => `topic.html?country=${encodeURIComponent(issue.countryId)}${issue.fixture ? '&fixture=barcelona' : ''}&issue=${encodeURIComponent(issue.id)}&return=saved`;
  const bookmarkIcon = '<svg viewBox="0 0 24 24" width="16" height="16" aria-hidden="true"><path d="M6 4h12v16l-6-4-6 4V4Z" fill="currentColor" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';
  function removeButton(action, id, label) {
    return `<button class="saved-remove" data-action="${action}" data-id="${esc(id)}" aria-label="${esc(label)}" title="${esc(label)}">${bookmarkIcon}<span>저장 해제</span></button>`;
  }
  function sectionHeading(label, count) {
    return `<div class="saved-section-heading"><h2>${label} <span>${count}</span></h2><p class="saved-order">최근 저장순</p></div>`;
  }

  function empty(title, copy, login = false) {
    return `<section class="saved-empty"><h2>${title}</h2><p>${copy}</p>${login ? '<button class="saved-login" data-action="login">로그인</button>' : `<a class="saved-explore" href="${tab==='countries'?'home.html':'feed.html'}">${tab==='countries'?'Earth에서 나라 둘러보기':'Feed에서 게시글 둘러보기'}</a>`}</section>`;
  }
  function unavailableCard(item) {
    return `<article class="saved-card saved-post-card saved-unavailable" data-id="${esc(item.id)}"><div class="saved-card-link"><div class="saved-post-fallback" aria-hidden="true">—</div><div class="saved-post-info"><p class="saved-post-copy">더 이상 볼 수 없는 콘텐츠예요</p><small>${esc(item.title||'저장한 콘텐츠')}</small><p class="saved-unavailable-copy">삭제되었거나 접근할 수 없어요.</p></div></div>${removeButton(item.kind==='issue'?'remove-issue':'remove-post',item.id,'접근할 수 없는 콘텐츠 저장 해제')}</article>`;
  }
  function postCard(post) {
    const image = imageFor(post);
    const visual = image ? `<img class="saved-post-image" src="${esc(image)}" alt="${esc(post.tag || '게시글')} 이미지">` : `<div class="saved-post-fallback tone-${esc(post.image || 'note')}" aria-hidden="true"></div>`;
    const reactions = Number(post.reactionCount || 0) + Number(post.likes || 0);
    return `<article class="saved-card saved-post-card" data-id="${esc(post.id)}">
      <a href="${postHref(post.id)}" class="saved-card-link" aria-label="${esc(post.name || '사용자')}의 저장한 게시글 열기">
        ${visual}<div class="saved-post-info"><p class="saved-post-copy">${esc(post.text || post.title || '내용을 불러올 수 없어요.')}</p>
        ${post.tag ? `<span class="saved-tag"># ${esc(post.tag)}</span>` : ''}
        <small class="saved-stats"><span>조회 ${Number(post.views || 0).toLocaleString()}</span><span>반응 ${reactions.toLocaleString()}</span></small></div>
      </a>
      ${removeButton('remove-post', post.id, `${post.tag || post.name || '게시글'} 저장 해제`)}
    </article>`;
  }
  function issueCard(issue) {
    return `<article class="saved-card saved-post-card saved-issue-card" data-id="${esc(issue.id)}">
      <a href="${issueHref(issue)}" class="saved-card-link" aria-label="${esc(issue.title)} 이슈 열기">
        <div class="saved-post-fallback tone-earth" aria-hidden="true">ISSUE</div><div class="saved-post-info"><p class="saved-post-copy">${esc(issue.title)}</p><span class="saved-tag">수집 이슈</span><small class="saved-stats">${esc(issue.countryId || '')}</small></div>
      </a>
      ${removeButton('remove-issue', issue.id, `${issue.title} 저장 해제`)}
    </article>`;
  }
  function countryCard(country) {
    const id = flagId(country);
    return `<article class="saved-card saved-country-card" data-id="${esc(country.id)}">
      <a href="home.html?country=${encodeURIComponent(country.id)}&view=issue&return=saved" class="saved-card-link" aria-label="${esc(country.name)} 이슈 보기">
        <span class="saved-flag-wrap">${id ? `<img class="saved-flag" src="assets/flags/${id}.svg" alt="${esc(country.name)} 국기">` : '<span class="saved-flag-fallback" aria-hidden="true">◎</span>'}</span>
        <strong title="${esc(country.name || country.id)}">${esc(country.name || country.id)}</strong>
      </a>
      ${removeButton('remove-country', country.id, `${country.name || country.id} 저장 해제`)}
    </article>`;
  }
  function captureScroll() { restoreScroll = window.scrollY; }
  function render() {
    const s = state(); let body = '';
    if (!s.account.loggedIn) body = empty('Saved를 보려면 로그인해 주세요', '저장한 기록과 나라를 한곳에서 확인할 수 있어요.', true);
    else if (query.get('state') === 'error') body = '<section class="saved-error"><strong>Saved를 불러오지 못했어요.</strong><p>잠시 후 다시 시도해 주세요.</p><button data-action="retry">다시 시도</button></section>';
    else if (query.get('state') === 'empty') body = tab === 'countries' ? empty('아직 저장한 나라가 없어요', 'Earth의 나라 시트에서 별표를 눌러 저장해 보세요.') : empty('아직 저장한 게시글이 없어요', 'Feed나 이슈에서 저장하면 여기에 모여요.');
    else if (tab === 'content') {
      const items = store().getSavedContent();
      body = items.length ? `${sectionHeading('저장한 게시글', items.length)}<section class="saved-grid saved-post-grid">${items.map(item => item.unavailable?unavailableCard(item):item.kind === 'post' ? postCard(item.value) : issueCard(item.value)).join('')}</section>` : empty('아직 저장한 게시글이 없어요', 'Feed나 이슈에서 저장하면 여기에 모여요.');
    } else {
      const countries = [...(s.countries || [])].sort((a, b) => (b.savedAt || 0) - (a.savedAt || 0));
      body = countries.length ? `${sectionHeading('저장한 국가', countries.length)}<section class="saved-grid saved-country-grid">${countries.map(countryCard).join('')}</section>` : empty('아직 저장한 나라가 없어요', 'Earth의 나라 시트에서 별표를 눌러 저장해 보세요.');
    }
    app.innerHTML = `<div class="saved-shell"><header class="saved-header"><div class="saved-status" aria-hidden="true"><span>9:41</span><img src="assets/figma/my-status-indicators.svg" alt=""></div><div class="saved-heading"><h1>Saved</h1><span>게시글 ${savedTotal()} / 100</span></div><div class="saved-tabs" role="tablist" aria-label="Saved 분류"><button id="saved-countries-tab" role="tab" aria-selected="${tab === 'countries'}" aria-controls="saved-panel" tabindex="${tab === 'countries' ? '0' : '-1'}" data-tab="countries">국가</button><button id="saved-content-tab" role="tab" aria-selected="${tab === 'content'}" aria-controls="saved-panel" tabindex="${tab === 'content' ? '0' : '-1'}" data-tab="content">게시글</button></div></header><section id="saved-panel" role="tabpanel" aria-labelledby="saved-${tab}-tab">${body}</section></div>`;
    window.AllEarthShell?.mount('saved');
    if(notice){const message=document.createElement('aside');message.className='saved-notice';message.setAttribute('role','alert');message.innerHTML=`<p>${esc(notice.message)}</p><div><button data-action="retry-action">다시 시도</button><button data-action="dismiss-notice">닫기</button></div>`;app.append(message);}
    app.querySelectorAll('.saved-remove,.saved-login,[data-action="retry-action"]').forEach(button=>{button.disabled=pending;});
    store()?.emit?.('screen.ready', { screen:'saved', tab, state:query.get('state'), example:query.get('example'), loggedIn:!!s.account.loggedIn });
    if (restoreScroll !== null) { const top=restoreScroll;restoreScroll=null;requestAnimationFrame(() => window.scrollTo(0,top)); }
    if (focusTab) { const selected = app.querySelector(`[data-tab="${focusTab}"]`); focusTab = null; selected?.focus({ preventScroll:true }); }
  }
  function updateSavedContext() { store()?.update?.(data => { data.saved = { ...(data.saved || {}), tab, scroll:window.scrollY }; }); }
  function act(action,id) {
    if(pending)return;
    captureScroll();pending=true;notice=null;
    let result;
    try {
      if(action==='login')result=store().perform('login',()=>store().login());
      else if(action==='remove-post')result=store().toggleSavedPost(id);
      else if(action==='remove-country')result=store().toggleSavedCountry(state().countries.find(c=>c.id===id)||{id});
      else if(action==='remove-issue')result=store().toggleSavedIssue(state().issues.find(item=>item.id===id)||{id});
      if(!result?.ok)notice={message:result?.message||'처리하지 못했어요. 다시 시도해 주세요.',action,id};
      else if(action==='login'){if(prepareInitialContent()&&!query.has('tab')){tab='content';restoreScroll=0;}store().ensureSavedRefs();}
    } catch(error){notice={message:error.message||'처리하지 못했어요. 다시 시도해 주세요.',action,id};}
    finally{pending=false;render();}
  }
  app.addEventListener('click', event => {
    const button = event.target.closest('button'); if (!button) return;
    if (button.dataset.tab) { tab = button.dataset.tab; focusTab = tab; restoreScroll = 0; store()?.update?.(data => { data.saved = { ...(data.saved || {}), tab, scroll:0 }; }); return; }
    if (button.dataset.action === 'login') { act('login'); return; }
    if (button.dataset.action === 'retry-action'&&notice) { act(notice.action,notice.id); return; }
    if (button.dataset.action === 'dismiss-notice') { notice=null;captureScroll();render();return; }
    if (button.dataset.action === 'retry') { query.delete('state'); history.replaceState(null, '', `${location.pathname}${query.size ? `?${query}` : ''}`); render(); return; }
    const id = button.dataset.id; if (!id) return;
    if(['remove-post','remove-country','remove-issue'].includes(button.dataset.action))act(button.dataset.action,id);
  });
  app.addEventListener('keydown', event => {
    if (!event.target.matches('[role="tab"]') || !['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
    event.preventDefault(); const buttons = [...app.querySelectorAll('[role="tab"]')];
    const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (buttons.indexOf(event.target) + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
    buttons[next].focus(); buttons[next].click();
  });
  window.addEventListener('allearth:state', () => { if (!focusTab) captureScroll(); render(); });
  window.addEventListener('allearth:beforeNavigate', updateSavedContext);
  window.addEventListener('pagehide', updateSavedContext);
  render();
})();
