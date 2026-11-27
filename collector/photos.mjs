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

/* 지난 날짜에 쓴 사진 기록 (최근 KEEP_DAYS일). 매일 같은 사진이 나오지 않게 피해요 */
const KEEP_DAYS = 21;
const sceneUse = new Map();   // 같은 날 같은 장면이 여러 번 나오면 검색어를 바꿔가며
let history = [], today = '', recentIds = new Set(), recentAuthors = new Set(), dayIndex = 0;
export function setPhotoHistory(list, date) {
  today = date;
  const from = Date.parse(date) - KEEP_DAYS * 864e5;
  /* 같은 날짜를 다시 만들 때는 그날 기록을 지우고 새로 (다시 만들 때마다 사진이 바뀌지 않게) */
  history = (Array.isArray(list) ? list : []).filter(h => h && h.date !== date && Date.parse(h.date) >= from);
  recentIds = new Set(history.map(h => h.id)); recentAuthors = new Set(history.map(h => h.author));
  dayIndex = Math.floor(Date.parse(date) / 864e5); sceneUse.clear();
}
export const photoHistory = () => history;

/* 검색 결과를 공통 모양으로: { id, width, text(설명), url, author, link } */
async function search(query) {
  if (PIXABAY) {
    const q = new URLSearchParams({ key: PIXABAY, q: query.slice(0, 100), image_type: 'photo', orientation: 'horizontal', safesearch: 'true', per_page: '50', min_width: '1000' });
    const r = await fetch(`${PIXABAY_BASE}/api/?${q}`);
    if (!r.ok) throw new Error(`Pixabay ${r.status}`);
    return ((await r.json()).hits || []).map(h => ({ id: 'pb' + h.id, width: h.imageWidth, text: h.tags, url: h.largeImageURL || h.webformatURL, author: h.user, link: h.pageURL }));
  }
  const r = await fetch(`${PEXELS_BASE}/v1/search?${new URLSearchParams({ query, per_page: '40', orientation: 'landscape' })}`, { headers: { Authorization: PEXELS } });
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
  // 금·보석: 시세 기사라도 주식 차트보다 금 사진이 맞아요
  { re: /\b(gold|jewel(le)?ry|bullion)\b/i, ko: /(?<![가-힣])금(값| ?가격|·은|은값)|귀금속|보석|(?<![가-힣])은값/, q: ['gold bars', 'gold jewelry', 'gold coins'], first: true },
  // e스포츠: '챔피언스'·'리그' 같은 말 때문에 축구로 잘못 가지 않게 축구보다 먼저
  { re: /\b(league of legends|lck|lpl|lec|faker|valorant|esports?|e-sports)\b|(^|[^A-Za-z0-9])T1(?![A-Za-z0-9])/i,
    ko: /리그 ?오브 ?레전드|롤드컵|LCK|LPL|(^|[^A-Za-z0-9])T1(?![A-Za-z0-9])|페이커|발로란트|e스포츠|이스포츠|프로게이머/, q: ['esports arena', 'gaming keyboard', 'gaming setup'], first: true },
  // 독감·감기: 아픈 사람 얼굴보다 체온계·약 같은 물건으로
  { re: /\b(flu|influenza|cold season|vaccine|vaccination)\b/i, ko: /독감|감기|인플루엔자|호흡기 ?질환|백신|예방접종/, q: ['thermometer', 'medicine pills', 'vaccine syringe'], first: true, not: /child|baby|kid|boy|girl|person|people|man|woman|patient|face/ },
  // 크리켓: 'Test 경기'·'match' 때문에 축구로 가지 않게 축구보다 먼저
  { re: /\b(cricket|ipl|test match|odi|t20)\b/i, ko: /크리켓|테스트 ?경기|IPL/, q: ['cricket ball', 'cricket bat', 'cricket stadium'], first: true },
  { re: /\b(tennis|atp|wta|wimbledon)\b/i, ko: /테니스|윔블던|US오픈|호주오픈/, q: ['tennis court', 'tennis ball racket', 'tennis player'], first: true },
  { re: /\b(f1|formula ?1|grand prix|motogp|nascar)\b/i, ko: /(^|[^A-Za-z0-9])F1(?![A-Za-z0-9])|포뮬러|그랑프리|모터스포츠/, q: 'race car track', first: true },
  { re: /\b(marathon)\b/i, ko: /마라톤/, q: 'marathon runners', first: true },
  { re: /\b(nba|basketball|76ers|lakers|celtics|warriors|bucks|knicks)\b/i, ko: /농구|NBA|KBL|덩크/, q: ['basketball game', 'basketball hoop', 'basketball court', 'basketball ball'], first: true },
  { re: /\b(nfl|super bowl)\b/i, ko: /미식축구|NFL|슈퍼볼/, q: ['american football stadium', 'american football ball', 'american football game'], first: true },
  { re: /\b(mlb|baseball|kbo|npb|baystars|giants|tigers|dodgers|yankees)\b/i, ko: /야구|MLB|KBO|NPB|홈런|투수|타자|베이스타즈|자이언츠|타이거즈/, q: ['baseball stadium', 'baseball glove', 'baseball bat ball', 'baseball field'], first: true },
  { re: /\b(figure skating|skating|skater)\b/i, ko: /피겨|스케이트|빙상/, q: 'ice skating', first: true },
  { re: /\b(miss universe|miss world|pageant)\b/i, ko: /미스유니버스|미스 유니버스|미스월드|미인대회/, q: 'stage spotlight', first: true },
  { re: /\b(nhl|hockey|canadiens|maple leafs|oilers|bruins)\b/i, ko: /하키|NHL|캐나디언스|메이플리프스/, q: ['ice hockey', 'hockey puck', 'hockey stick', 'ice rink'], first: true },
  { re: /\b(supermoon|full moon|moon|eclipse|meteor|aurora)\b/i, ko: /슈퍼문|보름달|월식|일식|유성우|오로라|천문/, q: ['full moon night', 'moon sky', 'supermoon'], first: true, not: /eclipse|blood|red moon|orange/, focus: 'bright' },
  { re: /\b(golf|pga|lpga)\b/i, ko: /골프|PGA|LPGA/, q: 'golf course', first: true },
  { re: /\b(boxing|ufc|mma)\b/i, ko: /복싱|UFC|격투/, q: ['boxing gloves', 'boxing ring'], first: true },
  // 'final' 하나만으로는 축구로 보지 않아요 (예: 방송인의 'Final' 방송)
  { re: /\b(vs|v|league|cup|match|friendly|friendlies|finals|quarter-?finals?|semi-?finals?|beats?|defeats?|derby|derbi|clasico|qualifier|world cup|euro|soccer|football|fc|squad|coach|striker|goal|premier|la liga|serie a|bundesliga|ligue 1|brasileir[aã]o|mls|j-?league|k-?league|champions)\b/i,
    ko: /축구|리그|라리가|세리에|분데스리가|프리미어|챔피언스|더비|월드컵|A매치|친선경기|국가대표|감독|득점|골키퍼|브라질리앙|시리즈 ?A|MLS|K리그|J리그/, q: ['soccer stadium', 'soccer ball grass', 'soccer goal net', 'football pitch', 'soccer cleats'], first: true },
  // 대담·토크쇼는 일반 방송(TV 화면)보다 먼저: 사람들이 마주 앉아 이야기하는 장면
  { re: /\b(talk show|chat show|interview show|late night)\b/i, ko: /대담|토크쇼|토크 쇼|인터뷰 프로그램|좌담/, q: ['talk show', 'interview studio', 'podcast studio'], first: true },
  // '드라마틱'은 드라마가 아니에요
  { re: /\b(drama|series|season finale|finale|episode|sitcom|tv show|tv|telenovela|dizi|game show|reality show|broadcast|presenter|talk show)\b/i,
    ko: /드라마(?!틱)|예능|게임쇼|TV ?쇼|티비|토크쇼|(^|\s)쇼(?!핑)|시즌 종영|종영|방송|시청률|리얼리티|진행자/, q: ['watching tv', 'television remote', 'tv studio', 'television screen'], first: true },
  { re: /\b(movie|film|box office|premiere|cinema)\b/i, ko: /영화|박스오피스|개봉|시사회|흥행|헝거게임/, q: ['cinema', 'movie theater seats', 'film reel', 'popcorn movie'], first: true, not: /vpn|laptop|computer|netflix|streaming/ },
  { re: /\b(gta|video ?games?|gaming|playstation|ps5|xbox|nintendo|switch 2|steam|esports|e-sports)\b/i, ko: /(?<!헝거)게임(?!쇼)|GTA|닌텐도|플레이스테이션|엑스박스|스팀|e스포츠/, q: ['video game controller', 'gaming setup', 'gamer'], first: true },
  { re: /\b(concert|album|single|tour|k-?pop|singer|band)\b/i, ko: /콘서트|앨범|컴백|공연|가수|아이돌/, q: ['concert stage', 'concert crowd', 'microphone stage'], first: true },
  { re: /\b(trade|tariffs?|exports?|imports?)\b/i, ko: /무역|관세|수출|수입/, q: 'cargo containers port', first: true },
  { re: /\b(oil|gasoline|petrol|fuel)\b/i, ko: /유가|난방유|휘발유|기름값|석유/, q: ['gas station', 'fuel pump', 'gas pump nozzle'], first: true, not: /wine|whisk|beer|winery|cellar/ },
  { re: /\b(stock|stocks|shares|earnings|nasdaq|dow|index|rally|plunge|surge|ipo)\b/i, ko: /주가|증시|주식|실적|나스닥|상장|급락|급등/, q: ['stock market chart', 'stock trading screen', 'financial chart'], first: true },
  { re: /\b(merger|acquisition|takeover)\b/i, ko: /합병|인수|매각|M&A/, q: 'business meeting', first: true },
  { re: /\b(semiconductors?|chips?|chipmaker|hbm|dram|tsmc|samsung|hynix|ai|artificial intelligence)\b/i, ko: /반도체|HBM|D램|파운드리|인공지능|(^|[^A-Za-z])AI(?![A-Za-z])/, q: 'semiconductor chip', first: true },
  { re: /\b(election|vote|president|prime minister|minister|parliament|congress|senate|government|party)\b/i, ko: /선거|투표|대통령|총리|장관|의회|국회|정부|정당/, q: 'parliament building', first: true },
  { re: /\b(bitcoin|crypto|ethereum)\b/i, ko: /비트코인|가상화폐|암호화폐/, q: 'cryptocurrency', first: false },
  { re: /\b(storm|typhoon|hurricane|rain|snow|heat ?wave|weather)\b/i, ko: /태풍|폭우|폭설|폭염|한파|날씨|기상|계절풍|기온/, q: ['weather sky', 'rain umbrella', 'cloudy sky', 'rainy window'], first: true, not: /lightning|tornado|thunder/ }
];
const sceneOf = (en, ko) => SCENES.find(x => x.re.test(String(en || '')) || (x.ko && x.ko.test(String(ko || ''))));

/* 화제 1개 → { url, credit, link, query } 또는 null */
export async function findPhoto({ titleEn, textKo = '', category, countryEn, log = () => {} }) {
  if (!hasPhotoSource()) return null;
  const cat = CATEGORY_EN[category] || '';
  const scene = sceneOf(titleEn, textKo);
  if (!scene) log(`  · 화제 종류를 몰라 제목으로 찾아요: ${JSON.stringify(String(textKo).slice(0, 60))}`);
  /* 장면 검색어가 여러 개면: 날짜마다 시작점을 바꾸고, 같은 날 같은 장면이 또 나오면 다음 검색어로 */
  let sq = scene ? scene.q : '';
  if (Array.isArray(sq)) { const n = sceneUse.get(scene) || 0; sceneUse.set(scene, n + 1); sq = sq[(dayIndex + n) % sq.length]; }
  const queries = [scene && scene.first ? sq : '', titleEn, scene && !scene.first ? sq : '', cat && countryEn ? `${cat} ${countryEn}` : '', countryEn ? `${countryEn} city` : '']
    .map(q => String(q || '').trim()).filter(Boolean);
  for (const q of [...new Set(queries)]) {
    const need = words(q);
    let hits;
    try { hits = await search(q); } catch (e) { log(`  ⚠ 사진 검색 실패 (${e.message})`); return null; }
    /* not: 그 장면에 어울리지 않는 사진 태그 (예: 슈퍼문인데 월식의 붉은 달) */
    const bad = scene && scene.not;
    /* 모든 장면 공통: 실사 사진만 (그림·만화·벡터는 빼요) */
    const drawn = /illustration|vector|cartoon|clipart|clip art|drawing|graphic|3d render|ai generated/;
    /* 장면 검색어는 단어가 모두 태그에 있어야 해요 (예: 'boxing ring' → 결혼반지 'ring'만 있는 사진은 빼요). 제목 검색은 하나만 맞아도 돼요 */
    const tags = x => String(x.text || '').toLowerCase();
    const match = x => !need.length || (q === sq ? need.every(w => tags(x).includes(w)) : need.some(w => tags(x).includes(w)));
    const ok = hits.filter(x => !used.has(x.id) && x.width >= 1000 && match(x) && !(bad && bad.test(String(x.text || ''))) && !drawn.test(tags(x)) && !/\.png(\?|$)/i.test(String(x.url || '')));   // 배경 없는 PNG는 대개 그림이에요
    /* 우선순위: 최근 3주 안 쓴 사진·작가 → 안 쓴 사진 → 아무거나. 같은 조건이면 날짜마다 다른 순서로 */
    const rot = a => a.length ? [...a.slice(dayIndex % a.length), ...a.slice(0, dayIndex % a.length)] : a;
    const fresh = ok.filter(x => !recentIds.has(x.id));
    const p = rot(fresh.filter(x => !usedAuthors.has(x.author) && !recentAuthors.has(x.author)))[0]
      || rot(fresh.filter(x => !usedAuthors.has(x.author)))[0] || fresh[0] || ok.find(x => !usedAuthors.has(x.author)) || ok[0];
    if (!p) continue;
    try {
      const data = await download(p.url);
      used.add(p.id); usedAuthors.add(p.author);
      if (today) history.push({ date: today, id: p.id, author: p.author, q });
      return { url: data, credit: `사진: ${String(p.author || photoSource()).slice(0, 40)} / ${photoSource()}`, link: p.link, query: q, focus: (scene && scene.focus) || '' };
    } catch (e) { log(`  ⚠ ${e.message}`); }
  }
  return null;
}
