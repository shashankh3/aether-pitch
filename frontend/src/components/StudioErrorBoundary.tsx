"use client";
// AETHER PITCH — studio error boundary.
// A live demo must never white-screen. Any render error in the 3D scene or a
// HUD panel is caught here and shown as a recoverable broadcast-style notice
// instead of a blank page.

import { Component, type ErrorInfo, type ReactNode } from "react";
import { AlertTriangle, RefreshCw, RotateCcw } from "lucide-react";

interface Props {
  children: ReactNode;
  /** Optional label so a judge can tell which surface failed. */
  label?: string;
  /** Called when the user asks to reset the surface. */
  onReset?: () => void;
}

interface State {
  error: Error | null;
  info: string | null;
}

export default class StudioErrorBoundary extends Component<Props, State> {
  state: State = { error: null, info: null };

  static getDerivedStateFromError(error: Error): State {
    return { error, info: null };
  }

  componentDidCatch(error: Error, info: ErrorInfo): void {
    const where = info.componentStack
      ? info.componentStack.split("\n").slice(1, 4).join(" | ").trim()
      : "unknown surface";
    this.setState({ error, info: where });
    if (typeof console !== "undefined") {
      console.error("[AETHER] surface error", error, where);
    }
  }

  private handleReset = () => {
    this.setState({ error: null, info: null });
    this.props.onReset?.();
  };

  private handleReload = () => {
    if (typeof window !== "undefined") window.location.reload();
  };

  render(): ReactNode {
    const { error, info } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="pointer-events-auto flex min-h-[220px] flex-col items-center justify-center gap-2 border border-crimson/40 bg-slate-950/92 p-4 text-center">
        <span className="flex items-center gap-1.5 font-display text-[13px] font-bold uppercase tracking-[0.2em] text-crimson">
          <AlertTriangle size={15} /> Broadcast surface recovered
        </span>
        <p className="max-w-[420px] text-[11px] leading-relaxed text-slate-300">
          {this.props.label ? `The ${this.props.label} surface hit an error.` : "A surface hit an error."}{" "}
          The live match engine kept running — reset the surface to continue.
        </p>
        <p className="max-w-[520px] break-words font-mono text-[9px] leading-relaxed text-slate-500">
          {error.message}
          {info ? ` · ${info}` : ""}
        </p>
        <div className="mt-1 flex flex-wrap items-center justify-center gap-1.5">
          <button
            onClick={this.handleReset}
            className="clip-skew flex items-center gap-1 bg-tactical/20 px-2.5 py-1 font-tech text-[10px] font-bold uppercase tracking-wider text-tactical transition hover:bg-tactical/35"
          >
            <RotateCcw size={12} /> Reset surface
          </button>
          <button
            onClick={this.handleReload}
            className="clip-skew flex items-center gap-1 bg-white/[0.06] px-2.5 py-1 font-tech text-[10px] font-bold uppercase tracking-wider text-slate-300 transition hover:text-white"
          >
            <RefreshCw size={12} /> Reload studio
          </button>
        </div>
      </div>
    );
  }
}
