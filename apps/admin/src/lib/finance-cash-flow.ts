export function isCashExpense(tx: {
  type?: string;
  category?: string;
  transactionKind?: string;
  transaction_kind?: string;
  isCashOutflow?: boolean;
  is_cash_outflow?: boolean;
}) {
  return (
    tx.type === "expense" &&
    String(tx.category ?? "").toLowerCase() !== "hpp" &&
    String(tx.transactionKind ?? tx.transaction_kind ?? "").toLowerCase() !==
      "order_cogs" &&
    tx.isCashOutflow !== false &&
    tx.is_cash_outflow !== false
  );
}
