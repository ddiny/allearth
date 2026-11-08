const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { staticServer, browserSession, TEMP } = require('./verify-my-navigation.cjs');

const goodImage = path.join(TEMP, 'feed-good.png');
const brokenImage = path.join(TEMP, 'feed-broken.png');

function post(id, own, images=[]) {
  return { id, name:own?'Aegungi':'다른사람', initial:own?'A':'다', region:'성수동', text:id+' 본문', tag:'QA',
    views:1, likes:0, savedCount:0, comments:0, reactionCount:0, created:Date.now(), saved:false,
    liked:false, reaction:null, commentList:[], own, images, image:null };
}

async function seed(page) {
  const images=Array.from({length:12},(_,index)=>({name:`${index}.svg`,src:'assets/examples/park.svg'}));
  await page.goto('feed.html');
  await page.evaluate(`(()=>{sessionStorage.clear();const app=AllEarthStore.read();app.account.loggedIn=true;app.countries=[];AllEarthStore.update(s=>Object.assign(s,app));AllEarthStore.setFeed({region:'World',view:'list',sort:'hot',tab:'feed',mode:'summary',history:[],summaryScroll:0,fullScroll:0,records:${JSON.stringify([post('other',false,images),post('mine',true)])},initialized:true});location.reload()})()`);
  await page.waitFor(`document.querySelectorAll('.feed-card').length===2`,'seeded Feed');
}

async function feedLocationCancel(page) {
  await page.click('[data-action="location"]');
  assert.ok(await page.evaluate(`!!document.querySelector('[data-action="randomRegion"]')`),'no Saved countries uses the non-GPS random fallback');
  await page.click('[data-action="randomRegion"]');assert.ok(await page.evaluate(`!document.querySelector('.random-retry').hidden`),'random selection exposes retry');
  await page.click('.location-picker [data-region="프랑스"]');await page.evaluate(`history.back()`);
  await page.waitFor(`!document.querySelector('.location-picker')`,'Feed location browser-back cancel');
  assert.equal(await page.evaluate(`AllEarthStore.getFeed().region`),'World','temporary Feed location does not alter the applied query');
}

async function composerLocationAndImages(page) {
  await page.click('[data-action="compose"]');
  await page.setValue('#post-text','World 작성 초안');await page.setValue('#post-tag','WorldQA');
  assert.equal(await page.evaluate(`document.querySelector('#post-region').value`),'','World query starts as explicit null');
  await page.click('[data-action="composeLocation"]');
  assert.equal(await page.evaluate(`document.querySelector('.location-current strong').textContent`),'World','null picker explores from World without committing it');
  await page.click('.location-picker [data-action="applyRegion"]');
  assert.deepEqual(await page.evaluate(`({text:document.querySelector('#post-text').value,tag:document.querySelector('#post-tag').value,region:document.querySelector('#post-region').value,enabled:!document.querySelector('.composer-page [type=submit]').disabled})`),{text:'World 작성 초안',tag:'WorldQA',region:'World',enabled:true},'World applies as a valid value and draft survives');

  await page.click('[data-action="composeLocation"]');await page.click('.location-picker [data-region="성수동"]');await page.evaluate(`history.back()`);await page.waitFor(`!document.querySelector('.location-picker') && !!document.querySelector('.composer-page')`,'location browser-back cancel');
  assert.equal(await page.evaluate(`document.querySelector('#post-region').value`),'World','location cancel discards only temporary choice');

  await page.setFiles('#post-images',[goodImage,brokenImage]);
  await page.waitFor(`document.querySelectorAll('.composer-image').length===1`,'one successful decode');
  assert.match(await page.evaluate(`document.querySelector('.composer-error').textContent`),/1개 이미지를 읽지 못해 제외/);
  assert.equal(await page.evaluate(`document.querySelector('#post-text').value`),'World 작성 초안','decode failure keeps draft');
  await page.evaluate(`history.back()`);await page.waitFor(`!!document.querySelector('.confirm')`,'browser back asks before discarding dirty composer');
  await page.click('.confirm [data-action="closeLayer"]');
  assert.equal(await page.evaluate(`document.querySelector('#post-text').value`),'World 작성 초안','continue-writing keeps the draft and restores one history marker');
  await page.evaluate(`history.back()`);await page.waitFor(`!!document.querySelector('.confirm')`,'second browser back asks once');await page.click('.confirm [data-action="confirm"]');
  await page.waitFor(`!document.querySelector('.composer-page')`,'browser-back discard closes composer');
  assert.equal(await page.evaluate(`!!history.state?.allearthComposer`),false,'composer marker is removed instead of trapping later navigation');
}

async function gallery(page) {
  await page.click('[data-id="other"]');
  await page.waitFor(`document.querySelector('.feed-full [data-id="other"]')`,'full post');
  const result=await page.evaluate(`({images:document.querySelectorAll('[data-id="other"] .post-images img').length,dots:document.querySelectorAll('[data-id="other"] .gallery-dots span').length})`);
  assert.deepEqual(result,{images:10,dots:5},'display is capped at ten images and indicator window at five dots');
}

async function commentsIntegration(page) {
  await page.click('[data-id="other"] [data-action="comment"]');
  await page.waitFor(`document.querySelector('[data-id="other"] [data-field="draft"]')`,'Feed comments mount');
  await page.setValue('[data-id="other"] [data-field="draft"]','렌더 뒤에도 남는 댓글 초안');
  await page.click('[data-id="other"] [data-action="like"]');
  await page.waitFor(`document.querySelector('[data-id="other"] [data-field="draft"]')?.value==='렌더 뒤에도 남는 댓글 초안'`,'comment draft after Feed rerender');
  await page.click('[data-id="other"] .aec-submit');
  await page.waitFor(`AllEarthComments.getCount('post','other')===1`,'comment count sync');
  assert.equal(await page.evaluate(`AllEarthStore.posts().find(post=>post.id==='other').comments`),1,'shared comments update the Feed record without a stale render overwrite');
  await page.setValue('[data-id="other"] [data-field="draft"]','저장 정렬 이동 뒤 초안');
  await page.click('[data-id="other"] [data-action="save"]');await page.waitFor(`document.querySelector('[data-id="other"] [data-field="draft"]')?.value==='저장 정렬 이동 뒤 초안'`,'draft after save render');
  await page.click('[data-action="sort"][data-sort="new"]');await page.waitFor(`document.querySelector('[data-id="other"] [data-field="draft"]')?.value==='저장 정렬 이동 뒤 초안'`,'draft after sort render');
  await page.goto('saved.html');await page.waitFor(`!!document.querySelector('.app-nav')`,'Saved navigation');await page.goto('feed.html');
  await page.waitFor(`document.querySelector('[data-id="other"] [data-field="draft"]')?.value==='저장 정렬 이동 뒤 초안'`,'draft after page navigation');
}

async function reportFailure(page) {
  await page.goto('feed.html?post=other&fail=report');await page.waitFor(`document.querySelector('[data-id="other"] [data-action="more"]')`,'other full post');
  await page.click('[data-id="other"] [data-action="more"]');
  await page.click('.report-form input[value="기타"]');await page.setValue('.report-form textarea','실패 후에도 남아야 하는 구체 사유');await page.click('.report-form [type="submit"]');
  await page.waitFor(`document.querySelector('.report-error').textContent.includes('유지')`,'report failure');
  assert.deepEqual(await page.evaluate(`({reason:document.querySelector('.report-form input:checked').value,details:document.querySelector('.report-form textarea').value})`),{reason:'기타',details:'실패 후에도 남아야 하는 구체 사유'},'report failure retains reason and details');
  await page.click('.report-form [type="submit"]');await page.waitFor(`!document.querySelector('.report-form')`,'report retry');
}

async function deleteFailure(page) {
  await page.goto('feed.html?post=mine&fail=post-delete');await page.waitFor(`document.querySelector('[data-id="mine"] [data-action="more"]')`,'own full post');
  await page.click('[data-id="mine"] [data-action="more"]');await page.click('[data-action="delete"]');await page.click('[data-action="confirmDelete"]');
  await page.waitFor(`document.querySelector('.delete-error').textContent.length>0`,'delete failure');
  assert.equal(await page.evaluate(`AllEarthStore.posts().some(post=>post.id==='mine')`),true,'failed delete preserves post');
  assert.equal(await page.evaluate(`document.querySelector('[data-action="confirmDelete"]').disabled`),false,'delete retry is enabled');
  await page.click('[data-action="confirmDelete"]');await page.waitFor(`!AllEarthStore.posts().some(post=>post.id==='mine')`,'delete retry succeeds');
}

async function main() {
  fs.mkdirSync(TEMP,{recursive:true});
  fs.writeFileSync(goodImage,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64'));
  fs.writeFileSync(brokenImage,'not a decodable png');
  const {server,port}=await staticServer();let page;
  try {
    page=await browserSession(`http://127.0.0.1:${port}/`);await seed(page);
    await feedLocationCancel(page);await composerLocationAndImages(page);await gallery(page);await commentsIntegration(page);await reportFailure(page);await deleteFailure(page);
    assert.deepEqual(page.errors,[],`browser/runtime errors:\n${page.errors.join('\n')}`);
    console.log('PASS: Feed World/null location, temporary cancel/draft, partial image decode, gallery cap/dots, shared comments, report retention and delete retry');
  } finally {await page?.close();await new Promise(resolve=>server.close(resolve));}
}

if(require.main===module)main().catch(error=>{console.error(`FAIL: ${error.stack||error}`);process.exitCode=1;});
