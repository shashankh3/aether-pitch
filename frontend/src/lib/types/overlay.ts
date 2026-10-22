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
