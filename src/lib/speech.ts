"use client";

/**
 * Text-to-speech utility for Japanese learners using Web Speech API
 */
export function isSpeechSupported(): boolean {
  return typeof window !== "undefined" && "speechSynthesis" in window;
}

export function cleanJapaneseForSpeech(text: string): string {
  if (!text) return "";
  return text
    .replace(/\([^\)]*[a-zA-Zà-ỹÀ-Ỹ][^\)]*\)/g, " ") // Any inner Vietnamese parens e.g. (hút)
    .replace(/\[([^\]]+)\]\{([^\}]+)\}/g, "$1") // Strip [kanji]{reading} formatting
    .replace(/[_＿]+/g, " ") // Underscores / blanks
    .replace(/[（(][\s　]*[)）]/g, " ") // Empty parens
    .replace(/[～~]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/**
 * Extracts only the Japanese sentences or words from a prompt containing Vietnamese instructions.
 */
export function extractJapaneseForSpeech(text: string): string {
  if (!text) return "";

  // 1. If text has Japanese quotes 「...」 or 『...』, extract all quoted Japanese text
  const quotes = Array.from(text.matchAll(/[「『]([^」』]+)[」』]/g));
  if (quotes.length > 0) {
    const combined = quotes.map(m => m[1]).join(" ");
    return cleanJapaneseForSpeech(combined);
  }

  // 2. Strip Vietnamese translations in parentheses, e.g. "(Anh/Chị Miller là nhân viên...)"
  let cleaned = text.replace(/\([^\)]*[a-zA-Zà-ỹÀ-Ỹ][^\)]*\)/g, " ");

  // 3. If there is a colon (e.g. "Chọn đáp án đúng: わたし..."), take the Japanese side
  if (cleaned.includes(":") || cleaned.includes("：")) {
    const parts = cleaned.split(/[:：]/);
    const jpPart = parts.find(p => /[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(p));
    if (jpPart) {
      cleaned = jpPart;
    }
  }

  // 4. Strip any remaining Latin/Vietnamese words (e.g. "A:", "B:", "Hoàn thành câu", etc.)
  cleaned = cleaned.replace(/[a-zA-Zà-ỹÀ-Ỹ]+/g, " ");

  const result = cleanJapaneseForSpeech(cleaned);
  // If no Japanese characters remain, return empty string so TTS does not speak punctuation
  if (!/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(result)) {
    return "";
  }
  return result;
}

export function speakJapanese(text: string, rate: number = 0.9): void {
  if (!isSpeechSupported()) return;

  try {
    window.speechSynthesis.cancel();
    // If text contains mixed Vietnamese words, extract only the Japanese parts
    const clean = /[a-zA-Zà-ỹÀ-Ỹ]/.test(text) ? extractJapaneseForSpeech(text) : cleanJapaneseForSpeech(text);
    if (!clean || !/[\u3040-\u30ff\u3400-\u4dbf\u4e00-\u9fff]/.test(clean)) return;

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
