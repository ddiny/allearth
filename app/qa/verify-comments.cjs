const assert = require('node:assert/strict');
const path = require('node:path');
const { staticServer, browserSession, delay } = require('./verify-my-navigation.cjs');

const APP = path.resolve(__dirname, '..');

async function main() {
  const { server, port } = await staticServer();
  let page;
  try {
    page = await browserSession(`http://127.0.0.1:${port}/`);
    await page.goto('feed.html?reset=1&fail=comment-add');
    await page.evaluate(`new Promise((resolve,reject)=>{const css=document.createElement('link');css.rel='stylesheet';css.href='comments.css';document.head.append(css);const script=document.createElement('script');script.src='comments.js';script.onload=resolve;script.onerror=reject;document.head.append(script)})`);
    await page.waitFor(`!!window.AllEarthComments`, 'comments module');

    const now = Date.now();
    const fixture = {
      id: 'comments-qa', name: 'Aegungi', initial: 'A', region: '성수동', text: '댓글 QA',
      tag: 'QA', views: 0, likes: 0, savedCount: 0, reactionCount: 0, created: now,
      comments: 18, own: true, commentList: [
        { id: 'p1', parentId: null, name: 'Aegungi', own: true, text: '답글이 있는 내 댓글', created: now - 50_000, likes: 1 },
        { id: 'p2', parentId: null, name: '다른사용자', own: false, text: '인기 댓글', created: now - 10_000, likes: 8 },
        ...Array.from({ length: 12 }, (_, index) => ({ id: `r${index + 1}`, parentId: 'p1', name: `답글${index + 1}`, own: false, text: `답글 본문 ${index + 1}`, created: now - index * 1_000, likes: index % 3 })),
      ],
    };
    await page.evaluate(`(()=>{const feed=AllEarthStore.getFeed();feed.records=[${JSON.stringify(fixture)},{id:'legacy-order',name:'Aegungi',own:true,comments:2,commentList:['먼저 쓴 댓글','나중에 쓴 댓글']}];AllEarthStore.setFeed(feed);const host=document.createElement('div');host.id='comments-test';host.style.cssText='height:520px;overflow:auto;position:fixed;inset:0;z-index:100;background:white';document.body.append(host);window.__outsideClicks=0;document.body.addEventListener('click',()=>window.__outsideClicks++);window.__comments=AllEarthComments.mount(host,{kind:'post',id:'comments-qa'});return true})()`);

    assert.equal(await page.evaluate(`AllEarthComments.getCount('post','comments-qa')`), 18, 'legacy aggregate is preserved without double counting materialized comments');
    assert.equal(await page.evaluate(`(()=>{AllEarthComments.getCount('post','legacy-order');const rows=AllEarthStore.read().commentThreads['post:legacy-order'].comments;return rows[1].created>rows[0].created})()`), true, 'legacy append order receives increasing fallback timestamps');
    assert.equal(await page.evaluate(`document.querySelectorAll('#comments-test .aec-replies').length`), 0, 'replies start collapsed');

    await page.click('#comments-test [data-comment-id="p1"] > [data-action="expand"]');
    await page.waitFor(`document.querySelectorAll('#comments-test [data-comment-id="p1"] > .aec-replies > .aec-row').length===5`, 'first five replies');
    await page.click('#comments-test [data-comment-id="p1"] > .aec-replies > [data-action="load-more"]');
    await page.waitFor(`document.querySelectorAll('#comments-test [data-comment-id="p1"] > .aec-replies > .aec-row').length===10`, 'next five replies');
    assert.equal(await page.evaluate(`AllEarthStore.read().commentUi['post:comments-qa'].expanded.p1`), 10, 'reply page size persists');

    await page.setValue('#comments-test [data-field="draft"]', '실패 뒤에도 남는 초안');
    assert.equal(await page.evaluate(`AllEarthStore.read().commentUi['post:comments-qa'].draft`), '실패 뒤에도 남는 초안', 'draft persists on every input');
    await delay(50);
    await page.evaluate(`(()=>{const host=document.querySelector('#comments-test');host.scrollTop=260;window.__qaCommentScroll=host.scrollTop;host.dispatchEvent(new Event('scroll'));return true})()`);
    await delay(90);
    await page.click('#comments-test [data-action="discard-draft"]');
    const discardHit = await page.evaluate(`(()=>{const box=document.querySelector('#comments-test .aec-confirm'),rect=box.getBoundingClientRect();return rect.top>=0&&rect.bottom<=innerHeight&&document.elementFromPoint(rect.left+rect.width/2,rect.top+20)?.closest('.aec-confirm')===box})()`);
    assert.equal(discardHit, true, 'discard confirmation remains visible and clickable from a scrolled inline thread');
    await page.click('#comments-test .aec-confirm [data-action="cancel-confirm"]');
    await delay(50);
    const scrollCheck = await page.evaluate(`({actual:document.querySelector('#comments-test').scrollTop,expected:window.__qaCommentScroll,saved:AllEarthStore.read().commentUi['post:comments-qa'].scroll,max:document.querySelector('#comments-test').scrollHeight-document.querySelector('#comments-test').clientHeight})`);
    assert.ok(Math.abs(scrollCheck.actual - scrollCheck.expected) <= 1, `inline rerender preserves current scroll ${JSON.stringify(scrollCheck)}`);
    await page.evaluate(`__comments.destroy();window.__comments=AllEarthComments.mount(document.querySelector('#comments-test'),{kind:'post',id:'comments-qa'});true`);
    assert.equal(await page.evaluate(`document.querySelector('#comments-test [data-field="draft"]').value`), '실패 뒤에도 남는 초안', 'draft survives hide/remount');

    await page.click('#comments-test .aec-submit');
    await page.waitFor(`document.querySelector('#comments-test .aec-error')?.textContent.includes('다시 시도')`, 'simulated add failure');
    assert.equal(await page.evaluate(`document.querySelector('#comments-test [data-field="draft"]').value`), '실패 뒤에도 남는 초안', 'failed post retains input');
    await page.click('#comments-test .aec-error [data-action="retry"]');
    await page.waitFor(`AllEarthComments.getCount('post','comments-qa')===19`, 'retry adds once');
    assert.equal(await page.evaluate(`AllEarthStore.read().commentUi['post:comments-qa'].draft`), '', 'success clears draft');

    await page.click('#comments-test [data-comment-id="p2"] [data-action="reply"]');
    await page.setValue('#comments-test [data-field="draft"]', '대상 답글');
    await page.click('#comments-test .aec-submit');
    await page.waitFor(`AllEarthComments.getCount('post','comments-qa')===20`, 'reply post');
    const reply = await page.evaluate(`(()=>{const t=AllEarthStore.read().commentThreads['post:comments-qa'];return t.comments.find(c=>c.own&&c.parentId==='p2')})()`);
    assert.ok(reply.text.startsWith('@다른사용자 '), 'reply keeps visible @target');

    await page.click('#comments-test [data-comment-id="p1"] > .aec-row-head [data-action="menu"]');
    await page.click('#comments-test [data-comment-id="p1"] > .aec-menu [data-action="ask-delete"]');
    await page.click('#comments-test .aec-confirm [data-action="delete"]');
    await page.waitFor(`AllEarthStore.read().commentThreads['post:comments-qa'].comments.find(c=>c.id==='p1')?.deleted===true`, 'parent tombstone');
    const deletion = await page.evaluate(`(()=>{const t=AllEarthStore.read().commentThreads['post:comments-qa'];return {count:AllEarthComments.getCount('post','comments-qa'),replies:t.comments.filter(c=>c.parentId==='p1'&&!c.deleted).length,tombstone:document.querySelector('[data-comment-id="p1"] .aec-tombstone')?.textContent,post:AllEarthStore.posts().find(p=>p.id==='comments-qa').comments}})()`);
    assert.deepEqual(deletion, { count: 19, replies: 12, tombstone: '삭제된 댓글입니다.', post: 19 }, 'deleted parent is excluded while replies and synchronized post count remain');

    await page.click('#comments-test [data-action="sort"][data-sort="popular"]');
    assert.equal(await page.evaluate(`AllEarthStore.read().commentUi['post:comments-qa'].sort`), 'popular', 'sort choice persists');
    assert.equal(await page.evaluate(`window.__outsideClicks`), 0, 'nested actions do not leak into parent card handlers');

    await page.evaluate(`__comments.destroy();document.querySelector('#comments-test').remove();true`);
    for (const [index, width] of [390, 320].entries()) {
      await page.viewport(width);
      await page.evaluate(`(()=>{const issue=document.createElement('dialog');issue.id='native-issue';issue.className='topic-detail';issue.style.cssText='box-sizing:border-box;width:min(320px,calc(100% - 20px));height:520px;padding:20px;border:0';issue.innerHTML='<h2>열려 있는 Earth 이슈</h2><p>댓글 뒤에서도 이 이슈가 유지되어야 합니다.</p>';const origin=document.createElement('button');origin.id='comments-origin';origin.textContent='댓글 열기';issue.append(origin);document.body.append(issue);issue.showModal();origin.focus();window.__modalComments=AllEarthComments.open({kind:'issue',id:'issue-qa',origin});return true})()`);
      await page.waitFor(`!!document.querySelector('.aec-overlay[open] .aec-dialog')`, `standalone comment modal ${width}`);
      const hit = await page.evaluate(`(()=>{const field=document.querySelector('.aec-overlay [data-field="draft"]'),rect=field.getBoundingClientRect(),sheet=document.querySelector('.aec-dialog').getBoundingClientRect(),x=rect.left+rect.width/2,y=rect.top+rect.height/2;return {x,y,hit:document.elementFromPoint(x,y)===field,overlay:document.querySelector('.aec-overlay').open,issue:document.querySelector('#native-issue').open,overflow:document.documentElement.scrollWidth-innerWidth,sheetLeft:sheet.left,sheetRight:sheet.right,viewport:innerWidth}})()`);
      assert.deepEqual({ hit: hit.hit, overlay: hit.overlay, issue: hit.issue }, { hit: true, overlay: true, issue: true }, `comment textarea is above native issue at ${width}`);
      assert.ok(hit.overflow <= 1 && hit.sheetLeft >= 0 && hit.sheetRight <= hit.viewport + 1, `no comments overflow at ${width}`);
      await page.cdp.send('Input.dispatchMouseEvent', { type: 'mousePressed', x: hit.x, y: hit.y, button: 'left', clickCount: 1 });
      await page.cdp.send('Input.dispatchMouseEvent', { type: 'mouseReleased', x: hit.x, y: hit.y, button: 'left', clickCount: 1 });
      assert.equal(await page.evaluate(`document.activeElement===document.querySelector('.aec-overlay [data-field="draft"]')`), true, `real pointer focuses textarea at ${width}`);
      await page.setValue('.aec-overlay [data-field="draft"]', `${width}px 이슈 댓글`);
      await page.screenshot(`functions-issue-comments-${width}.png`);
      await page.click('.aec-overlay .aec-submit');
      await page.waitFor(`AllEarthComments.getCount('issue','issue-qa')===${index + 1}`, `issue comment submit ${width}`);
      await page.click('.aec-dialog-head [data-action="close-modal"]');
      await page.waitFor(`!document.querySelector('.aec-overlay')`, `modal closes ${width}`);
      assert.deepEqual(await page.evaluate(`({focus:document.activeElement?.id,issue:document.querySelector('#native-issue')?.open,top:document.elementFromPoint(innerWidth/2,innerHeight/2)?.closest?.('#native-issue')?.id||''})`), { focus: 'comments-origin', issue: true, top: 'native-issue' }, `close restores underlying issue at ${width}`);
      await page.evaluate(`document.querySelector('#native-issue').close();document.querySelector('#native-issue').remove();true`);
    }

    await page.goto('my.html?view=list');
    await page.waitFor(`!!document.querySelector('[data-id="comments-qa"] [data-action="comment"]')`, 'My post comments entry');
    await page.click('[data-id="comments-qa"] [data-action="comment"]');
    await page.waitFor(`!!document.querySelector('.modal .my-comments.aec')`, 'My mounts shared comments in its existing modal');
    assert.match(await page.evaluate(`document.querySelector('.modal .aec-heading').textContent`), /19/, 'My reads synchronized shared count');
    await page.setValue('.modal [data-field="draft"]', 'My에서 유지할 초안');
    await page.click('.modal > .form-actions [data-action="modal-close"]');
    await page.waitFor(`!document.querySelector('.modal')`, 'My comment modal closes');
    await page.click('[data-id="comments-qa"] [data-action="comment"]');
    assert.equal(await page.evaluate(`document.querySelector('.modal [data-field="draft"]').value`), 'My에서 유지할 초안', 'My close/remount retains draft');
    await page.click('.modal [data-action="discard-draft"]');
    await page.click('.modal .aec-confirm [data-action="discard-confirmed"]');
    await page.click('.modal > .form-actions [data-action="modal-close"]');

    const accountCleanup = await page.evaluate(`(()=>{
      AllEarthStore.update(s=>{s.commentThreads['issue:account-qa']={baseCount:0,comments:[
        {id:'own-parent',parentId:null,name:s.account.nickname,own:true,text:'내 원댓글',created:1,likes:1,liked:true,deleted:false},
        {id:'foreign-reply',parentId:'own-parent',name:'외부',own:false,text:'외부 답글',created:2,likes:0,liked:false,deleted:false},
        {id:'foreign-parent',parentId:null,name:'외부',own:false,text:'외부 원댓글',created:3,likes:0,liked:false,deleted:false},
        {id:'own-reply',parentId:'foreign-parent',name:s.account.nickname,own:true,text:'내 답글',created:4,likes:0,liked:false,deleted:false}
      ]};s.commentUi['issue:account-qa']={draft:'개인 초안',replyTo:'foreign-parent',editId:null,editText:'',sort:'new',expanded:{},scroll:4};});
      AllEarthStore.rename('검증닉');
      const renamed=AllEarthStore.read().commentThreads['issue:account-qa'].comments.filter(c=>c.own).every(c=>c.name==='검증닉');
      const result=AllEarthStore.perform('withdraw',()=>AllEarthStore.withdraw());
      const state=AllEarthStore.read(),rows=state.commentThreads['issue:account-qa'].comments;
      return {ok:result.ok,renamed,loggedIn:state.account.loggedIn,ui:state.commentUi['issue:account-qa'],own:rows.filter(c=>c.own).length,stub:rows.find(c=>c.id==='own-parent'),foreignReply:rows.some(c=>c.id==='foreign-reply'),ownReply:rows.some(c=>c.id==='own-reply')};
    })()`);
    assert.equal(accountCleanup.ok, true, 'withdraw transaction succeeds');
    assert.equal(accountCleanup.renamed, true, 'rename reaches owned shared comments');
    assert.equal(accountCleanup.loggedIn, false, 'withdraw logs out');
    assert.equal(accountCleanup.ui, undefined, 'withdraw clears private comment UI/drafts');
    assert.equal(accountCleanup.own, 0, 'withdraw removes owned replies');
    assert.ok(accountCleanup.stub?.deleted && accountCleanup.foreignReply && !accountCleanup.ownReply, 'withdraw retains a deleted parent stub only for remaining foreign replies');
    assert.deepEqual(page.errors, [], `browser/runtime errors:\n${page.errors.join('\n')}`);
    console.log('PASS: comments core, My integration, nesting/modal API, rename and withdrawal cleanup');
  } finally {
    await page?.close();
    await new Promise(resolve => server.close(resolve));
  }
}

if (require.main === module) main().catch(error => { console.error(`FAIL: ${error.stack || error}`); process.exitCode = 1; });
