/*
 * AETHER PITCH — the plain-language layer.
 *
 * The studio speaks two audiences at once. A judge wants "xT", "PPDA" and
 * "Chaos Index"; an ordinary football fan watching the overlay wants to know
 * what is happening and why. Removing the technical language would gut the
 * project, so it is not removed: every technical term carries a plain
 * reading, and the studio can show either.
 *
 * `TERMS` is the single source of truth. A label that appears in the
 * fan-facing HUD and is not in here is a bug - the headless suite fails on
 * it, so nothing can ship unexplained.
 */

export interface Term {
  /** The fan's reading of the number, in a few words. */
  plain: string;
  /** One sentence a fan could repeat to a friend. */
  detail: string;
  /** Which part of the broadcast the term belongs to. */
  group: "Attacking" | "Defending" | "Fitness" | "The match" | "The studio";
}

export const TERMS: Record<string, Term> = {
  // ---- attacking --------------------------------------------------------
  "xT": {
    plain: "Pass quality",
    detail: "How much better this pass makes your attack. Zero is a wasted ball; one is a chance.",
    group: "Attacking",
  },
  "Expected Threat": {
    plain: "Pass quality",
    detail: "How much better this pass makes your attack. Zero is a wasted ball; one is a chance.",
    group: "Attacking",
  },
  "Δ xT": {
    plain: "Better or worse?",
    detail: "How much this pass improved the attack compared with a normal pass in the same spot.",
    group: "Attacking",
  },
  "Δ xT NOW": {
    plain: "Better or worse?",
    detail: "How much this pass improved the attack compared with a normal pass in the same spot.",
    group: "Attacking",
  },
  "GHOST xT": {
    plain: "The better pass",
    detail: "The pass that was available instead - and how much better it would have been.",
    group: "Attacking",
  },
  "BEST ΔxT": {
    plain: "Best pass quality",
    detail: "The biggest improvement in the attack anyone managed on the last touch.",
    group: "Attacking",
  },
  "PASS DIFF (PDR)": {
    plain: "Pass difficulty",
    detail: "How hard the pass was. 100% would be a miracle; under 50% is routine.",
    group: "Attacking",
  },
  "PDR": {
    plain: "Pass difficulty",
    detail: "How hard the pass was. 100% would be a miracle; under 50% is routine.",
    group: "Attacking",
  },
  "OPEN GHOST": {
    plain: "Space left behind",
    detail: "Metres of space the pass left open for a team-mate to run into.",
    group: "Attacking",
  },
  "PASS ACCURACY": {
    plain: "Pass accuracy",
    detail: "How many of the team's passes found a team-mate.",
    group: "Attacking",
  },
  "PASS DISTANCE": {
    plain: "Pass distance",
    detail: "How far the ball travelled in that pass, in metres.",
    group: "Attacking",
  },
  "COMPLETED": {
    plain: "Passes completed",
    detail: "How many passes found a team-mate, out of how many were attempted.",
    group: "Attacking",
  },
  "THROUGH BALL EXPOSURE": {
    plain: "Space behind them",
    detail: "How much danger the defence left between them and their goalkeeper.",
    group: "Attacking",
  },
  "TARGET ZONES": {
    plain: "Where to aim",
    detail: "The spots on the pitch the coach should be telling players to move into.",
    group: "Attacking",
  },

  // ---- defending --------------------------------------------------------
  "PPDA": {
    plain: "Pressing",
    detail: "How many passes the opposition is allowed before you go and press them. Lower means you press harder.",
    group: "Defending",
  },
  "PRESS": {
    plain: "Pressing effort",
    detail: "How hard the team is pressing right now, out of three.",
    group: "Defending",
  },
  "PRESSING INTENSITY": {
    plain: "Pressing effort",
    detail: "How hard the team is pressing right now, out of three.",
    group: "Defending",
  },
  "Pitch Control": {
    plain: "Who is winning the ball",
    detail: "The share of the pitch each team is in control of.",
    group: "Defending",
  },
  "TERRITORY": {
    plain: "Who is winning the ball",
    detail: "The share of the pitch each team is in control of.",
    group: "Defending",
  },
  "DEFLINE": {
    plain: "Defence line",
    detail: "How high up the pitch each team's back line is standing, in metres.",
    group: "Defending",
  },
  "Defensive line": {
    plain: "Defence line",
    detail: "How high up the pitch each team's back line is standing, in metres.",
    group: "Defending",
  },
  "defensive line height": {
    plain: "Defence line",
    detail: "How high up the pitch each team's back line is standing, in metres.",
    group: "Defending",
  },
  "COMPACTNESS AREA": {
    plain: "Tightness of the block",
    detail: "The size of the area the defence is squeezed into. Smaller is harder to play through.",
    group: "Defending",
  },
  "OFFSIDE TRAP CATCH %": {
    plain: "Offside trap chance",
    detail: "How likely the offside trap is to catch the attacker.",
    group: "Defending",
  },
  "PRESS COMPRESSION GAIN %": {
    plain: "How much pressing it buys",
    detail: "How much harder the opposition has to work after the line moves up.",
    group: "Defending",
  },
  "LINE COHESION": {
    plain: "How tight the line is",
    detail: "How close together the back four are standing.",
    group: "Defending",
  },

  // ---- fitness ----------------------------------------------------------
  "BIO-LOAD & +10m STAMINA": {
    plain: "How tired they are",
    detail: "How much energy each player has burned, and how much they will have left in ten minutes.",
    group: "Fitness",
  },
  "Bio-Load & +10m Stamina": {
    plain: "How tired they are",
    detail: "How much energy each player has burned, and how much they will have left in ten minutes.",
    group: "Fitness",
  },
  "STAMINA BURN": {
    plain: "Energy used",
    detail: "How much energy the team has burned through sprinting.",
    group: "Fitness",
  },
  "TEAM ENERGY": {
    plain: "Energy left",
    detail: "How much energy the team has left on average for the next ten minutes.",
    group: "Fitness",
  },
  "FATIGUE RISK": {
    plain: "Getting tired",
    detail: "How many players are running out of legs.",
    group: "Fitness",
  },
  "SPRINT LOAD INDEX": {
    plain: "Sprint load",
    detail: "How much sprinting a player has done. It is what makes them tired.",
    group: "Fitness",
  },
  "HIGH INTENSITY SECONDS": {
    plain: "Hard running",
    detail: "Seconds spent sprinting hard. It is what makes them tired.",
    group: "Fitness",
  },
  "PRESS SECONDS": {
    plain: "Time pressing",
    detail: "Seconds spent going and pressing the opposition.",
    group: "Fitness",
  },
  "RELIEF REQUIRED": {
    plain: "Needs a rest",
    detail: "This player is running out of legs and should be taken off.",
    group: "Fitness",
  },

  // ---- the match --------------------------------------------------------
  "CHAOS": {
    plain: "Match tempo",
    detail: "How chaotic the match is right now. High means end-to-end; low means controlled.",
    group: "The match",
  },
  "CHAOS INDEX": {
    plain: "Match tempo",
    detail: "How chaotic the match is right now. High means end-to-end; low means controlled.",
    group: "The match",
  },
  "Δ CHAOS": {
    plain: "Getting faster or slower?",
    detail: "Whether the match is speeding up or calming down.",
    group: "The match",
  },
  "Δ CHAOS 10S": {
    plain: "Getting faster or slower?",
    detail: "Whether the match is speeding up or calming down.",
    group: "The match",
  },
  "MATCH TEMPO": {
    plain: "Match tempo",
    detail: "How chaotic the match is right now.",
    group: "The match",
  },
  "Pulse": {
    plain: "Match tempo",
    detail: "How chaotic the match is right now. High means end-to-end; low means controlled.",
    group: "The match",
  },
  "Tactical Pulse · Control vs Chaos": {
    plain: "Match tempo",
    detail: "How chaotic the match is right now. High means end-to-end; low means controlled.",
    group: "The match",
  },
  "Δ10s": {
    plain: "Faster or slower?",
    detail: "Whether the match is speeding up or calming down over the last ten seconds.",
    group: "The match",
  },
  "BALANCED RHYTHM": {
    plain: "Balanced",
    detail: "The match is flowing, with both teams able to play.",
    group: "The match",
  },
  "HIGH CHAOS TRANSITION": {
    plain: "End to end",
    detail: "The match has opened up - lots of space, lots of chances, both teams attacking.",
    group: "The match",
  },
  "STRUCTURED CONTROL": {
    plain: "Controlled",
    detail: "One team is controlling the game and slowing it down.",
    group: "The match",
  },
  "GHOST EDGE": {
    plain: "The better pass",
    detail: "The pass that was available instead, and how much better it would have been.",
    group: "The match",
  },
  "GOD MODE": {
    plain: "Match scenario",
    detail: "A scripted moment in the match that shows off one part of the studio.",
    group: "The match",
  },
  "WIN PROBABILITY": {
    plain: "Who is winning",
    detail: "The chance each side has of taking the three points, as a percentage.",
    group: "The match",
  },
  "TOP SPEED": {
    plain: "Fastest player",
    detail: "The fastest player on the pitch right now.",
    group: "The match",
  },
  "SPRINTERS NOW": {
    plain: "Sprinting hard",
    detail: "How many players are sprinting at full speed right now.",
    group: "The match",
  },
  "SPRINTERS >30": {
    plain: "Sprinting hard",
    detail: "How many players are sprinting at full speed right now.",
    group: "The match",
  },
  "TOP SPRINTER": {
    plain: "Fastest player",
    detail: "The fastest player on the pitch right now.",
    group: "The match",
  },
  "SPRINT LEADERS": {
    plain: "Sprinting hard",
    detail: "How many players are sprinting at full speed right now.",
    group: "The match",
  },
  "FASTEST PLAYER": {
    plain: "Fastest player",
    detail: "The fastest player on the pitch right now.",
    group: "The match",
  },
  "SHOT VELOCITY": {
    plain: "Shot speed",
    detail: "How hard the shot was hit.",
    group: "The match",
  },
  "EVENT BALL SPEED": {
    plain: "Ball speed",
    detail: "How fast the ball was travelling on that touch.",
    group: "The match",
  },
  "BALL SPEED": {
    plain: "Ball speed",
    detail: "How fast the ball was travelling on that touch.",
    group: "The match",
  },

  // ---- the studio -------------------------------------------------------
  "COGNITIVE TELEMETRY DENSITY": {
    plain: "How much detail you see",
    detail: "Controls how many numbers are on screen at once.",
    group: "The studio",
  },
  "Cognitive Telemetry Density": {
    plain: "How much detail you see",
    detail: "Controls how many numbers are on screen at once.",
    group: "The studio",
  },
  "AI GATE": {
    plain: "What gets talked about",
    detail: "The studio only comments on moments worth commenting on. This is the rule it uses.",
    group: "The studio",
  },
  "Tactical Inversion": {
    plain: "Full-backs stepping forward",
    detail: "A team pushing a full-back into midfield to create an extra passer, and leaving space behind them.",
    group: "The studio",
  },
  "Match intelligence": {
    plain: "What is happening in the match",
    detail: "Possession, passing, pressing and the players behind it all.",
    group: "The studio",
  },
};

/** The plain reading of a label, if it has one. */
export function plainFor(label: string): string | null {
  const direct = TERMS[label];
  if (direct) return direct.plain;
  // Labels are written in a few different cases; try a normalised form.
  const key = Object.keys(TERMS).find((k) => k.toUpperCase() === label.toUpperCase());
  return key ? TERMS[key].plain : null;
}

/** The one-sentence explanation of a label, if it has one. */
export function detailFor(label: string): string | null {
  const direct = TERMS[label];
  if (direct) return direct.detail;
  const key = Object.keys(TERMS).find((k) => k.toUpperCase() === label.toUpperCase());
  return key ? TERMS[key].detail : null;
}

/** Every term, grouped, for the explainer sheet. */
export function glossary(): { term: string; plain: string; detail: string; group: string }[] {
  const seen = new Set<string>();
  const out: { term: string; plain: string; detail: string; group: string }[] = [];
  for (const [term, meta] of Object.entries(TERMS)) {
    if (seen.has(meta.plain)) continue;
    seen.add(meta.plain);
    out.push({ term, plain: meta.plain, detail: meta.detail, group: meta.group });
  }
  const order = ["Attacking", "Defending", "Fitness", "The match", "The studio"];
  return out.sort((a, b) => order.indexOf(a.group) - order.indexOf(b.group)
    || a.term.localeCompare(b.term));
}
