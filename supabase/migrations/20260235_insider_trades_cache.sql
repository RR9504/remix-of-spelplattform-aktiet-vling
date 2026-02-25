CREATE TABLE insider_trades_cache (
  id UUID DEFAULT gen_random_uuid() PRIMARY KEY,
  ticker TEXT NOT NULL,
  transaction_date DATE NOT NULL,
  insider_name TEXT NOT NULL,
  title TEXT,
  transaction_type TEXT NOT NULL,  -- 'buy' | 'sell' | 'exercise' | 'other'
  shares BIGINT,
  value_sek NUMERIC,
  source TEXT NOT NULL,            -- 'yahoo' | 'fi'
  fetched_at TIMESTAMPTZ DEFAULT now()
);

CREATE INDEX idx_insider_ticker ON insider_trades_cache(ticker);
CREATE INDEX idx_insider_fetched ON insider_trades_cache(fetched_at);
CREATE UNIQUE INDEX idx_insider_unique ON insider_trades_cache(ticker, transaction_date, insider_name, transaction_type, shares);

ALTER TABLE insider_trades_cache ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Anyone can read insider trades"
  ON insider_trades_cache FOR SELECT USING (true);
CREATE POLICY "Service role can insert insider trades"
  ON insider_trades_cache FOR INSERT WITH CHECK (true);
CREATE POLICY "Service role can update insider trades"
  ON insider_trades_cache FOR UPDATE USING (true);
CREATE POLICY "Service role can delete insider trades"
  ON insider_trades_cache FOR DELETE USING (true);
