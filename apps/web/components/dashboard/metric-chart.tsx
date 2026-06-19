"use client";

import { cn } from "@/lib/utils";

type ChartPoint = {
  label: string;
  value: number;
  unit?: string;
};

export function MetricBarChart({
  title,
  bars,
  unit = "",
  className,
}: {
  title: string;
  bars: ChartPoint[];
  unit?: string;
  className?: string;
}) {
  const max = Math.max(...bars.map((bar) => bar.value), 1);

  return (
    <section className={cn("rounded-md border border-border bg-background p-5", className)}>
      <h3 className="text-sm font-semibold">{title}</h3>
      <div className="mt-5 grid items-end gap-2 sm:grid-cols-7">
        {bars.map((bar) => (
          <div key={bar.label} className="grid gap-2">
            <div className="flex h-28 items-end rounded-md bg-panel px-1.5 pb-2 pt-2">
              <div
                className="w-full rounded-sm bg-foreground/90 transition-all"
                style={{ height: `${Math.max(8, (bar.value / max) * 100)}%` }}
                title={`${bar.value}${bar.unit ?? unit}`}
              />
            </div>
            <p className="text-center text-[11px] font-semibold text-muted-foreground">{bar.label}</p>
          </div>
        ))}
      </div>
    </section>
  );
}

export function MetricLineChart({
  title,
  points,
  unit = "",
  className,
}: {
  title: string;
  points: ChartPoint[];
  unit?: string;
  className?: string;
}) {
  const max = Math.max(...points.map((point) => point.value), 1);
  const min = Math.min(...points.map((point) => point.value));
  const range = Math.max(max - min, 1);
  const width = 640;
  const height = 160;
  const padding = 12;

  const coordinates = points.map((point, index) => {
    const x = padding + (index / Math.max(points.length - 1, 1)) * (width - padding * 2);
    const y = height - padding - ((point.value - min) / range) * (height - padding * 2);
    return { ...point, x, y };
  });

  const path = coordinates
    .map((point, index) => `${index === 0 ? "M" : "L"} ${point.x} ${point.y}`)
    .join(" ");
  const area = `${path} L ${coordinates[coordinates.length - 1]?.x ?? 0} ${height - padding} L ${coordinates[0]?.x ?? 0} ${height - padding} Z`;

  return (
    <section className={cn("rounded-md border border-border bg-background p-5", className)}>
      <div className="flex items-center justify-between gap-3">
        <h3 className="text-sm font-semibold">{title}</h3>
        <p className="text-xs text-muted-foreground">
          Latest: {points[points.length - 1]?.value}
          {points[points.length - 1]?.unit ?? unit}
        </p>
      </div>
      <div className="mt-4 overflow-x-auto">
        <svg viewBox={`0 0 ${width} ${height}`} className="h-40 w-full min-w-[320px]">
          <path d={area} className="fill-foreground/10" />
          <path d={path} fill="none" className="stroke-foreground" strokeWidth="2.5" strokeLinecap="round" />
          {coordinates.map((point) => (
            <circle key={point.label} cx={point.x} cy={point.y} r="4" className="fill-foreground" />
          ))}
        </svg>
      </div>
      <div className="mt-2 grid grid-cols-7 gap-1 text-center text-[11px] text-muted-foreground">
        {points.map((point) => (
          <span key={point.label}>{point.label}</span>
        ))}
      </div>
    </section>
  );
}

export function MetricStatGrid({
  items,
}: {
  items: Array<{ label: string; value: string | number; hint?: string }>;
}) {
  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
      {items.map((item) => (
        <div key={item.label} className="rounded-md border border-border bg-background p-4">
          <p className="text-sm text-muted-foreground">{item.label}</p>
          <p className="mt-2 text-3xl font-semibold">{item.value}</p>
          {item.hint ? <p className="mt-1 text-xs text-muted-foreground">{item.hint}</p> : null}
        </div>
      ))}
    </div>
  );
}
