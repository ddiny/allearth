// 예전 'ath' 앱의 실시간 화제 읽기 (topics.js 변환이 끝나기 전까지 쓰는 출처)
// ath 앱(index.html)이 화면을 그릴 때와 같은 요청으로 Supabase 공개 데이터를 읽어요.
// 주소와 publishable 키는 ath 앱 index.html 에 들어 있는 공개 값 그대로예요 (읽기 전용, 보안은 RLS가 담당).
// 결과는 allearth.mjs 와 같은 행 모양이라 카드 디자인·게시 흐름은 그대로 써요.

const URL_ = process.env.ATH_SUPABASE_URL || 'https://wbmiszonrsxpjzbnppfz.supabase.co';
const KEY = process.env.ATH_SUPABASE_KEY || 'sb_publishable_J8EkuZW7bpB1MGXbHkz8WA_Yl26qAQX';

/* ath 앱 화면과 같은 표기 */
const CATEGORY = { food: '푸드', tech: '테크', life: '라이프', culture: '컬처', fashion: '패션', wellness: '웰니스', travel: '여행' };
const CITY = {
  seoul: '서울', tokyo: '도쿄', shanghai: '상하이', newyork: '뉴욕', paris: '파리', london: '런던', rome: '로마', saopaulo: '상파울루',
  sydney: '시드니', bangkok: '방콕', berlin: '베를린', madrid: '마드리드', istanbul: '이스탄불', toronto: '토론토', mexicocity: '멕시코시티',
  mumbai: '뭄바이', jakarta: '자카르타', hochiminh: '호치민', singapore: '싱가포르', taipei: '타이베이'
};
const BADGE = { hot: 'HOT', rising: 'RISING', new: 'TODAY', talked: 'ONGOING' };
const RANK = { hot: 0, rising: 1, new: 2, talked: 3 };
const kstDate = iso => new Date(new Date(iso).getTime() + 9 * 3600e3).toISOString().slice(0, 10);

export async function loadAth({ max = 9, log = console.log } = {}) {
  let r;
  try {
    r = await fetch(`${URL_}/rest/v1/trends?select=*,trend_news(*)&order=published_at.desc`, { headers: { apikey: KEY, Authorization: 'Bearer ' + KEY } });
  } catch (e) { throw new Error(`ath 앱 데이터 서버에 접속하지 못했어요 (${(e.cause && e.cause.code) || e.message})`); }
  if (!r.ok) throw new Error(`ath 앱 데이터를 읽지 못했어요 (Supabase ${r.status})`);
  const all = await r.json();
  const real = all.filter(x => !x.is_sample && x.title);
  log(`ath 앱 실시간 화제를 읽어요 (전체 ${all.length}개, 실제 ${real.length}개)`);
  if (!real.length) throw new Error('ath 앱에 실제 화제가 없어요 (예시 데이터만 있어요)');

  /* 나라마다 대표 1개: 앱처럼 HOT 우선, 다음은 화제성(heat) 순 */
  const best = new Map();
  for (const x of [...real].sort((a, b) => (RANK[a.status] ?? 9) - (RANK[b.status] ?? 9) || (b.heat || 0) - (a.heat || 0)))
    if (!best.has(x.cc)) best.set(x.cc, x);
  /* 화제성 높은 나라부터 max 개 (자동 게시 10장 = 표지 + 9개).
     같은 이야기(같은 키워드·제목)가 여러 나라에 있으면 한 번만 넣어요 — ath 앱도 같은 화제는 하나로 묶어 보여줘요 */
  const norm = v => String(v || '').replace(/\s+/g, '').toLowerCase();
  const seen = new Set(), picked = [];
  for (const x of [...best.values()].sort((a, b) => (b.heat || 0) - (a.heat || 0))) {
    const k1 = norm(x.keyword_id), k2 = norm(x.title);
    if ((k1 && seen.has(k1)) || seen.has(k2)) continue;
    if (k1) seen.add(k1); seen.add(k2);
    picked.push(x);
    if (picked.length >= max) break;
  }
  const date = kstDate(real.map(x => x.published_at).filter(Boolean).sort().pop() || new Date().toISOString());

  const rows = picked.map((x, order) => {
    const news = (x.trend_news || []).slice().sort((a, b) => String(b.published_on).localeCompare(String(a.published_on)));
    const place = (x.area && String(x.area).trim()) || CITY[x.city_id] || '';
    return {
      id: x.id, cc: x.cc, order,
      title: x.title, short_desc: x.short_desc || '', category_label: CATEGORY[x.category] || '', when: place,
      badge: BADGE[x.status] || '',
      image_url: x.image_url || null, image_credit: x.image_url && x.image_credit ? `사진: ${x.image_credit} / Pexels` : '',
      image_alt: '', image_position: '',
      source_name: news[0] ? news[0].source : '', source_url: news[0] ? news[0].url || '' : '',
      published_at: x.published_at
    };
  });
  return { rows, date, dateLabel: date.replace(/-/g, '.'), total: best.size };
}
