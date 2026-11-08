// 지구 근황 · 무료 번역 (검색어·뉴스 제목 → 한국어)
//  - DEEPL_API_KEY 가 있으면 DeepL API Free (월 50만 자 무료, 품질 좋음)
//  - 없으면 MyMemory (가입 없이 하루 약 5,000자 무료)
//  - 실패하면 원문 그대로 돌려줘요 (카드 만들기는 멈추지 않아요)

/* 앱 나라 코드 -> 원문 언어 */
export const LANG = {
  KR: 'ko', JP: 'ja', US: 'en', UK: 'en', AU: 'en', CA: 'en', SG: 'en', IN: 'en', FR: 'fr', IT: 'it', BR: 'pt-BR',
  TH: 'th', DE: 'de', ES: 'es', MX: 'es', TR: 'tr', ID: 'id', VN: 'vi', TW: 'zh-TW', CN: 'zh-CN'
};
const DEEPL_KEY = (process.env.DEEPL_API_KEY || '').trim();
const MYMEMORY = process.env.MYMEMORY_BASE || 'https://api.mymemory.translated.net';
const DEEPL = process.env.DEEPL_BASE || (DEEPL_KEY.endsWith(':fx') ? 'https://api-free.deepl.com' : 'https://api.deepl.com');
export const engine = () => DEEPL_KEY ? 'DeepL' : 'MyMemory';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const hasHangul = s => /[가-힣]/.test(s);
/* 글자 모양으로 원문 언어 보정 (예: 인도의 힌디어, 싱가포르의 중국어) */
const langOf = (s, base) => /[\u0900-\u097F]/.test(s) ? 'hi' : /[\u0E00-\u0E7F]/.test(s) ? 'th' : /[\u3040-\u30FF]/.test(s) ? 'ja' : /[\u4E00-\u9FFF]/.test(s) && !/^zh|ja/.test(base) ? 'zh-CN' : base;

async function deepl(texts) {
  const body = new URLSearchParams({ target_lang: 'KO' });
  texts.forEach(t => body.append('text', t));
  const r = await fetch(`${DEEPL}/v2/translate`, { method: 'POST', headers: { Authorization: `DeepL-Auth-Key ${DEEPL_KEY}`, 'content-type': 'application/x-www-form-urlencoded' }, body });
  if (!r.ok) throw new Error(`DeepL ${r.status}`);
  return (await r.json()).translations.map(t => t.text);
}

async function mymemory(text, from) {
  const q = new URLSearchParams({ q: text.slice(0, 480), langpair: `${from}|ko` });
  const r = await fetch(`${MYMEMORY}/get?${q}`);
  const j = await r.json().catch(() => ({}));
  const out = j.responseData && j.responseData.translatedText;
  if (!r.ok || Number(j.responseStatus) !== 200 || !out || /MYMEMORY WARNING|QUERY LENGTH LIMIT|INVALID/i.test(out)) throw new Error(`MyMemory ${j.responseStatus || r.status}`);
  return out.replace(/&#39;/g, "'").replace(/&quot;/g, '"').replace(/&amp;/g, '&');
}

/* 여러 문장을 한 번에: 실패한 건 원문 그대로 */
export async function toKorean(texts, cc, log = () => {}) {
  const from = LANG[cc] || 'en';
  if (from === 'ko') return texts.slice();
  const todo = texts.map((t, i) => [t, i]).filter(([t]) => t && !hasHangul(t));
  const out = texts.slice();
  if (!todo.length) return out;
  try {
    if (DEEPL_KEY) {
      (await deepl(todo.map(([t]) => t))).forEach((k, n) => { out[todo[n][1]] = k; });
      return out;
    }
    for (const [t, i] of todo) { out[i] = await mymemory(t, langOf(t, from)); await sleep(400); }
  } catch (e) { log(`  ⚠ ${cc} 번역 실패, 원문 사용 (${e.message})`); }
  return out;
}
