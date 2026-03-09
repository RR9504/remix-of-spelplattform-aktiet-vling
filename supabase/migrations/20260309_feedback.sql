create table if not exists public.feedback (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  message text not null,
  page_url text,
  created_at timestamptz default now()
);

alter table public.feedback enable row level security;

-- Users can insert their own feedback
create policy "Users can insert own feedback"
  on public.feedback for insert
  to authenticated
  with check (auth.uid() = user_id);

-- No select policy — read via Supabase dashboard/service role only
