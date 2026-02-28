import { useState, useEffect, useRef } from "react";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Loader2, X } from "lucide-react";
import { formatSEK } from "@/lib/mockData";
import { getOrders, cancelOrder } from "@/lib/api";
import { useCompetition } from "@/contexts/CompetitionContext";
import { toast } from "sonner";
import type { PendingOrder } from "@/types/trading";

const ORDER_TYPE_LABELS: Record<string, string> = {
  limit_buy: "Limitköp",
  limit_sell: "Limitsälj",
  stop_loss: "Stop-Loss",
  take_profit: "Take-Profit",
};

const STATUS_LABELS: Record<string, string> = {
  pending: "Väntande",
  filled: "Fylld",
  cancelled: "Avbruten",
  expired: "Utgången",
};

export function PendingOrdersList() {
  const { activeCompetition, activeTeam } = useCompetition();
  const [orders, setOrders] = useState<PendingOrder[]>([]);
  const [loading, setLoading] = useState(true);
  const [cancelling, setCancelling] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval>>();

  const fetchOrders = async () => {
    if (!activeCompetition || !activeTeam) {
      setOrders([]);
      setLoading(false);
      return;
    }
    const data = await getOrders(activeCompetition.id, activeTeam.id);
    setOrders(data);
    setLoading(false);
  };

  useEffect(() => {
    setLoading(true);
    fetchOrders();
    intervalRef.current = setInterval(fetchOrders, 30_000);
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [activeCompetition?.id, activeTeam?.id]);

  const handleCancel = async (orderId: string) => {
    setCancelling(orderId);
    const result = await cancelOrder(orderId);
    if (result.success) {
      toast.success("Order avbruten");
      fetchOrders();
    } else {
      toast.error(result.error || "Kunde inte avbryta order");
    }
    setCancelling(null);
  };

  const pendingOrders = orders.filter((o) => o.status === "pending");
  const recentOrders = orders.filter((o) => o.status !== "pending").slice(0, 5);

  if (loading) {
    return null;
  }

  if (orders.length === 0) {
    return null;
  }

  return (
    <div className="rounded-xl border bg-card p-4 sm:p-6">
      <h2 className="text-lg font-semibold mb-4">Ordrar</h2>

      {pendingOrders.length > 0 && (
        <>
          <h3 className="text-sm font-medium text-muted-foreground mb-2">Aktiva ordrar</h3>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Aktie</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead className="text-right">Riktkurs</TableHead>
                <TableHead className="text-right">Antal</TableHead>
                <TableHead className="text-right">Skapad</TableHead>
                <TableHead className="text-right"></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {pendingOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell>
                    <span className="font-mono font-semibold text-sm">{order.ticker}</span>
                    <br />
                    <span className="text-xs text-muted-foreground">{order.stock_name}</span>
                  </TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {ORDER_TYPE_LABELS[order.order_type]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    <span>{formatSEK(order.target_price)}</span>
                    {order.currency && order.currency !== "SEK" && (
                      <span className="block text-[10px] text-muted-foreground">i SEK/{order.currency}</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">{order.shares}</TableCell>
                  <TableCell className="text-right text-xs text-muted-foreground">
                    {new Date(order.created_at).toLocaleDateString("sv-SE")}
                  </TableCell>
                  <TableCell className="text-right">
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => handleCancel(order.id)}
                      disabled={cancelling === order.id}
                    >
                      {cancelling === order.id ? (
                        <Loader2 className="h-3 w-3 animate-spin" />
                      ) : (
                        <X className="h-3 w-3" />
                      )}
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </>
      )}

      {recentOrders.length > 0 && (
        <>
          <h3 className="text-sm font-medium text-muted-foreground mb-2 mt-4">Senaste avslutade</h3>
          <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Aktie</TableHead>
                <TableHead>Typ</TableHead>
                <TableHead className="text-right">Riktkurs</TableHead>
                <TableHead className="text-right">Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {recentOrders.map((order) => (
                <TableRow key={order.id}>
                  <TableCell className="font-mono text-sm">{order.ticker}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className="text-xs">
                      {ORDER_TYPE_LABELS[order.order_type]}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-right font-mono text-sm">
                    {formatSEK(order.target_price)}
                  </TableCell>
                  <TableCell className="text-right">
                    <Badge
                      variant="outline"
                      className={`text-xs ${
                        order.status === "filled"
                          ? "border-gain text-gain"
                          : order.status === "cancelled"
                          ? "border-muted-foreground"
                          : "border-yellow-500 text-yellow-500"
                      }`}
                    >
                      {STATUS_LABELS[order.status]}
                    </Badge>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
          </div>
        </>
      )}
    </div>
  );
}
