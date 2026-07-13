"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { LogOut, Star, Package, Wallet } from "lucide-react";
import { currency } from "./types";

type CustomerData = {
  name: string;
  email: string;
  photo_url?: string;
  total_points?: number;
  total_orders?: number;
  total_spent?: number;
};

type ProfileCardProps = {
  customer: CustomerData;
  onLogout: () => void;
  onProfileClick?: () => void;
  className?: string;
};

export function ProfileCard({
  customer,
  onLogout,
  onProfileClick,
  className,
}: ProfileCardProps) {
  const initials = (customer.name || "?")
    .split(" ")
    .map((s) => s[0])
    .join("")
    .toUpperCase()
    .slice(0, 2);

  return (
    <button
      type="button"
      onClick={onProfileClick}
      className={cn(
        "w-full rounded-xl border border-border bg-card p-3 shadow-sm text-left transition-all hover:border-primary/30 hover:shadow-md",
        className
      )}
    >
      {/* Avatar & Info */}
      <div className="flex items-center gap-3">
        {customer.photo_url ? (
          <img
            src={customer.photo_url}
            alt={customer.name}
            className="h-10 w-10 rounded-full object-cover ring-2 ring-border"
          />
        ) : (
          <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10 text-[13px] font-black text-primary ring-2 ring-border">
            {initials}
          </div>
        )}
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-black text-foreground">
            {customer.name}
          </p>
          <p className="truncate text-[11px] text-muted-foreground">
            {customer.email}
          </p>
        </div>
        <Button
          variant="ghost"
          size="icon-xs"
          onClick={(e) => {
            e.stopPropagation(); // prevent parent ProfileCard navigation to /profile
            onLogout();
          }}
          className="shrink-0 text-muted-foreground hover:text-destructive"
        >
          <LogOut className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* Stats */}
      <div className="mt-2.5 grid grid-cols-3 gap-1.5">
        <Stat
          icon={<Star className="h-3 w-3 text-amber-500" />}
          label="Yumi Poin"
          value={String(customer.total_points ?? 0)}
        />
        <Stat
          icon={<Package className="h-3 w-3 text-blue-500" />}
          label="Pesanan"
          value={String(customer.total_orders ?? 0)}
        />
        <Stat
          icon={<Wallet className="h-3 w-3 text-emerald-500" />}
          label="Total"
          value={currency(customer.total_spent ?? 0)}
        />
      </div>
    </button>
  );
}

function Stat({
  icon,
  label,
  value,
}: {
  icon: React.ReactNode;
  label: string;
  value: string;
}) {
  return (
    <div className="flex items-center gap-1.5 rounded-lg bg-muted/40 px-2 py-1.5">
      {icon}
      <div className="min-w-0">
        <p className="truncate text-[10px] font-semibold text-muted-foreground">
          {label}
        </p>
        <p className="truncate text-[11px] font-black text-foreground">
          {value}
        </p>
      </div>
    </div>
  );
}
