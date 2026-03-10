import { useState } from "react";
import { Navbar } from "@/components/Navbar";
import { StockSearch } from "@/components/StockSearch";
import { MarketStatus } from "@/components/MarketStatus";
import { NoCompetitionState } from "@/components/NoCompetitionState";
import { useCompetition } from "@/contexts/CompetitionContext";
import { formatSEK } from "@/lib/mockData";
import { TrendingUp, TrendingDown, ChevronDown, ChevronUp } from "lucide-react";

const CERT_EXAMPLES = [
  { query: "BULL-VOLV", label: "Bull Volvo" },
  { query: "BEAR-VOLV", label: "Bear Volvo" },
  { query: "BULL-OMXS", label: "Bull OMXS30" },
  { query: "BEAR-OMXS", label: "Bear OMXS30" },
  { query: "BULL-ERIC", label: "Bull Ericsson" },
  { query: "BEAR-ERIC", label: "Bear Ericsson" },
  { query: "BULL-HM", label: "Bull H&M" },
  { query: "BEAR-HM", label: "Bear H&M" },
  { query: "BULL-SEB", label: "Bull SEB" },
  { query: "BEAR-SEB", label: "Bear SEB" },
  { query: "BULL-TSLA", label: "Bull Tesla" },
  { query: "BEAR-TSLA", label: "Bear Tesla" },
  { query: "BULL-NVD", label: "Bull NVIDIA" },
  { query: "BEAR-NVD", label: "Bear NVIDIA" },
  { query: "BULL-AAPL", label: "Bull Apple" },
  { query: "BEAR-AAPL", label: "Bear Apple" },
];

const Trade = () => {
  const { activeCompetition, activeTeam, cashBalance } = useCompetition();
  const [searchQuery, setSearchQuery] = useState("");
  const [showCerts, setShowCerts] = useState(false);

  return (
    <div className="min-h-screen bg-background">
      <Navbar />
      <main className="container py-6 pb-28 md:pb-6 space-y-6">
        <div className="flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl font-bold">Handla</h1>
            {activeCompetition && activeTeam ? (
              <p className="text-muted-foreground text-sm">
                {activeTeam.name} · {activeCompetition.name} · Saldo: {formatSEK(cashBalance ?? 0)}
              </p>
            ) : (
              <p className="text-muted-foreground text-sm">Sök och handla aktier på svenska och amerikanska marknader</p>
            )}
          </div>
          <MarketStatus />
        </div>
        {!activeCompetition || !activeTeam ? (
          <NoCompetitionState />
        ) : (
          <>
            <StockSearch initialQuery={searchQuery} />

            <button
              onClick={() => setShowCerts(!showCerts)}
              className="flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground transition-colors"
            >
              <TrendingUp className="h-4 w-4" />
              Bull & Bear-certifikat
              {showCerts ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </button>

            {showCerts && (
              <div className="rounded-xl border bg-card p-4 space-y-3">
                <p className="text-xs text-muted-foreground">
                  Certifikat ger hävstång på aktier och index. Sök direkt efter certifikat — klicka på ett exempel nedan för att fylla i sökningen.
                </p>
                <div className="flex flex-wrap gap-2">
                  {CERT_EXAMPLES.map((cert) => (
                    <button
                      key={cert.query}
                      onClick={() => setSearchQuery(cert.query)}
                      className={`inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-medium transition-colors hover:bg-muted ${
                        cert.query.startsWith("BULL")
                          ? "text-gain border-gain/30"
                          : "text-loss border-loss/30"
                      }`}
                    >
                      {cert.query.startsWith("BULL") ? (
                        <TrendingUp className="h-3 w-3" />
                      ) : (
                        <TrendingDown className="h-3 w-3" />
                      )}
                      {cert.label}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </>
        )}
      </main>
    </div>
  );
};

export default Trade;
