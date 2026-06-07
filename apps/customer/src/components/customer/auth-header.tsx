"use client";

import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import { ProfileCard } from "./profile-card";
import { LogIn, User } from "lucide-react";

type CustomerData = {
  name: string;
  email: string;
  photo_url?: string;
  total_points?: number;
  total_orders?: number;
  total_spent?: number;
};

type AuthHeaderProps = {
  isAuthenticated: boolean;
  customer: CustomerData | null;
  onOpenAuth: () => void;
  onLogout: () => void;
  onProfileClick?: () => void;
  isLoading?: boolean;
  className?: string;
};

export function AuthHeader({
  isAuthenticated,
  customer,
  onOpenAuth,
  onLogout,
  onProfileClick,
  isLoading = false,
  className,
}: AuthHeaderProps) {
  if (isLoading) {
    return (
      <div
        className={cn(
          "flex items-center justify-center rounded-xl border border-border bg-card p-3 shadow-sm",
          className
        )}
      >
        <div className="flex items-center gap-2">
          <div className="h-4 w-4 animate-pulse rounded-full bg-muted" />
          <div className="h-3 w-24 animate-pulse rounded bg-muted" />
        </div>
      </div>
    );
  }

  if (isAuthenticated && customer) {
    return <ProfileCard customer={customer} onLogout={onLogout} onProfileClick={onProfileClick} className={className} />;
  }

  return (
    <div
      className={cn(
        "flex items-center justify-between rounded-xl border border-border bg-card p-3 shadow-sm",
        className
      )}
    >
      <div className="flex items-center gap-2.5">
        <div className="flex h-9 w-9 items-center justify-center rounded-full bg-muted">
          <User className="h-4 w-4 text-muted-foreground" />
        </div>
        <div>
          <p className="text-xs font-black text-foreground">
            Pesan sebagai tamu
          </p>
          <p className="text-[10px] text-muted-foreground">
            Login untuk dapatkan poin
          </p>
        </div>
      </div>
      <Button
        variant="outline"
        size="xs"
        onClick={onOpenAuth}
      >
        <LogIn className="h-3 w-3" />
        Login/Daftar
      </Button>
    </div>
  );
}
