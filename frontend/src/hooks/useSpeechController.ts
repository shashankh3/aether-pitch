"use client";
// AETHER PITCH v4.0 — Zero-overlap multi-language voice controller.
// Module-level store so the equalizer pill, TwinCast HUD and PlayerLock card
// all share one speech pipeline: cancel-before-queue (rapid God-Mode clicks
// never stack audio), native voice mapping, broadcast cadence.

import { useSyncExternalStore, useCallback } from "react";
import type { LangCode } from "@/lib/types";

interface SpeechState {
  isSpeaking: boolean;
  activeText: string;
  isVoiceMuted: boolean;
  lang: LangCode;
}

let state: SpeechState = {
  isSpeaking: false,
  activeText: "",
  isVoiceMuted: false,
  lang: "en",
};
let autoNarrationSuppressed = false;
const listeners = new Set<() => void>();

function emit(next: Partial<SpeechState>) {
  state = { ...state, ...next };
  listeners.forEach((l) => l());
}

function subscribe(cb: () => void) {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

function getSnapshot() {
  return state;
}

const LOCALE_MAP: Record<LangCode, string[]> = {
  en: ["en-GB", "en-US", "en"],
  es: ["es-ES", "es-MX", "es"],
  ar: ["ar-SA", "ar-EG", "ar"],
  hi: ["hi-IN", "hi"],
};

function pickVoice(lang: LangCode): SpeechSynthesisVoice | null {
  if (typeof window === "undefined" || !window.speechSynthesis) return null;
  const voices = window.speechSynthesis.getVoices();
  for (const locale of LOCALE_MAP[lang]) {
    const exact = voices.find((v) => v.lang.replace("_", "-") === locale);
    if (exact) return exact;
  }
  for (const locale of LOCALE_MAP[lang]) {
    const prefix = voices.find((v) => v.lang.replace("_", "-").startsWith(locale.split("-")[0]));
    if (prefix) return prefix;
  }
  return null;
}

function speakInsight(text: string, lang: LangCode) {
  if (state.isVoiceMuted || !text) return;
  if (typeof window === "undefined" || !window.speechSynthesis) return;
  try {
    const synth = window.speechSynthesis;
    synth.cancel(); // zero-overlap: never stack utterances
    const u = new SpeechSynthesisUtterance(text);
    u.lang = LOCALE_MAP[lang][0];
    const voice = pickVoice(lang);
    if (voice) u.voice = voice;
    u.rate = 1.06;   // broadcast cadence
    u.pitch = 1.02;
    u.onend = () => emit({ isSpeaking: false });
    u.onerror = () => emit({ isSpeaking: false });
    emit({ isSpeaking: true, activeText: text.slice(0, 140), lang });
    synth.speak(u);
  } catch {
    emit({ isSpeaking: false });
  }
}

function stopSpeaking() {
  try {
    window.speechSynthesis?.cancel();
  } catch {
    /* noop */
  }
  emit({ isSpeaking: false, activeText: "" });
}

function speakAuto(text: string, lang: LangCode) {
  if (autoNarrationSuppressed) return;
  speakInsight(text, lang);
}

function setAutoNarrationSuppressed(next: boolean) {
  autoNarrationSuppressed = next;
}

function toggleMute() {
  const next = !state.isVoiceMuted;
  emit({ isVoiceMuted: next });
  if (next) stopSpeaking();
}

export function useSpeechController() {
  const snap = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const speak = useCallback((text: string, lang: LangCode) => speakInsight(text, lang), []);
  return {
    isSpeaking: snap.isSpeaking,
    activeText: snap.activeText,
    isVoiceMuted: snap.isVoiceMuted,
    lang: snap.lang,
    speakInsight: speak,
    speakAuto,
    setAutoNarrationSuppressed,
    stopSpeaking,
    toggleMute,
  };
}
