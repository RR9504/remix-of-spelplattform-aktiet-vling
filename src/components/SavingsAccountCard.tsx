import { useState, useEffect } from "react";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Landmark, ShieldCheck, ArrowDownToLine, ArrowUpFromLine, Loader2 } from "lucide-react";
import { formatSEK } from "@/lib/mockData";
import { savingsTransaction } from "@/lib/api";
import { supabase } from "@/integrations/supabase/client";
import { useCompetition } from "@/contexts/CompetitionContext";
import { toast } from "sonner";

interface SavingsAccountCardProps {
  competitionId: string;
  teamId: string;
  cashBalance: number;
}

export function SavingsAccountCard({ competitionId, teamId, cashBalance }: SavingsAccountCardProps) {
  const { refresh } = useCompetition();
  const [balance, setBalance] = useState<number>(0);
  const [amount, setAmount] = useState("");
  const [loading, setLoading] = useState(false);
  const [fetchingBalance, setFetchingBalance] = useState(true);

  useEffect(() => {
    fetchBalance();
  }, [competitionId, teamId]);

  const fetchBalance = async () => {
    setFetchingBalance(true);
    const { data } = await supabase
      .from("savings_accounts")
      .select("balance")
      .eq("competition_id", competitionId)
      .eq("team_id", teamId)
      .maybeSingle();
    setBalance(data ? Number(data.balance) : 0);
    setFetchingBalance(false);
  };

  const handleTransaction = async (action: "deposit" | "withdraw") => {
    const numAmount = parseFloat(amount);
    if (!numAmount || numAmount <= 0) {
      toast.error("Ange ett giltigt belopp");
      return;
    }
    setLoading(true);
    const result = await savingsTransaction({
      competition_id: competitionId,
      team_id: teamId,
      action,
      amount: numAmount,
    });
    setLoading(false);

    if (result.success) {
      toast.success(action === "deposit"
        ? `Satte in ${formatSEK(numAmount)} på sparkontot`
        : `Tog ut ${formatSEK(numAmount)} från sparkontot`
      );
      setAmount("");
      setBalance(result.new_savings_balance ?? balance);
      refresh();
    } else {
      toast.error(result.error || "Något gick fel");
    }
  };

  return (
    <Card className="border-primary/20 bg-gradient-to-br from-card to-primary/5">
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="text-lg flex items-center gap-2">
            <Landmark className="h-5 w-5 text-primary" />
            Haull Ånnan Sparkonto
          </CardTitle>
          <Badge variant="outline" className="text-xs border-primary/30 text-primary">
            <ShieldCheck className="h-3 w-3 mr-1" />
            Insättningsgaranti
          </Badge>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex items-baseline justify-between">
          <div>
            <p className="text-xs text-muted-foreground">Saldo på sparkontot</p>
            {fetchingBalance ? (
              <Loader2 className="h-5 w-5 animate-spin text-muted-foreground mt-1" />
            ) : (
              <p className="font-mono font-bold text-2xl">{formatSEK(balance)}</p>
            )}
          </div>
          <div className="text-right">
            <p className="text-xs text-muted-foreground">Ränta</p>
            <p className="font-mono font-semibold text-gain">0,35%</p>
            <p className="text-xs text-muted-foreground">på belopp över 50 000 kr</p>
          </div>
        </div>

        <div className="flex gap-2">
          <Input
            type="number"
            placeholder="Belopp (SEK)"
            value={amount}
            onChange={(e) => setAmount(e.target.value)}
            className="bg-background"
            min={0}
            disabled={loading}
          />
          <Button
            size="sm"
            onClick={() => handleTransaction("deposit")}
            disabled={loading || !amount}
            className="shrink-0"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowDownToLine className="h-4 w-4 mr-1" />}
            Sätt in
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => handleTransaction("withdraw")}
            disabled={loading || !amount || balance <= 0}
            className="shrink-0"
          >
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <ArrowUpFromLine className="h-4 w-4 mr-1" />}
            Ta ut
          </Button>
        </div>

        <p className="text-xs text-muted-foreground">
          Ränta beräknas dagligen. Insättningsgaranti upp till 1 050 000 kr.
          <a href="https://www.smsparbank.se/privat/spara-och-placera/sparkonton/Haull-annan.html" target="_blank" rel="noopener noreferrer" className="ml-1 text-primary hover:underline">
            Läs mer
          </a>
        </p>
      </CardContent>
    </Card>
  );
}
