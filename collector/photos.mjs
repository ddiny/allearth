// 사진이 없는 화제에 무료 사진 채우기
//  - PIXABAY_API_KEY 가 있으면 Pixabay (무료 가입 후 바로 발급, 상업적 사용 가능, 출처 표기 의무 없음)
//  - 없고 PEXELS_API_KEY 가 있으면 Pexels
//  - 둘 다 없으면 사진 없이 국기 그래픽
// Pixabay 는 사진 주소를 계속 걸어두지 말고 내려받아 쓰라고 안내해요. 그래서 사진을 내려받아 카드 이미지 안에 넣어요.
// 엉뚱한 사진을 줄이려고, 사진 설명(태그·alt)에 검색어의 단어가 실제로 들어 있는 사진만 골라요.

const PIXABAY = (process.env.PIXABAY_API_KEY || '').trim();
const PEXELS = (process.env.PEXELS_API_KEY || '').trim();
const PIXABAY_BASE = process.env.PIXABAY_BASE || 'https://pixabay.com';
const PEXELS_BASE = process.env.PEXELS_BASE || 'https://api.pexels.com';
export const hasPhotoSource = () => !!(PIXABAY || PEXELS);
export const photoSource = () => PIXABAY ? 'Pixabay' : PEXELS ? 'Pexels' : '';

const CATEGORY_EN = { food: 'food', tech: 'technology', life: 'city life', culture: 'culture', fashion: 'fashion', wellness: 'wellness', travel: 'travel',
  '푸드': 'food', '테크': 'technology', '라이프': 'city life', '컬처': 'culture', '패션': 'fashion', '웰니스': 'wellness', '여행': 'travel',
  '음악': 'concert', '영화': 'cinema', '스포츠': 'sports', '테니스': 'tennis', '모터스포츠': 'racing', '예술': 'art', '문화': 'festival' };
const STOP = new Set('the a an of and or in on at to for vs v with from as by is are be its new us uk city'.split(' '));
const words = s => String(s || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(w => w.length >= 4 && !STOP.has(w));
const used = new Set(), usedAuthors = new Set();   // 같은 사진·같은 작가(비슷한 연작)를 반복하지 않게

/* 검색 결과를 공통 모양으로: { id, width, text(설명), url, author, link } */
async function search(query) {
  if (PIXABAY) {
    const q = new URLSearchParams({ key: PIXABAY, q: query.slice(0, 100), image_type: 'photo', orientation: 'horizontal', safesearch: 'true', per_page: '20', min_width: '1000' });
    const r = await fetch(`${PIXABAY_BASE}/api/?${q}`);
    if (!r.ok) throw new Error(`Pixabay ${r.status}`);
    return ((await r.json()).hits || []).map(h => ({ id: 'pb' + h.id, width: h.imageWidth, text: h.tags, url: h.largeImageURL || h.webformatURL, author: h.user, link: h.pageURL }));
  }
  const r = await fetch(`${PEXELS_BASE}/v1/search?${new URLSearchParams({ query, per_page: '15', orientation: 'landscape' })}`, { headers: { Authorization: PEXELS } });
  if (!r.ok) throw new Error(`Pexels ${r.status}`);
  return ((await r.json()).photos || []).map(p => ({ id: 'px' + p.id, width: p.width, text: p.alt, url: p.src.large2x || p.src.large, author: p.photographer, link: p.url }));
}

/* 사진을 내려받아 카드 안에 넣을 data 주소로 */
async function download(url) {
  let r;
  for (let i = 0; i < 4; i++) {                       // 사진 서버가 잠시 막으면(429) 조금 기다렸다 다시
    r = await fetch(url);
    if (r.ok || (r.status !== 429 && r.status < 500)) break;
    await new Promise(z => setTimeout(z, 2000 * (i + 1)));
  }
  if (!r.ok) throw new Error(`사진 내려받기 ${r.status}`);
  const type = (r.headers.get('content-type') || 'image/jpeg').split(';')[0];
  return `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`;
}

/* 제목에서 화제의 종류를 알아내 장면 검색어로 바꿔요.
   고유명사(나라·팀·작품 이름)로 검색하면 엉뚱한 사진(예: 'Costa Rica' → 새 사진)이 나오기 쉬워서예요.
   first: 제목 검색보다 먼저 쓸지 (스포츠·드라마·정치는 제목 검색이 특히 잘 틀려요) */
const SCENES = [
  // re: 영어 제목 · ko: 한국어 제목·요약 (앱 데이터의 한국어 문장이 화제 종류를 더 잘 알려줘요). 위에서부터 먼저 맞는 것을 써요
  // 재난은 맨 앞: 다른 말(경기·방송 등)과 섞여도 재난 사진이 맞아요. 사람 얼굴이 크게 나오지 않는 장면으로 찾아요
  { re: /\b(earthquake|quake|tsunami)\b/i, ko: /지진|쓰나미|여진/, q: 'seismograph', first: true },
  { re: /\b(flood|flooding)\b/i, ko: /홍수|침수|범람/, q: 'flood water street', first: true },
  { re: /\b(wildfire|bushfire|forest fire)\b/i, ko: /산불/, q: 'forest fire smoke', first: true },
  { re: /\b(tennis|atp|wta|wimbledon)\b/i, ko: /테니스|윔블던|US오픈|호주오픈/, q: 'tennis court', first: true },
  { re: /\b(f1|formula ?1|grand prix|motogp|nascar)\b/i, ko: /(^|[^A-Za-z0-9])F1(?![A-Za-z0-9])|포뮬러|그랑프리|모터스포츠/, q: 'race car track', first: true },
  { re: /\b(marathon)\b/i, ko: /마라톤/, q: 'marathon runners', first: true },
  { re: /\b(nba|basketball|76ers|lakers|celtics|warriors|bucks|knicks)\b/i, ko: /농구|NBA|KBL|덩크/, q: 'basketball game', first: true },
  { re: /\b(nfl|super bowl)\b/i, ko: /미식축구|NFL|슈퍼볼/, q: 'american football stadium', first: true },
  { re: /\b(mlb|baseball|kbo|npb|baystars|giants|tigers|dodgers|yankees)\b/i, ko: /야구|MLB|KBO|NPB|홈런|투수|타자|베이스타즈|자이언츠|타이거즈/, q: 'baseball stadium', first: true },
  { re: /\b(figure skating|skating|skater)\b/i, ko: /피겨|스케이트|빙상/, q: 'ice skating', first: true },
  { re: /\b(miss universe|miss world|pageant)\b/i, ko: /미스유니버스|미스 유니버스|미스월드|미인대회/, q: 'stage spotlight', first: true },
  { re: /\b(golf|pga|lpga)\b/i, ko: /골프|PGA|LPGA/, q: 'golf course', first: true },
  { re: /\b(boxing|ufc|mma)\b/i, ko: /복싱|UFC|격투/, q: 'boxing ring', first: true },
  // 'final' 하나만으로는 축구로 보지 않아요 (예: 방송인의 'Final' 방송)
  { re: /\b(vs|v|league|cup|match|friendly|friendlies|finals|quarter-?finals?|semi-?finals?|beats?|defeats?|derby|derbi|clasico|qualifier|world cup|euro|soccer|football|fc|squad|coach|striker|goal|premier|la liga|serie a|bundesliga|ligue 1|brasileir[aã]o|mls|j-?league|k-?league|champions)\b/i,
    ko: /축구|리그|라리가|세리에|분데스리가|프리미어|챔피언스|더비|월드컵|A매치|친선경기|국가대표|감독|득점|골키퍼|브라질리앙|시리즈 ?A|MLS|K리그|J리그/, q: 'soccer stadium', first: true },
  // '드라마틱'은 드라마가 아니에요
  { re: /\b(drama|series|season finale|finale|episode|sitcom|tv show|tv|telenovela|dizi|game show|reality show|broadcast|presenter|talk show)\b/i,
    ko: /드라마(?!틱)|예능|게임쇼|TV ?쇼|티비|토크쇼|(^|\s)쇼(?!핑)|시즌 종영|종영|방송|시청률|리얼리티|진행자/, q: 'watching tv', first: true },
  { re: /\b(movie|film|box office|premiere|cinema)\b/i, ko: /영화|박스오피스|개봉|시사회|흥행|헝거게임/, q: 'cinema', first: true },
  { re: /\b(gta|video ?games?|gaming|playstation|ps5|xbox|nintendo|switch 2|steam|esports|e-sports)\b/i, ko: /(?<!헝거)게임(?!쇼)|GTA|닌텐도|플레이스테이션|엑스박스|스팀|e스포츠/, q: 'video game controller', first: true },
  { re: /\b(concert|album|single|tour|k-?pop|singer|band)\b/i, ko: /콘서트|앨범|컴백|공연|가수|아이돌/, q: 'concert stage', first: true },
  { re: /\b(trade|tariffs?|exports?|imports?)\b/i, ko: /무역|관세|수출|수입/, q: 'cargo containers port', first: true },
  { re: /\b(oil|gasoline|petrol|fuel)\b/i, ko: /유가|난방유|휘발유|기름값|석유/, q: 'oil barrels', first: true },
  { re: /\b(stock|stocks|shares|earnings|nasdaq|dow|index|rally|plunge|surge|ipo)\b/i, ko: /주가|증시|주식|실적|나스닥|상장|급락|급등/, q: 'stock market chart', first: true },
  { re: /\b(merger|acquisition|takeover)\b/i, ko: /합병|인수|매각|M&A/, q: 'business meeting', first: true },
  { re: /\b(semiconductors?|chips?|chipmaker|hbm|dram|tsmc|samsung|hynix|ai|artificial intelligence)\b/i, ko: /반도체|HBM|D램|파운드리|인공지능|(^|[^A-Za-z])AI(?![A-Za-z])/, q: 'semiconductor chip', first: true },
  { re: /\b(election|vote|president|prime minister|minister|parliament|congress|senate|government|party)\b/i, ko: /선거|투표|대통령|총리|장관|의회|국회|정부|정당/, q: 'parliament building', first: true },
  { re: /\b(bitcoin|crypto|ethereum)\b/i, ko: /비트코인|가상화폐|암호화폐/, q: 'cryptocurrency', first: false },
  { re: /\b(storm|typhoon|hurricane|rain|snow|heat ?wave|weather)\b/i, ko: /태풍|폭우|폭설|폭염|한파|날씨|기상|계절풍|기온/, q: 'weather sky', first: false }
];
const sceneOf = (en, ko) => SCENES.find(x => x.re.test(String(en || '')) || (x.ko && x.ko.test(String(ko || ''))));

/* 화제 1개 → { url, credit, link, query } 또는 null */
export async function findPhoto({ titleEn, textKo = '', category, countryEn, log = () => {} }) {
  if (!hasPhotoSource()) return null;
  const cat = CATEGORY_EN[category] || '';
  const scene = sceneOf(titleEn, textKo);
  if (!scene) log(`  · 화제 종류를 몰라 제목으로 찾아요: ${JSON.stringify(String(textKo).slice(0, 60))}`);
  const queries = [scene && scene.first ? scene.q : '', titleEn, scene && !scene.first ? scene.q : '', cat && countryEn ? `${cat} ${countryEn}` : '', countryEn ? `${countryEn} city` : '']
    .map(q => String(q || '').trim()).filter(Boolean);
  for (const q of [...new Set(queries)]) {
    const need = words(q);
    let hits;
    try { hits = await search(q); } catch (e) { log(`  ⚠ 사진 검색 실패 (${e.message})`); return null; }
    const ok = hits.filter(x => !used.has(x.id) && x.width >= 1000 && (!need.length || need.some(w => String(x.text || '').toLowerCase().includes(w))));
    const p = ok.find(x => !usedAuthors.has(x.author)) || ok[0];
    if (!p) continue;
    try {
      const data = await download(p.url);
      used.add(p.id); usedAuthors.add(p.author);
      return { url: data, credit: `사진: ${String(p.author || photoSource()).slice(0, 40)} / ${photoSource()}`, link: p.link, query: q };
    } catch (e) { log(`  ⚠ ${e.message}`); }
  }
  return null;
}
