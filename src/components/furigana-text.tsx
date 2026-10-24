"use client";

import React, { useMemo } from "react";
import { autoAnnotateFurigana } from "@/lib/furigana-dictionary";

export type FuriganaTextProps = {
  text?: string | null;
  japanese?: string | null;
  kana?: string | null;
  className?: string;
  autoFurigana?: boolean;
  style?: React.CSSProperties;
};

function alignWord(japanese: string, kana: string): string {
  if (!japanese || !kana || japanese === kana) return japanese;
  const cleanJp = japanese.replace(/^[～~]/, "").replace(/[\[\]]/g, "").trim();
  const cleanKana = kana.replace(/^[～~]/, "").replace(/[\[\]]/g, "").trim();
  if (!cleanJp || !cleanKana) return japanese;

  let start = 0;
  while (start < cleanJp.length && start < cleanKana.length && cleanJp[start] === cleanKana[start]) {
    start++;
  }
  let endJp = cleanJp.length - 1;
  let endKana = cleanKana.length - 1;
  while (endJp >= start && endKana >= start && cleanJp[endJp] === cleanKana[endKana]) {
    endJp--;
    endKana--;
  }

  const prefix = cleanJp.slice(0, start);
  const midJp = cleanJp.slice(start, endJp + 1);
  const midKana = cleanKana.slice(start, endKana + 1);
  const suffix = cleanJp.slice(endJp + 1);

  if (!midJp) return japanese;
  return (japanese.startsWith("～") ? "～" : "") + prefix + "[" + midJp + "]{" + midKana + "}" + suffix;
}

export function FuriganaText({
  text,
  japanese,
  kana,
  className = "",
  autoFurigana = true,
  style,
}: FuriganaTextProps) {
  const content = useMemo(() => {
    let raw = text ?? "";
    if (!raw && japanese) {
      if (kana && /[\u4e00-\u9faf]/.test(japanese)) {
        raw = alignWord(japanese, kana);
      } else {
        raw = japanese;
      }
    }
    if (!raw) return [];

    // Auto-annotate N5 Furigana if enabled and not already annotated
    const annotated = autoFurigana ? autoAnnotateFurigana(raw) : raw;

    // Parse [kanji]{reading} tokens
    const regex = /\[([^\]]+)\]\{([^\}]+)\}/g;
    const elements: React.ReactNode[] = [];
    let lastIndex = 0;
    let match: RegExpExecArray | null;

    while ((match = regex.exec(annotated)) !== null) {
      if (match.index > lastIndex) {
        elements.push(annotated.slice(lastIndex, match.index));
      }
      const kanji = match[1];
      const reading = match[2];
      elements.push(
        <ruby key={`rb-${match.index}`} className="furigana-ruby">
          {kanji}
          <rp>(</rp>
          <rt className="furigana-rt">{reading}</rt>
          <rp>)</rp>
        </ruby>
      );
      lastIndex = regex.lastIndex;
    }

    if (lastIndex < annotated.length) {
      elements.push(annotated.slice(lastIndex));
    }

    return elements;
  }, [text, japanese, kana, autoFurigana]);

  return (
    <span className={`furigana-wrapper ${className}`.trim()} style={style} lang="ja">
      {content}
    </span>
  );
}
