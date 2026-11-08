// AllEarth · 인스타 카드뉴스 만들기 (이미지까지만 만들고, 게시는 사람이 승인해요)
//  1) 앱의 화제 파일(app/assets/topics/topics.js)을 앱과 똑같이 읽어요 — 글은 한 글자도 바꾸지 않아요
//  2) 앱에 적힌 순서대로 카드 1080×1350 JPEG를 찍어요 (표지 + 화제)
//  3) 캡션(일정·출처·이미지 출처)과 미리보기도 같이 만들어요
//
// 환경 변수
//  CARDS_COUNT   화제 카드 수 (기본: 전부, 최대 18). 표지 포함 10장을 넘으면 앱에서 직접 올리기용
//                (인스타 API는 캐러셀 10장까지. 화제가 9개면 마지막 장 없이 10장)
//  CARDS_EXCLUDE 뺄 나라 코드 (예: JP,US)
//  CARDS_PHOTOS  0 이면 사진 대신 국기 그래픽 (사진 사용 조건을 확인하기 전 등)
//  CARDS_HANDLE  카드 아래 인스타 계정 이름 (예: @glb.gummi). 비우면 로고
//  CARDS_OUT     결과 폴더, 기본 out/cards
//  CARDS_APP_DIR 앱 폴더, 기본 app
// 필요한 패키지: playwright (워크플로에서 설치해요). 폰트는 앱에 들어 있는 파일을 써요.
import { mkdir, writeFile } from 'node:fs/promises';
import { appendFileSync, readFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { chromium } from 'playwright';
import { W, H, FONT_URL, COUNTRY, coverHtml, topicHtml, outroHtml, sheetHtml, dateParts } from './cards/template.mjs';
import { loadAllEarth, APP_DIR } from './allearth.mjs';

const MAX_API = 10;   // 인스타 API 캐러셀 한도
const HANDLE = (process.env.CARDS_HANDLE || '').trim();
const EXCLUDE = new Set((process.env.CARDS_EXCLUDE || '').toUpperCase().split(',').map(s => s.trim()).filter(Boolean));
const PHOTOS = !/^(0|false|no|off)$/i.test(process.env.CARDS_PHOTOS || '');
const COUNT = Math.min(18, Math.max(1, parseInt(process.env.CARDS_COUNT || '18', 10) || 18));
const OUT = process.env.CARDS_OUT || 'out/cards';
const log = (...a) => console.log(...a);
const kstDate = iso => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10);

/* Pretendard: 앱의 폰트 파일 그대로 */
function loadFont() {
  const f = join(APP_DIR, 'assets/fonts/PretendardVariable.woff2');
  if (existsSync(f)) return readFileSync(f);
  console.warn('⚠ 앱 폰트(PretendardVariable.woff2)가 없어서 기본 글꼴로 그려요');
  return null;
}

/* ---------- 1. 앱 화제 읽기 ---------- */
function pick() {
  const { rows, date, dateLabel } = loadAllEarth();
  log(`AllEarth 앱 화제를 읽어요 (topics.js · ${dateLabel} · ${rows.length}개)`);
  const topics = rows
    .filter(r => COUNTRY[r.cc] && !EXCLUDE.has(r.cc) && r.title)
    .sort((a, b) => a.order - b.order)
    .slice(0, COUNT)
    .map(r => ({ ...r, image_url: PHOTOS ? r.image_url : null }));
  const unknown = rows.filter(r => !COUNTRY[r.cc]).map(r => r.cc);
  if (unknown.length) log(`  ⚠ 카드 나라 목록에 없는 나라는 빠져요: ${unknown.join(', ')} (collector/cards/template.mjs 의 COUNTRY 에 추가하면 돼요)`);
  return { topics, date };
}

/* ---------- 2. 찍기 ---------- */
/* 글이 넘치면 제목 글자를 조금씩 줄여요 */
async function fit(page) {
  return page.evaluate(() => {
    const box = document.querySelector('[data-fit]');
    if (!box) return {};
    const over = () => box.scrollHeight > box.clientHeight + 1;
    const h = box.querySelector('[data-shrink]');
    let fs = h ? parseFloat(getComputedStyle(h).fontSize) : 0;
    while (h && over() && fs > 56) { fs -= 4; h.style.fontSize = fs + 'px'; }
    return { overflow: over() };
  });
}

async function shoot(page, html, file) {
  await page.setContent(html, { waitUntil: 'networkidle', timeout: 30000 }).catch(() => {});
  const photo = await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all([...document.images].map(img => img.complete ? null : new Promise(r => { img.onload = img.onerror = r; setTimeout(r, 8000); })));
    const photo = document.querySelector('img[data-photo]');
    if (photo && !photo.naturalWidth) { photo.closest('.art')?.classList.remove('has-photo'); photo.remove(); document.querySelector('[data-credit]')?.remove(); }   // 못 불러온 사진은 빼고 국기 그래픽으로
    return !!document.querySelector('img[data-photo]');
  });
  const res = await fit(page);
  const buf = await page.screenshot({ type: 'jpeg', quality: 92, clip: { x: 0, y: 0, width: W, height: H } });
  await writeFile(file, buf);
  return { ...res, buf, photo };
}

/* ---------- 3. 캡션 (앱 문구 그대로) ---------- */
function caption({ date, topics, countries }) {
  const dp = dateParts(date);
  const credits = topics.filter(t => t.photoShown && t.image_credit);
  return [
    `${dp.ko}, AllEarth 지구 근황`,
    '',
    `${countries}개국에서 지금 일어나는 이야기를 모았어요.`,
    '',
    ...topics.map(t => `${COUNTRY[t.cc].ko} | ${t.title}${t.when ? ` (${t.when})` : ''}`),
    '',
    '출처',
    ...topics.filter(t => t.source_name).map(t => `${COUNTRY[t.cc].ko}: ${t.source_name}`),
    ...(credits.length ? ['', '이미지', ...credits.map(t => `${COUNTRY[t.cc].ko}: ${t.image_credit.replace(/^(이미지|사진):\s*/, '')}`)] : []),
    '',
    '#AllEarth #올어스 #지구근황 #세계여행 #해외이슈 #' + topics.map(t => COUNTRY[t.cc].ko).slice(0, 3).join(' #')
  ].join('\n');
}

/* ---------- 실행 ---------- */
export async function main() {
  const { topics, date } = pick();
  if (!topics.length) throw new Error('카드로 만들 화제가 없어요 (app/assets/topics/topics.js 확인)');
  const countries = new Set(topics.map(t => t.cc)).size;
  /* 자동 게시 한도(10장) 안에서 화제를 우선해요: 화제 9개면 마지막 장을 빼고 10장 */
  const withOutro = topics.length + 2 <= MAX_API || topics.length + 1 > MAX_API;
  const total = topics.length + 1 + (withOutro ? 1 : 0);
  const dir = `${OUT}/${date}`;
  await mkdir(dir, { recursive: true });
  log(`${date} · ${countries}개국 ${topics.length}개 화제 → 카드 ${total}장${total > MAX_API ? ' (10장 초과: 앱에서 직접 올리기용)' : ''}`);

  const browser = await chromium.launch();
  const page = await browser.newPage({ viewport: { width: W, height: H }, deviceScaleFactor: 1 });
  const font = loadFont();
  await page.route(FONT_URL, route => font ? route.fulfill({ body: font, contentType: 'font/woff2' }) : route.abort());
  const files = [], warn = [];
  try {
    const slides = [
      { name: '01-cover.jpg', html: coverHtml({ date, topics, countryCount: countries, total, handle: HANDLE }) },
      ...topics.map((t, i) => ({ name: `${String(i + 2).padStart(2, '0')}-${t.cc.toLowerCase()}.jpg`, html: topicHtml(t, { index: i + 2, total, handle: HANDLE }), t })),
      ...(withOutro ? [{ name: `${String(total).padStart(2, '0')}-outro.jpg`, html: outroHtml({ topics, total, handle: HANDLE }) }] : [])
    ];
    for (const s of slides) {
      const r = await shoot(page, s.html, `${dir}/${s.name}`);
      files.push({ name: s.name, buf: r.buf });
      if (s.t) s.t.photoShown = r.photo;
      if (r.overflow) warn.push(`${s.name}: 글이 길어서 잘렸을 수 있어요`);
      log(`  ✓ ${s.name}${r.overflow ? ' ⚠ 넘침' : ''}`);
    }
    await page.setViewportSize({ width: 1600, height: 1000 });
    await page.setContent(sheetHtml(files.map(f => 'data:image/jpeg;base64,' + f.buf.toString('base64'))), { waitUntil: 'load' });
    await page.screenshot({ path: `${dir}/preview.jpg`, type: 'jpeg', quality: 85, fullPage: true });
  } finally { await browser.close(); }

  const cap = caption({ date, topics, countries });
  await writeFile(`${dir}/caption.txt`, cap + '\n');
  await writeFile(`${dir}/cards.json`, JSON.stringify({ date, countries, slides: files.map(f => f.name), topics: topics.map(t => ({ cc: t.cc, title: t.title, source: t.source_url, photo: t.photoShown ? t.image_credit : null })) }, null, 1));

  /* 앱 화제 날짜가 지났으면 알려줘요 (요약에 '오늘'·'내일' 같은 말이 있어 늦게 올리면 틀린 말이 돼요) */
  const age = Math.round((Date.parse(kstDate(new Date().toISOString())) - Date.parse(date)) / 864e5);
  if (age >= 1) { warn.unshift(`앱 화제 날짜가 ${date}로 ${age}일 지났어요. 요약의 '오늘'·'내일' 같은 표현이 지금과 맞지 않을 수 있어요. topics.js 를 새로 고친 뒤 올리는 걸 추천해요.`); log(`  ⚠ 화제 날짜 ${date} · ${age}일 지남`); }
  if (total > MAX_API) warn.push(`카드가 ${total}장이라 자동 게시는 안 돼요 (API 한도 10장). Artifacts에서 내려받아 앱으로 올려주세요.`);

  const summary = `## 카드뉴스 (${date} · AllEarth 앱 화제)\n${countries}개국 ${topics.length}개 화제, 카드 ${total}장\n\n` +
    topics.map((t, i) => `${i + 2}. **${COUNTRY[t.cc].ko}** ${t.title}`).join('\n') +
    (warn.length ? `\n\n확인 필요:\n${warn.map(w => '- ' + w).join('\n')}` : '') + '\n';
  log('\n' + cap);
  if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, summary);
  if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `date=${date}\ndir=${dir}\n`);
}
if (import.meta.url === `file://${process.argv[1]}`) main().catch(e => { console.error('✗ ' + (e && e.message || e)); process.exit(1); });
