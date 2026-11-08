// 지구 근황 · 인스타그램 연결 (2단계: 사람이 승인하면 올려요)
//
//  node collector/instagram.mjs upload   만든 카드를 Supabase Storage(공개 버킷)에 올리고 미리보기 링크를 남겨요
//  node collector/instagram.mjs refresh  인스타 토큰을 연장해요 (IG로 시작하는 60일 토큰만. EAA 토큰은 만료가 없어 건너뛰어요)
//  node collector/instagram.mjs publish  카드를 인스타 캐러셀로 올려요 (사람이 '인스타에 올리기'를 실행할 때만)
//
// 환경 변수
//  SUPABASE_URL, SUPABASE_SECRET_KEY  수집기와 같은 키
//  IG_ACCESS_TOKEN  인스타 토큰. 두 종류 모두 돼요
//                   - EAA… : 통합 로그인의 시스템 사용자 토큰 (만료 없음) → graph.facebook.com 사용, IG_USER_ID 필요
//                   - IG…  : Instagram 로그인 토큰 (60일) → graph.instagram.com 사용, 연장된 토큰은 Supabase ig_state 표에 보관
//  IG_USER_ID       인스타 계정 ID (앱 대시보드의 계정 이름 아래 숫자). EAA 토큰이면 꼭 필요해요
//  CARDS_DIR        upload: 카드 폴더 (cards.mjs가 알려준 경로)
//  PUBLISH_DATE     publish: 올릴 날짜 YYYY-MM-DD. 비우면 가장 최근 카드
//  DRY_RUN=1        publish: 실제로 올리지 않고 확인만
//  FORCE=1          publish: 이미 올린 날짜도 다시 올리기
import { readFile } from 'node:fs/promises';
import { appendFileSync } from 'node:fs';

const CMD = process.argv[2];
const yes = v => ['1', 'true', 'yes'].includes(String(v || '').toLowerCase());
const DRY = yes(process.env.DRY_RUN), FORCE = yes(process.env.FORCE);
const BUCKET = process.env.CARDS_BUCKET || 'cards';
/* 토큰 종류에 따라 접속 주소가 달라요: EAA… → graph.facebook.com, IG… → graph.instagram.com */
const isFbToken = t => /^EAA/.test(String(t || ''));
const apiBase = t => process.env.IG_API_BASE || (isFbToken(t) ? 'https://graph.facebook.com' : 'https://graph.instagram.com');
const apiUrl = t => apiBase(t) + '/' + (process.env.IG_API_VERSION || 'v23.0');
const MAX_SLIDES = 10;                       // Meta API의 캐러셀 한도 (앱에서는 20장까지 되지만 API는 10장)
let SB = (process.env.SUPABASE_URL || 'https://wbmiszonrsxpjzbnppfz.supabase.co').trim();   // 비우면 앱 주소
try { SB = new URL(SB).origin; } catch { SB = ''; }
const KEY = process.env.SUPABASE_SECRET_KEY;
const H = { apikey: KEY, Authorization: 'Bearer ' + KEY };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const log = (...a) => console.log(...a);
const summary = s => { console.log(s); if (process.env.GITHUB_STEP_SUMMARY) appendFileSync(process.env.GITHUB_STEP_SUMMARY, s + '\n'); };
const mask = s => { if (s && process.env.GITHUB_ACTIONS) console.log(`::add-mask::${s}`); };
const kstToday = () => new Date(Date.now() + 9 * 3600e3).toISOString().slice(0, 10);
mask(process.env.IG_ACCESS_TOKEN);

function need() {
  if (!SB || !KEY) throw new Error('SUPABASE_URL / SUPABASE_SECRET_KEY 가 없어요 (GitHub Secrets 확인)');
}

/* ---------- Supabase ---------- */
async function sb(method, path, body, prefer) {
  const r = await fetch(`${SB}/rest/v1/${path}`, { method, headers: { ...H, 'content-type': 'application/json', ...(prefer ? { Prefer: prefer } : {}) }, body: body ? JSON.stringify(body) : undefined });
  if (!r.ok) throw new Error(`Supabase ${method} ${path.split('?')[0]} ${r.status} ${(await r.text()).slice(0, 200)}`);
  return r.status === 204 ? null : r.json().catch(() => null);
}
const tableMissing = e => /42P01|PGRST205|does not exist|Could not find the table/i.test(String(e && e.message));
const publicUrl = p => `${SB}/storage/v1/object/public/${BUCKET}/${p}`;

async function ensureBucket() {
  const r = await fetch(`${SB}/storage/v1/bucket`, {
    method: 'POST', headers: { ...H, 'content-type': 'application/json' },
    body: JSON.stringify({ id: BUCKET, name: BUCKET, public: true, allowed_mime_types: ['image/jpeg', 'text/plain', 'application/json'] })
  });
  if (r.ok) { log(`Storage 버킷 '${BUCKET}'을 만들었어요 (공개)`); return; }
  const t = await r.text();
  if (!/already exists|duplicate|409/i.test(t + r.status)) throw new Error(`Storage 버킷 만들기 실패 ${r.status} ${t.slice(0, 200)}`);
}
async function put(path, body, type) {
  const r = await fetch(`${SB}/storage/v1/object/${BUCKET}/${path}`, {
    method: 'POST', headers: { ...H, 'content-type': type, 'x-upsert': 'true', 'cache-control': 'max-age=60' }, body
  });
  if (!r.ok) throw new Error(`Storage 올리기 실패 ${path} ${r.status} ${(await r.text()).slice(0, 200)}`);
}
async function getJson(url) {
  const r = await fetch(url + (url.includes('?') ? '&' : '?') + 't=' + Date.now());
  if (!r.ok) throw new Error(`${url.replace(SB, '')} ${r.status}`);
  return r.json();
}

/* ---------- upload: 카드 → Storage ---------- */
async function upload() {
  need();
  const dir = process.env.CARDS_DIR;
  if (!dir) throw new Error('CARDS_DIR 가 없어요');
  const meta = JSON.parse(await readFile(`${dir}/cards.json`, 'utf8'));
  const base = `${meta.date}/v${Date.now()}`;                        // 같은 날 다시 만들어도 예전 이미지가 캐시로 보이지 않게
  await ensureBucket();
  for (const name of meta.slides) await put(`${base}/${name}`, await readFile(`${dir}/${name}`), 'image/jpeg');
  await put(`${base}/preview.jpg`, await readFile(`${dir}/preview.jpg`), 'image/jpeg');
  await put(`${base}/caption.txt`, await readFile(`${dir}/caption.txt`), 'text/plain; charset=utf-8');
  const pub = { ...meta, base, urls: meta.slides.map(n => publicUrl(`${base}/${n}`)), preview: publicUrl(`${base}/preview.jpg`), caption: publicUrl(`${base}/caption.txt`), uploadedAt: new Date().toISOString() };
  await put(`${meta.date}/cards.json`, JSON.stringify(pub, null, 1), 'application/json');
  await put('latest.json', JSON.stringify({ date: meta.date, base, slides: meta.slides.length }), 'application/json');
  log(`Storage에 ${meta.slides.length}장을 올렸어요: ${base}`);

  const repo = process.env.GITHUB_REPOSITORY;
  const ok = meta.slides.length <= MAX_SLIDES;
  if (!process.env.GITHUB_ACTIONS) {   // 스킬·로컬 실행: 다음 단계에 쓸 값만 알려줘요
    log(`PREVIEW_URL=${pub.preview}\nPUBLISH_DATE=${meta.date}\nAUTO_PUBLISH_OK=${ok}`);
    return;
  }
  summary(`\n### 미리보기\n![카드 미리보기](${pub.preview})\n\n` +
    (ok ? `**올려도 괜찮으면** ${repo ? `[인스타에 올리기](https://github.com/${repo}/actions/workflows/publish.yml)` : "'인스타에 올리기' 워크플로"} → **Run workflow** 를 누르세요. 날짜 칸은 비워두면 이 카드(${meta.date})가 올라가요.\n`
        : `카드가 ${meta.slides.length}장이라 자동 게시는 할 수 없어요 (API 한도 ${MAX_SLIDES}장). 아래 Artifacts에서 내려받아 앱에서 직접 올려주세요.\n`));
}

/* ---------- 토큰: Supabase ig_state 표에 보관하고 연장해요 ---------- */
async function loadToken() {
  let row = null, table = true;
  try { row = (await sb('GET', 'ig_state?id=eq.main&select=*'))[0] || null; }
  catch (e) { if (tableMissing(e)) table = false; else throw e; }
  const token = (row && row.token) || process.env.IG_ACCESS_TOKEN;
  if (!token) throw new Error('인스타 토큰이 없어요: GitHub Secrets에 IG_ACCESS_TOKEN 을 넣어주세요');
  mask(token);
  return { token, row, table };
}
async function refresh({ force = false } = {}) {
  need();
  const { token, row, table } = await loadToken();
  if (isFbToken(token)) { log('만료되지 않는 토큰(EAA…)이라 연장할 필요가 없어요'); return token; }
  if (!table) { log('⚠ ig_state 표가 없어서 토큰을 연장하지 않았어요. sql/06_instagram.sql 을 실행해 주세요 (안 하면 60일 뒤 만료돼요)'); return token; }
  const age = row && row.refreshed_at ? Date.now() - Date.parse(row.refreshed_at) : Infinity;
  if (!force && age < 3 * 864e5) { log('토큰은 최근에 연장했어요. 건너뛰어요'); return token; }
  const r = await fetch(`${apiBase(token)}/refresh_access_token?grant_type=ig_refresh_token&access_token=${encodeURIComponent(token)}`);
  const j = await r.json().catch(() => ({}));
  if (!r.ok || !j.access_token) {
    log(`⚠ 토큰 연장 실패 ${r.status} ${(j.error && j.error.message) || ''}`.trim());
    if (row && row.expires_at && Date.parse(row.expires_at) - Date.now() < 7 * 864e5) summary(`\n> ⚠ 인스타 토큰이 ${row.expires_at.slice(0, 10)}에 만료돼요. 새 토큰을 IG_ACCESS_TOKEN 에 넣고 ig_state 표의 행을 지워주세요.\n`);
    return token;
  }
  mask(j.access_token);
  const expires = new Date(Date.now() + (Number(j.expires_in) || 60 * 864e2) * 1000).toISOString();
  await sb('POST', 'ig_state?on_conflict=id', [{ id: 'main', token: j.access_token, refreshed_at: new Date().toISOString(), expires_at: expires }], 'resolution=merge-duplicates,return=minimal');
  log(`토큰을 연장했어요 (만료 ${expires.slice(0, 10)})`);
  return j.access_token;
}

/* ---------- 인스타 API ---------- */
async function ig(method, path, params, token) {
  const q = new URLSearchParams({ ...params, access_token: token });
  const url = method === 'GET' ? `${apiUrl(token)}${path}?${q}` : `${apiUrl(token)}${path}`;
  const r = await fetch(url, method === 'GET' ? {} : { method, headers: { 'content-type': 'application/x-www-form-urlencoded' }, body: q });
  const j = await r.json().catch(() => ({}));
  if (!r.ok || j.error) throw new Error(`Instagram ${method} ${path.replace(/\d{6,}/g, '{id}')} ${r.status} ${(j.error && (j.error.error_user_msg || j.error.message)) || ''}`.trim());
  return j;
}
async function waitReady(id, token, label) {
  for (let i = 0; i < 40; i++) {
    const s = await ig('GET', `/${id}`, { fields: 'status_code' }, token);
    if (s.status_code === 'FINISHED' || !s.status_code) return;
    if (s.status_code === 'ERROR' || s.status_code === 'EXPIRED') throw new Error(`${label} 처리 실패 (${s.status_code})`);
    await sleep(3000);
  }
  throw new Error(`${label} 처리가 2분 넘게 끝나지 않았어요`);
}

/* ---------- publish: 사람이 실행했을 때만 ---------- */
async function publish() {
  need();
  let date = (process.env.PUBLISH_DATE || '').trim();
  if (!date) {
    const latest = await getJson(publicUrl('latest.json')).catch(() => null);
    if (!latest) throw new Error('올릴 카드가 없어요. 먼저 \'매일 카드뉴스 만들기\'가 성공해야 해요');
    date = latest.date;
    const gap = (Date.parse(kstToday()) - Date.parse(date)) / 864e5;
    if (gap > 1) throw new Error(`가장 최근 카드가 ${date}라서 오래됐어요. 그래도 올리려면 날짜 칸에 ${date}를 직접 넣어주세요`);
  }
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error(`날짜 모양이 이상해요: ${date} (예: 2026-11-08)`);
  const meta = await getJson(publicUrl(`${date}/cards.json`)).catch(() => null);
  if (!meta) throw new Error(`${date} 카드가 Storage에 없어요`);
  const urls = meta.urls || [];
  if (urls.length < 2) throw new Error('캐러셀은 2장 이상이어야 해요');
  if (urls.length > MAX_SLIDES) throw new Error(`카드가 ${urls.length}장이에요. API로는 ${MAX_SLIDES}장까지만 올릴 수 있어서 앱에서 직접 올려주세요`);
  const caption = (await (await fetch(meta.caption + '?t=' + Date.now())).text()).trim();
  if (caption.length > 2200) throw new Error(`캡션이 ${caption.length}자예요 (최대 2,200자)`);
  if ((caption.match(/#[^\s#]+/g) || []).length > 30) throw new Error('해시태그가 30개를 넘어요');

  /* 같은 날짜를 두 번 올리지 않게 */
  let posted;
  try { posted = await sb('GET', `ig_posts?date=eq.${date}&select=*`); }
  catch (e) { if (tableMissing(e)) throw new Error('ig_posts 표가 없어요. Supabase SQL Editor에서 sql/06_instagram.sql 을 먼저 실행해 주세요'); throw e; }
  if (posted.length && !FORCE) throw new Error(`${date} 카드는 이미 올렸어요: ${posted[0].permalink || posted[0].media_id} (다시 올리려면 GitHub에서는 '다시 올리기' 체크, 직접 실행할 때는 FORCE=1)`);

  const token = await refresh();
  const envUid = (process.env.IG_USER_ID || '').trim();
  if (!envUid && isFbToken(token)) throw new Error('EAA로 시작하는 토큰은 인스타 계정 ID가 필요해요: IG_USER_ID 에 앱 대시보드의 계정 번호(1784…)를 넣어주세요');
  let me = envUid ? { user_id: envUid } : await ig('GET', '/me', { fields: 'user_id,username' }, token);
  const uid = me.user_id || me.id;
  if (!me.username) { try { me = { ...me, username: (await ig('GET', `/${uid}`, { fields: 'username' }, token)).username }; } catch { /* 이름은 없어도 돼요 */ } }
  let quota = '';
  try { const q = await ig('GET', `/${uid}/content_publishing_limit`, { fields: 'quota_usage,config' }, token); const d = (q.data || [])[0] || {}; quota = `${d.quota_usage ?? '?'} / ${(d.config && d.config.quota_total) ?? '?'}`; } catch { /* 확인 못 해도 계속 */ }
  log(`계정 ${me.username ? '@' + me.username : uid} · 오늘 게시 ${quota || '확인 안 됨'} · ${date} 카드 ${urls.length}장`);

  if (DRY) {
    summary(`## 인스타 올리기 (시험 실행, ${date})\n계정 ${me.username ? '@' + me.username : uid}에 카드 ${urls.length}장을 올릴 준비가 됐어요. 실제로는 올리지 않았어요.\n\n![미리보기](${meta.preview})\n\n캡션:\n\`\`\`\n${caption}\n\`\`\``);
    return;
  }

  const children = [];
  for (const [i, image_url] of urls.entries()) {
    const c = await ig('POST', `/${uid}/media`, { image_url, is_carousel_item: 'true' }, token);
    children.push(c.id);
    log(`  ✓ ${i + 1}/${urls.length} 이미지 등록`);
  }
  for (const [i, id] of children.entries()) await waitReady(id, token, `${i + 1}번째 이미지`);
  const car = await ig('POST', `/${uid}/media`, { media_type: 'CAROUSEL', children: children.join(','), caption }, token);
  await waitReady(car.id, token, '캐러셀');
  const pub = await ig('POST', `/${uid}/media_publish`, { creation_id: car.id }, token);
  let permalink = '';
  try { permalink = (await ig('GET', `/${pub.id}`, { fields: 'permalink' }, token)).permalink || ''; } catch { /* 링크는 없어도 돼요 */ }
  await sb('POST', 'ig_posts?on_conflict=date', [{ date, media_id: pub.id, permalink: permalink || null, slides: urls.length, posted_at: new Date().toISOString() }], 'resolution=merge-duplicates,return=minimal')
    .catch(e => log('⚠ 올리긴 했지만 기록 저장 실패:', e.message));
  summary(`## 인스타에 올렸어요 (${date})\n카드 ${urls.length}장 · ${permalink ? `[게시물 보기](${permalink})` : 'media id ' + pub.id}`);
}

const run = { upload, refresh: () => refresh(), publish }[CMD];
if (!run) { console.error('사용법: node collector/instagram.mjs upload | refresh | publish'); process.exit(1); }
run().catch(e => { console.error('✗ ' + e.message); summary(`\n> ✗ ${e.message}\n`); process.exit(1); });
