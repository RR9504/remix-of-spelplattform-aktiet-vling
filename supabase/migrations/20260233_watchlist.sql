CREATE TABLE watchlist (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  profile_id UUID NOT NULL REFERENCES profiles(id) ON DELETE CASCADE,
  ticker TEXT NOT NULL,
  stock_name TEXT,
  added_at TIMESTAMPTZ DEFAULT now()
);

CREATE UNIQUE INDEX watchlist_unique ON watchlist(profile_id, ticker);

ALTER TABLE watchlist ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can manage own watchlist"
  ON watchlist FOR ALL
  USING (auth.uid() = profile_id)
  WITH CHECK (auth.uid() = profile_id);
