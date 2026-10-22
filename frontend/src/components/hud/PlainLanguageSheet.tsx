/*
 * AETHER PITCH — "What am I looking at?"
 *
 * Every number on the overlay, in the words a fan would use. One tap from
 * anywhere, so an ordinary fan never has to guess what xT or PPDA means, and
 * a judge can read the same explanation when they are asked to defend it.
 */
import { useEffect, useRef, useState } from "react";
import { BookOpen, X } from "lucide-react";
import { glossary } from "@/lib/terminology";
import { useModalA11y } from "@/lib/useModalA11y";

const GROUPS = ["Attacking", "Defending", "Fitness", "The match", "The studio"] as const;

export default function PlainLanguageSheet({
  open, onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const panelRef = useRef<HTMLDivElement>(null);
  const [query, setQuery] = useState("");
  useModalA11y(open, onClose, panelRef);
  useEffect(() => {
    if (!open) setQuery("");
  }, [open]);
  if (!open) return null;

  const needle = query.trim().toLowerCase();
  const entries = glossary().filter(
    (e) => !needle
      || e.term.toLowerCase().includes(needle)
      || e.plain.toLowerCase().includes(needle)
      || e.detail.toLowerCase().includes(needle),
  );

  return (
    <div
      className="fixed inset-0 z-[70] flex items-center justify-center bg-black/70 p-4 backdrop-blur-sm"
      onClick={onClose}
    >
      <div
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-label="What am I looking at? Every metric in plain English"
        className="clip-ea panel-lux max-h-[82vh] w-full max-w-2xl overflow-y-auto p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-start justify-between gap-3">
          <div>
            <h2 className="flex items-center gap-2 font-display text-[15px] font-bold uppercase tracking-[0.18em] text-tactical">
              <BookOpen size={15} /> What am I looking at?
            </h2>
            <p className="mt-1 font-tech text-[10px] leading-relaxed text-slate-400">
              Every number the studio shows, explained the way a fan would put it.
              Switch the top bar between <b className="text-pitch">Plain</b> and{" "}
              <b className="text-slate-300">Analyst</b> at any time — nothing is hidden.
            </p>
          </div>
          <button
            onClick={onClose}
            aria-label="Close the plain-English glossary"
            className="shrink-0 text-slate-400 transition hover:text-white"
          >
            <X size={16} />
          </button>
        </div>

        <label className="mb-3 block">
          <span className="sr-only">Search the glossary</span>
          <input
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            placeholder="Search — try xT, pressing, tired, space…"
            className="w-full border border-white/10 bg-slate-950/70 px-2.5 py-1.5 font-tech text-[11px] text-slate-200 outline-none placeholder:text-slate-600 focus:border-tactical/50"
          />
        </label>

        {entries.length === 0 ? (
          <p className="font-tech text-[11px] text-slate-500">Nothing matches that.</p>
        ) : (
          GROUPS.map((group) => {
            const rows = entries.filter((e) => e.group === group);
            if (rows.length === 0) return null;
            return (
              <div key={group} className="mb-3">
                <div className="mb-1.5 border-b border-white/10 pb-1 font-display text-[10px] font-bold uppercase tracking-[0.2em] text-slate-500">
                  {group}
                </div>
                <div className="space-y-1.5">
                  {rows.map((e) => (
                    <div
                      key={e.term}
                      className="clip-chamfer border border-white/10 bg-white/[0.03] px-2.5 py-1.5"
                    >
                      <div className="flex flex-wrap items-baseline gap-2">
                        <span className="font-display text-[11px] font-bold uppercase tracking-[0.14em] text-tactical">
                          {e.term}
                        </span>
                        <span className="font-tech text-[11px] font-bold text-slate-100">
                          {e.plain}
                        </span>
                      </div>
                      <p className="mt-0.5 font-tech text-[10px] leading-relaxed text-slate-400">
                        {e.detail}
                      </p>
                    </div>
                  ))}
                </div>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}
