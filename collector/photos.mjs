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
const used = new Set();

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
  const r = await fetch(url);
  if (!r.ok) throw new Error(`사진 내려받기 ${r.status}`);
  const type = (r.headers.get('content-type') || 'image/jpeg').split(';')[0];
  return `data:${type};base64,${Buffer.from(await r.arrayBuffer()).toString('base64')}`;
}

/* 화제 1개 → { url, credit, link, query } 또는 null */
export async function findPhoto({ titleEn, category, countryEn, log = () => {} }) {
  if (!hasPhotoSource()) return null;
  const cat = CATEGORY_EN[category] || '';
  const queries = [titleEn, cat && countryEn ? `${cat} ${countryEn}` : '', countryEn ? `${countryEn} city` : ''].map(q => String(q || '').trim()).filter(Boolean);
  for (const q of [...new Set(queries)]) {
    const need = words(q);
    let hits;
    try { hits = await search(q); } catch (e) { log(`  ⚠ 사진 검색 실패 (${e.message})`); return null; }
    const p = hits.find(x => !used.has(x.id) && x.width >= 1000 && (!need.length || need.some(w => String(x.text || '').toLowerCase().includes(w))));
    if (!p) continue;
    try {
      const data = await download(p.url);
      used.add(p.id);
      return { url: data, credit: `사진: ${String(p.author || photoSource()).slice(0, 40)} / ${photoSource()}`, link: p.link, query: q };
    } catch (e) { log(`  ⚠ ${e.message}`); }
  }
  return null;
}
