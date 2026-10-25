"use client";

/**
 * Text-to-speech utility for Japanese learners using Web Speech API
 */
export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function cleanJapaneseForSpeech(text: string): string {
  if (!text) return "";
  // Strip [kanji]{reading} formatting to just the kanji or reading
  return text
    .replace(/\[([^\]]+)\]\{([^\}]+)\}/g, "$1")
    .replace(/[～~]/g, "")
    .trim();
}

export function speakJapanese(text: string, rate: number = 0.9): void {
  if (!isSpeechSupported()) return;

  try {
    window.speechSynthesis.cancel();
    const clean = cleanJapaneseForSpeech(text);
    if (!clean) return;

    const utterance = new SpeechSynthesisUtterance(clean);
    utterance.lang = "ja-JP";
    utterance.rate = rate; // 0.85 - 0.9 is ideal for clarity in foreign language learners

    // Try finding an authentic Japanese voice if available
    const voices = window.speechSynthesis.getVoices();
    const jaVoice = voices.find(v => v.lang.startsWith("ja") || v.lang.includes("JP"));
    if (jaVoice) {
      utterance.voice = jaVoice;
    }

    window.speechSynthesis.speak(utterance);
  } catch (err) {
    console.warn("Speech synthesis error:", err);
  }
}
