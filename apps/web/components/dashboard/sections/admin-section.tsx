"use client";

import { cn } from "@/lib/utils";

export function AdminSection() {
    const mockTenants = [
        { id: "t1", name: "Alpha Ventures Africa", slug: "alpha", zones: 12, status: "Active" },
        { id: "t2", name: "Jumuiya Capital", slug: "jumuiya", zones: 4, status: "Active" },
        { id: "t3", name: "Nairobi Tech Hub", slug: "nth", zones: 18, status: "Review Required" },
    ];

    return (
        <div className="grid gap-5">
            <div className="rounded-md border border-border bg-panel p-5 border-l-4 border-l-primary">
                <h1 className="text-2xl font-semibold text-foreground">
                    Platform Admin Operations Console
                </h1>
                <p className="text-sm text-muted-foreground mt-1">
                    System-wide multi-tenant data logs, cluster metrics, and registry approvals.
                </p>
            </div>

            <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-md border border-border bg-background p-4">
                    <p className="text-xs font-bold text-muted-foreground uppercase">Global Tenants Connected</p>
                    <p className="text-3xl font-bold mt-2">142</p>
                    <p className="text-xs text-emerald-500 mt-1">● Database Engine Sync Stable</p>
                </div>
                <div className="rounded-md border border-border bg-background p-4">
                    <p className="text-xs font-bold text-muted-foreground uppercase">PowerDNS Zone Count</p>
                    <p className="text-3xl font-bold mt-2">580</p>
                    <p className="text-xs text-muted-foreground mt-1">Active Clusters across ccTLDs</p>
                </div>
                <div className="rounded-md border border-border bg-background p-4">
                    <p className="text-xs font-bold text-muted-foreground uppercase">Redis Cache Pipeline Memory</p>
                    <p className="text-3xl font-bold mt-2">12.4 MB</p>
                    <p className="text-xs text-emerald-500 mt-1">Eviction State: Clean</p>
                </div>
            </div>

            <div className="rounded-md border border-border bg-panel p-4">
                <h2 className="text-lg font-semibold mb-4">Connected Tenant Ecosystem</h2>
                <div className="overflow-hidden rounded-md border border-border bg-background">
                    <div className="grid grid-cols-[1.5fr_1fr_1fr_1fr] bg-muted px-4 py-2 text-xs font-bold uppercase text-muted-foreground">
                        <span>Organization Name</span>
                        <span>Route Slug</span>
                        <span>Managed Zones</span>
                        <span>System Status</span>
                    </div>
                    {mockTenants.map((tenant) => (
                        <div key={tenant.id} className="grid grid-cols-[1.5fr_1fr_1fr_1fr] gap-2 border-t border-border px-4 py-3 text-sm items-center">
                            <span className="font-semibold">{tenant.name}</span>
                            <span className="text-muted-foreground">/{tenant.slug}</span>
                            <span>{tenant.zones} zones</span>
                            <span className={cn(
                                "text-xs font-bold border px-2 py-0.5 rounded w-max",
                                tenant.status === "Active" ? "bg-emerald-500/10 text-emerald-500 border-emerald-500/20" : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                            )}>
                                {tenant.status}
                            </span>
                        </div>
                    ))}
                </div>
            </div>
        </div>
    );
}