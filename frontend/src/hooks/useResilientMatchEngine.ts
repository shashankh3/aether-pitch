"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import type {
  EngineStatus, Insight, MatchEvent, MatchTick, Metrics, Pipeline, Recap,
} from "@/lib/types";
import { telemetry } from "@/lib/telemetry";
import { EdgeEngine } from "@/lib/edgeEngine";
import { API_BASE } from "@/lib/api";

const WS_URL = process.env.NEXT_PUBLIC_WS_URL || "ws://localhost:8000/ws";

export interface ResilientStudioState {
  connected: boolean;
  status: EngineStatus;
  tick: MatchTick | null;
  tickRef: { current: MatchTick | null };
  metrics: Metrics | null;
  events: MatchEvent[];
  insights: Insight[];
  pipeline: Pipeline | null;
  recap: Recap | null;
  sendScenario: (name: string) => Promise<void>;
  clearRecap: () => void;
  applySnapshot: (snapshot: MatchTick) => void;
}

function pushEvent(prev: MatchEvent[], event: MatchEvent): MatchEvent[] {
  if (prev.some((e) => e.id === event.id)) return prev;
  return [event, ...prev].slice(0, 18);
}

export function useResilientMatchEngine(): ResilientStudioState {
  const [connected, setConnected] = useState(false);
  const [status, setStatus] = useState<EngineStatus>("EDGE_SYNTHETIC_FALLBACK");
  const [tick, setTick] = useState<MatchTick | null>(null);
  const [metrics, setMetrics] = useState<Metrics | null>(null);
  const [events, setEvents] = useState<MatchEvent[]>([]);
  const [insights, setInsights] = useState<Insight[]>([]);
  const [pipeline, setPipeline] = useState<Pipeline | null>(null);
  const [recap, setRecap] = useState<Recap | null>(null);
  const tickRef = useRef<MatchTick | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const edgeRef = useRef<EdgeEngine | null>(null);
  const edgeTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const lastEdgeInsight = useRef(0);
  const frameCount = useRef(0);

  useEffect(() => {
    let disposed = false;
    let retry: ReturnType<typeof setTimeout>;
    const engine = new EdgeEngine(19);
    edgeRef.current = engine;

    const stopEdge = () => {
      if (edgeTimerRef.current) {
        clearInterval(edgeTimerRef.current);
        edgeTimerRef.current = null;
      }
    };

    const startEdge = () => {
      if (disposed || edgeTimerRef.current) return;
      setStatus("EDGE_SYNTHETIC_FALLBACK");
      edgeTimerRef.current = setInterval(() => {
        const frame = engine.step(0.1);
        telemetry.recordLive(frame.tick);
        tickRef.current = frame.tick;
        if (!telemetry.playbackPaused) setTick(frame.tick);
        frameCount.current += 1;
        if (frameCount.current % 5 === 0) {
          telemetry.applyMetrics(frame.metrics);
          setMetrics(frame.metrics);
          setPipeline(engine.buildPipeline());
        }
        if (frame.events.length) {
          for (const event of frame.events) {
            if (event.type === "PASS" && event.player_id && event.pdr != null) {
              telemetry.setPdr(event.player_id, event.pdr);
            }
            if (event.type === "PASS" && event.target_id) {
              telemetry.setPassReceiver(event.target_id);
            }
            if (event.type === "PASS" && event.player_id && event.team && event.start && event.end) {
              telemetry.recordPassLink(
                event.player_id,
                event.target_id || "",
                event.team,
                event.start,
                event.end,
                event.delta_xt ?? 0
              );
            }
            setEvents((prev) => pushEvent(prev, event));
          }
          const candidate = frame.events.find((event) => event.ai_gate?.should_explain);
          if (candidate && performance.now() - lastEdgeInsight.current > 8500) {
            lastEdgeInsight.current = performance.now();
            const insight = engine.buildInsight(candidate, frame.tick, frame.metrics);
            telemetry.applyInsight(insight);
            setInsights((prev) => [insight, ...prev].slice(0, 12));
          }
        }
      }, 100);
    };

    const connect = () => {
      if (disposed) return;
      const ws = new WebSocket(WS_URL);
      wsRef.current = ws;

      ws.onopen = () => {
        if (disposed) return;
        setConnected(true);
        setStatus("CONNECTED_PIPELINE_LIVE");
        stopEdge();
      };

      ws.onmessage = (raw) => {
        let msg: { type: string; data: Record<string, unknown> };
        try {
          msg = JSON.parse(raw.data);
        } catch {
          return;
        }
        switch (msg.type) {
          case "hello": {
            const d = msg.data as {
              state?: MatchTick;
              metrics?: Metrics;
              pipeline?: Pipeline;
              insights?: Insight[];
            };
            if (d.state?.players) {
              tickRef.current = d.state;
              telemetry.recordLive(d.state);
              setTick(d.state);
            }
            if (d.metrics) {
              telemetry.applyMetrics(d.metrics);
              setMetrics(d.metrics);
            }
            if (d.pipeline) setPipeline(d.pipeline);
            if (d.insights) setInsights(d.insights);
            break;
          }
          case "tick": {
            const next = msg.data as unknown as MatchTick;
            telemetry.recordLive(next);
            tickRef.current = next;
            if (!telemetry.playbackPaused) setTick(next);
            break;
          }
          case "metrics": {
            const next = msg.data as unknown as Metrics;
            telemetry.applyMetrics(next);
            setMetrics(next);
            break;
          }
          case "event": {
            const event = msg.data as unknown as MatchEvent;
            if (event.type === "PASS" && event.player_id && event.pdr != null) {
              telemetry.setPdr(event.player_id, event.pdr);
            }
            if (event.type === "PASS" && event.target_id) {
              telemetry.setPassReceiver(event.target_id);
            }
            if (event.type === "PASS" && event.player_id && event.team && event.start && event.end) {
              telemetry.recordPassLink(
                event.player_id,
                event.target_id || "",
                event.team,
                event.start,
                event.end,
                event.delta_xt ?? 0
              );
            }
            setEvents((prev) => pushEvent(prev, event));
            break;
          }
          case "insight": {
            const next = msg.data as unknown as Insight;
            telemetry.applyInsight(next);
            setInsights((prev) => [next, ...prev].slice(0, 12));
            break;
          }
          case "pipeline":
            setPipeline(msg.data as unknown as Pipeline);
            break;
          case "recap":
            setRecap(msg.data as unknown as Recap);
            break;
        }
      };

      ws.onclose = () => {
        if (disposed) return;
        setConnected(false);
        setStatus("EDGE_SYNTHETIC_FALLBACK");
        startEdge();
        retry = setTimeout(connect, 2500);
      };
      ws.onerror = () => ws.close();
    };

    startEdge();
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
      stopEdge();
      wsRef.current?.close();
    };
  }, []);

  const sendScenario = useCallback(async (name: string) => {
    try {
      const response = await fetch(`${API_BASE}/api/scenario/${name}`, { method: "POST" });
      if (!response.ok) throw new Error(`scenario HTTP ${response.status}`);
    } catch {
      if (name === "halftime_recap") return;
      edgeRef.current?.inject(name);
    }
  }, []);

  const clearRecap = useCallback(() => setRecap(null), []);

  const applySnapshot = useCallback((snapshot: MatchTick) => {
    telemetry.playbackPaused = true;
    telemetry.applyTick(snapshot, false);
    tickRef.current = snapshot;
    setTick(snapshot);
  }, []);

  return {
    connected, status, tick, tickRef, metrics, events, insights, pipeline, recap,
    sendScenario, clearRecap, applySnapshot,
  };
}
