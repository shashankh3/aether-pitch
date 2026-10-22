import type { CameraMode, Team } from "./simulation";

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
