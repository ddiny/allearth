const assert = require('node:assert/strict');
const { staticServer, browserSession, seed } = require('./verify-my-navigation.cjs');

(async () => {
  const {server,port}=await staticServer();let page;
  try {
    page=await browserSession(`http://127.0.0.1:${port}/`);await page.viewport(390);await seed(page);
    for(const [tab,action,count] of [['content','remove-post','savedContentCount()'],['countries','remove-country','read().countries.length'],['content','remove-issue','savedContentCount()']]) {
      await page.goto(`saved.html?tab=${tab}&fail=saved-remove`);
      const before=await page.evaluate(`AllEarthStore.${count}`);
      await page.click(`[data-action=${action}]`);
      assert.equal(await page.evaluate(`AllEarthStore.${count}`),before,'failed unsave retains data');
      assert.ok(await page.evaluate(`!!document.querySelector('.saved-notice') && !!document.querySelector('[data-action=${action}]')`),'failed unsave retains visible card and retry');
      await page.click('[data-action=retry-action]');
      assert.equal(await page.evaluate(`AllEarthStore.${count}`),before-1,'retry removes exactly one item');
    }
    await seed(page);
    await page.goto('my.html?view=list&fail=post-delete');
    await page.click('[data-id="own-one"] [data-action="delete"]');await page.click('[data-action=delete-ok]');
    await page.waitFor("!!document.querySelector('.action-error')",'delete failure');
    assert.ok(await page.evaluate("AllEarthStore.posts().some(p=>p.id==='own-one')"));
    await page.click('[data-action=delete-ok]');await page.waitFor("!document.querySelector('.modal')",'delete retry');
    await page.goto('saved.html?tab=content');
    assert.ok(await page.evaluate("!!document.querySelector('[data-id=own-one].saved-unavailable')"),'deleted source remains a Saved tombstone');
    await page.click('[data-id="own-one"] [data-action=remove-post]');
    assert.ok(await page.evaluate("!AllEarthStore.getSavedContent().some(x=>x.id==='own-one')"),'tombstone can be unsaved');

    await seed(page);
    const rollback=await page.evaluate(`(()=>{
      const S=AllEarthStore,beforeApp=JSON.stringify(S.read()),beforeFeed=JSON.stringify(S.getFeed()),original=Storage.prototype.setItem;
      let fail=true;Storage.prototype.setItem=function(key,value){if(key==='allearth.app.v1'&&fail){fail=false;throw new DOMException('quota','QuotaExceededError');}return original.call(this,key,value)};
      const result=S.toggleSavedPost('outside');Storage.prototype.setItem=original;
      return {ok:result.ok,app:JSON.stringify(S.read())===beforeApp,feed:JSON.stringify(S.getFeed())===beforeFeed};
    })()`);
    assert.deepEqual(rollback,{ok:false,app:true,feed:true},'cross-store save failure rolls back post and references');

    await page.goto('my.html?view=list&fail=comment-add');
    await page.click('[data-id="own-one"] [data-action=comment]');
    await page.setValue('.aec-field-row textarea','닫고 이동해도 유지되는 댓글 초안');
    await page.click('.modal > .form-actions [data-action=modal-close]');
    await page.goto('saved.html');await page.goto('my.html?view=list&fail=comment-add');
    await page.click('[data-id="own-one"] [data-action=comment]');
    assert.equal(await page.evaluate("document.querySelector('.aec-field-row textarea').value"),'닫고 이동해도 유지되는 댓글 초안');
    await page.click('.aec-submit');await page.waitFor("!!document.querySelector('.aec-error')",'comment failure');
    assert.equal(await page.evaluate("document.querySelector('.aec-field-row textarea').value"),'닫고 이동해도 유지되는 댓글 초안');
    await page.click('.aec-error button');await page.waitFor("AllEarthStore.posts().find(p=>p.id==='own-one').commentList.some(c=>c.text==='닫고 이동해도 유지되는 댓글 초안')",'comment retry');
    await page.screenshot('functions-my-comments-390.png');
    await page.click('.modal > .form-actions [data-action=modal-close]');
    assert.ok(await page.evaluate("document.querySelector('[data-id=own-one] [data-action=comment]').textContent.includes('2')"),'My count synchronizes');
    await page.goto('saved.html?tab=content');await page.screenshot('functions-saved-390.png');
    await page.evaluate(`(()=>{const S=AllEarthStore,f=S.getFeed(),p=f.records.find(p=>p.saved);f.records=Array.from({length:24},(_,i)=>({...p,id:'scroll-'+i,saved:true,savedAt:Date.now()-i}));S.setFeed(f);S.update(s=>{s.savedRefs=[];s.issues=[]});})()`);
    await page.goto('saved.html?tab=content');
    await page.evaluate('scrollTo(0,900);new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    const beforeScroll=await page.evaluate('scrollY');
    await page.evaluate(`(()=>{window.originalStorageSet=Storage.prototype.setItem;let fail=true;Storage.prototype.setItem=function(key,value){if(key==='allearth.app.v1'&&fail){fail=false;throw new DOMException('quota','QuotaExceededError')}return originalStorageSet.call(this,key,value)}})()`);
    await page.click('[data-action=remove-post]');
    await page.evaluate('new Promise(r=>requestAnimationFrame(()=>requestAnimationFrame(r)))');
    assert.equal(await page.evaluate('AllEarthStore.savedContentCount()'),24,'real storage failure preserves all cards');
    assert.ok(Math.abs(await page.evaluate('scrollY')-beforeScroll)<2,'rollback render preserves nonzero scroll');
    assert.equal(await page.evaluate("document.querySelector('#saved-content-tab').getAttribute('aria-selected')"),'true');
    await page.evaluate('Storage.prototype.setItem=originalStorageSet');
    const activity=await page.evaluate(`(()=>{const S=AllEarthStore,item={id:'kr:activity-qa',title:'activity-qa',countryId:'kr'};S.toggleSavedIssue(item);const saved=S.read().issueActivity[item.id].events.filter(x=>x.type==='save').length;S.toggleSavedIssue(item);return {saved,removed:S.read().issueActivity[item.id].events.filter(x=>x.type==='save').length}})()`);
    assert.deepEqual(activity,{saved:1,removed:0},'Saved issue save/unsave updates activity atomically');
    await page.evaluate('AllEarthStore.logout()');await page.goto('saved.html?tab=countries&fail=login');
    await page.click('.saved-login');
    assert.ok(await page.evaluate("!!document.querySelector('.saved-notice')&&!AllEarthStore.read().account.loggedIn"),'failed login stays gated');
    await page.click('[data-action=retry-action]');
    assert.ok(await page.evaluate("AllEarthStore.read().account.loggedIn&&document.querySelector('#saved-countries-tab').getAttribute('aria-selected')==='true'"),'login retry returns to selected Saved tab');
    await page.goto('my.html?section=nickname&fail=nickname');
    await page.setValue('#nickname-input','재시도닉네임');await page.click('[data-action=save-name]');
    assert.ok(await page.evaluate("document.querySelector('.field-error').textContent.includes('저장하지 못했어요')&&document.querySelector('#nickname-input').value==='재시도닉네임'"),'nickname failure keeps input');
    await page.click('[data-action=save-name]');
    assert.ok(await page.evaluate("!document.querySelector('.modal')&&AllEarthStore.read().account.nickname==='재시도닉네임'"),'nickname retry succeeds once');
    assert.deepEqual(page.errors,[]);
    console.log('PASS: Saved post/country/issue unsave failure + retry, My delete failure + retry, deleted source tombstone, atomic storage rollback, My comment draft navigation/failure/retry/count');
  } finally {await page?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
