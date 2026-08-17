-- CampusConnect Supabase setup
-- Run this entire file in Supabase SQL Editor.
-- After running it, create a public Storage bucket named: campus-images

create extension if not exists "pgcrypto";

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  full_name text not null default 'Student',
  email text,
  course text,
  bio text,
  avatar_url text,
  role text not null default 'user' check (role in ('user','admin')),
  is_blocked boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.posts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null,
  image_url text,
  like_count integer not null default 0,
  created_at timestamptz not null default now()
);

create table if not exists public.comments (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.likes (
  id uuid primary key default gen_random_uuid(),
  post_id uuid not null references public.posts(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(post_id,user_id)
);

create table if not exists public.events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  description text not null,
  event_date date not null,
  event_time time,
  location text not null,
  image_url text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  created_at timestamptz not null default now()
);

create table if not exists public.event_registrations (
  id uuid primary key default gen_random_uuid(),
  event_id uuid not null references public.events(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(event_id,user_id)
);

create table if not exists public.study_partners (
  id uuid primary key default gen_random_uuid(),
  user_id uuid unique not null references public.profiles(id) on delete cascade,
  name text not null,
  subjects text not null,
  skills text not null,
  experience_level text not null,
  availability text not null,
  introduction text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.polls (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  question text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.poll_options (
  id uuid primary key default gen_random_uuid(),
  poll_id uuid not null references public.polls(id) on delete cascade,
  option_text text not null,
  position integer not null default 0
);

create table if not exists public.poll_votes (
  id uuid primary key default gen_random_uuid(),
  option_id uuid not null references public.poll_options(id) on delete cascade,
  user_id uuid not null references public.profiles(id) on delete cascade,
  created_at timestamptz not null default now(),
  unique(option_id,user_id)
);

create table if not exists public.notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  message text not null,
  type text not null default 'activity',
  is_read boolean not null default false,
  created_at timestamptz not null default now()
);

create table if not exists public.announcements (
  id uuid primary key default gen_random_uuid(),
  admin_id uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  body text not null,
  created_at timestamptz not null default now()
);

create table if not exists public.reports (
  id uuid primary key default gen_random_uuid(),
  reporter_id uuid not null references public.profiles(id) on delete cascade,
  post_id uuid references public.posts(id) on delete cascade,
  reason text not null,
  created_at timestamptz not null default now()
);

-- Keep post like_count correct.
create or replace function public.refresh_post_like_count()
returns trigger language plpgsql as $$
begin
  if tg_op = 'INSERT' then
    update public.posts set like_count = like_count + 1 where id = new.post_id;
    return new;
  else
    update public.posts set like_count = greatest(like_count - 1, 0) where id = old.post_id;
    return old;
  end if;
end $$;

drop trigger if exists likes_count_insert on public.likes;
create trigger likes_count_insert after insert on public.likes for each row execute function public.refresh_post_like_count();
drop trigger if exists likes_count_delete on public.likes;
create trigger likes_count_delete after delete on public.likes for each row execute function public.refresh_post_like_count();

-- Create a profile automatically after signup.
create or replace function public.handle_new_user()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  insert into public.profiles(id,full_name,email)
  values(new.id,coalesce(new.raw_user_meta_data->>'full_name','Student'),new.email)
  on conflict(id) do nothing;
  return new;
end $$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created after insert on auth.users
for each row execute function public.handle_new_user();

-- Helper used by RLS policies.
create or replace function public.is_admin()
returns boolean language sql stable security definer set search_path = public as $$
  select exists(select 1 from public.profiles where id = auth.uid() and role = 'admin');
$$;

alter table public.profiles enable row level security;
alter table public.posts enable row level security;
alter table public.comments enable row level security;
alter table public.likes enable row level security;
alter table public.events enable row level security;
alter table public.event_registrations enable row level security;
alter table public.study_partners enable row level security;
alter table public.polls enable row level security;
alter table public.poll_options enable row level security;
alter table public.poll_votes enable row level security;
alter table public.notifications enable row level security;
alter table public.announcements enable row level security;
alter table public.reports enable row level security;

-- Profiles
create policy "profiles readable" on public.profiles for select to authenticated using (true);
create policy "own profile update" on public.profiles for update to authenticated using (id=auth.uid() or public.is_admin()) with check (id=auth.uid() or public.is_admin());
create policy "profile insert" on public.profiles for insert to authenticated with check (id=auth.uid());

-- Posts: users can edit/delete only their own; admins can manage all.
create policy "posts readable" on public.posts for select to authenticated using (true);
create policy "posts insert own" on public.posts for insert to authenticated with check (user_id=auth.uid());
create policy "posts update own" on public.posts for update to authenticated using (user_id=auth.uid() or public.is_admin()) with check (user_id=auth.uid() or public.is_admin());
create policy "posts delete own/admin" on public.posts for delete to authenticated using (user_id=auth.uid() or public.is_admin());

-- Comments
create policy "comments readable" on public.comments for select to authenticated using (true);
create policy "comments insert own" on public.comments for insert to authenticated with check (user_id=auth.uid());
create policy "comments delete own/admin" on public.comments for delete to authenticated using (user_id=auth.uid() or public.is_admin());

-- Likes
create policy "likes readable" on public.likes for select to authenticated using (true);
create policy "likes insert own" on public.likes for insert to authenticated with check (user_id=auth.uid());
create policy "likes delete own" on public.likes for delete to authenticated using (user_id=auth.uid());

-- Events
create policy "events readable" on public.events for select to authenticated using (true);
create policy "events insert own" on public.events for insert to authenticated with check (user_id=auth.uid());
create policy "events update own/admin" on public.events for update to authenticated using (user_id=auth.uid() or public.is_admin()) with check (user_id=auth.uid() or public.is_admin());
create policy "events delete own/admin" on public.events for delete to authenticated using (user_id=auth.uid() or public.is_admin());

-- Registrations
create policy "registrations readable" on public.event_registrations for select to authenticated using (true);
create policy "registration own insert" on public.event_registrations for insert to authenticated with check (user_id=auth.uid());
create policy "registration own delete" on public.event_registrations for delete to authenticated using (user_id=auth.uid());

-- Study partners
create policy "partners readable" on public.study_partners for select to authenticated using (true);
create policy "partner own insert" on public.study_partners for insert to authenticated with check (user_id=auth.uid());
create policy "partner own update" on public.study_partners for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "partner own delete" on public.study_partners for delete to authenticated using (user_id=auth.uid());

-- Polls
create policy "polls readable" on public.polls for select to authenticated using (true);
create policy "polls own insert" on public.polls for insert to authenticated with check (user_id=auth.uid());
create policy "polls own update" on public.polls for update to authenticated using (user_id=auth.uid() or public.is_admin()) with check (user_id=auth.uid() or public.is_admin());
create policy "polls own delete" on public.polls for delete to authenticated using (user_id=auth.uid() or public.is_admin());

create policy "options readable" on public.poll_options for select to authenticated using (true);
create policy "options insert" on public.poll_options for insert to authenticated with check (exists(select 1 from public.polls p where p.id=poll_id and p.user_id=auth.uid()));
create policy "options delete" on public.poll_options for delete to authenticated using (exists(select 1 from public.polls p where p.id=poll_id and (p.user_id=auth.uid() or public.is_admin())));

-- One vote per user per option. For stronger "one vote per poll" enforcement, use the optional trigger below.
create policy "votes readable" on public.poll_votes for select to authenticated using (true);
create policy "vote own insert" on public.poll_votes for insert to authenticated with check (user_id=auth.uid());
create policy "vote own delete" on public.poll_votes for delete to authenticated using (user_id=auth.uid());

create or replace function public.prevent_multiple_poll_votes()
returns trigger language plpgsql security definer set search_path = public as $$
begin
  if exists (
    select 1
    from public.poll_votes v
    join public.poll_options old_o on old_o.id=v.option_id
    where v.user_id=new.user_id and old_o.poll_id=(select poll_id from public.poll_options where id=new.option_id)
  ) then
    raise exception 'You already voted in this poll';
  end if;
  return new;
end $$;

drop trigger if exists one_vote_per_poll on public.poll_votes;
create trigger one_vote_per_poll before insert on public.poll_votes
for each row execute function public.prevent_multiple_poll_votes();

-- Notifications
create policy "own notifications" on public.notifications for select to authenticated using (user_id=auth.uid() or public.is_admin());
create policy "notification insert" on public.notifications for insert to authenticated with check (user_id=auth.uid() or public.is_admin());
create policy "notification update own" on public.notifications for update to authenticated using (user_id=auth.uid()) with check (user_id=auth.uid());
create policy "notification delete own" on public.notifications for delete to authenticated using (user_id=auth.uid());

-- Announcements
create policy "announcements readable" on public.announcements for select to authenticated using (true);
create policy "announcement admin insert" on public.announcements for insert to authenticated with check (public.is_admin());
create policy "announcement admin update" on public.announcements for update to authenticated using (public.is_admin()) with check (public.is_admin());
create policy "announcement admin delete" on public.announcements for delete to authenticated using (public.is_admin());

-- Reports
create policy "reports own insert" on public.reports for insert to authenticated with check (reporter_id=auth.uid());
create policy "reports own/admin select" on public.reports for select to authenticated using (reporter_id=auth.uid() or public.is_admin());
create policy "reports admin delete" on public.reports for delete to authenticated using (public.is_admin());

-- Storage bucket
insert into storage.buckets (id,name,public)
values ('campus-images','campus-images',true)
on conflict (id) do update set public=true;

create policy "images public read" on storage.objects for select using (bucket_id='campus-images');
create policy "images authenticated upload" on storage.objects for insert to authenticated with check (bucket_id='campus-images');
create policy "images own update" on storage.objects for update to authenticated using (bucket_id='campus-images' and owner_id=auth.uid());
create policy "images own delete" on storage.objects for delete to authenticated using (bucket_id='campus-images' and owner_id=auth.uid());

-- OPTIONAL: after creating your account, make yourself admin:
-- update public.profiles set role='admin' where email='YOUR_EMAIL_HERE';
