import type { Pipeline } from "../types";
import { EdgeEngine } from "./simulation";

export function edgePipeline(): Pipeline {
  const engine = new EdgeEngine(3);
  return engine.buildPipeline();
}
