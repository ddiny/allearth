// 지구 근황 · 인스타그램 게시 (사람이 '인스타에 올리기'를 실행할 때만)
// 카드 이미지는 이 저장소의 cards-images 브랜치에 올라가 있고, 인스타는 그 공개 주소(raw.githubusercontent.com)에서 가져가요.
// 그래서 저장소가 '공개(Public)'여야 해요. Supabase·Claude는 쓰지 않아요.
//
//  node collector/instagram.mjs publish
//
// 환경 변수
//  IG_ACCESS_TOKEN  인스타 토큰 (GitHub Secrets)
//                   - EAA… : 통합 로그인 시스템 사용자 토큰 (만료 없음) → graph.facebook.com
//                   - IG…  : Instagram 로그인 토큰 (60일)           → graph.instagram.com
//  IG_USER_ID       인스타 계정 ID (앱 대시보드 계정 이름 아래 숫자, GitHub Variables)
//  CARDS_ROOT       cards-images 브랜치를 내려받은 폴더 (기본 cards-images)
//  RAW_BASE         이미지 공개 주소 앞부분 (기본 https://raw.githubusercontent.com/<저장소>/cards-images)
//  PUBLISH_DATE     올릴 날짜 YYYY-MM-DD (비우면 브랜치에 있는 가장 최근 카드)
//  DRY_RUN=1        실제로 올리지 않고 확인만
//  FORCE=1          이미 올린 날짜도 다시 올리기
import { readFile, writeFile, readdir, access } from 'node:fs/promises';
import { appendFileSync } from 'node:fs';

const yes = v => ['1', 'true', 'yes'].includes(String(v || '').toLowerCase());
const DRY = yes(process.env.DRY_RUN), FORCE = yes(process.env.FORCE);
const ROOT = process.env.CARDS_ROOT || 'cards-images';
const REPO = process.env.GITHUB_REPOSITORY || '';
const RAW = (process.env.RAW_BASE || (REPO ? `https://raw.githubusercontent.com/${REPO}/cards-images` : '')).replace(/\/$/, '');
const MAX_SLIDES = 10;            // Meta API의 캐러셀 한도 (앱에서는 20장까지 되지만 API는 10장)
const TOKEN = (process.env.IG_ACCESS_TOKEN || '').trim();
const isFb = /^EAA/.test(TOKEN);
const API = (process.env.IG_API_BASE || (isFb ? 'https://graph.facebook.com' : 'https://graph.instagram.com')) + '/' + (process.env.IG_API_VERSION || 'v23.0');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const summary = s => { console.log(s); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, s + '\n'); };
if (TOKEN && process.env.GITHUB_ACTIONS) console.log(`::add-mask::${TOKEN}`);
const exists = p => access(p).then(() => true, () => false);

async function ig(method, path, params) {
  const q = new URLSearchParams({ ...params, access_token: TOKEN });
  const r = await fetch(method === 'GET' ? `${API}${path}?${q}` : `${API}${path}`, method === 'GET' ? {} : { method, headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: q });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`Instagram ${method} ${path.replace(/\d{6,}/g, '{id}')} ${r.status} ${(j.error && (j.error.error_user_msg || j.error.message)) || ''}`.trim());
  return j;
}
async function waitReady(id, label) {
  for (let i = 0; i < 40; i++) {
    const s = await ig('GET', `/${id}`, { fields: 'status_code' });
    if (s.status_code === 'FINISHED' || !s.status_code) return;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`${label} 처리 실패 (${s.status_code})`);
    await sleep(3000);
  }
  throw new Error(`${label} 처리가 2분 넘게 끝나지 않았어요`);
}

async function publish() {
  if (!TOKEN) throw new Error('IG_ACCESS_TOKEN 이 없어요 (GitHub Secrets 확인)');
  const uid = (process.env.IG_USER_ID || '').trim();
  if (!uid) throw new Error('IG_USER_ID 가 없어요 (GitHub Variables 에 인스타 계정 번호 1784… 를 넣어주세요)');
  if (!RAW) throw new Error('RAW_BASE 를 알 수 없어요');

  /* 올릴 날짜 고르기 */
  const dates = (await readdir(ROOT).catch(() => [])).filter(d => /^\d{4}-\d{2}-\d{2}$/.test(d)).sort();
  if (!dates.length) throw new Error("올릴 카드가 없어요. 먼저 '매일 카드뉴스 만들기'가 성공해야 해요");
  const date = (process.env.PUBLISH_DATE || '').trim() || dates[dates.length - 1];
  if (!dates.includes(date)) throw new Error(`${date} 카드가 없어요. 지금 있는 카드: ${dates.join(', ')}`);
  const dir = `${ROOT}/${date}`;
  const meta = JSON.parse(await readFile(`${dir}/cards.json`, 'utf8'));
  const urls = meta.slides.map(n => `${RAW}/${date}/${n}`);
  if (urls.length < 2) throw new Error('캐러셀은 2장 이상이어야 해요');
  if (urls.length > MAX_SLIDES) throw new Error(`카드가 ${urls.length}장이에요. API로는 ${MAX_SLIDES}장까지만 올릴 수 있어서 앱에서 직접 올려주세요`);
  const caption = (await readFile(`${dir}/caption.txt`, 'utf8')).trim();
  if (caption.length > 2200) throw new Error(`캡션이 ${caption.length}자예요 (최대 2,200자)`);
  if ((caption.match(/#[^\s#]+/g) || []).length > 30) throw new Error('해시태그가 30개를 넘어요');

  /* 같은 날짜를 두 번 올리지 않게 */
  if (await exists(`${dir}/posted.json`) && !FORCE) {
    const p = JSON.parse(await readFile(`${dir}/posted.json`, 'utf8'));
    throw new Error(`${date} 카드는 이미 올렸어요: ${p.permalink || p.media_id} (다시 올리려면 '다시 올리기'를 체크하세요)`);
  }

  /* 인스타가 이미지를 가져갈 수 있는지 먼저 확인 (저장소가 비공개면 여기서 막혀요) */
  const probe = await fetch(urls[0], { method: 'HEAD' }).catch(e => ({ ok: false, status: e.message }));
  if (!probe.ok) throw new Error(`카드 이미지 주소에 접근할 수 없어요 (${probe.status}). 저장소가 공개(Public)인지 확인해 주세요: ${urls[0]}`);

  let username = '';
  try { username = (await ig('GET', `/${uid}`, { fields: 'username' })).username || ''; } catch (e) { if (DRY) throw e; }
  let quota = '';
  try { const q = await ig('GET', `/${uid}/content_publishing_limit`, { fields: 'quota_usage,config' }); const d = (q.data || [])[0] || {}; quota = `${d.quota_usage ?? '?'} / ${(d.config && d.config.quota_total) ?? '?'}`; } catch { /* 확인 못 해도 계속 */ }
  log(`계정 ${username ? '@' + username : uid} · 오늘 게시 ${quota || '확인 안 됨'} · ${date} 카드 ${urls.length}장`);

  if (DRY) {
    summary(`## 인스타 올리기 (시험 실행, ${date})\n계정 ${username ? '@' + username : uid}에 카드 ${urls.length}장을 올릴 준비가 됐어요. 실제로는 올리지 않았어요.\n\n![미리보기](${RAW}/${date}/preview.jpg)\n\n캡션:\n\`\`\`\n${caption}\n\`\`\``);
    return;
  }

  const children = [];
  for (const [i, image_url] of urls.entries()) {
    children.push((await ig('POST', `/${uid}/media`, { image_url, is_carousel_item: 'true' })).id);
    log(`  ✓ ${i + 1}/${urls.length} 이미지 등록`);
  }
  for (const [i, id] of children.entries()) await waitReady(id, `${i + 1}번째 이미지`);
  const car = await ig('POST', `/${uid}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption });
  await waitReady(car.id, '캐러셀');
  const pub = await ig('POST', `/${uid}/media_publish`, { creation_id: car.id });
  let permalink = '';
  try { permalink = (await ig('GET', `/${pub.id}`, { fields: 'permalink' })).permalink || ''; } catch { /* 링크는 없어도 돼요 */ }
  await writeFile(`${dir}/posted.json`, JSON.stringify({ date, media_id: pub.id, permalink, slides: urls.length, posted_at: new Date().toISOString() }, null, 1));
  summary(`## 인스타에 올렸어요 (${date})\n카드 ${urls.length}장 · ${permalink ? `[게시물 보기](${permalink})` : 'media id ' + pub.id}`);
}

const cmd = process.argv[2];
if (cmd !== 'publish') { console.error('사용법: node collector/instagram.mjs publish'); process.exit(1); }
publish().catch(e => { console.error('✗ ' + e.message); summary(`\n> ✗ ${e.message}\n`); process.exit(1); });
