// AETHER PITCH v2.0 — shared WebSocket payload types (mirrors backend schemas)

export type Team = "NLA" | "MCS";
export type Role = "GK" | "DEF" | "MID" | "FWD";
export type PoseState = "SPRINT" | "KICK" | "PRESS" | "JOG" | "IDLE";
export type PlayStyleBadge = "RAPID" | "INCISIVE_PASS" | "INTERCEPT";
export type CameraMode =
  | "TELE_BROADCAST"
  | "PLAYER_LOCK_3RD_PERSON"
  | "TACTICAL_DRONE_ORBIT"
  | "AUTO_DIRECTOR";

/** Mode vocabulary emitted by the Stage (c)/(d) AI camera director. */
export type DirectorMode =
  | "ACTION_ZOOM"
  | "TACTICAL_DRONE"
  | "PLAYER_LOCK_3RD_PERSON"
  | "TELE_BROADCAST";

export interface PlayerTick {
  id: string;
  team: Team;
  number: number;
  shirt_number: number;
  name: string;
  role: Role;
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed_kmh: number;
  stamina: number;
  heading_rad: number;
  distance_m: number;
  sprint_distance_m: number;
  top_speed_kmh: number;
  pose_state: PoseState;
  playstyle_badge: PlayStyleBadge | null;
  bio_load_profile?: BioLoadProfile;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface MatchTeamMetadata {
  id: Team;
  name: string;
  short_name: string;
  kit: string;
}

export interface MatchMetadata {
  match_id: string;
  competition: string;
  season: string;
  matchday: number;
  venue: string;
  city: string;
  kickoff_utc: string;
  home_team: MatchTeamMetadata;
  away_team: MatchTeamMetadata;
  data_source: string;
  synthetic: boolean;
  disclaimer: string;
}

export interface MatchTick {
  t_match: number;
  clock: string;
  score: { NLA: number; MCS: number };
  possession: Team;
  match_metadata?: MatchMetadata;
  players: PlayerTick[];
  ball: {
    x: number;
    y: number;
    z: number;
    vx: number;
    vy: number;
    vz: number;
    speed_kmh: number;
    pass_start: [number, number] | null;
    pass_end: [number, number] | null;
    is_lofted: boolean;
    ghost_end?: [number, number] | null;
    ghost_delta_xt?: number | null;
    ghost_actual_delta_xt?: number | null;
    ghost_target_id?: string | null;
    ghost_completion_probability?: number | null;
    ghost_net_xt_gain?: number | null;
  };
  carrier: string | null;
  scenario: string | null;
  scenario_left: number | null;
}

export interface TeamStats {
  passes: number;
  passes_completed: number;
  shots: number;
  shots_on_target: number;
  tackles: number;
  turnovers_won: number;
  pass_accuracy: number;
  shot_accuracy: number;
  possession_pct: number;
  distance_km: number;
  sprint_distance_km: number;
  goals: number;
}

export interface PlayerStats {
  passes: number;
  passes_completed: number;
  pass_accuracy: number;
  shots: number;
  shots_on_target: number;
  tackles: number;
  distance_km: number;
  top_speed_kmh: number;
}

export interface StatsLeader {
  player_id: string;
  player_name: string;
  team: Team;
  top_speed_kmh?: number;
  distance_km?: number;
}

export interface Metrics {
  chaos_index: number;
  chaos_state: "STRUCTURED CONTROL" | "BALANCED RHYTHM" | "HIGH CHAOS TRANSITION";
  chaos_history: number[];
  delta_chaos: number;
  ppda: { NLA: number; MCS: number };
  def_lines: { NLA: number; MCS: number };
  pressing_intensity: number;
  turnover_rate: number;
  ball_speed_var: number;
  stretch_m: number;
  possession: Team;
  team_stats: Record<Team, TeamStats>;
  player_stats: Record<string, PlayerStats>;
  leaders: { fastest?: StatsLeader; farthest?: StatsLeader };
  pitch_control_split?: PitchControlSplit;
  passing_network_edges?: PassingNetworkEdge[];
  bio_load_summary?: BioLoadSummary;
}

/* ------------------------------------------- v6.2 bio-load / fatigue twin */
export interface BioLoadProfile {
  sprint_load_index: number;
  projected_stamina_10m: number;
  fatigue_pdr_penalty: number;
  high_intensity_seconds: number;
  press_seconds?: number;
  stamina_now: number;
  tactical_relief_directive: string;
  relief_required: boolean;
}

export interface BioLoadSummary {
  mean_sprint_load_index: number;
  mean_projected_stamina_10m: number;
  max_fatigue_pdr_penalty: number;
  at_risk_count: number;
  most_at_risk: {
    player_id: string | null;
    player_name: string | null;
    team: Team | null;
    role: string | null;
    sprint_load_index: number;
    projected_stamina_10m: number;
    fatigue_pdr_penalty: number;
    relief_required: boolean;
  }[];
}

/* ------------------------------------------- v6.2 spatial ownership + network */
export interface PitchControlSplit {
  nla_territory_pct: number;
  mcs_territory_pct: number;
  neutral_pct?: number;
}

export interface PassingNetworkEdge {
  from_id: string;
  to_id: string;
  team: Team;
  xt_weight: number;
  distance_m: number;
  from_xy: Vec2;
  to_xy: Vec2;
}

export interface GhostPass {
  x: number;
  y: number;
  delta_xt: number;
  target_id: string;
  openness_m?: number;
  distance_m?: number;
  actual_delta_xt?: number | null;
  ghost_delta_xt?: number | null;
  net_xt_gain?: number | null;
  completion_probability?: number | null;
  receiver_target_xy?: Vec2 | null;
}

export interface CameraDirective {
  recommended_mode: DirectorMode;
  focus_target_id: string | null;
  cinematic_slow_mo: boolean;
  ar_highlight_zone: string;
}

export interface MatchEvent {
  id: string;
  type: string;
  clock: string;
  t_match: number;
  team: Team | null;
  player_id: string | null;
  player_name: string | null;
  target_id?: string | null;
  start?: [number, number];
  end?: [number, number];
  distance_m?: number;
  ball_speed_kmh?: number;
  defenders_in_cone?: number;
  nearest_defender_m?: number;
  pdr?: number | null;
  delta_xt?: number | null;
  ghost_pass?: GhostPass | null;
  speed_kmh?: number;
  on_target?: boolean;
  pass_seq?: number;
  target_name?: string | null;
  passer_id?: string | null;
  passer_name?: string | null;
  opponent_id?: string | null;
  opponent_name?: string | null;
  distance_km?: number;
  threshold_km?: number;
  delta_chaos?: number;
  ai_gate?: { should_explain: boolean; reasons: string[] };
  scenario?: string | null;
  scenario_signature?: boolean;
  leverage?: number;
  line_breaking?: boolean;
  middle_third?: boolean;
  score?: { NLA: number; MCS: number };
  x?: number;
  y?: number;
  players?: string[];
  detail?: string;
  headline?: string;
  value?: number;
  previous_team?: string;
  outcome?: string;
}

/* ------------------------------------------------ v5.0 judge domination */
export type MetricFocus =
  | "ALL"
  | "SPEED_VELOCITY"
  | "PASS_QUALITY"
  | "EXPECTED_THREAT_XT"
  | "CHAOS_PRESSING";

export type PersonaModeV5 = "ANALYST_HUD" | "CASUAL_STORY" | "TWINCAST_SPLIT";
export type ClubBias = "NEUTRAL" | "NLA_LOYALIST" | "MCS_LOYALIST";
export type EngineStatus = "CONNECTED_PIPELINE_LIVE" | "EDGE_SYNTHETIC_FALLBACK";

/* ------------------------------------- v6.2 inclusive broadcast density */
export type CognitiveDensity = "CASUAL_STORYTELLER" | "FANTASY_HUNTER" | "PRO_TACTICAL_DIRECTOR";

export const COGNITIVE_DENSITY_META: Record<
  CognitiveDensity,
  { label: string; detail: string; rawNumbers: boolean; jargon: boolean }
> = {
  CASUAL_STORYTELLER: {
    label: "Casual Storyteller",
    detail: "Plain-language callouts · raw grid numbers hidden",
    rawNumbers: false,
    jargon: false,
  },
  FANTASY_HUNTER: {
    label: "Fantasy Hunter",
    detail: "Speed milestones · stamina burn · individual ΔxT",
    rawNumbers: true,
    jargon: false,
  },
  PRO_TACTICAL_DIRECTOR: {
    label: "Pro Tactical Director",
    detail: "Full Stage B density · xT · PDR · PPDA · ghost traps",
    rawNumbers: true,
    jargon: true,
  },
};

export interface PersonalizationState {
  persona_mode: PersonaModeV5;
  metric_focus: MetricFocus;
  favorite_club_bias: ClubBias;
  locked_player_id: string | null;
  market_language: LangCode;
  cognitive_density?: CognitiveDensity;
  colorblind_safe?: boolean;
}

export interface MetricLock {
  active: boolean;
  focus: MetricFocus;
  label: string;
  filtered_tags: string[];
}

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

export type PersonaMode = "analyst" | "casual" | "split";
export type LangCode = "en" | "es" | "ar" | "hi";

export const TEAM_COLORS: Record<Team, string> = {
  NLA: "#FF1E56", // North Larchmont Athletic — crimson / gold
  MCS: "#00F0FF", // Meridian City SC — electric cyan / navy
};

export const TEAM_KIT: Record<Team, { primary: string; shorts: string; gk: string }> = {
  NLA: { primary: "#E11D48", shorts: "#7F0F26", gk: "#D9F99D" },
  MCS: { primary: "#00E5FF", shorts: "#0A1A2F", gk: "#FDE047" },
};

export const LANG_LABELS: Record<LangCode, string> = {
  en: "EN",
  es: "ES",
  ar: "العربية",
  hi: "हिन्दी",
};

export const SPEECH_LOCALES: Record<LangCode, string> = {
  en: "en-GB",
  es: "es-ES",
  ar: "ar-SA",
  hi: "hi-IN",
};

export const CAMERA_MODES: { id: CameraMode; label: string }[] = [
  { id: "TELE_BROADCAST", label: "Tele Cam" },
  { id: "PLAYER_LOCK_3RD_PERSON", label: "Pro Cam" },
  { id: "TACTICAL_DRONE_ORBIT", label: "Drone Orbit" },
  { id: "AUTO_DIRECTOR", label: "Auto-Director" },
];

/* ------------------------------------------------ v3.0 telestrator / DVR */
export interface CustomTacticalArrow {
  from: [number, number];
  to: [number, number];
}

export interface TelestratorState {
  spotlightPlayerIds: string[];
  showOffsideLaserWall: boolean;
  showCompactnessPolygon: boolean;
  animateGhostReplay: boolean;
  customTacticalArrows: CustomTacticalArrow[];
}

export interface HighlightZone {
  x_min: number;
  x_max: number;
  y_min: number;
  y_max: number;
  label: string;
}

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
  telemetry_basis: Record<string, unknown>;
  foundry_safety_shield?: FoundrySafetyShield;
  mode?: string;
  model?: string;
}

/* ------------------------------------------- v6.2 Foundry eval scorecard */
export interface FoundryEvalScorecard {
  mathematical_groundedness_pct: number;
  tactical_coherence_pct: number;
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
