// AETHER PITCH — shared WebSocket payload types (mirrors backend schemas)

export type Team = "NLA" | "MCS";

export interface PlayerTick {
  id: string;
  team: Team;
  number: number;
  name: string;
  role: "GK" | "DF" | "MF" | "FW";
  x: number;
  y: number;
  vx: number;
  vy: number;
  speed_kmh: number;
  stamina: number;
}

export interface MatchTick {
  t_match: number;
  clock: string;
  score: { NLA: number; MCS: number };
  possession: Team;
  players: PlayerTick[];
  ball: { x: number; y: number; z: number; speed_kmh: number };
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

export interface MatchEvent {
  id: string;
  type: string;
  clock: string;
  t_match: number;
  team: Team | null;
  player_id: string | null;
  player_name: string | null;
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
  previous_team?: string;
  outcome?: string;
}

export interface Insight {
  id: string;
  event_id?: string | null;
  created_at: string;
  model: string;
  archetype: string;
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
    analyst_mode: { metrics_summary: string; tactical_note: string };
    casual_fan_mode: { story_card: string; excitement_rating: number };
    player_lock_insight: string;
    translations: { en: string; es: string; ar: string; hi: string };
  };
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
  NLA: "#FF2A54", // North London Athletic — crimson red
  MCS: "#38BDF8", // Manchester Cityscape — sky blue
};

export const LANG_LABELS: Record<LangCode, string> = {
  en: "EN",
  es: "ES",
  ar: "العربية",
  hi: "हिन्दी",
};

export const SPEECH_LOCALES: Record<LangCode, string> = {
  en: "en-US",
  es: "es-ES",
  ar: "ar-SA",
  hi: "hi-IN",
};
