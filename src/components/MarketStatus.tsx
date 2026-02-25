import { isMarketOpen } from "@/lib/mockData";

export function MarketStatus() {
  const seOpen = isMarketOpen('SE');
  const usOpen = isMarketOpen('US');

  return (
    <div className="flex gap-4">
      <StatusBadge label="Nasdaq Stockholm" open={seOpen} hours="09:00–17:30" flag="🇸🇪" />
      <StatusBadge label="NYSE/NASDAQ" open={usOpen} hours="14:00–22:00" flag="🇺🇸" />
    </div>
  );
}

function StatusBadge({ label, open, hours, flag }: { label: string; open: boolean; hours: string; flag: string }) {
  return (
    <div className="flex items-center gap-2 rounded-lg border bg-card px-4 py-3">
      <span className="text-lg">{flag}</span>
      <div>
        <p className="text-sm font-medium">{label}</p>
        <div className="flex items-center gap-1.5">
          <span className={`h-2 w-2 rounded-full ${open ? 'bg-gain animate-pulse-glow' : 'bg-muted-foreground/50'}`} />
          <span className="text-xs text-muted-foreground">
            {open ? 'Öppen' : 'Stängd'} · {hours}
          </span>
        </div>
        {!open && (
          <p className="text-[10px] text-muted-foreground">Handel sker till senaste kurs</p>
        )}
      </div>
    </div>
  );
}
