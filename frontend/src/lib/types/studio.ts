import type { DirectorMode, PassingNetworkEdge, PitchControlSplit, Team, Vec2 } from "./simulation";
import type { HighlightZone } from "./overlay";
import type { AgentTrace, AgentTraceCompute, Pipeline } from "./recap";

/* ------------------------------------------------ v4.0 studio co-pilot */
export interface StudioSceneDirective {
  camera_mode: DirectorMode | "ACTION_ZOOM";
  spotlight_player_ids: string[];
  enable_offside_wall: boolean;
  enable_compactness_polygon: boolean;
  draw_ghost_pass: boolean;
  highlight_pitch_zone: HighlightZone | null;
}

export interface GroundingCitation {
  label: string;
  value: string;
  source: string;
  detail?: string;
}

export interface StudioSuggestedAction {
  id: string;
  label: string;
  type: "FOCUS_GAP" | "LOCK_PLAYER" | "SHOW_GHOST_PASS" | "GENERATE_RECAP" | string;
  payload?: {
    enabled?: boolean;
    player_id?: string;
    player_name?: string;
    camera_mode?: DirectorMode;
    zone?: { x: number; y: number };
    focus?: string;
  };
  reason?: string;
}

export interface StudioQueryResponse {
  query: string;
  answer: string;
  agent_specialist: string;
  grounding_citations: GroundingCitation[];
  suggested_actions: StudioSuggestedAction[];
  agent_reasoning_chain: string[];
  studio_answer_localized: string;
  commentator_cue_15s: string;
  scene_directive: StudioSceneDirective;
  foundry_safety_shield?: FoundrySafetyShield;
  model?: string;
}

/* ------------------------------------------- v6.2 Foundry RAI safety shield */
export interface FoundrySafetyShield {
  prompt_shield_status: "PROTECTED" | "CLEAR";
  severity: "clear" | "guarded" | "blocked";
  categories: string[];
  numeric_grounding_pass: boolean;
  club_neutrality_pass: boolean;
  grounding_status: string;
  numbers_checked?: number;
  unmatched_numbers?: string[];
  content_safety?: ContentSafetyVerdict;
  deflection: string | null;
  reasons: string[];
  policy_version: string;
}

/* ------------------------------------------- v6.2 adversarial bench war-room */
export interface WarRoomAgent {
  id: string;
  agent: string;
  role: string;
  status: string;
}

export interface WarRoomZone {
  x: number;
  y: number;
  label: string;
}

export interface WarRoomVector {
  from: Vec2;
  to: Vec2;
  label: string;
}

export interface WarRoomAgentCall {
  id: string;
  agent: string;
  role: string;
  deployment: string;
  tools: string[];
  latency_ms: number;
  prompt_tokens?: number | null;
  completion_tokens?: number | null;
  total_tokens?: number | null;
}

/* ------------------------------------- v6.2 interactive counterfactual API */
export interface CounterfactualDisplacement {
  /** Shirt number of the displaced player. */
  player_id: number;
  /** Resolved engine id (e.g. "NLA_2"). Preferred by the server. */
  canonical_player_id?: string | null;
  team: Team;
  role: string;
  /** Absolute pitch metres (x, y). */
  original_coords: [number, number];
  /** Absolute pitch metres (x, y). */
  displaced_coords: [number, number];
  delta_distance_m: number;
}

export interface CounterfactualRequest {
  match_id: string;
  minute: number;
  displacements: CounterfactualDisplacement[];
  baseline_xt: number;
  baseline_pitch_control: Record<string, number>;
  current_chaos_index: number;
}

export interface CounterfactualEvaluation {
  scenario_id: string;
  projected_xt_shift: number;
  pitch_control_shift_pct: Record<string, number>;
  structural_vulnerability_index: number;
  arbiter_verdict: string;
  recommended_compensation_move: {
    player_id: number;
    target_xy: [number, number];
    label?: string;
  };
  numeric_grounding_verified: boolean;
  trace_id: string;
  grounding?: {
    status: string;
    score: number;
    checked_numbers: number;
    unmatched_numbers: string[];
    source: string;
    note: string;
  };
  agent_call?: {
    id: string;
    agent: string;
    role: string;
    deployment: string;
    tools: string[];
    latency_ms: number;
    total_tokens?: number | null;
  } | null;
  displacements?: {
    player_id: number;
    canonical_player_id: string;
    player_name: string;
    team: Team;
    role: string;
    original_coords: [number, number];
    displaced_coords: [number, number];
    delta_distance_m: number;
    xt_before: number;
    xt_after: number;
    xt_shift: number;
  }[];
  mode?: string;
  model?: string;
}

export interface WarRoomPrefill {
  query: string;
  counterfactual: {
    player_id: string;
    player_name: string;
    team: Team;
    from_xy: { x: number; y: number };
    to_xy: { x: number; y: number };
    displacement_m: number;
    delta_xt: number;
    delta_pitch_control_pct: number;
  };
}

export interface WarRoomResponse {
  agent_debate_transcript: {
    manager_proposal: string;
    scout_counter: string;
    arbiter_verdict: string;
  };
  recommended_adjustment: {
    title: string;
    directive: string;
    team: string;
    opponent: string;
  };
  projected_30s_xt_delta: number;
  win_prob_shift_pct: number;
  target_zones: WarRoomZone[];
  adjustment_vectors: WarRoomVector[];
  agents: WarRoomAgent[];
  agent_calls?: WarRoomAgentCall[];
  degraded?: boolean;
  degraded_agents?: string[];
  orchestration?: {
    mode: string;
    rounds: number;
    agents: string[];
    tool_surface: string[];
    note: string;
  };
  telemetry_basis: Record<string, unknown>;
  foundry_safety_shield?: FoundrySafetyShield;
  mode?: string;
  model?: string;
}

/* ------------------------------------------- v6.2 Foundry eval scorecard */
export interface FoundryEvalScorecard {
  mathematical_groundedness_pct: number;
  tactical_coherence_pct: number | null;
  tactical_coherence_basis?: {
    published_insights: number;
    numeric_critic_passed: number;
    source: string;
  };
  prompt_shield_status: "PROTECTED" | "CLEAR";
  prompt_shield_active: boolean;
  hallucinations: number;
  policy_breaches: number;
  p95_frame_sla_pct: number;
  p95_budget_ms: number;
  p95_observed_ms: number;
  numbers_checked: number;
  sla_met: boolean;
  evaluated_at: string;
  eval_suite: string;
  content_safety?: ContentSafetyVerdict;
}

export interface ContentSafetyVerdict {
  service: string;
  status: "CLEAR" | "FLAGGED" | "SKIPPED" | "ARMED" | "ERROR";
  configured: boolean;
  categories: { category: string | null; severity: number }[];
  max_severity: number;
  host: string;
  note: string;
}

/* ------------------------------------------------ v4.0 rubric audit */
export interface StageBSummary {
  peak_chaos_index: number;
  team_ppda: Record<string, unknown>;
  pitch_control_split?: PitchControlSplit;
  passing_network_edges?: PassingNetworkEdge[];
  top_delta_xt: {
    clock: string;
    player: string;
    team: Team | null;
    type: string | null;
    delta_xt: number;
    pdr: number | null;
    ghost_delta_xt: number | null;
  }[];
  ghost_counterfactual: {
    clock: string;
    team: Team | null;
    player_id: string | null;
    player_name: string | null;
    target_id: string | null;
    actual_delta_xt: number;
    ghost_delta_xt: number;
    net_xt_gain: number;
    completion_probability: number | null;
    receiver_target_xy: Vec2 | null;
  } | null;
}

export interface AuditMatchSummary {
  home: string;
  away: string;
  competition: string;
  venue: string;
  clock: string | null;
  score: { NLA: number; MCS: number } | null;
  synthetic_provenance: boolean;
  data_source: string;
  provenance: string;
}

export interface PipelineAudit {
  status: string;
  synthetic_data_compliance: boolean;
  match_summary?: AuditMatchSummary;
  stage_b_summary?: StageBSummary;
  foundry_eval?: FoundryEvalScorecard;
  foundry_safety_shield?: FoundrySafetyShield;
  audit: {
    stage_a_ingest_ms: number;
    stage_b_interpret_ms: number;
    stage_c_explain_ms: number;
    stage_d_render_ms: number;
    stage_e_personalize_ms: number;
  };
  live_pipeline: Record<string, number | null>;
  latency_p95?: Record<string, number>;
  agent_trace?: AgentTrace;
  gate_efficiency?: AgentTraceCompute;
  handoff_counts?: {
    insights: number;
    azure: number;
    fallback: number;
    grounding_pass: number;
  };
    stage_modes?: Record<string, string>;
    stage_c_audit_mode?: string;
    translator?: {
      configured: boolean;
      last_attempted: string | null;
      last_used: string | null;
      last_error: string | null;
      region: string;
    };
  azure?: {
    configured: boolean;
    last_attempted: boolean;
    last_used: boolean;
    last_error: string | null;
    request_id: string | null;
    usage: Record<string, unknown>;
    triage_deployment: string;
    narrative_deployment: string;
    api_version: string;
  };
  event_gate: { rule: string; gate_fired_in_audit: { should_explain: boolean; reasons: string[] } };
}
