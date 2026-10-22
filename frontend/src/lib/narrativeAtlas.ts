/*
 * AETHER PITCH — the deterministic narrative atlas.
 *
 * The browser twin and the Stage E personaliser tell the same story in the
 * same four languages. The English line and each translation live here so
 * the twin has a genuine per-archetype translation rather than a translated
 * prefix glued onto the English sentence - which is what the offline path
 * used to do.
 *
 * The engine's copy lives in `backend/stage_d_e_personalizer.py`; the
 * cross-engine parity suite asserts the two stay in step.
 */

export const ARCHETYPES = [
  "counter_overload",
  "pressing_trap",
  "inversion",
  "difficult_progression",
  "threat_surge",
  "rhythm_shift",
] as const;

export type Archetype = (typeof ARCHETYPES)[number];

/** The English fan story per archetype. `{team}`, `{player}` and `{speed}`
 *  are substituted at render time. */
export const STORIES: Record<Archetype, string> = {
  counter_overload:
    "Lightning counter-attack! {team} stole it in midfield and exploded forward at "
    + "{speed:.0f} km/h — the defence was caught square with nowhere to run.",
  pressing_trap:
    "{team} just sprang a perfectly-timed pressing trap — three defenders swarmed the ball "
    + "and won it back high up the pitch. The crowd can smell a chance!",
  inversion:
    "Clever switch by {team}: their right-back has moved into midfield as an extra playmaker. "
    + "Brave stuff — but that leaves the wing wide open if they lose it!",
  difficult_progression:
    "Absolutely outrageous pass from {player} — through a forest of defenders! "
    + "One mistake there and it's a counter-attack the other way.",
  threat_surge:
    "{team} are slicing through the pitch — every pass is pulling defenders out of position "
    + "and the danger zone is glowing red!",
  rhythm_shift:
    "Calm, controlled possession from {team}. They're making the pitch big, passing the "
    + "opponents into submission — no panic, just patience.",
};

/** The genuine market-language translations, per archetype. */
export const TRANSLATIONS: Record<Archetype, Record<string, string>> = {
  counter_overload: {
    es: "¡Contraataque relámpago! {team} robó en el mediocampo y arrancó a toda velocidad — la defensa quedó desconectada.",
    ar: "هجمة مرتدة خاطفة! انتزع {team} الكرة في الوسط وانطلق بسرعة جنونية — والدفاع تُرك في مواجهة الفراغ.",
    hi: "बिजली जैसा काउंटर-अटैक! {team} ने मिडफ़ील्ड में गेंद छीनी और तेज़ी से दौड़ पड़ा — बचाव पूरी तरह फैल गया।",
  },
  pressing_trap: {
    es: "¡Trampa de presión perfecta de {team}! Tres defensores cercaron el balón y lo recuperaron arriba.",
    ar: "فخ ضغط مثالي من {team}! ثلاثة مدافعين حاصروا الكرة واستعادوها في مقدمة الملعب.",
    hi: "{team} का शानदार प्रेसिंग ट्रैप! तीन डिफेंडर्स ने गेंद घेरी और ऊपर ही वापस ले ली।",
  },
  inversion: {
    es: "Cambio valiente de {team}: el lateral derecho se instala en el mediocampo… ¡pero deja el ala abierta!",
    ar: "تحويل جريء من {team}: الظهير الأيمن ينتقل إلى الوسط… لكنه يترك الجناح مفتوحًا!",
    hi: "{team} की स्मार्ट चाल: दायां फुल-बैक मिडफ़ील्ड में उतर गया… लेकिन विंग खुला छूट गया!",
  },
  difficult_progression: {
    es: "¡Pase escandaloso de {player} entre un bosque de piernas! Un error ahí y era contragolpe.",
    ar: "تمريرة خارقة من {player} وسط غابة من المدافعين! أي خطأ هنا كان يعني هجمة مرتدة.",
    hi: "{player} का कमाल का पास — डिफेंडर्स के बीच से! वहाँ एक गलती और काउंटर बन जाता।",
  },
  threat_surge: {
    es: "¡{team} atraviesa el campo! Cada pase descoloca defensas y la zona de peligro arde.",
    ar: "{team} يشقّ الملعب! كل تمريرة تشتت الدفاع ومنطقة الخطر تتوهج.",
    hi: "{team} पूरे मैदान को चीर रहा है! हर पास बचाव बिखेर रहा है और ख़तरे का ज़ोन लाल हो रहा है।",
  },
  rhythm_shift: {
    es: "Posesión serena de {team}: agrandan la cancha y desgastan al rival con paciencia.",
    ar: "استحواذ هادئ من {team}: يوسّعون الملعب ويستهلكون الخصم بصبر.",
    hi: "{team} का शांत कब्ज़ा — मैदान बड़ा करके धैर्य से opponent को थका रहे हैं।",
  },
};

/** Substitute the placeholders the engine's `.format()` call would. */
export function fillTemplate(
  template: string,
  values: { team: string; opp: string; player: string; speed?: number },
): string {
  return template
    .replace(/\{team\}/g, values.team)
    .replace(/\{opp\}/g, values.opp)
    .replace(/\{player\}/g, values.player)
    .replace(/\{speed(?::[^}]*)?\}/g, String(Math.round(values.speed ?? 30)));
}
