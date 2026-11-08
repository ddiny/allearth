// AllEarth 앱의 화제 읽기: app/assets/topics/topics.js 를 앱과 똑같이 그대로 읽어요.
// 이 파일이 앱 화면과 인스타 카드의 공통 원본이에요. 내용을 고치면 앱과 카드가 함께 바뀌어요.
import { readFileSync, existsSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join, extname } from 'node:path';
import vm from 'node:vm';

export const APP_DIR = process.env.CARDS_APP_DIR || join(dirname(fileURLToPath(import.meta.url)), '..', 'app');
const MIME = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };

export function loadAllEarth() {
  const file = join(APP_DIR, 'assets/topics/topics.js');
  if (!existsSync(file)) throw new Error(`앱 화제 파일이 없어요: ${file}`);
  const sandbox = { window: {} };
  vm.runInNewContext(readFileSync(file, 'utf8'), sandbox, { filename: 'topics.js', timeout: 1000 });
  const data = sandbox.window.AllEarthTopics;
  if (!data || !data.topics) throw new Error('topics.js 에서 AllEarthTopics 를 찾지 못했어요');
  const rows = Object.entries(data.topics).map(([id, t]) => {
    const img = t.image && join(APP_DIR, t.image);
    const ok = img && existsSync(img);
    return {
      id: `${id}-${data.date}`, cc: id.toUpperCase() === 'GB' ? 'UK' : id.toUpperCase(),
      title: t.title, short_desc: t.summary, category_label: t.category || '', when: t.when || '',
      status: 'new', category: '', area: '', why: [], what: [],
      image_url: ok ? `data:${MIME[extname(img).toLowerCase()] || 'image/jpeg'};base64,${readFileSync(img).toString('base64')}` : null,
      image_credit: t.imageCredit || '', image_alt: t.imageAlt || '', image_position: t.imagePosition || '',
      trend_news: t.sourceName ? [{ title: t.sourceName, source: t.sourceName, url: t.source || '' }] : [],
      source_name: t.sourceName || '', source_url: t.source || '',
      is_sample: false, published_at: `${data.date}T00:00:00+09:00`, order: Object.keys(data.topics).indexOf(id)
    };
  });
  return { rows, date: data.date, dateLabel: data.dateLabel || data.date };
}
