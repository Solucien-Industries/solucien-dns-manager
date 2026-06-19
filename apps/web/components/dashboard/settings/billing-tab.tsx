"use client";

import { useState } from "react";
import { Sparkles, Wallet } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { ChangePlanDialog } from "@/components/dashboard/settings/change-plan-dialog";
import { formatLimit, getPlan, PLANS, type PlanId } from "@/lib/plans";
import { cn } from "@/lib/utils";

export function BillingSettingsTab() {
  const [currentPlanId, setCurrentPlanId] = useState<PlanId>("pro");
  const [platformCredits, setPlatformCredits] = useState(120);
  const [creditAmount, setCreditAmount] = useState("50");
  const [discountCode, setDiscountCode] = useState("");
  const [appliedDiscount, setAppliedDiscount] = useState<string | null>(null);
  const [changePlanId, setChangePlanId] = useState<PlanId | null>(null);
  const [notice, setNotice] = useState<string | null>(null);

  const currentPlan = getPlan(currentPlanId);
  const discountRate = appliedDiscount ? 0.15 : 0;
  const pendingPlan = changePlanId ? getPlan(changePlanId) : null;

  function applyDiscount() {
    if (discountCode.trim().toUpperCase() === "NANI15") {
      setAppliedDiscount("NANI15");
      return;
    }
    setAppliedDiscount(null);
    setNotice("Invalid discount code.");
  }

  function loadCredits() {
    const amount = Number(creditAmount);
    if (!Number.isFinite(amount) || amount <= 0) return;
    setPlatformCredits((current) => current + amount);
    setNotice(`Added $${amount.toFixed(2)} platform credits.`);
  }

  function confirmPlanChange(paymentMethod: string) {
    if (!changePlanId) return;
    setCurrentPlanId(changePlanId);
    setChangePlanId(null);
    setNotice(`Plan changed to ${getPlan(changePlanId).name} via ${paymentMethod}. Billing integration coming soon.`);
  }

  return (
    <div className="grid gap-5">
      <section className="rounded-md border border-border bg-panel p-5">
        <p className="text-sm font-semibold text-muted-foreground">Current plan</p>
        <div className="mt-3 flex flex-col justify-between gap-4 lg:flex-row lg:items-end">
          <div>
            <h3 className="text-3xl font-semibold">{currentPlan.name}</h3>
            <p className="mt-1 text-sm text-muted-foreground">
              ${currentPlan.price}/month · Billed monthly
              {appliedDiscount ? " · 15% discount active" : ""}
            </p>
          </div>
          <div className="rounded-md border border-border bg-background px-4 py-3">
            <p className="text-xs text-muted-foreground">Platform credits</p>
            <p className="text-2xl font-semibold">${platformCredits.toFixed(2)}</p>
          </div>
        </div>

        <div className="mt-5 grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          {[
            ["Domains", formatLimit(currentPlan.domains)],
            ["DNS records", formatLimit(currentPlan.records)],
            ["SMTP / day", formatLimit(currentPlan.smtpDaily)],
            ["Team seats", formatLimit(currentPlan.teamSeats)],
          ].map(([label, value]) => (
            <div key={label} className="rounded-md border border-border bg-background p-4">
              <p className="text-sm text-muted-foreground">{label}</p>
              <p className="mt-2 text-xl font-semibold">{value}</p>
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-md border border-border bg-background p-5">
        <div className="flex items-center gap-2">
          <Wallet className="h-4 w-4 text-muted-foreground" />
          <h3 className="font-semibold">Load platform credits</h3>
        </div>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-end">
          <label className="grid flex-1 gap-2 text-sm font-semibold">
            Amount (USD)
            <Input type="number" min="1" value={creditAmount} onChange={(e) => setCreditAmount(e.target.value)} />
          </label>
          <Button type="button" onClick={loadCredits}>
            Add credits
          </Button>
        </div>
      </section>

      <section>
        <h3 className="font-semibold">Available plans</h3>
        <p className="mt-1 text-sm text-muted-foreground">Payment details appear only when you choose to change plans.</p>
        <div className="mt-4 grid gap-3 lg:grid-cols-3">
          {PLANS.map((plan) => (
            <div
              key={plan.id}
              className={cn(
                "rounded-md border p-5",
                plan.id === currentPlanId ? "border-foreground bg-panel" : "border-border bg-background",
              )}
            >
              <div className="flex items-center justify-between gap-2">
                <p className="font-semibold">{plan.name}</p>
                {plan.id === currentPlanId ? (
                  <span className="rounded border border-foreground px-2 py-0.5 text-[11px] font-bold">Current</span>
                ) : plan.highlight ? (
                  <span className="rounded border border-border px-2 py-0.5 text-[11px] font-bold">Popular</span>
                ) : null}
              </div>
              <p className="mt-3 text-2xl font-semibold">
                ${plan.price}
                <span className="text-sm font-normal text-muted-foreground">/mo</span>
              </p>
              <ul className="mt-4 grid gap-1.5 text-sm text-muted-foreground">
                <li>{formatLimit(plan.domains)} domains</li>
                <li>{formatLimit(plan.records)} records</li>
                <li>{formatLimit(plan.smtpDaily)} SMTP/day</li>
                <li>{formatLimit(plan.teamSeats)} seats</li>
              </ul>
              {plan.id !== currentPlanId ? (
                <Button type="button" className="mt-5 w-full" variant="outline" onClick={() => setChangePlanId(plan.id)}>
                  <Sparkles className="h-4 w-4" />
                  Change to {plan.name}
                </Button>
              ) : null}
            </div>
          ))}
        </div>
      </section>

      <section className="rounded-md border border-border bg-background p-5">
        <h3 className="font-semibold">Discount code</h3>
        <div className="mt-4 flex flex-col gap-3 sm:flex-row">
          <Input value={discountCode} onChange={(e) => setDiscountCode(e.target.value)} placeholder="Try NANI15" className="flex-1" />
          <Button type="button" variant="outline" onClick={applyDiscount}>
            Apply
          </Button>
        </div>
      </section>

      {notice ? <p className="text-sm text-muted-foreground">{notice}</p> : null}

      {pendingPlan ? (
        <ChangePlanDialog
          open={Boolean(changePlanId)}
          plan={pendingPlan}
          discountRate={discountRate}
          onClose={() => setChangePlanId(null)}
          onConfirm={confirmPlanChange}
        />
      ) : null}
    </div>
  );
}
