const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
const { APP, WIDTHS, staticServer, browserSession } = require('./verify-my-navigation.cjs');

async function settled(page) {
  await page.evaluate('document.fonts.ready.then(()=>true)');
  await page.waitFor("[...document.querySelectorAll('img')].every(i=>i.complete&&i.naturalWidth>0)", 'Saved assets');
  await page.evaluate('new Promise(resolve=>requestAnimationFrame(()=>requestAnimationFrame(()=>resolve(true))))');
}

async function checkLayout(page, countries) {
  const result = await page.evaluate(`(() => {
    const rect=n=>{const r=n.getBoundingClientRect();return {left:r.left,right:r.right,top:r.top,bottom:r.bottom,width:r.width,height:r.height}};
    return {
      overflow:document.documentElement.scrollWidth>innerWidth,
      navVisible:Math.abs(document.querySelector('.app-nav').getBoundingClientRect().bottom-innerHeight)<1 && !!document.elementFromPoint(innerWidth/2,innerHeight-30)?.closest('.app-nav'),
      cards:[...document.querySelectorAll('.saved-card')].map(card=>{
        const link=card.querySelector('.saved-card-link'), button=card.querySelector('.saved-remove');
        const name=card.querySelector('strong'), flag=card.querySelector('.saved-flag');
        const label=button.querySelector('span'), range=document.createRange();range.selectNodeContents(label);
        return {box:rect(card),link:rect(link),button:rect(button),label:rect(label),labelLines:range.getClientRects().length,
          name:name?{...rect(name),full:name.scrollWidth<=name.clientWidth}:null,flag:flag?rect(flag):null,
          font:card.querySelector('.saved-post-copy')?parseFloat(getComputedStyle(card.querySelector('.saved-post-copy')).fontSize):null};
      })
    };
  })()`);
  assert.equal(result.overflow,false,'no page overflow');
  assert.equal(result.navVisible,true,'shared navigation is visible at the bottom of the viewport');
  assert.equal(result.cards.length,3);
  for (const card of result.cards) {
    assert.ok(card.button.height>=44 && card.button.width>=44,'usable save button');
    assert.equal(card.labelLines,1,'save action is on one line');
    assert.ok(card.label.left>=card.button.left && card.label.right<=card.button.right,'save label is inside button');
    assert.ok(card.button.top>=card.link.bottom-1,'card body and save action do not overlap');
    if(countries) {
      assert.ok(card.name.full,'sample country name is not truncated');
      assert.ok(card.name.top>=card.flag.bottom+8,'country name is below the flag');
      assert.ok(card.flag.width>=40 && card.flag.height>=24,'flag is not flex-shrunk');
    } else assert.ok(card.font>=14,'readable post body size');
  }
  assert.ok(result.cards[1].box.left>result.cards[0].box.right,'adjacent cards have a gap');
  if(countries) assert.ok(Math.abs(result.cards[2].box.top-result.cards[0].box.top)<1,'countries stay in one row');
  else assert.ok(result.cards[2].box.top>result.cards[0].box.bottom,'posts use two readable columns');
}

(async()=>{
  const {server,port}=await staticServer();let page;
  try {
    page=await browserSession(`http://127.0.0.1:${port}/`);
    await page.goto('saved.html?reset=1');
    for(const width of WIDTHS) {
      await page.viewport(width);
      await page.goto('saved.html?tab=countries');await settled(page);await checkLayout(page,true);
      await page.screenshot(`saved-refined-countries-${width}.png`);
      await page.click('#saved-content-tab');await settled(page);await checkLayout(page,false);
      await page.screenshot(`saved-refined-posts-${width}.png`);
      await page.evaluate('window.scrollTo(0,document.documentElement.scrollHeight)');
      assert.ok(await page.evaluate("[...document.querySelectorAll('.saved-remove')].at(-1).getBoundingClientRect().bottom<=document.querySelector('.app-nav').getBoundingClientRect().top"),'last save action can scroll above navigation');
      await page.evaluate('window.scrollTo(0,0)');
    }
    await page.viewport(320);await page.click('#saved-countries-tab');
    await page.evaluate("AllEarthStore.update(s=>{s.countries[0].name='세인트빈센트 그레나딘';s.countries[1].name='Bosnia and Herzegovina'})");
    assert.ok(await page.evaluate("document.documentElement.scrollWidth<=innerWidth && [...document.querySelectorAll('.saved-country-card strong')].every(n=>n.getBoundingClientRect().height<30&&n.getAttribute('title')===n.textContent)"),'long country names retain one line and full accessible name');
    await page.goto(pathToFileURL(path.join(APP,'saved.html')).href+'?reset=1&tab=countries');
    await settled(page);await checkLayout(page,true);
    await page.click('[data-action=remove-country]');
    assert.equal(await page.evaluate("document.querySelectorAll('.saved-country-card').length"),2,'country save action still works');
    await page.evaluate('AllEarthStore.reset()');
    await page.goto(pathToFileURL(path.join(APP,'preview.html')).href+'?screen=saved-countries');
    await page.cdp.send('Emulation.setDeviceMetricsOverride',{width:1920,height:1080,deviceScaleFactor:1,mobile:false});
    await page.waitFor("document.querySelector('#app-preview')?.src.includes('saved.html')",'preview Saved loaded');
    await new Promise(resolve=>setTimeout(resolve,600));
    await page.screenshot('saved-refined-preview-1920.png');
    assert.deepEqual(page.errors,[]);
    console.log('PASS: Saved 320/390/430 geometry, country names/flags, 2-column posts, readable text, touch targets, long names, file:// and preview');
  } finally {await page?.close();await new Promise(resolve=>server.close(resolve));}
})().catch(error=>{console.error(error);process.exitCode=1});
