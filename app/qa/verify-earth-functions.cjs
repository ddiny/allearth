const assert = require('node:assert/strict');
const { staticServer, browserSession } = require('./verify-my-navigation.cjs');

async function searchAndSheet(page) {
  await page.goto('home.html?searchFixture=error');
  await page.waitFor(`!!window.AllEarthIssues && document.querySelector('#country-search')`, 'Earth modules');
  const ranking = await page.evaluate(`(()=>{const now=Date.now(),country=AllEarthGeo.countries.find(x=>x.id==='kr'),primary=AllEarthTopics.topics.kr,id='kr:'+primary.title;AllEarthStore.update(s=>{s.issueActivity[id]={events:[{type:'like',created:now-4*3600000},{type:'save',created:now-4*3600000},{type:'like',created:now-3600000},{type:'save',created:now-3600000},{type:'like',created:now-3600000},{type:'save',created:now-3600000},{type:'like',created:now-3600000},{type:'comment-like',created:now-3600000}],likes:99};});const activity=AllEarthStore.read().issueActivity[id];return {windowed:AllEarthIssues.reactionsInWindow(activity,now-24*3600000,now),configured:AllEarthIssues.badgeCandidates(country,primary,{increaseRate:1,minimumReactions:3,newMinimumReactions:3},{now,asOfDate:AllEarthTopics.date}).find(x=>x.id===id)?.badges||[],unset:AllEarthIssues.badgeCandidates(country,primary,undefined,{now,asOfDate:AllEarthTopics.date}).find(x=>x.id===id)?.badges||[]};})()`);
  assert.equal(ranking.windowed, 7, '24h window excludes comment likes and lifetime aggregate');
  assert.ok(ranking.configured.includes('Rising'), `configured 3h thresholds enable Rising: ${JSON.stringify(ranking)}`);
  assert.ok(!ranking.unset.includes('Rising'), 'unset Rising thresholds stay hidden');
  await page.setValue('#country-search', '대한');
  await page.waitFor(`document.querySelector('.home-search-state')?.textContent.includes('불러오지 못했')`, 'search error');
  assert.equal(await page.evaluate(`document.querySelector('#country-search').value`), '대한', 'error preserves query');
  await page.click('.home-search-retry');
  await page.waitFor(`document.querySelector('.home-result-group button')`, 'search retry');
  await page.click('.home-result-group button');
  await page.waitFor(`document.querySelector('.country-issue')?.open`, 'country sheet');
  assert.equal(await page.evaluate(`document.querySelector('.country-issue').dataset.mode`), 'full', 'country search opens Full');
  await page.click('.issue-grabber');
  assert.equal(await page.evaluate(`document.querySelector('.country-issue').dataset.mode`), 'half', 'handle collapses to Half');
  const candidate = await page.evaluate(`({count:document.querySelectorAll('#issue-topic-list > li').length,ids:[...document.querySelectorAll('[data-issue-topic]')].map(x=>x.dataset.issueTopic),badges:[...document.querySelectorAll('#issue-topic-list small')].map(x=>x.textContent.split('·')[0].trim())})`);
  assert.ok(candidate.count > 0 && candidate.count <= 5, 'candidate union returns actual count up to five');
  assert.equal(new Set(candidate.ids).size, candidate.ids.length, 'candidate IDs are de-duplicated');
  assert.ok(candidate.ids.every(id => id.startsWith('kr:')), 'stable country:title IDs are retained');
}

async function randomAndIssueSearch(page) {
  await page.click('[data-issue="close"]');
  await page.waitFor(`!document.querySelector('.country-issue')?.open`, 'sheet close');
  await page.click('[data-action="random"]');
  await page.waitFor(`document.querySelector('.country-issue')?.open`, 'first random');
  const first = await page.evaluate(`document.querySelector('#globe-stage').dataset.selectedId`);
  assert.equal(await page.evaluate(`document.querySelector('.country-issue').dataset.mode`), 'half', 'random opens Half');
  await page.click('[data-issue="close"]'); await page.waitFor(`!document.querySelector('.country-issue')?.open`, 'first close');
  await page.click('[data-action="random"]'); await page.waitFor(`document.querySelector('.country-issue')?.open`, 'second random');
  const second = await page.evaluate(`document.querySelector('#globe-stage').dataset.selectedId`);
  assert.notEqual(second, first, 'random retry chooses a different country');
  await page.click('[data-issue="close"]'); await page.waitFor(`!document.querySelector('.country-issue')?.open`, 'second close');
  await page.setValue('#country-search', '문화');
  await page.waitFor(`document.querySelector('.home-search-retry')`, 'new-query fixture error');
  await page.click('.home-search-retry');
  await page.waitFor(`document.querySelector('[data-search-issue]')`, 'issue keyword results');
  await page.click('[data-search-issue]');
  await page.waitFor(`document.querySelector('.topic-detail')?.open`, 'issue result direct detail');
}

async function engagementAndRelated(page) {
  const id = await page.evaluate(`document.querySelector('.topic-detail [data-topic="save"]') && document.querySelector('#topic-title').textContent`);
  assert.ok(id, 'detail keeps existing content UI');
  await page.click('.topic-detail [data-topic="save"]');
  assert.equal(await page.evaluate(`document.querySelector('.topic-detail [data-topic="save"]').getAttribute('aria-pressed')`), 'true', 'issue save is connected');
  assert.equal(await page.evaluate(`(()=>{const state=AllEarthStore.read(),id=state.issues.at(-1)?.id;window.__savedIssueId=id;return (state.issueActivity[id]?.events||[]).filter(e=>e.type==='save').length})()`), 1, 'saved issue has one atomic save event');
  await page.click('.topic-detail [data-topic="save"]');
  assert.equal(await page.evaluate(`document.querySelector('.topic-detail [data-topic="save"]').getAttribute('aria-pressed')`), 'false', 'issue unsave is connected');
  assert.equal(await page.evaluate(`(AllEarthStore.read().issueActivity[window.__savedIssueId]?.events||[]).filter(e=>e.type==='save').length`), 0, 'unsave removes the matching activity event');
  const relatedBefore = await page.evaluate(`[...document.querySelectorAll('.topic-related button')].map(x=>x.dataset.issueId)`);
  const before = await page.evaluate(`Number(document.querySelector('.topic-detail [data-topic="like"] strong').textContent)`);
  await page.click('.topic-detail [data-topic="like"]');
  assert.equal(await page.evaluate(`Number(document.querySelector('.topic-detail [data-topic="like"] strong').textContent)`), before + 1, 'issue like increments');
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('.topic-related button')].map(x=>x.dataset.issueId)`), relatedBefore, 'related random selection is cached during detail rerenders');
  await page.click('.topic-detail [data-topic="comments"]');
  await page.waitFor(`document.querySelector('.aec-overlay')`, 'shared comments');
  assert.equal(await page.evaluate(`document.querySelector('.aec-overlay')?.getAttribute('aria-label')`), '댓글', 'issue uses shared comments sheet');

  await page.goto('topic.html?country=kr&related=one');
  await page.waitFor(`document.querySelector('.topic-detail')?.open`, 'one related');
  assert.equal(await page.evaluate(`document.querySelectorAll('.topic-related button').length`), 1, 'one candidate shows next only');
  assert.equal(await page.evaluate(`document.querySelector('.topic-related button span')?.textContent`), '다음 이슈');
  await page.goto('topic.html?country=kr&related=zero');
  await page.waitFor(`document.querySelector('.topic-detail')?.open`, 'zero related');
  assert.equal(await page.evaluate(`document.querySelector('.topic-related')`), null, 'zero candidates hides the section');
  const randomSelections = await page.evaluate(`(()=>{const topic={id:'kr:current',title:'current',countryId:'kr'},rows=['a','b','c','d'].map(x=>({id:'kr:'+x,title:x}));return new Set(Array.from({length:12},()=>AllEarthIssues.related(topic,rows).map(x=>x.id).join('|'))).size})()`);
  assert.ok(randomSelections > 1, 'related selection is genuinely randomized across detail sessions');
}

async function failures(page) {
  await page.goto('home.html?view=issue&country=ca&issues=error');
  await page.waitFor(`document.querySelector('.issue-load-state')?.textContent.includes('불러오지 못했')`, 'country issue failure');
  assert.equal(await page.evaluate(`document.querySelector('#issue-country-name').textContent`), '캐나다', 'failure retains country');
  await page.click('.issue-load-state button');
  await page.waitFor(`document.querySelectorAll('#issue-topic-list > li').length>0`, 'country retry');

  await page.goto('topic.html?country=kr&fail=like-issue');
  await page.waitFor(`document.querySelector('.topic-detail [data-topic="like"]')`, 'like failure detail');
  const before = await page.evaluate(`Number(document.querySelector('[data-topic="like"] strong').textContent)`);
  await page.click('[data-topic="like"]');
  assert.equal(await page.evaluate(`Number(document.querySelector('[data-topic="like"] strong').textContent)`), before, 'failed like rolls back');
  assert.match(await page.evaluate(`document.querySelector('.topic-action-notice').textContent`), /다시 시도/);
  await page.click('[data-topic="like"]');
  assert.equal(await page.evaluate(`Number(document.querySelector('[data-topic="like"] strong').textContent)`), before + 1, 'like retry succeeds');

  await page.goto('topic.html?country=kr&previewAuth=out');
  await page.waitFor(`document.querySelector('.topic-detail [data-topic="like"]')`, 'guest detail');
  const guestBefore = await page.evaluate(`JSON.stringify(AllEarthStore.read().issueActivity)`);
  await page.click('[data-topic="like"]');
  assert.equal(await page.evaluate(`JSON.stringify(AllEarthStore.read().issueActivity)`), guestBefore, 'guest like does not mutate activity');
  assert.match(await page.evaluate(`document.querySelector('.topic-action-notice').textContent`), /로그인/);
}

async function main() {
  const { server, port } = await staticServer(); let page;
  try {
    page = await browserSession(`http://127.0.0.1:${port}/`);
    await searchAndSheet(page); await randomAndIssueSearch(page); await engagementAndRelated(page); await failures(page);
    assert.deepEqual(page.errors, [], `browser/runtime errors:\n${page.errors.join('\n')}`);
    console.log('PASS: Earth search, Half/Full, distinct random, candidates, engagement/comments, related exceptions and rollback/retry');
  } finally { await page?.close(); await new Promise(resolve => server.close(resolve)); }
}

if (require.main === module) main().catch(error => { console.error(`FAIL: ${error.stack || error}`); process.exitCode = 1; });
