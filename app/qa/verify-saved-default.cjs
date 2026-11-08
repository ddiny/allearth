const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {APP,staticServer,browserSession,fixture}=require('./verify-my-navigation.cjs');

async function fresh(page,base='') {
  await page.goto(base+'my.html');
  await page.evaluate('AllEarthStore.reset()');
  await page.goto(base+'saved.html');
  await page.waitFor("document.querySelectorAll('.saved-post-card').length===3",'default Saved content');
  assert.equal(await page.evaluate("document.querySelector('#saved-content-tab').getAttribute('aria-selected')"),'true');
  await page.waitFor("[...document.querySelectorAll('.saved-post-image')].every(i=>i.complete&&i.naturalWidth>0)",'local sample images');
}

(async()=>{
  const {server,port}=await staticServer();let page;
  try{
    page=await browserSession('http://127.0.0.1:'+port+'/');await page.viewport(390);
    await fresh(page);await page.screenshot('saved-default-content-390.png');
    await page.click('#saved-countries-tab');assert.equal(await page.evaluate("document.querySelectorAll('.saved-country-card').length"),3);
    await page.goto('saved.html');assert.equal(await page.evaluate("document.querySelector('#saved-countries-tab').getAttribute('aria-selected')"),'true','later visits retain the chosen tab');
    await page.click('#saved-content-tab');await page.click('.saved-card-link');
    await page.waitFor("location.pathname.endsWith('/feed.html')&&!!document.querySelector('[data-action=back]')",'Saved card detail');
    await page.click('[data-action=back]');await page.waitFor("location.pathname.endsWith('/saved.html')&&document.querySelectorAll('.saved-post-card').length===3",'return to populated Saved');
    for(let i=0;i<3;i++)await page.click('[data-action=remove-post]');
    await page.goto('saved.html');assert.equal(await page.evaluate('AllEarthStore.savedContentCount()'),0,'unsaved samples are not resurrected');assert.ok(await page.evaluate("!!document.querySelector('.saved-empty')"));
    const existing=fixture();await page.evaluate(`sessionStorage.setItem('allearth.app.v1',${JSON.stringify(JSON.stringify(existing.app))});sessionStorage.setItem('allearth.feed.v2',${JSON.stringify(JSON.stringify(existing.feed))})`);
    await page.goto('saved.html');assert.deepEqual(await page.evaluate("[...document.querySelectorAll('.saved-card')].map(n=>n.dataset.id)"),['own-one','kr:저장 이슈','outside'],'existing content is preserved without extra samples');
    await page.goto('my.html?reset=1');await page.goto('saved.html?state=empty');assert.equal(await page.evaluate('AllEarthStore.savedContentCount()'),0,'empty fixture remains empty');
    await page.goto('saved.html?state=error');assert.ok(await page.evaluate("!!document.querySelector('.saved-error')"));assert.equal(await page.evaluate('AllEarthStore.savedContentCount()'),0);
    await page.goto('my.html?screen=loggedout');await page.goto('saved.html');assert.ok(await page.evaluate("!!document.querySelector('.saved-login')"));assert.equal(await page.evaluate('AllEarthStore.savedContentCount()'),0,'guest does not seed');
    await page.click('.saved-login');await page.waitFor("document.querySelectorAll('.saved-post-card').length===3",'login reveals default content');
    await page.goto('my.html?reset=1');await page.goto('preview.html');await page.click('[data-group=saved]');
    await page.waitFor("document.querySelector('#app-preview').contentDocument?.querySelectorAll('.saved-post-card').length===3",'preview Saved shows content immediately');
    const fileBase=pathToFileURL(APP+path.sep).href;await fresh(page,fileBase);
    await page.click('[data-action=remove-post]');await page.goto(fileBase+'saved.html');assert.equal(await page.evaluate("document.querySelectorAll('.saved-post-card').length"),2,'file mode keeps unsave state');
    assert.deepEqual(page.errors,[]);
    console.log('PASS: Saved default content, images, tab/detail return, preserve existing/unsaved/empty/error/guest states, preview and file://');
  } finally {await page?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
