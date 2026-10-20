// AETHER PITCH v2.0 — shared WebSocket payload types (mirrors backend schemas)

export type Team = "NLA" | "MCS";
export type Role = "GK" | "DEF" | "MID" | "FWD";
export type PoseState = "SPRINT" | "KICK" | "PRESS" | "JOG" | "IDLE";
export type PlayStyleBadge = "RAPID+" | "INCISIVE_PASS+" | "INTERCEPT+";
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
  pose_state: PoseState;
  playstyle_badge: PlayStyleBadge | null;
}

export interface Vec2 {
  x: number;
  y: number;
}

export interface MatchTick {
  t_match: number;
  clock: string;
  score: { NLA: number; MCS: number };
  possession: Team;
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
  };
  carrier: string | null;
  scenario: string | null;
  scenario_left: number | null;
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
}

export interface GhostPass {
  x: number;
  y: number;
  delta_xt: number;
  target_id: string;
  openness_m?: number;
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
  delta_chaos?: number;
  ai_gate?: { should_explain: boolean; reasons: string[] };
  scenario?: string | null;
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
export type EngineStatus = "CONNECTED_AZURE_LIVE" | "EDGE_SYNTHETIC_FALLBACK";

export interface PersonalizationState {
  persona_mode: PersonaModeV5;
  metric_focus: MetricFocus;
  favorite_club_bias: ClubBias;
  locked_player_id: string | null;
  market_language: LangCode;
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

export interface Pipeline {
  stages: Record<"a" | "b" | "c" | "d" | "e", { latency_ms: number }>;
  payloads: Record<"a" | "b" | "c" | "d" | "e", string>;
  updated_at: string | null;
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
  NLA: "#FF1E56", // North London Athletic — crimson / gold
  MCS: "#00F0FF", // Manchester Cityscape — electric cyan / navy
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

export interface StudioQueryResponse {
  query: string;
  agent_reasoning_chain: string[];
  studio_answer_localized: string;
  commentator_cue_15s: string;
  scene_directive: StudioSceneDirective;
  model?: string;
}

/* ------------------------------------------------ v4.0 rubric audit */
export interface PipelineAudit {
  status: string;
  synthetic_data_compliance: boolean;
  audit: {
    stage_a_ingest_ms: number;
    stage_b_interpret_ms: number;
    stage_c_explain_ms: number;
    stage_d_render_ms: number;
    stage_e_personalize_ms: number;
  };
  live_pipeline: Record<string, number | null>;
  event_gate: { rule: string; gate_fired_in_audit: { should_explain: boolean; reasons: string[] } };
}
