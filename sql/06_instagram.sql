-- 지구 근황 · 인스타그램 자동 게시용 표 (Supabase SQL Editor에서 한 번만 실행)
-- 두 표 모두 RLS를 켜고 정책을 만들지 않아요.
-- 그래서 앱(publishable 키)에서는 읽을 수도 쓸 수도 없고, GitHub Actions의 secret 키로만 다룰 수 있어요.

-- 인스타 토큰 보관 (60일마다 만료되기 전에 매일 연장해요)
create table if not exists public.ig_state (
  id           text primary key,
  token        text not null,
  refreshed_at timestamptz,
  expires_at   timestamptz
);
alter table public.ig_state enable row level security;

-- 올린 기록 (같은 날짜를 두 번 올리지 않게)
create table if not exists public.ig_posts (
  date       date primary key,
  media_id   text not null,
  permalink  text,
  slides     int,
  posted_at  timestamptz not null default now()
);
alter table public.ig_posts enable row level security;
