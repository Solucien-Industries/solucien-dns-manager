import {
  Activity,
  BarChart3,
  CreditCard,
  Database,
  Globe2,
  Key,
  Mail,
  Settings,
  ShieldCheck,
  Users,
  type LucideIcon,
} from "lucide-react";

export type DashboardSection =
  | "overview"
  | "domains"
  | "records"
  | "metrics"
  | "monitoring"
  | "smtp"
  | "settings";

export type SettingsTab = "api" | "billing" | "users";

export type NavItem = {
  id: DashboardSection;
  label: string;
  icon: LucideIcon;
};

export type SettingsNavItem = {
  id: SettingsTab;
  label: string;
  icon: LucideIcon;
  description: string;
};

export const MAIN_NAV_ITEMS: NavItem[] = [
  { id: "overview", label: "Overview", icon: Activity },
  { id: "domains", label: "Domains", icon: Globe2 },
  { id: "records", label: "DNS Records", icon: Database },
  { id: "metrics", label: "Metrics", icon: BarChart3 },
  { id: "monitoring", label: "Monitoring", icon: ShieldCheck },
  { id: "smtp", label: "SMTP", icon: Mail },
];

export const SETTINGS_NAV_ITEM: NavItem = {
  id: "settings",
  label: "Settings",
  icon: Settings,
};

export const SETTINGS_TABS: SettingsNavItem[] = [
  {
    id: "api",
    label: "API",
    icon: Key,
    description: "Nani API endpoints, keys, and developer docs.",
  },
  {
    id: "billing",
    label: "Billing",
    icon: CreditCard,
    description: "Plans, payment methods, and platform credits.",
  },
  {
    id: "users",
    label: "Users",
    icon: Users,
    description: "Team members, roles, and invitations.",
  },
];

export const SIDEBAR_STORAGE_KEY = "sdm-sidebar-collapsed";
