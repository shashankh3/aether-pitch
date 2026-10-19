"use client";
// AETHER PITCH — studio WebSocket hook.
// Keeps a mutable ref of the latest tick for 60fps canvas rendering while
// throttled React state powers the HUD components.

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  Insight, MatchEvent, MatchTick, Metrics, Pipeline, Recap,
} from "@/lib/types";
import { telemetry } from "@/lib/telemetry";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws";
const API_URL = process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000";

export interface StudioState {
  connected: boolean;
  tick: MatchTick | null;
  tickRef: React.MutableRefObject<MatchTick | null>;
  metrics: Metrics | null;
  events: MatchEvent[];
  insights: Insight[];
  pipeline: Pipeline | null;
  recap: Recap | null;
  sendScenario: (name: string) => Promise<void>;
  clearRecap: () => void;
}

export function useStudio(): StudioState {
  const [connected, setConnected] = useState(false);
  const [tick, setTick] = useState<MatchTick | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [recap, setRecap] = useState<Recap | null>(null);
  const tickRef = useRef<MatchTick | null>(null);
  const wsRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    let disposed = false;
    let retry: ReturnType<typeof setTimeout>;

    const connect = () => {
      if (disposed) return;
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => setConnected(true);

      ws.onmessage = (raw) => {
        let msg: { type: string; data: any };
        try {
          msg = JSON.parse(raw.data);
        } catch {
          return;
        }
        switch (msg.type) {
          case "hello": {
            const d = msg.data || {};
            if (d.state?.players) {
              tickRef.current = d.state;
              setTick(d.state);
            }
            if (d.metrics) setMetrics(d.metrics);
            if (d.pipeline) setPipeline(d.pipeline);
            if (d.insights) setInsights(d.insights);
            break;
          }
          case "tick":
            telemetry.applyTick(msg.data);
            tickRef.current = msg.data;
            setTick(msg.data);
            break;
          case "metrics":
            telemetry.applyMetrics(msg.data);
            setMetrics(msg.data);
            break;
          case "event":
            if (msg.data?.type === "PASS" && msg.data.player_id && msg.data.pdr != null) {
              telemetry.setPdr(msg.data.player_id, msg.data.pdr);
            }
            setEvents((prev) => [msg.data, ...prev].slice(0, 14));
            break;
          case "insight":
            telemetry.applyInsight(msg.data);
            setInsights((prev) => [msg.data, ...prev].slice(0, 12));
            break;
          case "pipeline":
            setPipeline(msg.data);
            break;
          case "recap":
            setRecap(msg.data);
            break;
        }
      };

      ws.onclose = () => {
        setConnected(false);
        if (!disposed) retry = setTimeout(connect, 2000);
      };
      ws.onerror = () => ws.close();
    };

    connect();
    const ping = setInterval(() => {
      if (wsRef.current?.readyState === WebSocket.OPEN) {
        wsRef.current.send("ping");
      }
    }, 10000);

    return () => {
      disposed = true;
      clearTimeout(retry);
      clearInterval(ping);
      wsRef.current?.close();
    };
  }, []);

  const sendScenario = useCallback(async (name: string) => {
    try {
      await fetch(`${API_URL}/api/scenario/${name}`, { method: "POST" });
    } catch {
      // backend unreachable — the HUD keeps rendering the last stream state
    }
  }, []);

  const clearRecap = useCallback(() => setRecap(null), []);

  return {
    connected, tick, tickRef, metrics, events, insights, pipeline, recap,
    sendScenario, clearRecap,
  };
}
