export type PlanId = "starter" | "pro" | "enterprise";

export type PlanDefinition = {
  id: PlanId;
  name: string;
  price: number;
  domains: number | "Unlimited";
  records: number | "Unlimited";
  smtpDaily: number | "Unlimited";
  apiDaily: number | "Unlimited";
  teamSeats: number | "Unlimited";
  highlight?: boolean;
};

export const PLANS: PlanDefinition[] = [
  {
    id: "starter",
    name: "Starter",
    price: 9,
    domains: 3,
    records: 500,
    smtpDaily: 200,
    apiDaily: 5000,
    teamSeats: 2,
  },
  {
    id: "pro",
    name: "Pro",
    price: 29,
    domains: 25,
    records: 5000,
    smtpDaily: 2000,
    apiDaily: 50000,
    teamSeats: 10,
    highlight: true,
  },
  {
    id: "enterprise",
    name: "Enterprise",
    price: 99,
    domains: "Unlimited",
    records: "Unlimited",
    smtpDaily: "Unlimited",
    apiDaily: "Unlimited",
    teamSeats: "Unlimited",
  },
];

export function getPlan(id: PlanId): PlanDefinition {
  return PLANS.find((plan) => plan.id === id) ?? PLANS[1];
}

export function formatLimit(value: number | "Unlimited"): string {
  return value === "Unlimited" ? "Unlimited" : value.toLocaleString();
}
