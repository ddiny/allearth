// 카드뉴스와 같은 화제로 인스타 릴스 영상(9:16, 1080×1920, 30fps, 소리 없음)을 만들어요.
// cards.mjs 가 카드를 다 만든 뒤 불러요 → 같은 폴더에 reel.mp4 를 남겨요.
//   표지(에궁이 등장) → 화제 장면 N개(사진 또는 국기 그래픽) → 마지막(에궁이 인사)
// 에궁이 표정 규칙: 가벼운 화제는 웃는 얼굴. 눈썹 내린 얼굴은 무거운 소식에만 (카드 표지와 같은 기준).
// 음악은 넣지 않아요 (저작권). 인스타 앱에서 올릴 때 음악을 골라 주세요.
//
// 환경 변수
//   CARDS_REELS=0    릴스 만들지 않기
//   REELS_COUNT      영상에 넣을 화제 수 (기본 5)
//   REELS_SECONDS    화제 한 장면 길이(초, 기본 3)

import { spawn, spawnSync } from 'node:child_process';
import { readFileSync, renameSync, rmSync, writeFileSync } from 'node:fs';
import { chromium } from 'playwright';
import { FONT_URL, COUNTRY, flagSrc, poster, dateParts, isLight, iga } from './cards/template.mjs';

const RW = 1080, RH = 1920, FPS = 30;
const asset = f => readFileSync(new URL('./cards/brand/' + f, import.meta.url));
const png = f => 'data:image/png;base64,' + asset(f).toString('base64');
const EG = { smile: png('egung-cover.png'), calm: png('egung-cover-calm.png'), serious: png('egung-cover-serious.png'), outro: png('egung-outro.png') };
const LOGO_H = 'data:image/svg+xml;base64,' + asset('brand-horizontal.svg').toString('base64');
const POP = 'data:font/ttf;base64,' + asset('Poppins-Bold.ttf').toString('base64');
const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hash = s => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const BUB = flip => `<svg viewBox="0 0 262 172"${flip ? ' style="transform:scaleX(-1)"' : ''}><path d="M100 127 C160 132 236 123 252 82 C264 42 220 5 138 3 C60 2 7 30 6 67 C5 100 30 123 72 126 Q72 141 62 150 Q87 140 100 127 Z" fill="#fff" stroke="#23262C" stroke-width="2.5" stroke-linejoin="round" vector-effect="non-scaling-stroke"/></svg>`;

/* 인스타 릴스 화면의 위(메뉴)·아래(캡션)·오른쪽(버튼)에 가리지 않게 글자는 가운데 쪽에 둬요 */
const CSS = `
@font-face{font-family:P;src:url('${FONT_URL}') format('woff2');font-weight:45 920}
@font-face{font-family:Pop;src:url(${POP}) format('truetype');font-weight:700}
:root{--paper:#FFFEFB;--ink:#23262C;--mute:#5C5F66;--line:#E6E5DF;--accent:#DEFA5F}
*{margin:0;padding:0;box-sizing:border-box}
html,body{width:${RW}px;height:${RH}px;background:var(--paper);overflow:hidden;font-family:P,sans-serif;color:var(--ink);letter-spacing:-.02em;word-break:keep-all}
.top{position:absolute;left:80px;right:140px;top:190px;display:flex;justify-content:space-between;align-items:center}
.top img{height:46px}.top .date{font:700 28px Pop,P;color:var(--mute);letter-spacing:.04em}
.pill{display:inline-flex;align-items:center;gap:12px;background:var(--ink);color:#fff;font-weight:700;font-size:30px;padding:12px 26px;border-radius:40px}
.pill i{width:12px;height:12px;border-radius:50%;background:var(--accent)}
mark{background:linear-gradient(transparent 55%,var(--accent) 55%,var(--accent) 92%,transparent 92%) no-repeat;background-size:0% 100%;color:inherit;padding:0 6px;-webkit-box-decoration-break:clone;box-decoration-break:clone}
.bubble{position:absolute;width:330px;height:217px}
.bubble svg{position:absolute;inset:0;width:100%;height:100%;overflow:visible}
.bubble span{position:absolute;left:0;right:0;top:0;height:164px;display:flex;align-items:center;justify-content:center;text-align:center;font-size:30px;font-weight:800;line-height:1.3;white-space:nowrap}
.eg{position:absolute}.eg .move{position:absolute;inset:0;transform-origin:50% 100%}
.eg img{position:absolute;inset:0;width:100%;height:100%;object-fit:contain;object-position:50% 100%}
.shadow{position:absolute;left:20%;right:20%;bottom:0;height:4%;border-radius:50%;background:rgba(35,38,44,.12);filter:blur(6px)}
@keyframes up{from{opacity:0;transform:translateY(60px)}to{opacity:1;transform:none}}
@keyframes pop{0%{opacity:0;transform:scale(.6)}70%{opacity:1;transform:scale(1.06)}100%{opacity:1;transform:scale(1)}}
@keyframes hl{to{background-size:100% 100%}}
@keyframes zoom{from{transform:scale(1.12)}to{transform:scale(1)}}
@keyframes sticker{0%{opacity:0;transform:rotate(-6deg) scale(.5)}70%{opacity:1;transform:rotate(-6deg) scale(1.08)}100%{opacity:1;transform:rotate(-6deg) scale(1)}}
/* 에궁이 움직임: 통통 등장(찌그러졌다 늘어나기) · 숨쉬듯 흔들기 · 깡총 · 인사 */
@keyframes hopin{0%{opacity:0;transform:translateY(420px)}45%{opacity:1;transform:translateY(-40px) scale(.94,1.06)}62%{transform:translateY(0) scale(1.08,.92)}78%{transform:translateY(-12px) scale(.98,1.02)}100%{opacity:1;transform:none}}
@keyframes idle{0%,100%{transform:translateY(0) rotate(0)}25%{transform:translateY(-10px) rotate(-1.6deg)}50%{transform:translateY(0) scale(1.02,.98)}75%{transform:translateY(-10px) rotate(1.6deg)}}
@keyframes hop{0%,100%{transform:translateY(0) scale(1)}20%{transform:translateY(0) scale(1.08,.9)}45%{transform:translateY(-46px) scale(.95,1.06)}70%{transform:translateY(0) scale(1.06,.94)}85%{transform:translateY(-6px)}}
@keyframes bob{0%,100%{transform:translateY(0) rotate(0)}30%{transform:translateY(-12px) rotate(-2deg)}60%{transform:translateY(-4px) rotate(1.5deg)}}
@keyframes wave{0%,100%{transform:rotate(0)}20%{transform:rotate(-5deg)}40%{transform:rotate(5deg)}60%{transform:rotate(-4deg)}80%{transform:rotate(3deg)}}
.a{animation-fill-mode:both;animation-timing-function:cubic-bezier(.2,.8,.2,1)}
/* 화제 장면 */
.art{position:absolute;left:80px;right:80px;top:390px;height:740px;border-radius:36px;overflow:hidden;box-shadow:0 0 0 2px var(--line);background:#ddd}
.pz{position:absolute;inset:0}.pz svg{width:100%;height:100%;display:block}
.pz img{width:100%;height:100%;object-fit:cover;display:block}
.stk{position:absolute;left:50%;top:50%;width:400px;height:280px;margin:-140px 0 0 -200px;object-fit:cover;border:10px solid #fff;border-radius:14px;box-shadow:0 20px 40px rgba(0,0,0,.25)}
.badge{position:absolute;right:36px;top:36px;width:150px;height:150px;border-radius:50%;background:var(--accent);display:grid;place-items:center;font:700 34px Pop,P;transform:rotate(-8deg)}
.chip{position:absolute;left:36px;bottom:36px;background:#fff;border-radius:30px;padding:10px 24px;font-size:30px;font-weight:700}
.credit{position:absolute;left:80px;right:140px;top:1142px;font-size:20px;color:var(--mute);white-space:nowrap;overflow:hidden;text-overflow:ellipsis}
.body{position:absolute;left:80px;right:140px;top:1192px}
.co{display:flex;align-items:center;gap:16px}.co img{width:64px;height:46px;border-radius:8px;object-fit:cover;box-shadow:0 0 0 2px var(--line)}.co b{font-size:46px;font-weight:900}
.body h2{margin-top:20px;font-size:74px;font-weight:900;line-height:1.22;letter-spacing:-.045em}
.body p{margin-top:26px;font-size:34px;font-weight:500;line-height:1.55;max-width:600px}
.t-eg{right:110px;top:1360px;width:260px;height:354px}
.dots{position:absolute;left:80px;top:1680px;display:flex;gap:12px}
.dots i{width:14px;height:14px;border-radius:50%;background:var(--line)}.dots i.on{background:var(--ink);width:40px;border-radius:8px}
`;
const page = (body, css = '') => `<!doctype html><html lang="ko"><head><meta charset="utf-8"><style>${CSS}${css}</style></head><body>${body}</body></html>`;
const egung = ({ cls, src, enter, move }) => `<div class="eg ${cls}"><div class="a" style="position:absolute;inset:0;animation:${enter}"><div class="shadow"></div><div class="move" style="animation:${move}"><img src="${src}" alt=""></div></div></div>`;

/* 장면 목록 [이름, 길이(초), html] */
export function reelScenes({ date, topics, seconds = 3 }) {
  const dp = dateParts(date);
  const TOP = `<div class="top"><img src="${LOGO_H}" alt=""><span class="date">${dp.dot} ${dp.dow}</span></div>`;
  const hero = topics[0], co = COUNTRY[hero.cc];
  /* 표지 표정·말: 카드 표지와 같은 3단계 */
  const light = isLight(hero), anyHeavy = topics.some(t => !isLight(t));
  const say = !light ? '오늘은 조금<br>무거운 소식이야' : anyHeavy ? '오늘은 조금<br>무거운 소식도 있어' : '지구 근황 배달 왔어!';
  const scenes = [['cover', 3.6, page(`${TOP}
<div class="pill a" style="position:absolute;left:80px;top:300px;animation:up .5s .1s both"><i></i>allearth 지구 근황</div>
<h1 style="position:absolute;left:80px;top:400px;font-size:120px;font-weight:900;line-height:1.15;letter-spacing:-.045em">
 <span class="a" style="display:block;animation:up .55s .25s both">오늘 <mark style="animation:hl .4s .8s both">${esc(co.ko)}</mark>${iga(co.ko)}</span>
 <span class="a" style="display:block;animation:up .55s .4s both">들썩인 이유</span></h1>
${egung({ cls: 'c-eg', src: !light ? EG.serious : anyHeavy ? EG.calm : EG.smile, enter: 'hopin .9s .3s both', move: light ? 'idle 2.4s 1.2s infinite ease-in-out' : 'none' })}
<div class="bubble a" style="right:70px;top:620px;animation:pop .45s 1.2s both,bob 1.8s 1.7s infinite ease-in-out;transform-origin:30% 100%">${BUB()}<span>${say}</span></div>`,
  '.c-eg{left:100px;top:680px;width:880px;height:1198px}')]];

  topics.forEach((t, i) => {
    const c = COUNTRY[t.cc], heavy = !isLight(t);
    const photo = t.image_url && t.photoShown !== false;
    const art = photo
      ? `<div class="pz" style="animation:zoom ${seconds}s linear both"><img src="${esc(t.image_url)}" alt=""${t.image_position ? ` style="object-position:${esc(t.image_position)}"` : ''}></div>`
      : `<div class="pz" style="animation:zoom ${seconds}s linear both">${poster(hash(t.title) % 8, t.cc, t.title)}</div><img class="stk a" src="${flagSrc(t.cc)}" alt="" style="animation:sticker .5s .25s both">`;
    scenes.push([`t${i}`, seconds, page(`${TOP}
<div style="position:absolute;left:80px;right:140px;top:290px;display:flex;justify-content:space-between;align-items:center">
 <span class="pill a" style="animation:up .4s both"><i></i>오늘의 지구 근황</span><span style="font:700 30px Pop,P;color:var(--mute)">${i + 1} / ${topics.length}</span></div>
<div class="art a" style="animation:up .5s both">${art}
 ${t.badge ? `<span class="badge a" style="animation:pop .4s .5s both">${esc(t.badge)}</span>` : ''}
 ${t.category_label ? `<span class="chip a" style="animation:up .4s .55s both"># ${esc(t.category_label)}</span>` : ''}
</div>
${photo && t.image_credit ? `<p class="credit">${esc(t.image_credit)}</p>` : ''}
<div class="body">
 <div class="co a" style="animation:up .45s .35s both"><img src="${flagSrc(t.cc)}" alt=""><b>${esc(c.ko)}</b></div>
 <h2 class="a" style="animation:up .5s .45s both"><mark style="animation:hl .35s .9s both">${esc(t.title)}</mark></h2>
 <p class="a" style="animation:up .5s .6s both">${esc(t.short_desc)}</p>
</div>
${egung({ cls: 't-eg', src: heavy ? EG.serious : EG.smile, enter: 'up .5s .5s both', move: heavy ? 'none' : 'hop .8s 1s both' })}
<div class="dots">${topics.map((_, k) => `<i class="${k === i ? 'on' : ''}"></i>`).join('')}</div>`)]);
  });

  /* 마지막 장: 카드뉴스 마지막 장처럼 에궁이 뒤에 오늘 나라 국기를 흐리게 (나라가 적으면 반복해서 10자리) */
  const bgFlags = Array.from({ length: 10 }, (_, i) => `<img src="${flagSrc(topics[i % topics.length].cc)}" alt="">`).join('');
  scenes.push(['outro', 5.0, page(`${TOP}
<h2 class="a" style="position:absolute;left:0;right:0;top:330px;text-align:center;font-size:64px;font-weight:900;line-height:1.3;letter-spacing:-.04em;animation:up .5s .1s both">더 많은 나라 이야기는<br><mark style="animation:hl .4s .7s both">allearth</mark>에서 만나요</h2>
<p class="a" style="position:absolute;left:0;right:0;top:530px;text-align:center;font-size:34px;color:var(--mute);animation:up .5s .3s both">프로필 링크에서 지구 한 바퀴 돌아보세요</p>
<div class="fbg a" style="animation:up .6s .4s both">${bgFlags}</div>
${egung({ cls: 'o-eg', src: EG.outro, enter: 'hopin .9s .2s both', move: 'wave 1.6s 1.1s infinite ease-in-out' })}
<div class="bubble a" style="left:680px;top:575px;animation:pop .45s 1.0s both,bob 1.6s 1.5s infinite ease-in-out;transform-origin:30% 100%">${BUB()}<span>또 올게!</span></div>`,
  '.o-eg{left:250px;top:740px;width:560px;height:874px}' +
  '.fbg{position:absolute;left:0;right:0;top:700px;height:980px}' +
  '.fbg img{position:absolute;width:150px;height:112px;object-fit:cover;border-radius:16px;filter:blur(8px);opacity:.55}' +
  '.fbg img:nth-child(1){left:60px;top:40px;transform:rotate(-12deg)}.fbg img:nth-child(2){left:190px;top:250px;transform:rotate(8deg) scale(.8)}' +
  '.fbg img:nth-child(3){left:50px;top:470px;transform:rotate(6deg) scale(1.1)}.fbg img:nth-child(4){left:200px;top:700px;transform:rotate(-8deg) scale(.85)}' +
  '.fbg img:nth-child(5){left:360px;top:0;transform:rotate(10deg) scale(.7)}.fbg img:nth-child(6){right:60px;top:330px;transform:rotate(-10deg) scale(1.05)}' +
  '.fbg img:nth-child(7){right:190px;top:560px;transform:rotate(12deg) scale(.8)}.fbg img:nth-child(8){right:50px;top:780px;transform:rotate(-5deg) scale(.95)}' +
  '.fbg img:nth-child(9){left:620px;top:860px;transform:rotate(7deg) scale(.7)}.fbg img:nth-child(10){right:230px;top:120px;transform:rotate(-6deg) scale(.75)}')]);
  return scenes;
}

const hasFfmpeg = () => spawnSync('ffmpeg', ['-version'], { stdio: 'ignore' }).status === 0;

/* 장면마다 프레임을 찍어 mp4 로 만들고 이어 붙여요 */
export async function makeReel({ date, topics, dir, font, log = console.log, count, seconds }) {
  count = count || Math.max(1, parseInt(process.env.REELS_COUNT || '5', 10) || 5);
  seconds = seconds || Math.max(2, parseFloat(process.env.REELS_SECONDS || '3') || 3);
  if (!hasFfmpeg()) throw new Error('ffmpeg 가 없어서 릴스 영상을 만들지 못했어요');
  const picked = topics.slice(0, count);
  if (!picked.length) throw new Error('영상에 넣을 화제가 없어요');
  const scenes = reelScenes({ date, topics: picked, seconds });
  const browser = await chromium.launch();
  const files = [];
  try {
    const pg = await browser.newPage({ viewport: { width: RW, height: RH }, deviceScaleFactor: 1 });
    await pg.route(FONT_URL, r => font ? r.fulfill({ body: font, contentType: 'font/woff2' }) : r.abort());
    for (const [name, dur, html] of scenes) {
      await pg.setContent(html, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
      await pg.evaluate(async () => {
        await document.fonts.ready;
        await Promise.all([...document.images].map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; setTimeout(r, 8000); })));
        /* 못 불러온 사진은 빈 칸 대신 숨겨요 */
        for (const img of document.querySelectorAll('.pz img')) if (!img.naturalWidth) img.style.visibility = 'hidden';
      });
      const out = `${dir}/reel-${name}.mp4`, tmp = `${dir}/reel-${name}.tmp.mp4`;
      const ff = spawn('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'image2pipe', '-framerate', String(FPS), '-c:v', 'mjpeg', '-i', '-',
        '-c:v', 'libx264', '-preset', 'veryfast', '-crf', '20', '-pix_fmt', 'yuv420p', '-r', String(FPS), tmp], { stdio: ['pipe', 'ignore', 'inherit'] });
      const done = new Promise(r => ff.on('close', r));
      const n = Math.round(dur * FPS);
      for (let k = 0; k < n; k++) {
        /* 애니메이션을 멈추고 시간을 직접 맞춰서 찍어요 (느린 컴퓨터에서도 끊기지 않게) */
        await pg.evaluate(t => { for (const a of document.getAnimations()) { a.pause(); a.currentTime = t; } }, k * 1000 / FPS);
        const buf = await pg.screenshot({ type: 'jpeg', quality: 92 });
        if (!ff.stdin.write(buf)) await new Promise(r => ff.stdin.once('drain', r));
      }
      ff.stdin.end();
      if (await done !== 0) throw new Error(`릴스 ${name} 장면 인코딩 실패`);
      renameSync(tmp, out); files.push(out);
      log(`  ✓ 릴스 ${name} (${dur}초)`);
    }
  } finally { await browser.close(); }
  const list = `${dir}/reel-list.txt`;
  writeFileSync(list, files.map(f => `file '${f.split('/').pop()}'`).join('\n') + '\n');
  const r = spawnSync('ffmpeg', ['-y', '-loglevel', 'error', '-f', 'concat', '-safe', '0', '-i', list, '-c', 'copy', '-movflags', '+faststart', `${dir}/reel.tmp.mp4`], { stdio: 'inherit' });
  for (const f of [...files, list]) rmSync(f, { force: true });
  if (r.status !== 0) throw new Error('릴스 장면을 잇지 못했어요');
  renameSync(`${dir}/reel.tmp.mp4`, `${dir}/reel.mp4`);
  const total = scenes.reduce((s, x) => s + x[1], 0);
  log(`  ✓ reel.mp4 (${picked.length}개 화제 · ${total.toFixed(1)}초)`);
  return { file: `${dir}/reel.mp4`, seconds: total, topics: picked.length };
}
