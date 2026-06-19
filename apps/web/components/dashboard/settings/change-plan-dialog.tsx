"use client";

import { useState } from "react";
import { Bitcoin, CreditCard, Smartphone, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import type { PlanDefinition } from "@/lib/plans";
import { cn } from "@/lib/utils";

const PAYMENT_METHODS = [
  { id: "card", label: "Credit card", icon: CreditCard, detail: "Visa, Mastercard, Amex" },
  { id: "mobile", label: "Mobile money", icon: Smartphone, detail: "M-Pesa, Airtel, Orange" },
  { id: "crypto", label: "Crypto", icon: Bitcoin, detail: "USDC, BTC, ETH" },
] as const;

type ChangePlanDialogProps = {
  open: boolean;
  plan: PlanDefinition;
  discountRate: number;
  onClose: () => void;
  onConfirm: (paymentMethod: string) => void;
};

export function ChangePlanDialog({ open, plan, discountRate, onClose, onConfirm }: ChangePlanDialogProps) {
  const [paymentMethod, setPaymentMethod] = useState<(typeof PAYMENT_METHODS)[number]["id"]>("card");
  const total = Number((plan.price * (1 - discountRate)).toFixed(2));

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-black/50 p-4">
      <div role="dialog" aria-modal="true" className="w-full max-w-lg rounded-md border border-border bg-background shadow-xl">
        <div className="flex items-center justify-between border-b border-border px-5 py-4">
          <div>
            <h2 className="text-lg font-semibold">Change to {plan.name}</h2>
            <p className="text-sm text-muted-foreground">${total}/month after checkout</p>
          </div>
          <Button variant="ghost" className="h-10 w-10 px-0" onClick={onClose} aria-label="Close">
            <X className="h-4 w-4" />
          </Button>
        </div>

        <div className="grid gap-4 p-5">
          <p className="text-sm text-muted-foreground">Choose how you want to pay for this plan change.</p>
          <div className="grid gap-2">
            {PAYMENT_METHODS.map((method) => {
              const Icon = method.icon;
              return (
                <button
                  key={method.id}
                  type="button"
                  onClick={() => setPaymentMethod(method.id)}
                  className={cn(
                    "flex items-center gap-3 rounded-md border p-3 text-left transition",
                    paymentMethod === method.id ? "border-foreground bg-panel" : "border-border hover:bg-panel",
                  )}
                >
                  <Icon className="h-4 w-4 text-muted-foreground" />
                  <div>
                    <p className="font-semibold">{method.label}</p>
                    <p className="text-xs text-muted-foreground">{method.detail}</p>
                  </div>
                </button>
              );
            })}
          </div>

          {paymentMethod === "card" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <Input placeholder="Card number" />
              <Input placeholder="Name on card" />
              <Input placeholder="MM/YY" />
              <Input placeholder="CVC" />
            </div>
          ) : null}

          {paymentMethod === "mobile" ? (
            <div className="grid gap-2 sm:grid-cols-2">
              <Input placeholder="Mobile number" />
              <Input placeholder="Provider" />
            </div>
          ) : null}

          {paymentMethod === "crypto" ? (
            <p className="rounded-md border border-border bg-panel p-3 text-sm text-muted-foreground">
              A wallet address will be generated for {plan.name} checkout.
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <Button type="button" variant="outline" onClick={onClose}>
              Cancel
            </Button>
            <Button type="button" onClick={() => onConfirm(paymentMethod)}>
              Confirm plan change
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}
