import type { CameraDirective, CameraMode, MatchTick, Team, Vec2 } from "./simulation";
import type { ClubBias, LangCode, MetricLock, PersonaModeV5, PersonalizationState } from "./personalization";
import type { HighlightZone } from "./overlay";

export interface RecapPass {
  start: Vec2;
  end: Vec2;
}

export interface RecapGhostPass extends RecapPass {
  delta_xt: number;
  target_id: string | null;
  openness_m: number;
  actual_delta_xt?: number | null;
  ghost_delta_xt?: number | null;
  net_xt_gain?: number | null;
  completion_probability?: number | null;
  receiver_target_xy?: Vec2 | null;
}

export interface MilestoneEvent {
  id: string;
  type: string;
  clock: string;
  t_match?: number;
  headline: string;
  detail: string;
  team?: Team | null;
  player_id?: string | null;
  player_name?: string | null;
  speed_kmh?: number;
  value?: number;
}

export interface RecapAct {
  act: number;
  title: string;
  subtitle: string;
  clock: string;
  score: { NLA: number; MCS: number };
  team: Team;
  event_type: string;
  player_id: string | null;
  player_name: string;
  pdr: number;
  delta_xt: number;
  chaos: number;
  catalyst?: string;
  actual_pass: RecapPass;
  ghost_pass: RecapGhostPass;
  key_player_ids: string[];
  highlight_zone: HighlightZone;
  camera_mode: CameraMode;
  snapshot: MatchTick;
  analyst_tactical_summary?: string;
  casual_story?: string;
  localized_commentary?: Record<LangCode, string>;
}

export interface MatchRecapStoryboard {
  title: string;
  subtitle: string;
  model: string;
  score: { NLA: number; MCS: number };
  timecode: string;
  acts: RecapAct[];
  milestones: MilestoneEvent[];
  latency_ms?: number;
}

export interface RecapPassArc {
  start: Vec2;
  end: Vec2;
  ghostStart: Vec2;
  ghostEnd: Vec2;
  deltaXt: number;
  targetId: string | null;
}

export interface Insight {
  id: string;
  event_id?: string | null;
  created_at: string;
  model: string;
  archetype: string;
  camera_directive?: CameraDirective;
  stage_c_explainability: {
    moment_headline: string;
    why_it_matters_causal: string;
    tactical_catalyst: string;
    commentator_talking_point: string;
  };
  stage_d_broadcast_overlay: {
    timecode: string;
    overlay_type: string;
    highlight_players: string[];
    draw_ghost_pass: boolean;
    lower_third_title: string;
    lower_third_subtitle: string;
  };
  agent_trace?: AgentTrace | null;
  stage_e_personalization: {
    analyst_mode: {
      metrics_summary: string;
      tactical_note: string;
      metric_focus_note?: string;
      club_bias_note?: string;
    };
    casual_fan_mode: { story_card: string; excitement_rating: number };
    player_lock_insight: string;
    translations: { en: string; es: string; ar: string; hi: string };
    metric_lock?: MetricLock;
    metric_focus_note?: string;
    favorite_club_bias?: ClubBias;
    club_bias_frame?: string | null;
    persona_mode?: PersonaModeV5;
    locked_player_id?: string | null;
  };
  personalization?: PersonalizationState;
}

export type AgentTraceMode = "azure" | "fallback" | "edge";
export type AgentTraceStatus = "completed" | "fallback" | "review";

export interface AgentTraceSpan {
  id: "sentinel" | "triage" | "analyst" | "director";
  agent: string;
  role: string;
  status: AgentTraceStatus;
  latency_ms: number;
  summary: string;
  detail: string;
}

export interface AgentTraceGrounding {
  status: "verified" | "fallback_verified" | "review";
  score: number;
  checked_numbers: number;
  unmatched_numbers: string[];
  source: string;
  note: string;
}

export interface AgentTraceCompute {
  considered_events: number;
  gated_events: number;
  filtered_events: number;
  filter_ratio: number;
  ticks: number;
  insights: number;
  ticks_per_insight: number;
}

export interface AgentTrace {
  trace_id: string;
  event_id: string | null;
  anchor_clock: string;
  created_at: string;
  mode: AgentTraceMode;
  archetype: string;
  model: string;
  gate: {
    should_explain: boolean;
    reasons: string[];
    pdr: number | null;
    delta_xt: number | null;
    delta_chaos: number | null;
  };
  handoff_chain: AgentTraceSpan[];
  grounding: AgentTraceGrounding;
  guardrail?: {
    triggered: boolean;
    action: string;
    unmatched_numbers: string[];
    attempted_mode: string;
  } | null;
  compute: AgentTraceCompute;
  languages: string[];
}

export interface Pipeline {
  stages: Record<"a" | "b" | "c" | "d" | "e", { latency_ms: number }>;
  payloads: Record<"a" | "b" | "c" | "d" | "e", string>;
  updated_at: string | null;
  agent_trace?: AgentTrace | null;
  gate?: AgentTraceCompute;
  latency_p95?: Record<"a" | "b" | "c" | "d" | "e", number>;
}

export interface Recap {
  id: string;
  created_at: string;
  title: string;
  model: string;
  timecode: string;
  score: { NLA: number; MCS: number };
  items: { clock: string; headline: string; detail: string }[];
  translations: { en: string; es: string; ar: string; hi: string };
}
