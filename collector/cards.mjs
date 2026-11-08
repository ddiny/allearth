// 지구 근황 · 카드뉴스 만들기 (이미지까지만 만들고, 게시는 사람이 승인해요)
//  1) 앱(index.html)에 보이는 화제를 앱과 같은 방식으로 읽어요 (공개 주소·공개 키, 무료)
//  2) 나라마다 1개씩, 검색량 높은 순으로 골라요
//  3) HTML 카드를 1080×1350 JPEG로 찍어요  4) 캡션과 미리보기도 같이 만들어요
//
// 환경 변수
//  CARDS_SOURCE  app(기본) | trends
//                app    = 앱에 노출되는 데이터 (index.html 의 SUPABASE_URL·SUPABASE_KEY 로 읽기만 해요)
//                trends = 구글 트렌드 급상승 검색어를 원문 그대로 (앱 데이터가 없을 때 대안)
//  CARDS_EXCLUDE 뺄 나라 코드 (예: JP,US)
//  CARDS_COUNT  화제 카드 수, 기본 8 (최대 18)
//               8 이하 = 표지·마지막 장 포함 10장 이하라 API로 자동 게시 가능
//               9~18  = 최대 20장, 앱에서 직접 올리기용 (API는 캐러셀 10장까지만 받아요)
//  CARDS_INPUT  JSON 파일 경로. 주면 Supabase 대신 이 파일을 읽어요 (시험용)
//  CARDS_OUT    결과 폴더, 기본 out/cards
//  CARDS_HANDLE 카드 아래에 넣을 인스타 계정 이름 (예: @ath.earth). 비우면 로고를 넣어요
// 필요한 패키지: playwright, pretendard (워크플로에서 설치해요)
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { appendFileSync, readFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { dirname, join } from 'node:path';
import { chromium } from 'playwright';
import { W, H, FONT_URL, COUNTRY, CITY_KO, coverHtml, topicHtml, outroHtml, sheetHtml, dateParts } from './cards/template.mjs';
import { loadTrends, trafficKo } from './trends.mjs';
import { toKorean, engine } from './translate.mjs';

const HANDLE = (process.env.CARDS_HANDLE || '').trim();
const SOURCE = (process.env.CARDS_SOURCE || 'app').toLowerCase();
const EXCLUDE = new Set((process.env.CARDS_EXCLUDE || '').toUpperCase().split(',').map(s => s.trim()).filter(Boolean));
const ALLOW_SAMPLE = /^(1|true|yes)$/i.test(process.env.CARDS_ALLOW_SAMPLE || '');   // 테스트: 앱의 예시 데이터로도 만들기
const AI = SOURCE !== 'trends';   // 앱 데이터는 AI가 한국어로 요약한 것, 구글 트렌드는 원문 그대로

/* 앱(index.html)에 들어 있는 Supabase 공개 주소와 publishable 키를 그대로 읽어요. 앱을 바꾸면 카드도 따라가요 */
function appConfig() {
  const html = readFileSync(new URL('../index.html', import.meta.url), 'utf8');
  const url = (html.match(/const SUPABASE_URL\s*=\s*'([^']+)'/) || [])[1];
  const key = (html.match(/const SUPABASE_KEY\s*=\s*'([^']+)'/) || [])[1];
  if (!url || !key) throw new Error('index.html 에서 SUPABASE_URL / SUPABASE_KEY 를 찾지 못했어요');
  return { url: new URL(process.env.APP_SUPABASE_URL || url).origin, key };   // APP_SUPABASE_URL 은 시험용
}
/* Pretendard 폰트 파일 (없으면 Noto Sans KR로 대신 그려요) */
function loadFont() {
  try {
    const req = createRequire(import.meta.url);
    return readFileSync(join(dirname(req.resolve('pretendard/package.json')), 'dist/web/variable/woff2/PretendardVariable.woff2'));
  } catch { console.warn('⚠ pretendard 패키지가 없어서 Noto Sans KR로 그려요 (npm install pretendard)'); return null; }
}

const COUNT = Math.min(18, Math.max(1, parseInt(process.env.CARDS_COUNT || '8', 10) || 8));
const OUT = process.env.CARDS_OUT || 'out/cards';
const log = (...a) => console.log(...a);
const kstDate = iso => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10);

/* ---------- 1. 데이터 읽기 ---------- */
async function loadRows() {
  if (process.env.CARDS_INPUT) return JSON.parse(await readFile(process.env.CARDS_INPUT, 'utf8'));
  if (SOURCE === 'trends') {
    log('구글 트렌드에서 나라별 급상승 검색어를 읽어요…');
    const names = Object.fromEntries(Object.entries(COUNTRY).map(([cc, c]) => [cc, c.ko]));
    return loadTrends({ countries: Object.keys(COUNTRY).filter(cc => !EXCLUDE.has(cc)), names, log });
  }
  /* 앱과 같은 요청: trends?select=*,trend_news(*)&order=published_at.desc */
  const { url, key } = appConfig();
  log(`앱 데이터를 읽어요 (${new URL(url).host})…`);
  let r;
  try {
    r = await fetch(`${url}/rest/v1/trends?select=*,trend_news(*)&order=published_at.desc`, { headers: { apikey: key, Authorization: 'Bearer ' + key } });
  } catch (e) { throw new Error(`앱 데이터 서버(${new URL(url).host})에 접속하지 못했어요 (${(e.cause && e.cause.code) || e.message})`); }
  if (!r.ok) throw new Error(`앱 데이터를 읽지 못했어요 (Supabase ${r.status}) ${(await r.text()).slice(0, 160)}`);
  const rows = await r.json();
  const real = rows.filter(x => !x.is_sample).length;
  log(`  · 화제 ${rows.length}개 (실제 ${real}개, 예시 ${rows.length - real}개)`);
  if (!real && ALLOW_SAMPLE) { log('  ⚠ 테스트: 예시 데이터로 만들어요 (인스타 게시용 아님)'); return rows; }
  if (!real) throw new Error('앱에 실제 화제 데이터가 없어요. 지금 앱은 예시 데이터를 보여주고 있어서 인스타에는 올리지 않아요. (구글 트렌드로 만들려면 source 를 trends 로)');
  return rows;
}

/* ---------- 2. 고르기: 나라마다 1개, 검색량(heat) 높은 순 ---------- */
const RANK = { hot: 0, rising: 1, new: 2, talked: 3 };
function pick(rows) {
  const live = rows.filter(r => (ALLOW_SAMPLE || !r.is_sample) && COUNTRY[r.cc] && !EXCLUDE.has(r.cc) && r.title && r.short_desc);
  const sorted = [...live].sort((a, b) => (b.heat || 0) - (a.heat || 0) || (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9));
  const best = new Map();
  for (const r of sorted) { const k = ALLOW_SAMPLE ? r.id : r.cc; if (!best.has(k)) best.set(k, r); }   // 테스트는 앱에 있는 화제를 전부
  const countries = new Set([...best.values()].map(r => r.cc)).size;
  const topics = [...best.values()].slice(0, COUNT).map(r => ({
    cc: r.cc, title: r.title, title_en: r.title_en, short_desc: r.short_desc, status: r.status, category: r.category,
    pattern: r.pattern || 0, area: r.area || CITY_KO[r.city_id] || '',
    why: Array.isArray(r.why) ? r.why : [], what: Array.isArray(r.what) ? r.what : [],
    news: (r.trend_news || []).slice().sort((a, b) => String(b.published_on).localeCompare(String(a.published_on))),
    image_url: r.image_url || null, image_credit: r.image_credit || null, image_link: r.image_link || null, heat: r.heat || 0,
    traffic: r.traffic || 0, ai: AI
  }));
  const latest = live.map(r => r.published_at).filter(Boolean).sort().pop();
  return { topics, countries, date: latest ? kstDate(latest) : kstDate(new Date().toISOString()) };
}

/* ---------- 3. 찍기 ---------- */
/* 내용이 넘치면 '무슨 일' 블록을 뒤에서부터 빼고, 그래도 넘치면 제목 글자를 줄여요 */
async function fit(page) {
  return page.evaluate(() => {
    const box = document.querySelector('[data-fit]');
    if (!box) return {};
    const over = () => box.scrollHeight > box.clientHeight + 1;
    const drops = [...box.querySelectorAll('[data-drop]')];
    let dropped = 0;
    while (over() && drops.length) { drops.pop().remove(); dropped++; }
    const h = box.querySelector('[data-shrink]');
    let fs = h ? parseFloat(getComputedStyle(h).fontSize) : 0;
    while (h && over() && fs > 56) { fs -= 4; h.style.fontSize = fs + 'px'; }
    if (!box.querySelector('[data-drop]')) box.querySelector('.why')?.remove();
    return { dropped, overflow: over() };
  });
}

async function shoot(page, html, file) {
  await page.setContent(html, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});   // 사진이 늦어도 멈추지 않게
  const photo = await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; setTimeout(r, 8000); })));
    const photo = document.querySelector('img[data-photo]');
    if (photo && !photo.naturalWidth) { photo.closest('.art')?.classList.remove('has-photo'); photo.remove(); document.querySelector('[data-credit]')?.remove(); }   // 못 불러온 사진은 빼고 무늬를 보여줘요
    return !!document.querySelector('img[data-photo]');
  });
  const res = await fit(page);
  const buf = await page.screenshot({ type: 'jpeg', quality: 92, clip: { x: 0, y: 0, width: W, height: H } });
  await writeFile(file, buf);
  return { ...res, buf, photo };
}

/* ---------- 4. 캡션 ---------- */
function caption({ date, topics, countries, translated }) {
  const dp = dateParts(date);
  const photos = [...new Set(topics.filter(t => t.photoShown && t.image_credit).map(t => t.image_credit))];
  return [
    ...(ALLOW_SAMPLE ? ['[테스트 · 앱 예시 데이터로 만든 카드예요]', ''] : []),
    `${dp.ko}, 지구 근황`,
    '',
    `오늘 ${countries}개국에서 많이 검색된 화제 중 ${topics.length}개를 골랐어요.`,
    '',
    ...topics.map(t => `${COUNTRY[t.cc].ko} | ${t.title}${t.translated && t.title_en ? ` (${t.title_en})` : ''}${t.traffic ? ` · 검색 ${trafficKo(t.traffic)}` : ''}`),
    '',
    AI ? '구글 트렌드 급상승 검색어와 관련 뉴스를 AI가 요약했어요. 정확한 내용은 원문 기사로 확인해 주세요.'
       : translated ? `구글 트렌드 급상승 검색어 기준이에요. 검색어와 뉴스 제목은 ${translated}로 자동 번역했어요.`
       : '구글 트렌드 급상승 검색어 기준이에요. 검색어와 뉴스 제목은 원문 그대로 실었어요.',
    ...(photos.length ? [`사진: ${photos.join(', ')} (Pexels)`] : []),
    '',
    '#지구근황 #해외트렌드 #세계뉴스 #오늘의이슈 #카드뉴스 #' + topics.map(t => COUNTRY[t.cc].ko).slice(0, 3).join(' #')
  ].join('\n');
}

/* ---------- 실행 ---------- */
export async function main() {
  const rows = await loadRows();
  const { topics, countries, date } = pick(rows);
  /* 구글 트렌드 원문이면 검색어와 뉴스 제목을 한국어로 (무료 번역, 실패하면 원문) */
  let translated = '';
  if (SOURCE === 'trends' && !/^(0|false|no)$/i.test(process.env.CARDS_TRANSLATE || '')) {
    log(`한국어로 번역해요 (${engine()})…`);
    for (const t of topics) {
      const [kw, ...why] = await toKorean([t.title, ...t.why], t.cc, log);
      if (kw && kw !== t.title) { t.title_en = t.title; t.title = kw; }
      t.why = why.map(w => w.length > 60 ? w.slice(0, 58) + '…' : w);
      t.translated = true;
    }
    translated = engine();
  }
  if (!topics.length) throw new Error('카드로 만들 화제가 없어요 (실제 수집 데이터가 아직 없거나 모두 샘플이에요)');
  const dir = `${OUT}/${date}`;
  await mkdir(dir, { recursive: true });
  const total = topics.length + 2;
  log(`${date} · ${countries}개국 중 ${topics.length}개 화제 → 카드 ${total}장`);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const font = loadFont();
  await page.route(FONT_URL, route => font ? route.fulfill({ body: font, contentType: 'font/woff2' }) : route.abort());
  const files = [], warn = [];
  try {
    const slides = [
      { name: '01-cover.jpg', html: coverHtml({ date, topics, countryCount: countries, total, handle: HANDLE }) },
      ...topics.map((t, i) => ({ name: `${String(i + 2).padStart(2, '0')}-${t.cc.toLowerCase()}.jpg`, html: topicHtml(t, { index: i + 2, total, handle: HANDLE }), t })),
      { name: `${String(total).padStart(2, '0')}-outro.jpg`, html: outroHtml({ topics, restCount: countries - topics.length, total, handle: HANDLE, ai: AI, translated }) }
    ];
    for (const s of slides) {
      const r = await shoot(page, s.html, `${dir}/${s.name}`);
      files.push({ name: s.name, buf: r.buf });
      if (s.t) s.t.photoShown = r.photo;
      if (r.overflow) warn.push(`${s.name}: 글이 길어서 잘렸을 수 있어요`);
      log(`  ✓ ${s.name}${r.dropped ? ` (이유 ${r.dropped}줄 생략)` : ''}${r.overflow ? ' ⚠ 넘침' : ''}`);
    }
    /* 미리보기 한 장 */
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.setContent(sheetHtml(files.map(f => 'data:image/jpeg;base64,' + f.buf.toString('base64'))), { waitUntil: 'load' });
    await page.screenshot({ path: `${dir}/preview.jpg`, type: 'jpeg', quality: 85, fullPage: true });
  } finally { await browser.close(); }

  const cap = caption({ date, topics, countries, translated });
  await writeFile(`${dir}/caption.txt`, cap + '\n');
  await writeFile(`${dir}/cards.json`, JSON.stringify({ date, countries, slides: files.map(f => f.name), topics: topics.map(t => ({ cc: t.cc, title: t.title, photo: t.photoShown ? { credit: t.image_credit, link: t.image_link } : null })) }, null, 1));

  const summary = `## 카드뉴스 (${date})\n${countries}개국 중 ${topics.length}개 화제, 카드 ${total}장\n\n` +
    topics.map((t, i) => `${i + 2}. **${t.cc}** ${t.title}`).join('\n') +
    (warn.length ? `\n\n확인 필요:\n${warn.map(w => '- ' + w).join('\n')}` : '') +
    '\n';
  log('\n' + cap);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `date=${date}\ndir=${dir}\n`);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error('✗ ' + (e && e.message || e)); process.exit(1); });
