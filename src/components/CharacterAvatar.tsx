"use client";

export function CharacterAvatar({
  initials,
  hue,
  size = "md",
}: {
  initials: string | null;
  hue: number | null;
  size?: "sm" | "md" | "lg";
}) {
  const dim = size === "sm" ? "h-7 w-7 text-[10px]" : size === "lg" ? "h-12 w-12 text-sm" : "h-9 w-9 text-xs";
  const h = hue ?? 30;
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center font-medium tracking-wide text-[var(--night)] ${dim}`}
      style={{
        background: `linear-gradient(145deg, hsl(${h} 55% 48%), hsl(${(h + 40) % 360} 40% 28%))`,
      }}
      aria-hidden
    >
      {initials ?? "?"}
    </span>
  );
}
