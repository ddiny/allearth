// 지구 근황 · 구글 트렌드에서 바로 화제 가져오기 (무료, AI 없음)
// 나라마다 '급상승 검색어' RSS를 읽어 검색량이 가장 큰 검색어 1개를 골라요.
// 검색어와 뉴스 제목은 원래 언어 그대로 써요 (번역·요약 없음).

/* 앱의 나라 코드 -> 구글 트렌드 geo (CN은 구글 트렌드가 지원하지 않아 제외) */
export const GEO = {
  KR: 'KR', JP: 'JP', US: 'US', FR: 'FR', UK: 'GB', IT: 'IT', BR: 'BR', AU: 'AU', TH: 'TH', DE: 'DE',
  ES: 'ES', TR: 'TR', CA: 'CA', MX: 'MX', IN: 'IN', ID: 'ID', VN: 'VN', SG: 'SG', TW: 'TW'
};

/* 화제로 보기 어려운 도구성 검색어 (로또, 로그인 등). 사람이 최종 확인하니 가볍게만 걸러요 */
const SKIP = /lotto|lottery|loter[ií]a|loto\b|powerball|mega ?millions|login|log in|로또|복권|宝くじ|ロト|樂透|大樂透|xổ số|xo so|หวย|togel|şans topu|sayısal/i;

const decode = s => s.replace(/<!\[CDATA\[|\]\]>/g, '').replace(/&amp;/g, '&').replace(/&quot;/g, '"').replace(/&#39;|&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#(\d+);/g, (_, n) => String.fromCharCode(+n)).trim();
const tag = (s, t) => { const m = s.match(new RegExp(`<${t}[^>]*>([\\s\\S]*?)</${t}>`)); return m ? decode(m[1]) : ''; };

export function parseRss(xml) {
  return xml.split('<item>').slice(1).map(it => ({
    term: tag(it, 'title'),
    traffic: parseInt(tag(it, 'ht:approx_traffic').replace(/[^0-9]/g, '') || '0', 10),
    news: it.split('<ht:news_item>').slice(1).map(n => ({ title: tag(n, 'ht:news_item_title'), source: tag(n, 'ht:news_item_source'), url: tag(n, 'ht:news_item_url') })).filter(n => n.title)
  })).filter(i => i.term);
}

const BASE = process.env.TRENDS_BASE || 'https://trends.google.com';
async function fetchGeo(geo) {
  let lastErr;
  for (let i = 1; i <= 3; i++) {
    try {
      const r = await fetch(`${BASE}/trending/rss?geo=${geo}`, { headers: { 'user-agent': 'Mozilla/5.0 (compatible; earth-lately-cards)' } });
      if (r.ok) return parseRss(await r.text());
      lastErr = new Error('RSS ' + r.status);
    } catch (e) { lastErr = e; }
    await new Promise(r => setTimeout(r, 1500 * i));
  }
  throw lastErr;
}

/* 검색량 표기: 200000 -> '20만+', 5000 -> '5천+' */
export const trafficKo = n => n >= 1e8 ? `${Math.round(n / 1e8)}억+` : n >= 1e4 ? `${Math.round(n / 1e4)}만+` : n >= 1e3 ? `${Math.round(n / 1e3)}천+` : `${n}+`;

/* 나라마다 1개씩 -> cards.mjs가 쓰는 행 모양으로 */
export async function loadTrends({ countries = Object.keys(GEO), names = {}, log = console.log } = {}) {
  const rows = [], failed = [];
  for (const cc of countries) {
    if (!GEO[cc]) continue;
    try {
      const items = (await fetchGeo(GEO[cc])).filter(i => i.news.length && !SKIP.test(i.term));
      if (!items.length) { failed.push(`${cc}: 쓸 만한 검색어 없음`); continue; }
      const top = items.sort((a, b) => b.traffic - a.traffic)[0];
      const name = names[cc] || cc;
      rows.push({
        id: `${cc.toLowerCase()}-top`, cc, title: top.term, title_en: '',
        short_desc: `${name}에서 지금 검색량이 크게 늘었어요 · 검색 ${trafficKo(top.traffic)}`,
        status: 'rising', category: '', area: '', pattern: [...top.term].reduce((h, c) => (h * 31 + c.charCodeAt(0)) >>> 0, 7) % 8,
        why: top.news.slice(0, 3).map(n => n.title.length > 60 ? n.title.slice(0, 58) + '…' : n.title),
        what: [], heat: Math.log10(Math.max(top.traffic, 10)), traffic: top.traffic,
        trend_news: top.news.slice(0, 3).map(n => ({ title: n.title, source: n.source, url: n.url })),
        image_url: null, is_sample: false, published_at: new Date().toISOString()
      });
      log(`  · ${cc} ${top.term} (${trafficKo(top.traffic)})`);
    } catch (e) { failed.push(`${cc}: ${e.message}`); }
    await new Promise(r => setTimeout(r, 700));
  }
  /* 검색량 상위 3곳은 HOT */
  [...rows].sort((a, b) => b.traffic - a.traffic).slice(0, 3).forEach(r => { r.status = 'hot'; });
  if (failed.length) log(`  ⚠ 못 가져온 나라: ${failed.join(' / ')}`);
  return rows;
}
