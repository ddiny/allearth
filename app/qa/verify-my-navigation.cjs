const assert = require('node:assert/strict');
const fs = require('node:fs');
const http = require('node:http');
const net = require('node:net');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { spawn } = require('node:child_process');

const APP = path.resolve(__dirname, '..');
const WORKSPACE = path.resolve(APP, '..');
const TEMP = path.join(WORKSPACE, 'tmp', 'qa-my');
const TINY_IMAGE = path.join(TEMP, 'tiny.png');
const BAD_IMAGE = path.join(TEMP, 'unsupported.txt');
const CHROME = process.env.ALLEARTH_CHROME || 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';
const WIDTHS = [320, 390, 430];
const HEIGHTS = { 320: 568, 390: 844, 430: 932 };
const MIME = { '.css':'text/css; charset=utf-8', '.html':'text/html; charset=utf-8', '.js':'text/javascript; charset=utf-8', '.json':'application/json', '.svg':'image/svg+xml', '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.webp':'image/webp', '.woff2':'font/woff2', '.ttf':'font/ttf' };

function freePort() {
  return new Promise((resolve, reject) => {
    const server = net.createServer();
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => { const port = server.address().port; server.close(() => resolve(port)); });
  });
}

function staticServer() {
  const server = http.createServer((request, response) => {
    const requestPath = decodeURIComponent(new URL(request.url, 'http://localhost').pathname);
    if(requestPath==='/favicon.ico'){response.writeHead(204).end();return;}
    const relative = requestPath === '/' ? 'my.html' : requestPath.replace(/^\/+/, '');
    const file = path.resolve(APP, relative);
    if (file !== APP && !file.startsWith(APP + path.sep)) { response.writeHead(403).end('Forbidden'); return; }
    fs.readFile(file, (error, data) => {
      if (error) { response.writeHead(error.code === 'ENOENT' ? 404 : 500).end(error.code || 'Error'); return; }
      response.writeHead(200, { 'Content-Type': MIME[path.extname(file).toLowerCase()] || 'application/octet-stream', 'Cache-Control':'no-store' });
      response.end(data);
    });
  });
  return new Promise((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => resolve({ server, port: server.address().port }));
  });
}

class CDP {
  constructor(url) { this.url=url; this.next=0; this.pending=new Map(); this.listeners=new Map(); }
  async open() {
    this.ws = new WebSocket(this.url);
    await new Promise((resolve, reject) => { this.ws.addEventListener('open', resolve, { once:true }); this.ws.addEventListener('error', reject, { once:true }); });
    this.ws.addEventListener('message', event => {
      const message=JSON.parse(event.data);
      if (message.id) { const pending=this.pending.get(message.id); if (!pending) return; this.pending.delete(message.id); message.error ? pending.reject(new Error(message.error.message)) : pending.resolve(message.result); return; }
      for (const listener of this.listeners.get(message.method) || []) listener(message.params || {});
    });
  }
  send(method, params={}) {
    const id=++this.next;
    return new Promise((resolve,reject)=>{this.pending.set(id,{resolve,reject});this.ws.send(JSON.stringify({id,method,params}));});
  }
  on(method, listener) { const listeners=this.listeners.get(method)||[];listeners.push(listener);this.listeners.set(method,listeners);return()=>this.listeners.set(method,listeners.filter(x=>x!==listener)); }
  close() { this.ws?.close(); }
}

const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function waitForChrome(port) {
  let last;
  for (let i=0;i<100;i++) {
    try { const response=await fetch(`http://127.0.0.1:${port}/json/version`);if(response.ok)return response.json(); } catch(error) { last=error; }
    await delay(50);
  }
  throw new Error(`Chrome DevTools did not start: ${last?.message || 'timeout'}`);
}

async function browserSession(base) {
  if (!fs.existsSync(CHROME)) throw new Error(`Chrome not found: ${CHROME}`);
  fs.mkdirSync(TEMP, { recursive:true });
  const profile=path.join(TEMP, `chrome-${process.pid}`);
  fs.rmSync(profile, { recursive:true, force:true });
  const port=await freePort();
  const chrome=spawn(CHROME, ['--headless=new','--disable-gpu','--disable-extensions','--disable-background-networking','--no-first-run','--no-default-browser-check',`--remote-debugging-port=${port}`,`--user-data-dir=${profile}`,'about:blank'], { stdio:'ignore' });
  const version=await waitForChrome(port);
  const created=await fetch(`http://127.0.0.1:${port}/json/new?about:blank`, { method:'PUT' });
  if (!created.ok) throw new Error(`Cannot create Chrome target: HTTP ${created.status}`);
  const target=await created.json(), cdp=new CDP(target.webSocketDebuggerUrl);
  await cdp.open();
  await Promise.all([cdp.send('Page.enable'),cdp.send('Runtime.enable'),cdp.send('Log.enable'),cdp.send('DOM.enable')]);
  const errors=[];
  cdp.on('Runtime.exceptionThrown', ({exceptionDetails})=>errors.push(`exception: ${exceptionDetails?.text || 'unknown'} ${exceptionDetails?.exception?.description || ''}`.trim()));
  cdp.on('Log.entryAdded', ({entry})=>{if(entry?.level==='error')errors.push(`log: ${entry.text}${entry.url?` (${entry.url})`:''}`);});
  cdp.on('Runtime.consoleAPICalled', ({type,args})=>{if(type==='error')errors.push(`console: ${args.map(a=>a.value||a.description||'').join(' ')}`);});
  async function evaluate(expression) {
    const result=await cdp.send('Runtime.evaluate',{expression,awaitPromise:true,returnByValue:true,userGesture:true});
    if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);
    return result.result.value;
  }
  async function waitFor(expression, message=expression, timeout=5000) {
    const start=Date.now();let last;
    while(Date.now()-start<timeout){try{if(await evaluate(expression))return;}catch(error){last=error;}await delay(35);}
    let snapshot='';try{snapshot=await evaluate(`location.href+' | '+document.body.innerText.slice(0,240)`);}catch(_){}
    throw new Error(`Timeout: ${message}${last ? ` (${last.message})` : ''}\n${snapshot}\n${errors.join('\n')}`);
  }
  async function goto(relative) {
    const target=new URL(relative,base), marker=`qa-${Date.now()}-${Math.random()}`;
    try{await evaluate(`window.__qaNavigationMarker=${JSON.stringify(marker)}`);}catch(_){}
    await cdp.send('Page.navigate',{url:target});
    await waitFor(`location.pathname === ${JSON.stringify(target.pathname)} && window.__qaNavigationMarker !== ${JSON.stringify(marker)} && document.readyState === 'complete'`, `load ${relative}`, 10000);
  }
  async function viewport(width) {
    await cdp.send('Emulation.setDeviceMetricsOverride',{width,height:HEIGHTS[width],deviceScaleFactor:1,mobile:true,screenWidth:width,screenHeight:HEIGHTS[width]});
  }
  async function click(selector) {
    const found=await evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node)return false;node.click();return true})()`);
    assert.equal(found,true,`missing clickable ${selector}`);
  }
  async function setValue(selector,value) {
    const changed=await evaluate(`(()=>{const node=document.querySelector(${JSON.stringify(selector)});if(!node)return false;node.value=${JSON.stringify(value)};node.dispatchEvent(new Event('input',{bubbles:true}));node.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
    assert.equal(changed,true,`missing input ${selector}`);
  }
  async function setFiles(selector,files) {
    const {root}=await cdp.send('DOM.getDocument',{depth:1});
    const {nodeId}=await cdp.send('DOM.querySelector',{nodeId:root.nodeId,selector});
    assert.ok(nodeId,`missing file input ${selector}`);
    await cdp.send('DOM.setFileInputFiles',{nodeId,files:files.map(file=>path.resolve(file))});
  }
  async function screenshot(name) {
    const result=await cdp.send('Page.captureScreenshot',{format:'png',captureBeyondViewport:false});
    fs.writeFileSync(path.join(__dirname,name),Buffer.from(result.data,'base64'));
  }
  return {chrome,profile,cdp,errors,evaluate,waitFor,goto,viewport,click,setValue,setFiles,screenshot,async close(){cdp.close();chrome.kill();await delay(250);try{fs.rmSync(profile,{recursive:true,force:true});}catch(error){if(error.code!=='EPERM'&&error.code!=='EBUSY')throw error;}}};
}

function fixture() {
  const outside={id:'outside',name:'성수러버',initial:'성',region:'성수동',text:'외부 사용자 글 본문',tag:'외부 글',views:10,likes:3,savedCount:1,comments:0,reactionCount:0,created:90,saved:true,savedAt:100,liked:false,reaction:null,commentList:[],own:false};
  const own={id:'own-one',name:'Aegungi',initial:'A',region:'서울',text:'내가 쓴 글 본문',tag:'나의 기록',views:2,likes:1,savedCount:1,comments:1,reactionCount:0,created:200,saved:true,savedAt:300,liked:false,reaction:null,commentList:[{id:'mine',name:'Aegungi',own:true,text:'내 댓글'}],own:true};
  const ownTwo={id:'own-two',name:'Aegungi',initial:'A',region:'부산',text:'두 번째 내 글',tag:'두 번째 기록',views:1,likes:0,savedCount:0,comments:0,reactionCount:0,created:190,saved:false,liked:false,reaction:null,commentList:[],own:true};
  return {
    app:{account:{loggedIn:true,nickname:'Aegungi',email:'example@gmail.com'},countries:[{id:'kr',name:'대한민국',savedAt:250}],issues:[{id:'kr:저장 이슈',title:'저장 이슈',countryId:'kr',savedAt:200}],history:[{type:'post',id:'own-one',title:'나의 기록',visited:300},{type:'issue',id:'jp:저장하지 않은 이슈',title:'저장하지 않은 이슈',countryId:'jp',visited:290},{type:'post',id:'deleted-post',title:'삭제된 게시글',visited:280}],my:{view:'grid',historyTab:'all'}},
    feed:{region:'World',view:'list',sort:'hot',tab:'feed',mode:'summary',history:[],summaryScroll:0,fullScroll:0,records:[outside,own,ownTwo],initialized:true},
  };
}

async function seed(page) {
  const data=fixture();
  await page.goto('my.html');
  await page.evaluate(`sessionStorage.clear();sessionStorage.setItem('allearth.app.v1',${JSON.stringify(JSON.stringify(data.app))});sessionStorage.setItem('allearth.feed.v2',${JSON.stringify(JSON.stringify(data.feed))});true`);
  await page.goto('my.html');
  await page.waitFor(`!!document.querySelector('.app-nav') && !!document.querySelector('.profile-name')`,'seeded My');
}

async function stateContract(page) {
  await seed(page);
  const result=await page.evaluate(`(()=>{
    const S=AllEarthStore;
    for(let i=0;i<105;i++)S.recordHistory({type:'post',id:'h-'+i,title:'H '+i});
    S.recordHistory({type:'post',id:'h-50',title:'H 50 again'});
    const history=S.read().history;
    const validation={tooLong:S.nicknameError('가나다라마바사아자차카'),symbol:S.nicknameError('bad!'),collision:S.nicknameError('성수러버'),valid:S.nicknameError('새이름_1')};
    S.rename('새이름_1');
    const renamed=S.posts().filter(p=>p.own).every(p=>p.name==='새이름_1')&&S.posts().flatMap(p=>p.commentList||[]).filter(c=>c&&c.own).every(c=>c.name==='새이름_1');
    const beforeLogout=S.savedCount();S.logout();S.recordHistory({type:'post',id:'while-out',title:'no'});const loggedOut=S.read();S.login();
    const isolated=beforeLogout>0&&S.savedCount()===beforeLogout&&!loggedOut.account.loggedIn&&!loggedOut.history.some(x=>x.id==='while-out');
    S.withdraw();const after=S.read(),feed=S.getFeed();
    return {historyLength:history.length,historyFirst:history[0].id,historyDupes:history.filter(x=>x.id==='h-50').length,validation,renamed,isolated,withdrawn:!after.account.loggedIn&&!after.history.length&&!feed.records.some(p=>p.own)&&feed.records.some(p=>p.id==='outside'&&!p.saved&&!p.liked)};
  })()`);
  assert.deepEqual([result.historyLength,result.historyFirst,result.historyDupes],[100,'h-50',1],'history capped, newest-first and deduplicated');
  assert.ok(result.validation.tooLong && result.validation.symbol && result.validation.collision && !result.validation.valid,'nickname constraints');
  assert.ok(result.renamed,'rename propagates to owned content');
  assert.ok(result.isolated,'logout keeps account data and prevents history writes');
  assert.ok(result.withdrawn,'withdrawal removes owned data and resets foreign interactions');
}

async function navigationAndResponsive(page) {
  await seed(page);
  const expected=['Earth','Feed','Saved','My'];
  for(const width of WIDTHS){
    await page.viewport(width);
    for(const [file,current] of [['home.html','earth'],['feed.html','feed'],['saved.html','saved'],['my.html','my']]){
      await page.goto(file);await page.waitFor(`document.querySelectorAll('.app-nav a').length===4`,`nav ${file}`);
      const nav=await page.evaluate(`(()=>({labels:[...document.querySelectorAll('.app-nav a')].map(a=>a.getAttribute('aria-label')),current:document.querySelector('.app-nav [aria-current="page"]')?.dataset.nav,overflow:document.documentElement.scrollWidth-document.documentElement.clientWidth}))()`);
      assert.deepEqual(nav.labels,expected,`${file} common nav labels at ${width}`);assert.equal(nav.current,current,`${file} current nav`);assert.ok(nav.overflow<=1,`${file} horizontal overflow ${nav.overflow}px at ${width}`);
    }
    await page.goto('my.html');await page.waitFor(`!!document.querySelector('.own-grid')`,'My grid');await page.screenshot(`my-grid-${width}.png`);
  }
  await page.viewport(390);await page.goto('home.html');await page.waitFor(`!!document.querySelector('.app-nav a[data-nav="my"]')`,'home My nav');await page.click('.app-nav a[data-nav="my"]');
  await page.waitFor(`location.pathname.endsWith('/my.html') && !!document.querySelector('.profile-name')`,'home to My profile');
  assert.equal(await page.evaluate(`document.querySelector('h1')?.textContent.trim()`),'My','home My opens profile, not history');
  await page.screenshot('my-nav-390.png');
}

async function myUi(page) {
  await seed(page);await page.viewport(390);
  let text=await page.evaluate(`document.body.innerText`);assert.match(text,/내가 쓴 글 본문/);assert.doesNotMatch(text,/외부 사용자 글 본문/);
  await page.click('.view-switch [data-action="view"]:not(.is-active)');await page.waitFor(`!!document.querySelector('.own-list')`,'list view');
  assert.equal(await page.evaluate(`AllEarthStore.read().my.view`),'list');
  text=await page.evaluate(`document.body.innerText`);assert.match(text,/내가 쓴 글 본문/);assert.doesNotMatch(text,/외부 사용자 글 본문/);
  await page.click('[data-action="nickname"]');await page.setValue('#nickname-input','가나다라마바사아자차카');assert.ok(await page.evaluate(`document.querySelector('[data-action="save-name"]').disabled && document.querySelector('.field-error').textContent.length>0`));
  await page.setValue('#nickname-input','bad!');assert.match(await page.evaluate(`document.querySelector('.field-error').textContent`),/한글|영문|숫자|밑줄/);
  await page.setValue('#nickname-input','성수러버');assert.match(await page.evaluate(`document.querySelector('.field-error').textContent`),/사용 중/);
  await page.setValue('#nickname-input','취소할이름');await page.click('[data-action="modal-close"]');assert.equal(await page.evaluate(`document.querySelector('.profile-name').textContent`),'Aegungi','nickname cancel');
  await page.goto('my.html?section=nickname&fail=nickname');await page.waitFor(`!!document.querySelector('#nickname-input')`,'nickname failure screen');await page.setValue('#nickname-input','실패보존');await page.click('[data-action="save-name"]');assert.match(await page.evaluate(`document.querySelector('.field-error').textContent`),/저장하지 못했어요/);assert.equal(await page.evaluate(`document.querySelector('#nickname-input').value`),'실패보존');
  await page.goto('my.html');await page.waitFor(`!!document.querySelector('[data-action="nickname"]')`,'My after failure');await page.click('[data-action="nickname"]');await page.setValue('#nickname-input','새이름_1');await page.click('[data-action="save-name"]');await page.waitFor(`document.querySelector('.profile-name')?.textContent==='새이름_1'`,'nickname save');
  assert.ok(await page.evaluate(`AllEarthStore.posts().filter(p=>p.own).every(p=>p.name==='새이름_1')`),'nickname propagated');
  await page.click('[data-action="settings"]');await page.waitFor(`document.body.innerText.includes('계정 관리')`,'settings');await page.screenshot('my-settings-390.png');await page.click('[data-action="back"]');await page.waitFor(`!!document.querySelector('.profile-name')`,'settings back');
  await page.click('[data-action="history"]');await page.waitFor(`document.querySelectorAll('.history-item').length>=3`,'history');
  const history=await page.evaluate(`[...document.querySelectorAll('.history-item')].map(x=>({id:x.dataset.id,text:x.innerText,unavailable:x.classList.contains('unavailable')}))`);
  const seeded=history.filter(x=>['own-one','jp:저장하지 않은 이슈','deleted-post'].includes(x.id));assert.deepEqual(seeded.map(x=>x.id),['own-one','jp:저장하지 않은 이슈','deleted-post']);assert.ok(!seeded[1].unavailable,'issue history works without being Saved');assert.ok(seeded.at(-1).unavailable&&seeded.at(-1).text.includes('더 이상 볼 수 없어요'));
  await page.click('.tabs [data-action="tab"]:last-child');await page.waitFor(`AllEarthStore.read().my.historyTab==='post'`,'post history tab');assert.ok(await page.evaluate(`[...document.querySelectorAll('.history-item')].every(x=>x.dataset.type==='post') && document.querySelectorAll('.history-item').length>=2`),'post history tab filters issues');await page.screenshot('my-history-390.png');
  await page.click('[data-action="back"]');await page.click('.view-switch [data-view="list"]');await page.click('[data-id="own-one"] [data-action="comment"]');await page.setValue('.aec-field-row textarea','새 댓글');await page.click('.aec-submit');await page.waitFor(`document.querySelector('.modal')?.innerText.includes('새 댓글')`,'saved comment display');assert.ok(await page.evaluate(`AllEarthStore.posts().find(p=>p.id==='own-one').commentList.some(c=>c.text==='새 댓글'&&c.own)`),'comment submit persists with ownership');await page.click('.modal [data-action="modal-close"]');
  await page.click('[data-id="own-two"] [data-action="post-menu"]');assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('.modal [data-action="edit"],.modal [data-action="delete"]')].map(b=>b.dataset.id)`),['own-two','own-two'],'more menu retains post id');await page.click('.modal [data-action="delete"]');await page.click('.modal [data-action="delete-ok"]');await page.waitFor(`!document.querySelector('.modal')`,'delete completes');assert.ok(await page.evaluate(`!AllEarthStore.posts().some(p=>p.id==='own-two')`),'delete removes selected own post');
  await page.click('[data-action="settings"]');await page.click('[data-action="logout"]');await page.click('[data-action="logout-ok"]');await page.waitFor(`location.pathname.endsWith('/index.html')&&new URL(location.href).searchParams.get('scenario')==='existing'`,'logout login destination');await page.goto('my.html');await page.waitFor(`!!document.querySelector('.auth')`,'guest My after logout');assert.equal(await page.evaluate(`AllEarthStore.read().account.loggedIn`),false);assert.equal(await page.evaluate(`AllEarthStore.savedCount()`),0,'saved hidden while logged out');await page.evaluate(`AllEarthStore.login()`);await page.goto('my.html');await page.waitFor(`!!document.querySelector('.profile-name')`,'mock login');assert.ok(await page.evaluate(`AllEarthStore.savedCount()>0`),'saved restored after login');
  await page.click('[data-action="settings"]');await page.click('[data-action="withdraw"]');await page.click('[data-action="withdraw-ok"]');await page.waitFor(`location.pathname.endsWith('/index.html')&&new URL(location.href).searchParams.get('scenario')==='existing'`,'withdraw login destination');await page.goto('my.html');await page.waitFor(`!!document.querySelector('.auth')`,'guest My after withdraw');assert.ok(await page.evaluate(`!AllEarthStore.read().account.loggedIn&&!AllEarthStore.posts().some(p=>p.own)&&AllEarthStore.posts().some(p=>p.id==='outside')`),'withdraw isolation');
}

async function savedAndComposer(page) {
  await seed(page);await page.viewport(390);await page.goto('saved.html?tab=content');await page.waitFor(`!!document.querySelector('.app-nav')`,'Saved page');
  const savedText=await page.evaluate(`document.body.innerText`);for(const expected of ['저장 이슈','외부 글','나의 기록'])assert.match(savedText,new RegExp(expected),`Saved contains ${expected}`);
  assert.deepEqual(await page.evaluate(`[...document.querySelectorAll('.saved-card')].map(x=>x.dataset.id)`),['own-one','kr:저장 이슈','outside'],'Saved newest-first by savedAt');
  await page.click('[data-tab="countries"]');assert.match(await page.evaluate(`document.body.innerText`),/대한민국/,'Saved country tab shares state');
  await page.goto('feed.html?post=own-two');await page.waitFor(`!!document.querySelector('[data-id="own-two"] [data-action="save"]')`,'feed post save');await page.click('[data-id="own-two"] [data-action="save"]');assert.ok(await page.evaluate(`AllEarthStore.posts().find(p=>p.id==='own-two').savedAt>300`),'real save click stamps savedAt');await page.goto('saved.html?tab=content');await page.waitFor(`!!document.querySelector('.saved-card')`,'Saved after feed save');assert.equal(await page.evaluate(`document.querySelector('.saved-card').dataset.id`),'own-two','cross-page Saved refresh and ordering');
  await page.goto('feed.html?compose=1&return=my');
  await page.waitFor(`location.pathname.endsWith('/feed.html') && !!document.querySelector('.composer-page')`,'direct composer for My return');
  assert.equal(await page.evaluate(`!!document.querySelector('.app-nav') && getComputedStyle(document.querySelector('.app-nav')).display==='none'`),true,'nav hidden while composer open');
  assert.equal(await page.evaluate(`document.querySelector('.composer-page [type="submit"]').disabled`),true,'empty composer is invalid');
  await page.setValue('#post-text','My에서 작성한 새 글');await page.setValue('#post-region','성수동');await page.setValue('#post-tag','My복귀');
  assert.equal(await page.evaluate(`document.querySelector('.composer-page [type="submit"]').disabled`),false,'required body/location/tag enable submit');
  await page.setFiles('#post-images',[BAD_IMAGE]);await page.waitFor(`document.querySelector('.composer-error')?.textContent.includes('제외')`,'unsupported image rejection');
  await page.setFiles('#post-images',[TINY_IMAGE]);await page.waitFor(`document.querySelectorAll('.composer-image').length===1`,'allowed image preview');await page.click('[data-action="removeImage"]');await page.waitFor(`document.querySelectorAll('.composer-image').length===0`,'image remove');await page.setFiles('#post-images',[TINY_IMAGE]);await page.waitFor(`document.querySelectorAll('.composer-image').length===1`,'allowed image re-add');
  await page.click('.composer-page [type="submit"]');
  await page.waitFor(`location.pathname.endsWith('/my.html') && document.body.innerText.includes('My에서 작성한 새 글')`,'composer returns to My');
  assert.ok(await page.evaluate(`(()=>{const p=AllEarthStore.posts().find(x=>x.text==='My에서 작성한 새 글');const img=[...document.querySelectorAll('.own-grid img')].find(x=>x.src===p.images[0].src);return p.images.length===1&&img?.naturalWidth>0})()`),'submitted image renders in My');
  await page.goto('feed.html?compose=1&return=my&fail=save');await page.waitFor(`!!document.querySelector('.composer-page')`,'failure composer');
  await page.setValue('#post-text','실패 뒤 유지되는 글');await page.setValue('#post-region','성수동');await page.setValue('#post-tag','재시도');await page.click('.composer-page [type="submit"]');
  await page.waitFor(`document.querySelector('.composer-error')?.textContent.includes('저장하지 못했어요')`,'save failure');
  assert.equal(await page.evaluate(`document.querySelector('#post-text').value`),'실패 뒤 유지되는 글','failed draft retained');
  await page.click('.composer-page [type="submit"]');await page.waitFor(`location.pathname.endsWith('/my.html') && document.body.innerText.includes('실패 뒤 유지되는 글')`,'retry returns My');
}

async function previewSync(page) {
  await page.viewport(390);await page.goto('preview.html');await page.waitFor(`!!document.querySelector('[data-group="my"]')`,'preview My group');await page.click('[data-group="my"]');
  await page.waitFor(`!!document.querySelector('[data-screen="my-profile"]') && !document.querySelector('[data-variants="my"]').hidden`,'preview My variants');await page.click('[data-screen="my-profile"]');
  await page.waitFor(`document.querySelector('#app-preview')?.src.includes('my.html')`,'preview loads My');
  const state=await page.evaluate(`({pressed:document.querySelector('[data-screen="my-profile"]').getAttribute('aria-pressed'),src:document.querySelector('#app-preview').getAttribute('src')})`);
  assert.equal(state.pressed,'true');assert.match(state.src,/my\.html/);
  await page.click('[data-screen="my-settings"]');await page.waitFor(`document.querySelector('#app-preview').getAttribute('src').includes('screen=settings')`,'preview settings URL');
  await page.click('[data-screen="my-list"]');await page.waitFor(`document.querySelector('#app-preview').getAttribute('src').includes('view=list')`,'preview My list');await page.click('[data-screen="my-grid"]');await page.waitFor(`document.querySelector('#app-preview').getAttribute('src').includes('view=grid')`,'preview My grid reset');
}

async function signupRegression(page) {
  await seed(page);await page.viewport(390);await page.goto('signup.html?from=b');await page.waitFor(`!!document.querySelector('#nickname')`,'signup');
  await page.setValue('#nickname','bad!');assert.equal(await page.evaluate(`document.querySelector('.signup-submit').disabled`),true,'invalid signup nickname disables submit');assert.match(await page.evaluate(`AllEarthStore.nicknameError(document.querySelector('#nickname').value)`),/한글|영문|숫자|밑줄/);
  await page.setValue('#nickname','가입이름');await page.click('#consent-all');assert.equal(await page.evaluate(`document.querySelector('.signup-submit').disabled`),false,'valid signup nickname and required consent');await page.click('.signup-submit');
  await page.waitFor(`location.pathname.endsWith('/complete.html')&&!!window.AllEarthStore`,'signup completion',3000);assert.equal(await page.evaluate(`AllEarthStore.read().account.nickname`),'가입이름','signup nickname stored');await page.click('#enter-home');await page.waitFor(`location.pathname.endsWith('/home.html') && !!document.querySelector('.app-nav a[data-nav="my"]')`,'enter home');await page.click('.app-nav a[data-nav="my"]');await page.waitFor(`document.querySelector('.profile-name')?.textContent==='가입이름'`,'signup nickname reaches My');
}

async function previewExamplesAndLogout(page) {
  await page.goto('my.html?reset=1');
  await page.waitFor(`!!window.AllEarthStore && !!document.querySelector('.profile')`,'reset My examples');
  await page.evaluate(`(()=>{const f=AllEarthStore.getFeed();f.records.push({...f.records[0],id:'qa-preserved-own',text:'직접 작성한 글 유지',own:true});AllEarthStore.setFeed(f);AllEarthStore.update(s=>s.account.nickname='검토자')})()`);
  await page.cdp.send('Emulation.setDeviceMetricsOverride',{width:1920,height:1100,deviceScaleFactor:1,mobile:false});
  await page.goto('preview.html');
  const inside=expression=>page.evaluate(`document.querySelector('#app-preview').contentWindow.eval(${JSON.stringify(expression)})`);
  async function select(screen,selector) {
    const marker=`preview-${Math.random()}`;
    await inside(`window.__qaSelected=${JSON.stringify(marker)}`);
    await page.click(`[data-screen="${screen}"]`);
    await page.waitFor(`(()=>{const w=document.querySelector('#app-preview').contentWindow;return w.__qaSelected!==${JSON.stringify(marker)}&&w.document.readyState==='complete'&&!!w.document.querySelector(${JSON.stringify(selector)})})()`,screen+' renders');
    await page.waitFor(`document.querySelector('[data-screen="${screen}"]')?.getAttribute('aria-pressed')==='true'`,screen+' inspector stays selected');
  }
  await page.waitFor(`!!document.querySelector('#app-preview').contentDocument.querySelector('.profile')`,'initial preview My');
  for(const [screen,selector] of [['my-profile','.profile'],['my-grid','.own-grid'],['my-list','.own-list'],['my-settings','.settings-section'],['my-history','.tabs'],['my-posts-grid','.own-grid'],['my-posts-list','.own-list'],['feed-saved','.saved-tabs']]) {
    await select('my-loggedout','.auth');
    assert.equal(await inside(`AllEarthStore.read().account.loggedIn`),false,'logout example is a guest');
    await select(screen,selector);
    assert.equal(await inside(`AllEarthStore.read().account.loggedIn`),true,'inspector selection restores '+screen);
  }
  assert.equal(await inside(`AllEarthStore.posts().filter(p=>p.own&&p.example).length`),6,'six own example posts');
  assert.equal(await inside(`AllEarthStore.posts().filter(p=>p.own).length`),7,'existing post preserved');
  assert.equal(await inside(`AllEarthStore.read().account.nickname`),'검토자','account preserved');
  await select('my-posts-grid','.own-grid');
  assert.equal(await inside(`document.querySelector('[data-action="own-list"] .count-number').textContent`),'7','profile count matches posts');
  await page.screenshot('preview-my-posts-1920.png');
  await inside(`document.querySelector('[data-id="my-example-cafe"] .grid-open').click()`);
  await page.waitFor(`document.querySelector('[data-screen="my-posts-list"]').getAttribute('aria-pressed')==='true'`,'grid selection syncs to example list');
  assert.equal(await inside(`document.querySelectorAll('.own-list .post-card').length`),7);
  await inside(`AllEarthStore.updatePost('my-example-park',p=>p.text='수정한 샘플 내용');const f=AllEarthStore.getFeed();f.records=f.records.filter(p=>p.id!=='my-example-note');AllEarthStore.setFeed(f)`);
  await select('my-posts-list','.own-list');
  await select('my-posts-grid','.own-grid');
  assert.equal(await inside(`AllEarthStore.posts().filter(p=>p.own&&p.example).length`),5,'deleted sample stays deleted; no duplicates');
  assert.equal(await inside(`AllEarthStore.posts().find(p=>p.id==='my-example-park').text`),'수정한 샘플 내용','sample edit preserved');
  await select('my-settings','.settings-section');
  await inside(`document.querySelector('[data-action="logout"]').click();document.querySelector('[data-action="logout-ok"]').click()`);
  await page.waitFor(`(()=>{const w=document.querySelector('#app-preview').contentWindow;return w.location.pathname.endsWith('/index.html')&&new URL(w.location.href).searchParams.get('scenario')==='existing'})()`,'actual logout login screen');
  await inside(`location.href='my.html'`);
  await page.waitFor(`!!document.querySelector('#app-preview').contentDocument.querySelector('.auth')`,'direct My remains guest after preview logout');
  assert.equal(await inside(`AllEarthStore.read().account.loggedIn`),false,'preview logout persisted');
  for(const nav of ['feed','my','saved']) {
    await inside(`document.querySelector('.app-nav [data-nav="${nav}"]').click()`);
    await page.waitFor(`(()=>{const w=document.querySelector('#app-preview').contentWindow;return w.location.pathname.endsWith('/${nav}.html')&&w.document.readyState==='complete'&&!!w.document.querySelector('.app-nav')})()`,'guest navigation '+nav);
    assert.equal(await inside(`AllEarthStore.read().account.loggedIn`),false,'app navigation does not log in at '+nav);
  }
  assert.match(await inside(`document.body.innerText`),/로그인/,'Saved remains gated');
  await page.click('[data-group="my"]');
  await select('my-posts-grid','.own-grid');
  for(const width of WIDTHS) {
    await page.viewport(width);await page.goto('my.html?example=posts&view=grid');
    await page.waitFor(`document.querySelectorAll('.own-grid img').length>0 && [...document.querySelectorAll('.own-grid img')].every(i=>i.complete&&i.naturalWidth>0)`,'local example images '+width);
    assert.ok(await page.evaluate(`document.documentElement.scrollWidth<=innerWidth`),'example grid no overflow '+width);
    assert.equal(await page.evaluate(`getComputedStyle(document.querySelector('.own-grid')).gridTemplateColumns.split(' ').length`),width===320?2:3,'example columns '+width);
    await page.screenshot(`my-posts-grid-${width}.png`);
    await page.click('[data-action="view"][data-view="list"]');
    assert.ok(await page.evaluate(`document.documentElement.scrollWidth<=innerWidth`),'example list no overflow '+width);
    if(width===390)await page.screenshot('my-posts-list-390.png');
  }
  console.log('PASS: populated My previews, preserved posts/edits/deletions, logout-to-variant switching, actual logout across reload/navigation, 320/390/430 layout');
}

async function fileModeSmoke(page) {
  const fileBase=pathToFileURL(APP+path.sep).href;
  await page.goto(new URL('my.html',fileBase).href);await page.waitFor(`!!document.querySelector('[data-action="nickname"]')`,'file My');await page.click('[data-action="nickname"]');await page.setValue('#nickname-input','파일모드');await page.click('[data-action="save-name"]');await page.waitFor(`document.querySelector('.profile-name')?.textContent==='파일모드'`,'file nickname');
  await page.click('.app-nav a[data-nav="feed"]');await page.waitFor(`location.protocol==='file:' && location.pathname.endsWith('/feed.html') && !!document.querySelector('.app-nav')`,'file My to Feed');await page.click('.app-nav a[data-nav="saved"]');await page.waitFor(`location.pathname.endsWith('/saved.html') && !!document.querySelector('.app-nav')`,'file Feed to Saved');await page.click('.app-nav a[data-nav="my"]');await page.waitFor(`location.pathname.endsWith('/my.html') && document.querySelector('.profile-name')?.textContent==='파일모드'`,'file Saved to My persistence');
  const contexts=new Map(),offContext=page.cdp.on('Runtime.executionContextCreated',({context})=>{if(context.auxData?.isDefault&&context.auxData?.frameId)contexts.set(context.auxData.frameId,context.id);});
  async function composerContext(){
    let frame;
    for(let i=0;i<120;i++){const tree=(await page.cdp.send('Page.getFrameTree')).frameTree;const frames=[];(function walk(node){frames.push(node.frame);(node.childFrames||[]).forEach(walk)})(tree);frame=frames.find(item=>item.url.includes('feed.html')&&item.url.includes('embed=my'));if(frame&&contexts.has(frame.id))return contexts.get(frame.id);await delay(35);}
    throw new Error('file My composer execution context unavailable');
  }
  async function frameEval(contextId,expression){const result=await page.cdp.send('Runtime.evaluate',{contextId,expression,awaitPromise:true,returnByValue:true,userGesture:true});if(result.exceptionDetails)throw new Error(result.exceptionDetails.exception?.description||result.exceptionDetails.text);return result.result.value;}
  async function waitFrame(contextId,expression,message){for(let i=0;i<120;i++){try{if(await frameEval(contextId,expression))return;}catch(_){}await delay(35);}throw new Error('Timeout: '+message);}
  const beforeFilePosts=await page.evaluate(`AllEarthStore.posts().filter(p=>p.own).length`);await page.click('[data-action="compose"]');await page.waitFor(`!!document.querySelector('.my-composer-frame')`,'file My iframe sheet');let contextId=await composerContext();await waitFrame(contextId,`!!document.querySelector('#post-text')`,'file iframe composer DOM');
  for(const [selector,value] of [['#post-text','file iframe 작성'],['#post-region','성수동'],['#post-tag','fileiframe']])await frameEval(contextId,`(()=>{const n=document.querySelector(${JSON.stringify(selector)});n.value=${JSON.stringify(value)};n.dispatchEvent(new Event('input',{bubbles:true}));n.dispatchEvent(new Event('change',{bubbles:true}));return true})()`);
  assert.equal(await frameEval(contextId,`document.querySelector('.composer-page [type=submit]').disabled`),false,'file iframe composer valid');await frameEval(contextId,`document.querySelector('.composer-page [type=submit]').click()`);await page.waitFor(`!document.querySelector('.my-composer-sheet')&&document.body.innerText.includes('file iframe 작성')`,'file iframe submit closes and refreshes My');assert.equal(await page.evaluate(`AllEarthStore.posts().filter(p=>p.own).length`),beforeFilePosts+1);
  const filePostId=await page.evaluate(`AllEarthStore.posts().find(p=>p.own&&p.text==='file iframe 작성').id`);contexts.clear();await page.click(`[data-id="${filePostId}"] .grid-menu`);await page.click('.modal [data-action="edit"]');await page.waitFor(`!!document.querySelector('.my-composer-frame')`,'file My edit iframe');contextId=await composerContext();await waitFrame(contextId,`document.querySelector('#post-text')?.value==='file iframe 작성'`,'file iframe receives parent edit state');await frameEval(contextId,`(()=>{const n=document.querySelector('#post-text');n.value='file iframe 수정';n.dispatchEvent(new Event('input',{bubbles:true}));return true})()`);await frameEval(contextId,`document.querySelector('.composer-page [type=submit]').click()`);await page.waitFor(`!document.querySelector('.my-composer-sheet')&&document.body.innerText.includes('file iframe 수정')`,'file iframe edit merges into parent');assert.equal(await page.evaluate(`AllEarthStore.posts().filter(p=>p.id===${JSON.stringify(filePostId)}).length`),1,'file edit upserts without duplicate');
  contexts.clear();await page.click('[data-action="compose"]');await page.waitFor(`!!document.querySelector('.my-composer-frame')`,'file My iframe cancel sheet');contextId=await composerContext();await waitFrame(contextId,`!!document.querySelector('[data-action=closeComposer]')`,'file iframe cancel DOM');await frameEval(contextId,`document.querySelector('[data-action=closeComposer]').click()`);await page.waitFor(`!document.querySelector('.my-composer-sheet')`,'file iframe unchanged cancel closes');assert.equal(await page.evaluate(`AllEarthStore.posts().filter(p=>p.own).length`),beforeFilePosts+1,'cancel adds no post');offContext();
  await page.goto(new URL('preview.html',fileBase).href);await page.waitFor(`document.querySelector('#app-preview')?.src.startsWith('file:')`,'file preview iframe element',10000);await page.evaluate(`(()=>{const f=document.querySelector('#app-preview');f.dataset.qaLoaded='';f.addEventListener('load',()=>f.dataset.qaLoaded='yes',{once:true});return true})()`);await page.click('[data-screen="my-list"]');await page.waitFor(`document.querySelector('#app-preview')?.dataset.qaLoaded==='yes' && document.querySelector('#app-preview').src.includes('view=list')`,'file preview iframe load event',10000);
  await page.evaluate(`window.addEventListener('message',e=>{if(e.source===document.querySelector('#app-preview').contentWindow&&e.data?.action==='screen.ready')window.__qaFrameReady=e.data.detail})`);
  await page.click('[data-screen="my-loggedout"]');
  await page.waitFor(`window.__qaFrameReady?.loggedIn===false`,'file logout example');
  await page.click('[data-screen="my-posts-grid"]');
  await page.waitFor(`window.__qaFrameReady?.loggedIn===true && window.__qaFrameReady?.example==='posts' && window.__qaFrameReady?.view==='grid'`,'file populated My after logout');
  await page.click('[data-screen="my-posts-list"]');
  await page.waitFor(`window.__qaFrameReady?.example==='posts' && window.__qaFrameReady?.view==='list'`,'file populated list');
  await page.goto(new URL('my.html?example=posts&view=grid',fileBase).href);
  await page.waitFor(`document.querySelectorAll('.own-tile').length===7 && AllEarthStore.posts().filter(p=>p.own&&p.example).length===6 && AllEarthStore.posts().some(p=>p.own&&p.text==='file iframe 수정') && [...document.querySelectorAll('.own-grid img')].every(i=>i.complete&&i.naturalWidth>0)`,'file six examples plus preserved iframe post');
}

async function main() {
  const {server,port}=await staticServer();let page;
  try {
    fs.mkdirSync(TEMP,{recursive:true});fs.writeFileSync(TINY_IMAGE,Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=','base64'));fs.writeFileSync(BAD_IMAGE,'not an image');
    page=await browserSession(`http://127.0.0.1:${port}/`);
    await stateContract(page);
    await navigationAndResponsive(page);
    await myUi(page);
    await savedAndComposer(page);
    await previewSync(page);
    await previewExamplesAndLogout(page);
    await signupRegression(page);
    await fileModeSmoke(page);
    assert.deepEqual(page.errors,[],`browser/runtime errors:\n${page.errors.join('\n')}`);
    console.log('PASS: MY state, common navigation, 320/390/430 responsive layout, own posts, nickname, settings/history, logout/withdraw, Saved, composer and preview sync');
  } finally {
    await page?.close();
    await new Promise(resolve=>server.close(resolve));
  }
}

module.exports={APP,TEMP,TINY_IMAGE,BAD_IMAGE,WIDTHS,HEIGHTS,staticServer,browserSession,fixture,seed,delay};
if(require.main===module)main().catch(error=>{console.error(`FAIL: ${error.stack||error}`);process.exitCode=1;});
