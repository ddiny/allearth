// 지구 근황 · 카드뉴스 HTML 템플릿 (1080 × 1350, 인스타 4:5)
// 스타일: 아이보리 종이 + 옅은 그레인, 큰 굵은 글자 + 형광펜 강조, 국기·배지는 스티커처럼.
// 프로필 격자는 표지를 좌우로 약 34px씩 잘라 보여줘서, 중요한 내용은 좌우 64px 안쪽에 둬요.
import { readFileSync } from 'node:fs';

export const W = 1080, H = 1350;
export const FONT_URL = 'https://cards.local/pretendard.woff2';   // cards.mjs가 이 주소로 폰트 파일을 넘겨줘요

/* 나라 정보: 앱 이름, 영문, 국기 파일, 앱의 나라 색 [배경, 무늬] */
export const COUNTRY = {
  KR: { ko: '한국', en: 'KOREA', flag: 'kr', c: ['#3340FF', '#D9DCFF'] },
  JP: { ko: '일본', en: 'JAPAN', flag: 'jp', c: ['#F3B6CD', '#7E1F46'] },
  CN: { ko: '중국', en: 'CHINA', flag: 'cn', c: ['#E8A200', '#3D2A00'] },
  US: { ko: '미국', en: 'USA', flag: 'us', c: ['#E23B3B', '#FFDCDC'] },
  FR: { ko: '프랑스', en: 'FRANCE', flag: 'fr', c: ['#7B61F2', '#E6E0FF'] },
  UK: { ko: '영국', en: 'UK', flag: 'gb', c: ['#1F2B63', '#C9D2FF'] },
  IT: { ko: '이탈리아', en: 'ITALY', flag: 'it', c: ['#2E9E5B', '#DDF5E5'] },
  BR: { ko: '브라질', en: 'BRAZIL', flag: 'br', c: ['#F2D01B', '#0B5B35'] },
  AU: { ko: '호주', en: 'AUSTRALIA', flag: 'au', c: ['#10A5B5', '#D3F4F7'] },
  TH: { ko: '태국', en: 'THAILAND', flag: 'th', c: ['#FF8A3D', '#4A2300'] },
  DE: { ko: '독일', en: 'GERMANY', flag: 'de', c: ['#3A3F4B', '#E6E8EF'] },
  ES: { ko: '스페인', en: 'SPAIN', flag: 'es', c: ['#D6336C', '#FFE0EC'] },
  TR: { ko: '튀르키예', en: 'TÜRKIYE', flag: 'tr', c: ['#9E1B32', '#FFDDE3'] },
  CA: { ko: '캐나다', en: 'CANADA', flag: 'ca', c: ['#0B6E4F', '#D9F5EA'] },
  MX: { ko: '멕시코', en: 'MEXICO', flag: 'mx', c: ['#B7D336', '#2E3A00'] },
  IN: { ko: '인도', en: 'INDIA', flag: 'in', c: ['#B85C00', '#FFE6CC'] },
  ID: { ko: '인도네시아', en: 'INDONESIA', flag: 'id', c: ['#6D4C41', '#F2E3DC'] },
  VN: { ko: '베트남', en: 'VIETNAM', flag: 'vn', c: ['#00897B', '#D6F5F1'] },
  SG: { ko: '싱가포르', en: 'SINGAPORE', flag: 'sg', c: ['#5E6B7A', '#E4E9EE'] },
  TW: { ko: '대만', en: 'TAIWAN', flag: 'tw', c: ['#5E35B1', '#E7DCF8'] }
};
export const CITY_KO = {
  seoul: '서울', tokyo: '도쿄', newyork: '뉴욕', paris: '파리', london: '런던', rome: '로마', saopaulo: '상파울루', sydney: '시드니',
  bangkok: '방콕', berlin: '베를린', madrid: '마드리드', istanbul: '이스탄불', toronto: '토론토', mexicocity: '멕시코시티', mumbai: '뭄바이',
  jakarta: '자카르타', hochiminh: '호치민', singapore: '싱가포르', taipei: '타이베이', shanghai: '상하이'
};
const STATUS = { hot: 'HOT', rising: 'RISING', new: 'NEW', talked: 'ONGOING' };
const CATEGORY = { food: '푸드', tech: '테크', life: '라이프', culture: '컬처', fashion: '패션', wellness: '웰니스', travel: '여행' };

/* 국기: collector/cards/flags/*.svg (flag-icons, MIT) 를 data URI로 넣어요 */
const flagCache = {};
export function flagSrc(cc) {
  const f = (COUNTRY[cc] || {}).flag;
  if (!f) return '';
  if (!flagCache[f]) flagCache[f] = 'data:image/svg+xml;base64,' + readFileSync(new URL(`./flags/${f}.svg`, import.meta.url)).toString('base64');
  return flagCache[f];
}

const esc = s => String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const hash = s => [...String(s)].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7);
const pad = n => String(n).padStart(2, '0');

/* 사진이 없을 때 쓰는 평면 무늬 (앱의 poster()와 같은 8종) */
export function poster(pat, cc, seed) {
  const [bg, fg] = (COUNTRY[cc] || COUNTRY.KR).c, h = hash(seed), a = (h % 7) / 7, b = ((h >> 3) % 5) / 5;
  let g = '';
  switch (pat % 8) {
    case 0: for (let i = 0; i < 8; i++) g += `<circle cx="${250 + a * 60}" cy="${110 + b * 40}" r="${18 + i * 24}" fill="none" stroke="${fg}" stroke-width="${i % 2 ? 3 : 12}"/>`; break;
    case 1: for (let y = 0; y < 9; y++) for (let x = 0; x < 13; x++) g += `<circle cx="${22 + x * 29}" cy="${22 + y * 32}" r="${3 + ((x + y + Math.round(a * 5)) % 4) * 3.2}" fill="${fg}"/>`; break;
    case 2: g += `<circle cx="${190 + a * 40}" cy="300" r="150" fill="${fg}"/><rect x="0" y="262" width="400" height="38" fill="${bg}"/><rect x="0" y="258" width="400" height="5" fill="${fg}"/>`; break;
    case 3: for (let i = -6; i < 14; i++) g += `<rect x="${i * 34}" y="-60" width="${12 + b * 8}" height="440" fill="${fg}" transform="rotate(${-18 - a * 8} 200 150)" opacity=".92"/>`; break;
    case 4: for (let i = 0; i < 4; i++) { const w = 300 - i * 64; g += `<path d="M${200 - w / 2} 300 V${150 + i * 10} a${w / 2} ${w / 2} 0 0 1 ${w} 0 V300 Z" fill="${i % 2 ? bg : fg}" stroke="${fg}" stroke-width="3"/>`; } break;
    case 5: for (let y = 0; y < 5; y++) for (let x = 0; x < 7; x++) if ((x + y + Math.round(a * 3)) % 2 === 0) g += `<rect x="${x * 60 - 10}" y="${y * 60}" width="60" height="60" fill="${fg}" opacity="${(.35 + ((x * y) % 3) * .3).toFixed(2)}"/>`; break;
    case 6: for (let i = 0; i < 7; i++) { let d = 'M-10 ' + (40 + i * 38); for (let x = 0; x <= 420; x += 20) d += ` L${x - 10} ${(40 + i * 38 + Math.sin(x / 38 + i * .7 + a * 6) * 14).toFixed(1)}`; g += `<path d="${d}" fill="none" stroke="${fg}" stroke-width="${i % 2 ? 4 : 10}" stroke-linecap="round"/>`; } break;
    default: g += `<rect x="${60 + a * 40}" y="40" width="190" height="190" fill="${fg}" opacity=".95" transform="rotate(12 150 130)"/><rect x="${170 - b * 30}" y="90" width="170" height="170" fill="none" stroke="${fg}" stroke-width="10" transform="rotate(-8 255 175)"/>`;
  }
  return `<svg viewBox="0 0 400 300" preserveAspectRatio="xMidYMid slice"><rect width="400" height="300" fill="${bg}"/>${g}</svg>`;
}

const STAR = '<svg viewBox="0 0 24 24"><path d="M12 0C12.8 7 17 11.2 24 12C17 12.8 12.8 17 12 24C11.2 17 7 12.8 0 12C7 11.2 11.2 7 12 0Z"/></svg>';
const LOGO = `<span class="logo">ath${STAR}</span>`;
const ARROW = '<svg viewBox="0 0 24 24"><path d="M4 12h15M13 5l7 7-7 7" fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" stroke-linejoin="round"/></svg>';
const ICON = {
  save: '<svg viewBox="0 0 24 24"><path d="M6 3h12v18l-6-4.5L6 21z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>',
  share: '<svg viewBox="0 0 24 24"><path d="M21 3 10 14M21 3l-7 18-4-7-7-4z" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linejoin="round"/></svg>',
  follow: '<svg viewBox="0 0 24 24"><circle cx="10" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="2.2"/><path d="M3 21c0-4 3.2-6.5 7-6.5s7 2.5 7 6.5M19 8v6M16 11h6" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round"/></svg>'
};
/* 스타일은 모두 cards.css 한 파일에 있어요 (design/*.html 예시도 같은 파일을 써요) */
const CSS = readFileSync(new URL('./cards.css', import.meta.url), 'utf8');
const FONTS = '<link rel="stylesheet" href="https://fonts.googleapis.com/css2?family=Anybody:wdth,wght@50..150,700..900&family=DM+Mono:wght@500&family=Noto+Sans+KR:wght@500;700;900&display=block">';
const FONT_FACE = `@font-face { font-family:'Pretendard'; src:url('${FONT_URL}') format('woff2'); font-weight:45 920; font-display:block; }`;
const page = body => `<!doctype html><html lang="ko"><head><meta charset="utf-8">${FONTS}<style>${FONT_FACE}\n${CSS}</style></head><body>${body}</body></html>`;
const handleHtml = handle => handle ? `<span class="handle">${esc(handle)}</span>` : LOGO.replace('class="logo"', 'class="logo logo--sm"');

/* 날짜 표기: '2026-11-06' -> { dot:'2026.11.06', ko:'11월 6일', dow:'FRI' } */
export function dateParts(iso) {
  const d = new Date(iso + 'T00:00:00Z');
  return { dot: `${d.getUTCFullYear()}.${pad(d.getUTCMonth() + 1)}.${pad(d.getUTCDate())}`, ko: `${d.getUTCMonth() + 1}월 ${d.getUTCDate()}일`, dow: ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'][d.getUTCDay()] };
}

/* ---------- 1장: 표지 ---------- */
export function coverHtml({ date, topics, countryCount, total, handle }) {
  const dp = dateParts(date), compact = topics.length > 8;
  const tiles = topics.map((t, i) => {
    const co = COUNTRY[t.cc];
    return `<li><img class="flag" src="${flagSrc(t.cc)}" alt=""><div><span>${esc(co.ko)}</span><b>${esc(t.title)}</b></div><i class="mono">${pad(i + 2)}</i></li>`;
  }).join('');
  return page(`<div class="card s-cover${compact ? ' compact' : ''}">
  <div class="top">${LOGO}<span class="mono date">${dp.dot} ${dp.dow}</span></div>
  <div class="pill">오늘의 지구 근황</div>
  <h1>지금 ${countryCount}개국이<br><mark>가장 많이 검색한</mark><br>이야기</h1>
  <ul class="list">${tiles}</ul>
  <div class="foot"><span>구글 트렌드 급상승 검색어 기준 · ${total}장</span><span class="go">넘겨서 보기<span>${ARROW}</span></span></div>
</div>`);
}

/* ---------- 2~9장: 나라별 화제 ---------- */
export function topicHtml(t, { index, total, handle }) {
  const co = COUNTRY[t.cc];
  const sub = [co.en, t.area].filter(Boolean).join(' · ');
  const why = (t.why || []).slice(0, 3).map((w, i) => `<li data-drop><i class="mono">${pad(i + 1)}</i><span>${esc(w)}</span></li>`).join('');
  const sources = [...new Set((t.news || []).map(n => n.source).filter(Boolean))].slice(0, 2);
  const credit = t.image_url && t.image_credit ? `Photo ${esc(t.image_credit)} / Pexels` : '';
  const img = t.image_url ? `<img class="photo" src="${esc(t.image_url)}" alt="" data-photo>` : '';
  const st = t.status in STATUS ? t.status : 'rising';
  return page(`<div class="card s-topic" data-fit>
  <div class="top">
    <div class="who"><img class="flag" src="${flagSrc(t.cc)}" alt=""><div><b>${esc(co.ko)}</b><span class="mono">${esc(sub)}</span></div></div>
    <span class="count mono">${pad(index)} / ${pad(total)}</span>
  </div>
  <div class="art${img ? ' has-photo' : ''}" style="--cc:${co.c[0]};--cc2:${co.c[1]}">${poster(t.pattern || 0, t.cc, t.title)}<img class="big-flag sticker" src="${flagSrc(t.cc)}" alt="">${img}
    <div class="badge badge--${st}">${STATUS[st]}</div>
    ${t.category in CATEGORY ? `<div class="chip"># ${CATEGORY[t.category]}</div>` : ''}
    ${credit ? `<div class="credit mono" data-credit>${credit}</div>` : ''}
  </div>
  <h2 data-shrink><mark>${esc(t.title)}</mark></h2>
  <p class="short">${esc(t.short_desc)}</p>
  ${why ? `<ul class="why">${why}</ul>` : ''}
  <div class="foot"><span>출처 Google 트렌드${sources.length ? ' · ' + sources.map(esc).join(', ') : ''}${t.ai === false ? (t.translated ? ' · 자동 번역' : '') : ' · AI 요약'}</span>${handleHtml(handle)}</div>
</div>`);
}

/* ---------- 마지막 장 ---------- */
export function outroHtml({ topics, restCount, total, handle, ai = true, translated = '' }) {
  const many = topics.length > 8;
  const flags = topics.slice(0, 18).map(t => `<img class="flag sticker" src="${flagSrc(t.cc)}" alt="">`).join('');
  const acts = [['save', '저장하기', '내일 또 보기'], ['share', '공유하기', '친구에게 보내기'], ['follow', '팔로우', '매일 아침 받기']]
    .map(([k, a, b]) => `<li><span>${ICON[k]}</span><b>${a}</b><em>${b}</em></li>`).join('');
  return page(`<div class="card s-outro${many ? ' many' : ''}">
  <div class="top">${LOGO}<span class="count mono">${pad(total)} / ${pad(total)}</span></div>
  <div class="flags">${flags}</div>
  <h2>${!ai ? `내일 아침에도<br><mark>세계 검색어</mark>를<br>모아 올게요` : restCount > 0 ? `나머지 <mark>${restCount}개국</mark> 소식은<br>앱에서 볼 수 있어요` : `더 자세한 소식은<br><mark>앱에서</mark> 볼 수 있어요`}</h2>
  <p class="sub">${ai ? '매일 밤 12시(한국 시간)에 새 화제로 바뀌어요.' : '매일 아침 7시, 나라별 급상승 검색어를 카드로 정리해요.'}</p>
  <ul class="acts">${acts}</ul>
  <p class="note">${ai ? '구글 트렌드 급상승 검색어와 관련 뉴스를 AI가 요약했어요. 정확한 내용은 원문 기사로 확인해 주세요.' : translated ? `구글 트렌드 급상승 검색어 기준이에요. 검색어와 뉴스 제목은 ${esc(translated)}로 자동 번역했어요.` : '구글 트렌드 급상승 검색어 기준이에요. 검색어와 뉴스 제목은 원문 그대로 실었어요.'}</p>
  ${handle ? `<div class="foot"><span></span>${handleHtml(handle)}</div>` : ''}
</div>`);
}

/* 미리보기: 모든 장을 한 장에 모아 보기 */
export function sheetHtml(images, cols = 5) {
  const w = 300, h = 375, gap = 16;
  return `<!doctype html><html><head><meta charset="utf-8"><style>*{margin:0}body{background:#DCD8CF;padding:${gap}px;display:grid;grid-template-columns:repeat(${cols},${w}px);gap:${gap}px;width:max-content}img{width:${w}px;height:${h}px;display:block;border-radius:6px;box-shadow:0 2px 8px rgba(18,19,24,.18)}</style></head><body>${images.map(src => `<img src="${src}">`).join('')}</body></html>`;
}
