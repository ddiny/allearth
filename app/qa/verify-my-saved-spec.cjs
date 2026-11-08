const assert=require('node:assert/strict');
const fs=require('node:fs');
const {
  TEMP,TINY_IMAGE,BAD_IMAGE,WIDTHS,staticServer,browserSession,fixture,
}=require('./verify-my-navigation.cjs');

async function install(page,data,target='my.html'){
  await page.goto('my.html');
  await page.evaluate(`sessionStorage.clear();sessionStorage.setItem('allearth.app.v1',${JSON.stringify(JSON.stringify(data.app))});sessionStorage.setItem('allearth.feed.v2',${JSON.stringify(JSON.stringify(data.feed))});true`);
  await page.goto(target);
}

function post(id,saved=false,savedAt=0){return {id,name:'테스터',initial:'테',region:'성수동',text:`본문 ${id}`,tag:`태그${id}`,views:1,likes:0,savedCount:saved?1:0,comments:0,reactionCount:0,created:Date.now(),saved,savedAt:saved?savedAt:null,liked:false,reaction:null,reactionCounts:[0,0,0,0],commentList:[],own:false};}

async function storeLimit(page){
  const base=fixture();base.app.countries=Array.from({length:12},(_,i)=>({id:`c${i}`,name:`국가${i}`}));base.app.issues=[];base.feed.records=Array.from({length:101},(_,i)=>post(`limit-${i}`,i<99,1000-i));
  await install(page,base);
  let result=await page.evaluate(`(()=>{const S=AllEarthStore;const before=S.savedContentCount(),hundred=S.toggleSavedPost('limit-99'),blocked=S.toggleSavedPost('limit-100');return{before,hundred,blocked,count:S.savedContentCount(),countries:S.read().countries.length}})()`);
  assert.equal(result.before,99);assert.deepEqual([result.hundred.ok,result.count,result.countries],[true,100,12]);assert.equal(result.blocked.ok,false);assert.match(result.blocked.message,/최대 100개/,'101st saved content blocked while countries excluded');
  result=await page.evaluate(`(()=>{const S=AllEarthStore;const released=S.toggleSavedPost('limit-0'),allowed=S.toggleSavedPost('limit-100');return{released,allowed,count:S.savedContentCount()}})()`);
  assert.deepEqual([result.released.ok,result.allowed.ok,result.count],[true,true,100],'unsave frees one slot');
  await page.evaluate(`(()=>{const S=AllEarthStore;const f=S.getFeed();f.records.forEach(p=>{p.saved=false;p.savedAt=null;p.savedCount=0});for(let i=0;i<99;i++){f.records[i].saved=true;f.records[i].savedAt=1000-i;f.records[i].savedCount=1}S.setFeed(f);S.update(s=>{s.issues=[{id:'kr:합산 이슈',title:'합산 이슈',countryId:'kr'}]});return true})()`);
  result=await page.evaluate(`({count:AllEarthStore.savedContentCount(),blocked:AllEarthStore.toggleSavedPost('limit-100')})`);
  assert.equal(result.count,100);assert.equal(result.blocked.ok,false,'issues share the 100-item limit');
}

async function savedUi(page){
  const data=fixture();await install(page,data,'saved.html?tab=content');await page.waitFor(`document.querySelectorAll('.saved-card').length===3`,'Saved content cards');
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('.saved-card')].map(x=>x.dataset.id)`),['own-one','kr:저장 이슈','outside'],'Saved order uses data-id/savedAt');
  await page.evaluate(`document.querySelector('#saved-content-tab').focus();document.querySelector('#saved-content-tab').dispatchEvent(new KeyboardEvent('keydown',{key:'ArrowLeft',bubbles:true}));true`);
  await page.waitFor(`document.querySelector('#saved-countries-tab').getAttribute('aria-selected')==='true' && document.activeElement.id==='saved-countries-tab'`,'Saved ArrowLeft tab');
  await page.evaluate(`document.querySelector('#saved-countries-tab').dispatchEvent(new KeyboardEvent('keydown',{key:'End',bubbles:true}));true`);
  await page.waitFor(`document.querySelector('#saved-content-tab').getAttribute('aria-selected')==='true' && document.activeElement.id==='saved-content-tab'`,'Saved End tab');
  await page.click('[data-action="remove-post"][data-id="outside"]');assert.ok(await page.evaluate(`!AllEarthStore.posts().find(p=>p.id==='outside').saved && !document.querySelector('[data-id="outside"]')`),'remove-post updates shared store');
  await page.click('[data-action="remove-issue"][data-id="kr:저장 이슈"]');assert.ok(await page.evaluate(`!AllEarthStore.read().issues.some(x=>x.id==='kr:저장 이슈')`),'remove-issue');
  await page.click('#saved-countries-tab');await page.click('[data-action="remove-country"][data-id="kr"]');assert.ok(await page.evaluate(`!AllEarthStore.read().countries.some(x=>x.id==='kr')`),'remove-country');
  await page.goto('saved.html?tab=countries&state=empty');assert.deepEqual(await page.evaluate(`[document.querySelector('.saved-empty h2').textContent,document.querySelector('.saved-empty p').textContent]`),['아직 저장한 나라가 없어요','Earth의 나라 시트에서 별표를 눌러 저장해 보세요.']);
  await page.goto('saved.html?tab=content&state=empty');assert.deepEqual(await page.evaluate(`[document.querySelector('.saved-empty h2').textContent,document.querySelector('.saved-empty p').textContent]`),['아직 저장한 게시글이 없어요','Feed나 이슈에서 저장하면 여기에 모여요.']);
  await install(page,fixture(),'saved.html?tab=content&state=error');await page.waitFor(`!!document.querySelector('.saved-error')`,'Saved error fixture');await page.click('[data-action="retry"]');await page.waitFor(`!new URL(location.href).searchParams.has('state') && !!document.querySelector('.saved-card')`,'Saved retry');
}

async function feedReport(page){
  await install(page,fixture(),'feed.html?post=outside&fail=report');await page.waitFor(`!!document.querySelector('[data-id="outside"] [data-action="more"]')`,'outside full post');await page.click('[data-id="outside"] [data-action="more"]');await page.waitFor(`!!document.querySelector('.report-form')`,'report form');
  assert.equal(await page.evaluate(`document.querySelector('.report-form [data-action="edit"]')`),null,'other users never expose edit');
  await page.click('.report-form input[type="radio"]');await page.click('.report-form [type="submit"]');await page.waitFor(`document.querySelector('.report-error').textContent.includes('처리하지 못했어요')`,'report failure');
  assert.equal(await page.evaluate(`document.querySelector('.report-form input:checked')?.value`),'스팸 또는 광고','report reason retained');await page.click('.report-form [type="submit"]');await page.waitFor(`!document.querySelector('.report-form') && AllEarthStore.read().reports.some(r=>r.postId==='outside'&&r.reason==='스팸 또는 광고')`,'report retry');
  await page.goto('feed.html?post=own-one');await page.waitFor(`!!document.querySelector('[data-id="own-one"] [data-action="more"]')`,'own full post');await page.click('[data-id="own-one"] [data-action="more"]');assert.ok(await page.evaluate(`!!document.querySelector('[data-action="edit"]')&&!!document.querySelector('[data-action="delete"]')&&!document.querySelector('.report-form')`),'own menu is edit/delete, not report');
}

async function myPresentation(page){
  await install(page,fixture(),'my.html?view=grid');await page.waitFor(`document.querySelectorAll('.own-tile').length===2`,'My grid');
  assert.ok(await page.evaluate(`[...document.querySelectorAll('.own-tile')].every(x=>x.querySelector('.post-tag')&&x.querySelector('.grid-stats')?.textContent.includes('조회')&&x.querySelector('.grid-stats')?.textContent.includes('반응'))`),'grid tag and stats');
  const sizes=await page.evaluate(`[...document.querySelectorAll('.compose-icon,.grid-menu,.app-nav a')].map(x=>{const r=x.getBoundingClientRect();return[Math.round(r.width),Math.round(r.height)]})`);assert.ok(sizes.every(([w,h])=>w>=44&&h>=44),`representative touch targets ${JSON.stringify(sizes)}`);
  await page.click('[data-action="nickname"]');await page.setValue('#nickname-input','취소될이름');await page.click('[data-action="modal-close"]');assert.equal(await page.evaluate(`document.querySelector('.profile-name').textContent`),'Aegungi','nickname popup cancel');
  await page.goto('my.html?state=empty');assert.equal(await page.evaluate(`document.querySelector('.empty-tile').textContent`),'당신의 동네에는 무슨일이 벌어지고 있나요, 이슈를 공유해보세요.');
  await page.evaluate(`AllEarthStore.update(s=>s.history=[])`);await page.goto('my.html');await page.click('[data-action="history"]');assert.equal(await page.evaluate(`document.querySelector('.empty').textContent`),'아직 본 콘텐츠가 없어요.');
}

async function myIframeComposer(page){
  await install(page,fixture(),'my.html');await page.waitFor(`!!document.querySelector('[data-action="compose"]')`,'My composer trigger');await page.click('[data-action="compose"]');
  await page.waitFor(`(()=>{const f=document.querySelector('.my-composer-frame');return location.pathname.endsWith('/my.html')&&f?.src.includes('embed=my')&&f.contentDocument?.querySelector('.composer-page')})()`,'My iframe composer');
  const sheet=await page.evaluate(`(()=>{const r=document.querySelector('.my-composer-sheet').getBoundingClientRect();return{height:r.height,viewport:innerHeight}})()`);assert.ok(sheet.height<=760&&sheet.height<=sheet.viewport*.91,`bottom sheet height ${JSON.stringify(sheet)}`);
  const inside=expression=>page.evaluate(`document.querySelector('.my-composer-frame').contentWindow.eval(${JSON.stringify(expression)})`);
  await inside(`(()=>{for(const [s,v] of [['#post-text','MY iframe 작성'],['#post-region','성수동'],['#post-tag','iframe']]){const n=document.querySelector(s);n.value=v;n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}))}return !document.querySelector('.composer-page [type=submit]').disabled})()`);
  assert.equal(await page.evaluate(`location.pathname`),'/my.html','parent URL remains My while composing');await inside(`document.querySelector('.composer-page [type=submit]').click()`);await page.waitFor(`!document.querySelector('.my-composer-sheet')&&document.body.innerText.includes('MY iframe 작성')`,'iframe completion closes sheet and refreshes My');assert.ok(await page.evaluate(`AllEarthStore.posts().some(p=>p.own&&p.text==='MY iframe 작성')`));
}

async function authFailureRetry(page){
  await install(page,fixture(),'my.html?screen=settings&fail=logout');await page.waitFor(`!!document.querySelector('[data-action="logout"]')`,'logout setting');await page.click('[data-action="logout"]');
  const busy=await page.evaluate(`(()=>{const b=document.querySelector('[data-action="logout-ok"]');b.click();b.click();return b.disabled})()`);assert.equal(busy,true,'logout blocks duplicate confirmation while processing');await page.waitFor(`document.querySelector('.action-error')?.textContent.includes('로그아웃하지 못했어요')`,'logout failure');assert.equal(await page.evaluate(`AllEarthStore.read().account.loggedIn`),true,'logout failure keeps account');await page.click('[data-action="logout-ok"]');await page.waitFor(`location.pathname.endsWith('/index.html')&&new URL(location.href).searchParams.get('scenario')==='existing'`,'logout retry success');await page.goto('my.html');await page.waitFor(`!!document.querySelector('.auth')`,'logout guest My');assert.equal(await page.evaluate(`AllEarthStore.read().account.loggedIn`),false);

  await install(page,fixture(),'my.html?screen=settings&fail=withdraw');await page.click('[data-action="withdraw"]');const withdrawBusy=await page.evaluate(`(()=>{const b=document.querySelector('[data-action="withdraw-ok"]');b.click();b.click();return b.disabled})()`);assert.equal(withdrawBusy,true,'withdraw blocks duplicate confirmation while processing');await page.waitFor(`document.querySelector('.action-error')?.textContent.includes('회원탈퇴하지 못했어요')`,'withdraw failure');assert.ok(await page.evaluate(`AllEarthStore.read().account.loggedIn&&AllEarthStore.posts().some(p=>p.own)`),'withdraw failure keeps account data');await page.click('[data-action="withdraw-ok"]');await page.waitFor(`location.pathname.endsWith('/index.html')&&new URL(location.href).searchParams.get('scenario')==='existing'`,'withdraw retry success');await page.goto('my.html');await page.waitFor(`!!document.querySelector('.auth')`,'withdraw guest My');assert.ok(await page.evaluate(`!AllEarthStore.read().account.loggedIn&&!AllEarthStore.posts().some(p=>p.own)`));
}

async function homeAndDetail(page){
  await page.viewport(390);await install(page,fixture(),'home.html?country=kr&view=issue');await page.waitFor(`document.querySelector('.country-issue')?.open && document.querySelector('.country-issue')?.dataset.motion==='open' && document.querySelectorAll('[data-issue-topic]').length>=3`,'country issue list',10000);await page.evaluate(`Promise.allSettled(document.getAnimations({subtree:true}).map(a=>a.finished)).then(()=>new Promise(r=>setTimeout(r,500)))`);await page.screenshot('final-country-issues-390.png');
  const info=await page.evaluate(`({count:document.querySelectorAll('[data-issue-topic]').length,time:document.querySelector('#issue-time').textContent,rank:document.querySelector('#issue-rank-copy').textContent})`);assert.ok(info.count>=3&&info.count<=5);assert.match(info.time,/서울/);assert.match(info.rank,/편집 예시|위/);
  const before=await page.evaluate(`document.querySelector('#issue-topic-title').textContent`);await page.evaluate(`document.querySelectorAll('[data-issue-topic]')[1].click()`);await page.waitFor(`document.querySelector('#issue-topic-title').textContent!==${JSON.stringify(before)}`,'select another country issue');const selected=await page.evaluate(`document.querySelector('#issue-topic-title').textContent`);await page.click('[data-issue="detail"]');await page.waitFor(`document.querySelector('.topic-detail')?.open && document.querySelector('#topic-title').textContent===${JSON.stringify(selected)}`,'selected topic detail');
  await page.evaluate(`(()=>{const s=document.querySelector('.topic-shell');s.scrollTop=s.scrollHeight;return true})()`);await page.evaluate(`Promise.allSettled(document.getAnimations({subtree:true}).map(a=>a.finished)).then(()=>new Promise(r=>setTimeout(r,500)))`);await page.screenshot('final-related-issues-390.png');const relatedBefore=await page.evaluate(`document.querySelector('#topic-title').textContent`);await page.click('[data-topic="related"]');await page.waitFor(`document.querySelector('#topic-title').textContent!==${JSON.stringify(relatedBefore)}`,'related/next issue transition');

  const countryData=fixture();await install(page,countryData,'saved.html?tab=countries');await page.waitFor(`!!document.querySelector('.saved-country-card[data-id="kr"] a')`,'saved country');await page.click('.saved-country-card[data-id="kr"] a');await page.waitFor(`location.pathname.endsWith('/home.html')&&document.querySelector('.country-issue')?.open`,'Saved country sheet');await page.click('[data-issue="close"]');await page.waitFor(`location.pathname.endsWith('/saved.html')`,'close country returns Saved');

  const issueData=fixture();issueData.app.issues=[{id:'kr:정확한 저장 이슈',title:'정확한 저장 이슈',countryId:'kr',savedAt:999}];await install(page,issueData,'saved.html?tab=content');await page.click('.saved-issue-card[data-id="kr:정확한 저장 이슈"] a');await page.waitFor(`location.pathname.endsWith('/topic.html')&&document.querySelector('#topic-title')?.textContent==='정확한 저장 이슈'`,'Saved issue exact title restore');const standaloneTitle=await page.evaluate(`document.querySelector('#topic-title').textContent`);await page.click('[data-topic="related"]');await page.waitFor(`document.querySelector('#topic-title').textContent!==${JSON.stringify(standaloneTitle)}`,'standalone related issue');assert.equal(await page.evaluate(`AllEarthStore.read().history[0].title`),await page.evaluate(`document.querySelector('#topic-title').textContent`),'related issue updates history');await page.click('[data-topic="back"]');await page.waitFor(`location.pathname.endsWith('/saved.html')&&new URL(location.href).searchParams.get('tab')==='content'`,'standalone related keeps Saved close destination');
}

async function responsiveShots(page){
  for(const width of WIDTHS){await install(page,fixture(),'my.html?view=grid');await page.viewport(width);await page.waitFor(`!!document.querySelector('.own-grid')`,'My screenshot '+width);assert.ok(await page.evaluate(`document.documentElement.scrollWidth<=innerWidth`),'My no overflow '+width);await page.screenshot(`spec-my-grid-${width}.png`);await page.goto('saved.html?tab=content');await page.waitFor(`!!document.querySelector('.saved-grid')`,'Saved screenshot '+width);assert.ok(await page.evaluate(`document.documentElement.scrollWidth<=innerWidth`),'Saved no overflow '+width);await page.screenshot(`spec-saved-${width}.png`);}
}

async function main(){
  fs.mkdirSync(TEMP,{recursive:true});fs.writeFileSync(TINY_IMAGE,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64'));fs.writeFileSync(BAD_IMAGE,'not an image');
  const {server,port}=await staticServer();let page;
  try{page=await browserSession(`http://127.0.0.1:${port}/`);if(process.env.ALLEARTH_QA_ONLY==='home'){await homeAndDetail(page);assert.deepEqual(page.errors,[],`browser/runtime errors:\n${page.errors.join('\n')}`);console.log('PASS: Home country issues and related/detail evidence captures');return;}await storeLimit(page);await savedUi(page);await feedReport(page);await myPresentation(page);await myIframeComposer(page);await authFailureRetry(page);await homeAndDetail(page);await responsiveShots(page);assert.deepEqual(page.errors,[],`browser/runtime errors:\n${page.errors.join('\n')}`);console.log('PASS: My/Saved Figma spec, 100 limit, Saved tabs/states, report retry, iframe composer, auth retry, Home issues/detail/return, 320/390/430');}
  finally{await page?.close();await new Promise(resolve=>server.close(resolve));}
}

main().catch(error=>{console.error(`FAIL: ${error.stack||error}`);process.exitCode=1;});
