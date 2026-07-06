"use client";

import { useCallback, useEffect, useState } from "react";
import { AddDomainDialog } from "@/components/dashboard/add-domain-dialog";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { NotificationBanner } from "@/components/dashboard/notification-banner";
import { AdminSection } from "@/components/dashboard/sections/admin-section";
import { DomainsSection } from "@/components/dashboard/sections/domains-section";
import { MetricsSection } from "@/components/dashboard/sections/metrics-section";
import { MonitoringSection } from "@/components/dashboard/sections/monitoring-section";
import { OverviewSection } from "@/components/dashboard/sections/overview-section";
import { RecordsSection } from "@/components/dashboard/sections/records-section";
import { SmtpSection } from "@/components/dashboard/sections/smtp-section";
import { SettingsPanel } from "@/components/dashboard/settings/settings-panel";
import { getDashboardData, type DashboardData } from "@/lib/api";
import {
  SIDEBAR_STORAGE_KEY,
  type DashboardSection,
  type SettingsTab,
} from "@/lib/dashboard-nav";
import { isPlatformAdmin } from "@/lib/workspace-users";

type AuthUser = {
  id: string;
  email: string;
  name: string | null;
  role: string;
  tenantId: string;
};

type DashboardShellProps = {
  accessToken: string;
  user: AuthUser | null;
  dark: boolean;
  onThemeChange: () => void;
  onSignOut: () => Promise<void>;
  onGoHome: () => void;
};

export function DashboardShell({
  accessToken,
  user,
  dark,
  onThemeChange,
  onSignOut,
  onGoHome,
}: DashboardShellProps) {
  const [activeSection, setActiveSection] = useState<DashboardSection>("overview");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("api");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [addDomainOpen, setAddDomainOpen] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);

  const showAdmin = isPlatformAdmin(user?.role);

  const refreshData = useCallback(async () => {
    const dashboardData = await getDashboardData(accessToken);
    setData(dashboardData);
  }, [accessToken]);

  useEffect(() => {
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    if (stored === "true") setSidebarCollapsed(true);
  }, []);

  useEffect(() => {
    localStorage.setItem(SIDEBAR_STORAGE_KEY, String(sidebarCollapsed));
  }, [sidebarCollapsed]);

  useEffect(() => {
    if (!mobileMenuOpen) return;

    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setMobileMenuOpen(false);
    }

    document.addEventListener("keydown", onKeyDown);
    return () => document.removeEventListener("keydown", onKeyDown);
  }, [mobileMenuOpen]);

  useEffect(() => {
    void refreshData();
  }, [refreshData]);

  function handleToggleCollapsed() {
    setSidebarCollapsed((value) => !value);
  }

  if (!data) {
    return (
      <div className="grid min-h-screen place-items-center bg-background">
        <div className="rounded-md border border-border bg-panel p-6 text-sm font-semibold">
          Loading Nani DNS...
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <DashboardHeader
        tenantLabel={user?.name ?? user?.email ?? "Workspace"}
        dark={dark}
        mobileMenuOpen={mobileMenuOpen}
        onThemeChange={onThemeChange}
        onSignOut={onSignOut}
        onGoHome={onGoHome}
        onMobileMenuToggle={() => setMobileMenuOpen((open) => !open)}
      />

      <div className="mx-auto flex gap-5 px-4 py-5 sm:px-6 lg:px-8">
        <AppSidebar
          activeSection={activeSection}
          collapsed={sidebarCollapsed}
          mobileOpen={mobileMenuOpen}
          showAdmin={showAdmin}
          onSectionChange={setActiveSection}
          onToggleCollapsed={handleToggleCollapsed}
          onMobileClose={() => setMobileMenuOpen(false)}
        />

        <section className="min-w-0 flex-1">
          <NotificationBanner accessToken={accessToken} />
          {activeSection === "overview" ? (
            <OverviewSection
              accessToken={accessToken}
              data={data}
              onAddDomain={() => setAddDomainOpen(true)}
              onOpenMetrics={() => setActiveSection("metrics")}
            />
          ) : null}
          {activeSection === "domains" ? (
            <DomainsSection
              accessToken={accessToken}
              data={data}
              onAddDomain={() => setAddDomainOpen(true)}
              onVerified={() => void refreshData()}
            />
          ) : null}
          {activeSection === "records" ? (
            <RecordsSection data={data} onAddDomain={() => setAddDomainOpen(true)} />
          ) : null}
          {activeSection === "metrics" ? <MetricsSection accessToken={accessToken} /> : null}
          {activeSection === "monitoring" ? <MonitoringSection accessToken={accessToken} /> : null}
          {activeSection === "smtp" ? <SmtpSection accessToken={accessToken} /> : null}
          {activeSection === "admin" && showAdmin ? (
            <AdminSection accessToken={accessToken} currentUserId={user?.id ?? null} />
          ) : null}
          {activeSection === "settings" ? (
            <SettingsPanel
              accessToken={accessToken}
              activeTab={settingsTab}
              onTabChange={setSettingsTab}
              user={user}
            />
          ) : null}
        </section>
      </div>

      <AddDomainDialog
        open={addDomainOpen}
        accessToken={accessToken}
        defaultOwner={user?.name ?? user?.email ?? "Workspace"}
        onClose={() => setAddDomainOpen(false)}
        onCreated={() => void refreshData()}
        onVerified={() => void refreshData()}
      />
    </div>
  );
}
