(() => {
  'use strict';
  const CACHE_MS = 3 * 60 * 60 * 1000;
  const memory = new Map();
  const params = () => new URLSearchParams(location.search);
  const normalized = value => String(value || '').toLocaleLowerCase().normalize('NFKC').replace(/[\s._'-]/g, '');
  const stableId = (countryId, title) => `${countryId}:${title}`;
  const hash = value => [...String(value)].reduce((sum, char) => ((sum * 31) + char.charCodeAt(0)) >>> 0, 2166136261);
  const shuffled = (rows, seed) => rows.slice().sort((a, b) => hash(`${seed}:${a.id}`) - hash(`${seed}:${b.id}`));
  const cacheKey = countryId => `allearth.issue.candidates.${countryId}`;
  function readCache(countryId) {
    if (memory.has(countryId)) return memory.get(countryId);
    try { const value = JSON.parse(sessionStorage.getItem(cacheKey(countryId)) || 'null'); if (value) memory.set(countryId, value); return value; } catch (_) { return null; }
  }
  function writeCache(countryId, value) {
    memory.set(countryId, value);
    try { sessionStorage.setItem(cacheKey(countryId), JSON.stringify(value)); } catch (_) {}
  }

  function examples(country) {
    return [
      { title: `${country.name}의 문화·일상 이야기`, summary: '현지의 문화와 일상을 살펴보는 편집 예시입니다.', category: '문화·일상' },
      { title: `${country.name}에서 나누는 여행 팁`, summary: '여행자가 남긴 지역의 작은 팁을 모아 보는 편집 예시입니다.', category: '여행' },
      { title: `${country.name}의 지역 커뮤니티`, summary: '지역의 대화 주제를 안내하는 편집 예시입니다.', category: '커뮤니티' },
    ].map((item, index) => ({ ...item, id: stableId(country.id, item.title), countryId: country.id, example: true, exampleStatus: '편집 예시', candidateDate: window.AllEarthTopics?.date || '', badges: index < 2 ? ['Today'] : [] }));
  }

  function normalizeTopic(country, topic, options = {}) {
    if (!topic?.title) return null;
    const dataDate = window.AllEarthTopics?.date || '';
    const result = {
      ...topic,
      id: stableId(country.id, topic.title),
      countryId: country.id,
      example: topic.example !== false,
      exampleStatus: topic.exampleStatus || '편집 예시',
      public: topic.public !== false,
      accessible: topic.accessible !== false,
    };
    const badges = new Set(Array.isArray(topic.badges) ? topic.badges : []);
    if ((topic.publishedDate || topic.candidateDate) === dataDate) badges.add('Today');
    if (options.primary && !topic.publishedDate) {
      result.candidateDate = dataDate;
      badges.add('Today');
    }
    result.badges = [...badges].filter(badge => ['Hot', 'Rising', 'Today'].includes(badge));
    return result;
  }

  const eligibleEvent = event => ['like', 'save', 'parent-comment', 'reply'].includes(event?.type);
  function reactionsInWindow(activity = {}, from = 0, to = Date.now()) {
    // Only timestamped eligible events can enter a time window. Lifetime aggregates are not treated as 24h data.
    return (activity.events || []).filter(event => eligibleEvent(event) && Number(event.created) >= from && Number(event.created) < to).length;
  }
  function reactionTotal(activity = {}) {
    // Comment likes and unrelated record reactions are deliberately excluded.
    return ['likes', 'saves', 'parentComments', 'replies'].reduce((sum, key) => sum + Math.max(0, Number(activity[key]) || 0), 0);
  }

  function issueActivity(id) {
    const state = window.AllEarthStore?.read?.() || {}, row = state.issueActivity?.[id] || {};
    const comments = (state.commentThreads?.[`issue:${id}`]?.comments || []).filter(item => !item.deleted);
    const parentComments = comments.filter(item => !item.parentId), replies = comments.filter(item => item.parentId);
    const nonCommentEvents = (row.events || []).filter(event => !['parent-comment', 'reply'].includes(event?.type));
    const commentEvents = comments.map(item => ({ type: item.parentId ? 'reply' : 'parent-comment', created: Number(item.created) || 0 }));
    return {
      ...row,
      saves: state.issues?.some(item => item.id === id) ? 1 : 0,
      parentComments: parentComments.length,
      replies: replies.length,
      events: [...nonCommentEvents, ...commentEvents],
    };
  }

  function allForCountry(country, primary) {
    const rows = [];
    const first = normalizeTopic(country, primary, { primary: true });
    if (first) rows.push(first);
    examples(country).forEach(item => rows.push(normalizeTopic(country, item)));
    const unique = new Map();
    rows.forEach(item => { if (item && !unique.has(item.id)) unique.set(item.id, item); });
    return [...unique.values()];
  }

  function badgeCandidates(country, primary, risingConfig, options = {}) {
    const rows = allForCountry(country, primary);
    const now = Number(options.now) || Date.now(), hour = 60 * 60 * 1000;
    const hot = rows.map(item => ({ item, score: reactionsInWindow(issueActivity(item.id), now - 24 * hour, now) }))
      .filter(row => row.score > 0).sort((a, b) => b.score - a.score).slice(0, 5).map(row => ({ ...row.item, badges: [...new Set([...row.item.badges, 'Hot'])] }));
    const todayKey = options.asOfDate || new Date(now).toLocaleDateString('en-CA');
    const today = rows.filter(item => (item.publishedDate || item.candidateDate) === todayKey).slice(0, 5).map(item => ({ ...item, badges: [...new Set([...item.badges, 'Today'])] }));
    // No business values are invented: all three Rising thresholds must be explicitly configured.
    const configured = risingConfig?.increaseRate > 0 && risingConfig?.minimumReactions > 0 && risingConfig?.newMinimumReactions > 0;
    const rising = configured ? rows.map(item => {
      const activity = issueActivity(item.id), recent = reactionsInWindow(activity, now - 3 * hour, now), previous = reactionsInWindow(activity, now - 6 * hour, now - 3 * hour);
      const qualifies = previous === 0 ? recent >= risingConfig.newMinimumReactions : recent >= risingConfig.minimumReactions && ((recent - previous) / previous) >= risingConfig.increaseRate;
      return { item, recent, qualifies };
    }).filter(row => row.qualifies).sort((a, b) => b.recent - a.recent).slice(0, 5).map(row => ({ ...row.item, badges: [...new Set([...row.item.badges, 'Rising'])] })) : [];
    const union = new Map();
    [...hot, ...rising, ...today].forEach(item => {
      const previous = union.get(item.id);
      const badges = [...new Set([...(previous?.badges || []), ...item.badges])];
      if (badges.includes('Rising') && badges.includes('Hot')) badges.splice(badges.indexOf('Hot'), 1);
      union.set(item.id, { ...previous, ...item, badges });
    });
    return [...union.values()];
  }

  function selectCandidates(country, primary, options = {}) {
    const mode = options.fixture || params().get('issues');
    const key = country.id;
    const cached = readCache(key);
    if (mode === 'loading') return { status: 'loading', countryId: key, items: [] };
    if (mode === 'empty') return { status: 'empty', countryId: key, items: [] };
    if (mode === 'error') return cached ? { ...cached, status: 'stale', stale: true } : { status: 'error', countryId: key, items: [] };
    if (cached && Date.now() - cached.updatedAt < CACHE_MS) return cached;
    const risingConfig = options.risingConfig || window.AllEarthIssueConfig?.rising;
    const candidates = badgeCandidates(country, primary, risingConfig, { now: options.now, asOfDate: options.asOfDate || window.AllEarthTopics?.date });
    const bucket = Math.floor(Date.now() / CACHE_MS);
    const result = { status: candidates.length ? 'ready' : 'empty', countryId: key, items: shuffled(candidates, `${key}:${bucket}`).slice(0, 5), updatedAt: Date.now(), example: true };
    writeCache(key, result);
    return result;
  }

  function search(countries, query, options = {}) {
    const q = normalized(query);
    const mode = options.fixture || params().get('searchFixture');
    if (mode === 'error') return { status: 'error', countries: [], issues: [] };
    if (!q) return { status: 'ready', countries: countries.slice(), issues: [] };
    const countryRows = countries.map(country => {
      const values = [country.name, country.en, country.id, country.iso3, ...(country.aliases || [])].filter(Boolean).map(normalized);
      const score = values.includes(q) ? 0 : values.some(value => value.startsWith(q)) ? 1 : values.some(value => value.includes(q)) ? 2 : 3;
      return { country, score };
    }).filter(row => row.score < 3).sort((a, b) => a.score - b.score).map(row => row.country);
    const issues = [];
    countries.forEach(country => {
      const primary = window.AllEarthTopics?.topics?.[country.id];
      allForCountry(country, primary).forEach(item => {
        const value = normalized(`${item.title} ${item.summary || ''} ${item.category || ''} ${country.name}`);
        if (value.includes(q)) issues.push({ ...item, country });
      });
    });
    return { status: 'ready', countries: countryRows, issues: issues.slice(0, 20) };
  }

  function related(topic, topics, fixture) {
    if (fixture === 'error' || fixture === 'zero') return [];
    let candidates = (topics || []).filter(item => item.id !== topic.id && item.title !== topic.title && item.public !== false && item.accessible !== false);
    candidates = [...new Map(candidates.map(item => [item.id || stableId(topic.countryId, item.title), item])).values()];
    if (fixture === 'one') candidates = candidates.slice(0, 1);
    for (let index = candidates.length - 1; index > 0; index--) {
      const values = new Uint32Array(1); crypto.getRandomValues?.(values);
      const random = crypto.getRandomValues ? values[0] / 4294967296 : Math.random();
      const target = Math.floor(random * (index + 1));
      [candidates[index], candidates[target]] = [candidates[target], candidates[index]];
    }
    return candidates.slice(0, 2);
  }

  window.AllEarthIssues = { CACHE_MS, stableId, examples, normalizeTopic, reactionTotal, reactionsInWindow, allForCountry, badgeCandidates, selectCandidates, search, related, _memory: memory };
})();
