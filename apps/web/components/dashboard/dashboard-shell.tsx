"use client";

import { useCallback, useEffect, useState } from "react";
import { AddDomainDialog } from "@/components/dashboard/add-domain-dialog";
import { AppSidebar } from "@/components/dashboard/app-sidebar";
import { DashboardHeader } from "@/components/dashboard/dashboard-header";
import { NotificationBanner } from "@/components/dashboard/notification-banner";
import { AdminSection, type AdminTab } from "@/components/dashboard/sections/admin-section";
import { DomainsSection } from "@/components/dashboard/sections/domains-section";
import { MetricsSection } from "@/components/dashboard/sections/metrics-section";
import { MonitoringSection } from "@/components/dashboard/sections/monitoring-section";
import { OverviewSection } from "@/components/dashboard/sections/overview-section";
import { RecordsSection } from "@/components/dashboard/sections/records-section";
import { SettingsPanel } from "@/components/dashboard/settings/settings-panel";
import { getDashboardData, type DashboardData } from "@/lib/api";
import {
  SIDEBAR_STORAGE_KEY,
  type DashboardSection,
  type SettingsTab,
} from "@/lib/dashboard-nav";

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
  /** Whether to show the platform admin console nav/section (see page.tsx's admin/tenant chooser). */
  showAdminNav: boolean;
};

export function DashboardShell({
  accessToken,
  user,
  dark,
  onThemeChange,
  onSignOut,
  onGoHome,
  showAdminNav,
}: DashboardShellProps) {
  const [activeSection, setActiveSection] = useState<DashboardSection>("overview");
  const [adminTab, setAdminTab] = useState<AdminTab>("users");
  const [settingsTab, setSettingsTab] = useState<SettingsTab>("api");
  const [sidebarCollapsed, setSidebarCollapsed] = useState(false);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [addDomainOpen, setAddDomainOpen] = useState(false);
  const [data, setData] = useState<DashboardData | null>(null);

  const showAdmin = showAdminNav;

  const refreshData = useCallback(async () => {
    const dashboardData = await getDashboardData(accessToken);
    setData(dashboardData);
  }, [accessToken]);

  useEffect(() => {
    // Read after mount (not a lazy useState initializer) so the server-rendered
    // and first-client-render markup match; localStorage isn't available on the server.
    const stored = localStorage.getItem(SIDEBAR_STORAGE_KEY);
    // eslint-disable-next-line react-hooks/set-state-in-effect
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
    let cancelled = false;
    getDashboardData(accessToken).then((dashboardData) => {
      if (!cancelled) setData(dashboardData);
    });
    return () => {
      cancelled = true;
    };
  }, [accessToken]);

  function handleToggleCollapsed() {
    setSidebarCollapsed((value) => !value);
  }

  function openApprovedLocationsFromNotification() {
    if (!showAdmin) return;
    setActiveSection("admin");
    setAdminTab("locations");
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
          <NotificationBanner
            accessToken={accessToken}
            onNavigateToApprovedLocations={showAdmin ? openApprovedLocationsFromNotification : undefined}
          />
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
          {activeSection === "admin" && showAdmin ? (
            <AdminSection
              accessToken={accessToken}
              currentUserId={user?.id ?? null}
              activeTab={adminTab}
              onTabChange={setAdminTab}
            />
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
