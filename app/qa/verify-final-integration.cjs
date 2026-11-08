const assert=require('node:assert/strict');
const path=require('node:path');
const {pathToFileURL}=require('node:url');
const {APP,staticServer,browserSession}=require('./verify-my-navigation.cjs');
async function settle(page){await page.evaluate('Promise.allSettled(document.getAnimations().filter(a=>a.effect.getComputedTiming().iterations!==Infinity).map(a=>a.finished))');}

async function physicalClick(page,selector){
  const hit=await page.evaluate(`(()=>{const n=document.querySelector(${JSON.stringify(selector)}),r=n.getBoundingClientRect(),x=r.left+r.width/2,y=r.top+r.height/2;return{x,y,hit:n.contains(document.elementFromPoint(x,y))}})()`);
  assert.equal(hit.hit,true,`pointer reaches ${selector}`);
  for(const type of ['mousePressed','mouseReleased'])await page.cdp.send('Input.dispatchMouseEvent',{type,x:hit.x,y:hit.y,button:'left',clickCount:1});
}
(async()=>{
  const {server,port}=await staticServer();let page;
  try{
    page=await browserSession(`http://127.0.0.1:${port}/`);await page.viewport(390);
    await page.goto('topic.html?country=kr');await page.waitFor("document.querySelector('.topic-detail')?.open",'real issue detail');
    await page.click('[data-topic=comments]');await page.waitFor("document.querySelector('.aec-overlay')?.open",'native comments above native issue');
    await physicalClick(page,'.aec-overlay textarea');
    assert.equal(await page.evaluate("document.activeElement===document.querySelector('.aec-overlay textarea')"),true);
    await page.cdp.send('Input.insertText',{text:'이슈에서 직접 입력한 댓글'});
    await physicalClick(page,'.aec-submit');
    await page.waitFor("document.querySelector('.topic-engagement [data-topic=comments] strong')?.textContent==='1'",'real issue count callback');
    await settle(page);await page.screenshot('final-v8-issue-comments-390.png');
    await page.click('.aec-dialog-head [data-action=close-modal]');await page.waitFor("!document.querySelector('.aec-overlay')&&!history.state?.allearthComments",'close returns native issue');
    assert.equal(await page.evaluate("document.querySelector('.topic-detail').open"),true);
    for(const width of [320,430]){
      await page.viewport(width);await page.click('[data-topic=comments]');await page.waitFor("document.querySelector('.aec-overlay')?.open",'responsive comments');
      await physicalClick(page,'.aec-overlay textarea');
      assert.ok(await page.evaluate('document.documentElement.scrollWidth<=innerWidth'),'comments no page overflow');
      await settle(page);await page.screenshot(`final-v8-issue-comments-${width}.png`);
      await page.click('.aec-dialog-head [data-action=close-modal]');await page.waitFor("!document.querySelector('.aec-overlay')&&!history.state?.allearthComments",'responsive close');
    }
    await page.viewport(390);await page.goto(pathToFileURL(path.join(APP,'topic.html')).href+'?country=kr');
    await page.waitFor("document.querySelector('.topic-detail')?.open",'file issue');await page.click('[data-topic=comments]');
    await page.waitFor("document.querySelector('.aec-overlay')?.open",'file native comments');await physicalClick(page,'.aec-overlay textarea');
    await page.cdp.send('Input.insertText',{text:'파일 실행 초안'});await page.click('.aec-dialog-head [data-action=close-modal]');
    await page.waitFor("!document.querySelector('.aec-overlay')&&!history.state?.allearthComments",'file close');await page.click('[data-topic=comments]');
    assert.equal(await page.evaluate("document.querySelector('.aec-overlay textarea').value"),'파일 실행 초안');
    assert.deepEqual(page.errors,[]);
    console.log('PASS: actual issue native comments physical clicks/typing/submission/count/close, 320/390/430 geometry and file:// draft');
  }finally{await page?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
