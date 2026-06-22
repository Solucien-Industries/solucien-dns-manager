"use client";

import { PanelLeftClose, PanelLeftOpen, type LucideIcon } from "lucide-react";
import {
  MAIN_NAV_ITEMS,
  SETTINGS_NAV_ITEM,
  type DashboardSection,
} from "@/lib/dashboard-nav";
import { cn } from "@/lib/utils";
import { Button } from "@/components/ui/button";

type AppSidebarProps = {
  activeSection: DashboardSection;
  collapsed: boolean;
  mobileOpen: boolean;
  onSectionChange: (section: DashboardSection) => void;
  onToggleCollapsed: () => void;
  onMobileClose: () => void;
};

function NavButton({
  label,
  icon: Icon,
  active,
  collapsed,
  onClick,
}: {
  label: string;
  icon: LucideIcon;
  active: boolean;
  collapsed: boolean;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      title={collapsed ? label : undefined}
      aria-label={label}
      aria-current={active ? "page" : undefined}
      onClick={onClick}
      className={cn(
        "mb-1 flex h-10 w-full items-center rounded-md text-left text-sm font-semibold text-muted-foreground transition hover:bg-background hover:text-foreground",
        collapsed ? "justify-center px-0" : "gap-3 px-3",
        active && "bg-background text-foreground",
      )}
    >
      <Icon className="h-4 w-4 shrink-0" />
      {!collapsed ? <span className="truncate">{label}</span> : null}
    </button>
  );
}

function SidebarContent({
  activeSection,
  collapsed,
  onSectionChange,
  onToggleCollapsed,
  showCollapseToggle,
}: {
  activeSection: DashboardSection;
  collapsed: boolean;
  onSectionChange: (section: DashboardSection) => void;
  onToggleCollapsed: () => void;
  showCollapseToggle: boolean;
}) {
  return (
    <div className="flex h-full flex-col p-2">
      {showCollapseToggle ? (
        <div className={cn("mb-2 flex", collapsed ? "justify-center" : "justify-end")}>
          <Button
            variant="ghost"
            className={cn("h-9", collapsed ? "w-9 px-0" : "w-full justify-start px-3")}
            onClick={onToggleCollapsed}
            aria-expanded={!collapsed}
            aria-label={collapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {collapsed ? <PanelLeftOpen className="h-4 w-4" /> : <PanelLeftClose className="h-4 w-4" />}
            {!collapsed ? <span className="text-sm">Collapse</span> : null}
          </Button>
        </div>
      ) : null}

      <nav className="flex-1" aria-label="Dashboard">
        {MAIN_NAV_ITEMS.map((item) => (
          <NavButton
            key={item.id}
            label={item.label}
            icon={item.icon}
            active={activeSection === item.id}
            collapsed={collapsed}
            onClick={() => onSectionChange(item.id)}
          />
        ))}
      </nav>

      <div className="mt-auto border-t border-border pt-2">
        <NavButton
          label={SETTINGS_NAV_ITEM.label}
          icon={SETTINGS_NAV_ITEM.icon}
          active={activeSection === "settings"}
          collapsed={collapsed}
          onClick={() => onSectionChange("settings")}
        />
      </div>
    </div>
  );
}

export function AppSidebar({
  activeSection,
  collapsed,
  mobileOpen,
  onSectionChange,
  onToggleCollapsed,
  onMobileClose,
}: AppSidebarProps) {
  function handleSectionChange(section: DashboardSection) {
    onSectionChange(section);
    onMobileClose();
  }

  return (
    <>
      {/* Mobile backdrop */}
      <button
        type="button"
        aria-label="Close navigation menu"
        className={cn(
          "fixed inset-0 z-40 bg-black/40 transition-opacity lg:hidden",
          mobileOpen ? "opacity-100" : "pointer-events-none opacity-0",
        )}
        onClick={onMobileClose}
      />

      {/* Mobile drawer */}
      <aside
        className={cn(
          "fixed inset-y-0 left-0 z-50 w-[min(280px,85vw)] border-r border-border bg-panel shadow-lg transition-transform duration-200 lg:hidden",
          mobileOpen ? "translate-x-0" : "-translate-x-full",
        )}
        aria-hidden={!mobileOpen}
      >
        <SidebarContent
          activeSection={activeSection}
          collapsed={false}
          onSectionChange={handleSectionChange}
          onToggleCollapsed={onToggleCollapsed}
          showCollapseToggle={false}
        />
      </aside>

      {/* Desktop sidebar */}
      <aside
        className={cn(
          "hidden shrink-0 rounded-md border border-border bg-panel transition-[width] duration-200 lg:block lg:min-h-[calc(100vh-112px)]",
          collapsed ? "w-16" : "w-[208px]",
        )}
      >
        <SidebarContent
          activeSection={activeSection}
          collapsed={collapsed}
          onSectionChange={onSectionChange}
          onToggleCollapsed={onToggleCollapsed}
          showCollapseToggle
        />
      </aside>
    </>
  );
}
