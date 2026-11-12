import type { ReactNode } from "react";
import { Link } from "@tanstack/react-router";
import "./finance-workspace.css";

const pages = [
  ["/admin/finance", "Overview"],
  ["/admin/finance/transactions", "Transaksi"],
  ["/admin/finance/accounting", "Akuntansi"],
  ["/admin/finance/expenses", "Pengeluaran"],
  ["/admin/finance/reports", "Laporan"],
  ["/admin/finance/shift-reports", "Laporan Shift"],
  ["/admin/recipe/hpp", "HPP"],
] as const;
export function FinanceWorkspace({ children }: { children: ReactNode }) {
  return (
    <div className="finance-workspace">
      <nav aria-label="Navigasi keuangan" className="finance-navigation">
        {pages.map(([to, label]) => (
          <Link
            key={to}
            to={to}
            activeOptions={{ exact: true }}
            activeProps={{ "aria-current": "page" }}
          >
            {label}
          </Link>
        ))}
      </nav>
      {children}
    </div>
  );
}
