"use client";

import { Home, Menu, Moon, Network, Sun, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type DashboardHeaderProps = {
  tenantLabel: string;
  dark: boolean;
  mobileMenuOpen: boolean;
  onThemeChange: () => void;
  onSignOut: () => Promise<void>;
  onGoHome: () => void;
  onMobileMenuToggle: () => void;
};

export function DashboardHeader({
  tenantLabel,
  dark,
  mobileMenuOpen,
  onThemeChange,
  onSignOut,
  onGoHome,
  onMobileMenuToggle,
}: DashboardHeaderProps) {
  return (
    <header className="border-b border-border bg-background">
      <div className="mx-auto flex h-[72px] items-center justify-between gap-3 px-4 sm:px-6 lg:px-8">
        <div className="flex min-w-0 items-center gap-3">
          <Button
            variant="ghost"
            className="h-10 w-10 shrink-0 px-0 lg:hidden"
            onClick={onMobileMenuToggle}
            aria-expanded={mobileMenuOpen}
            aria-label={mobileMenuOpen ? "Close navigation menu" : "Open navigation menu"}
          >
            {mobileMenuOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
          </Button>
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-primary text-primary-foreground">
            <Network className="h-5 w-5" />
          </div>
          <div className="min-w-0">
            <p className="truncate font-bold leading-5">Nani DNS</p>
            <p className="truncate text-xs text-muted-foreground">Tenant: {tenantLabel}</p>
          </div>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Button variant="outline" onClick={onGoHome}>
            <Home className="h-4 w-4" />
            <span className="hidden sm:inline">Home</span>
          </Button>
          <Button variant="ghost" className="h-10 w-10 px-0" onClick={onThemeChange} aria-label="Toggle theme">
            {dark ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
          </Button>
          <Button variant="outline" onClick={() => void onSignOut()}>
            Sign out
          </Button>
        </div>
      </div>
    </header>
  );
}
