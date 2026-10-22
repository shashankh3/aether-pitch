/*
 * AETHER PITCH — a metric label an ordinary fan can read.
 *
 * The technical term is never thrown away: it is the small qualifier under
 * the plain reading, so a judge still sees "xT" and a fan sees "Pass
 * quality". With the plain-language toggle off, the two swap places.
 */
import { plainFor, detailFor } from "@/lib/terminology";

export function MetricLabel({
  label, plain = true, className = "", plainClassName = "",
}: {
  /** The technical label as the studio renders it. */
  label: string;
  /** Show the plain reading first. */
  plain?: boolean;
  className?: string;
  plainClassName?: string;
}) {
  const plainText = plainFor(label);
  if (!plainText) {
    return <span className={className}>{label}</span>;
  }
  if (!plain) {
    return (
      <span className={className} title={detailFor(label) ?? undefined}>
        {label}
      </span>
    );
  }
  return (
    <span className={className} title={detailFor(label) ?? undefined}>
      {plainText}
      <span className={plainClassName || "ml-1 font-tech text-[8px] uppercase tracking-wider text-slate-600"}>
        {label}
      </span>
    </span>
  );
}

/**
 * The plain reading of a label, for places that build their own markup.
 * Falls back to the label itself, so an unexplained label still renders.
 */
export function plainLabel(label: string): string {
  return plainFor(label) ?? label;
}

export default MetricLabel;
