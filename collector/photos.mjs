// 사진이 없는 화제에 Pexels 무료 사진 채우기 (PEXELS_API_KEY 가 있을 때만)
// Pexels 라이선스: 무료, 상업적 사용 가능, 출처 표기 의무 없음 (그래도 카드·캡션에 작가를 적어요)
// 엉뚱한 사진을 줄이려고, 사진 설명(alt)에 검색어의 단어가 실제로 들어 있는 사진만 골라요.

const KEY = (process.env.PEXELS_API_KEY || '').trim();
const BASE = process.env.PEXELS_BASE || 'https://api.pexels.com';
export const hasPexels = () => !!KEY;

const CATEGORY_EN = { food: 'food', tech: 'technology', life: 'city life', culture: 'culture', fashion: 'fashion', wellness: 'wellness', travel: 'travel',
  '푸드': 'food', '테크': 'technology', '라이프': 'city life', '컬처': 'culture', '패션': 'fashion', '웰니스': 'wellness', '여행': 'travel',
  '음악': 'concert', '영화': 'cinema', '스포츠': 'sports', '테니스': 'tennis', '모터스포츠': 'racing', '예술': 'art', '문화': 'festival' };
/* 검색에 도움이 안 되는 말 */
const STOP = new Set('the a an of and or in on at to for vs v with from as by is are be its new us uk'.split(' '));
const words = s => String(s || '').toLowerCase().replace(/[^a-z0-9\s-]/g, ' ').split(/\s+/).filter(w => w.length >= 4 && !STOP.has(w));
const used = new Set();

async function search(query) {
  const r = await fetch(`${BASE}/v1/search?${new URLSearchParams({ query, per_page: '15', orientation: 'landscape' })}`, { headers: { Authorization: KEY } });
  if (!r.ok) throw new Error(`Pexels ${r.status}`);
  return (await r.json()).photos || [];
}

/* 화제 1개 → { url, credit, link } 또는 null */
export async function findPhoto({ titleEn, category, countryEn, log = () => {} }) {
  if (!KEY) return null;
  const cat = CATEGORY_EN[category] || '';
  const queries = [titleEn, cat && countryEn ? `${cat} ${countryEn}` : '', countryEn ? `${countryEn} city` : ''].map(q => String(q || '').trim()).filter(Boolean);
  for (const q of [...new Set(queries)]) {
    const need = words(q);
    let photos;
    try { photos = await search(q); } catch (e) { log(`  ⚠ 사진 검색 실패 (${e.message})`); return null; }
    const p = photos.find(x => !used.has(x.id) && x.width >= 1000 && (!need.length || need.some(w => String(x.alt || '').toLowerCase().includes(w))));
    if (p) {
      used.add(p.id);
      return { url: p.src.large2x || p.src.large, credit: `사진: ${String(p.photographer || 'Pexels').slice(0, 40)} / Pexels`, link: p.url, query: q };
    }
  }
  return null;
}
