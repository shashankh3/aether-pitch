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
  /** Why the pass was made: line_breaking | under_pressure | buildup. */
  reason?: string | null;
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

