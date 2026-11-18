// AllEarth 앱의 화제 읽기: app/assets/topics/topics.js 를 앱과 똑같이 그대로 읽어요.
// 이 파일이 앱 화면과 인스타 카드의 공통 원본이에요. 내용을 고치면 앱과 카드가 함께 바뀌어요.
//
// 카드가 읽는 칸 (README 'topics.js 데이터 약속' 참고)
//   window.AllEarthTopics = { date: 'YYYY-MM-DD', dateLabel, topics: { kr: {...}, jp: {...} } }
//   topics 의 값은 화제 1개(객체) 또는 여러 개(배열). 배열이면 첫 번째를 대표 화제로 써요.
//   title(필수) · summary · category · when · image · imageAlt · imagePosition · imageCredit · source · sourceName · badges
//   image 는 앱 안 파일 경로(assets/…) 또는 인터넷 주소(https://…) 둘 다 돼요.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import vm from 'node:vm';

export const APP_DIR = process.env.CARDS_APP_DIR || join(dirname(fileURLToPath(import.meta.url)), '..', 'app');
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp', '.gif': 'image/gif' };
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);

/* 나라 코드: 앱은 소문자 ISO(kr, gb), 예전 앱은 UK 를 썼어요. 카드는 대문자로, 영국은 UK 로 맞춰요 */
const toCC = id => { const c = String(id || '').trim().toUpperCase(); return c === 'GB' ? 'UK' : c; };

/* 사진: 앱 안 파일이면 그대로 읽어 넣고, 인터넷 주소면 주소 그대로 (카드를 찍을 때 불러와요) */
function imageOf(src) {
  if (!src) return null;
  if (/^https?:\/\//i.test(src)) return src;
  if (/^data:image\//i.test(src)) return src;
  const f = join(APP_DIR, src);
  if (!existsSync(f)) return null;
  return `data:${MIME[extname(f).toLowerCase()] || 'image/jpeg'};base64,${readFileSync(f).toString('base64')}`;
}

export function loadAllEarth() {
  const file = join(APP_DIR, 'assets/topics/topics.js');
  if (!existsSync(file)) throw new Error(`앱 화제 파일이 없어요: ${file}`);
  const sandbox = { window: {} };
  vm.runInNewContext(readFileSync(file, 'utf8'), sandbox, { filename: 'topics.js', timeout: 1000 });
  const data = sandbox.window.AllEarthTopics;
  if (!data || !data.topics) throw new Error('topics.js 에서 window.AllEarthTopics.topics 를 찾지 못했어요');
  const date = /^\d{4}-\d{2}-\d{2}$/.test(String(data.date || '')) ? data.date : kstToday();
  const entries = Array.isArray(data.topics)
    ? data.topics.map(t => [t.countryId || t.cc || t.country, t])            // 배열 모양 [{countryId, …}] 도 받아요
    : Object.entries(data.topics);
  const rows = entries.map(([id, v], order) => {
    const t = Array.isArray(v) ? v[0] : v;                                     // 나라당 여러 개면 첫 번째(대표)
    if (!t || !t.title) return null;
    const badge = (Array.isArray(t.badges) && t.badges[0]) || t.status || '';
    return {
      id: `${id}-${date}`, cc: toCC(id), order,
      title: t.title, short_desc: t.summary ?? t.short_desc ?? '', category_label: t.category || '', when: t.when || '',
      badge: ({ NEW: 'TODAY', TALKED: 'ONGOING' })[String(badge).toUpperCase()] || String(badge).toUpperCase(),   // 예전 앱 화면 표기와 같게
      image_url: imageOf(t.image || t.image_url), image_credit: t.imageCredit || t.image_credit || '',
      image_alt: t.imageAlt || '', image_position: t.imagePosition || '',
      source_name: t.sourceName || '', source_url: t.source || '',
      published_at: `${date}T00:00:00+09:00`
    };
  }).filter(Boolean);
  return { rows, date, dateLabel: data.dateLabel || date };
}
