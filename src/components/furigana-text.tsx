"use client";

import React, { useMemo } from "react";
import { autoAnnotateFurigana } from "@/lib/furigana-dictionary";
import { lookupWord, N5_DICTIONARY, type WordMeaning } from "@/lib/word-dictionary";

export type FuriganaTextProps = {
  text?: string | null;
  japanese?: string | null;
  kana?: string | null;
  className?: string;
  autoFurigana?: boolean;
  mode?: "ruby" | "kanji-only" | "kana-only";
  style?: React.CSSProperties;
  enableTooltip?: boolean;
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

type SegmentToken = {
  type: "ruby" | "plain" | "text";
  kanji?: string;
  reading?: string;
  okurigana?: string;
  raw?: string;
  lookup: WordMeaning | null;
};

function segmentWithTooltips(annotated: string): SegmentToken[] {
  const rubyRegex = /\[([^\]]+)\]\{([^\}]+)\}/g;
  const tokens: SegmentToken[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;

  function pushPlainSegment(seg: string) {
    if (!seg) return;
    const wordRegex = /([ぁ-んァ-ヶー]+|[a-zA-Z0-9]+|[^\s\wぁ-んァ-ヶー\u4e00-\u9faf]+|\s+)/g;
    let m: RegExpExecArray | null;
    while ((m = wordRegex.exec(seg)) !== null) {
      const part = m[1];
      if (/^[ぁ-んァ-ヶー]+$/.test(part)) {
        let remaining = part;
        while (remaining.length > 0) {
          let matched = false;
          for (let len = remaining.length; len > 0; len--) {
            const sub = remaining.slice(0, len);
            const lookup = N5_DICTIONARY[sub] || (len > 1 ? lookupWord(sub) : null);
            if (lookup) {
              tokens.push({ type: "plain", raw: sub, lookup });
              remaining = remaining.slice(len);
              matched = true;
              break;
            }
          }
          if (!matched) {
            tokens.push({ type: "text", raw: remaining[0], lookup: null });
            remaining = remaining.slice(1);
          }
        }
      } else {
        tokens.push({ type: "text", raw: part, lookup: null });
      }
    }
  }

  while ((match = rubyRegex.exec(annotated)) !== null) {
    if (match.index > lastIndex) {
      pushPlainSegment(annotated.slice(lastIndex, match.index));
    }
    const kanji = match[1];
    const reading = match[2];
    const afterIndex = rubyRegex.lastIndex;

    const rest = annotated.slice(afterIndex);
    const okuriganaMatch = rest.match(/^[ぁ-ん]+/);
    let okurigana = "";
    let lookup: WordMeaning | null = null;

    if (okuriganaMatch) {
      const fullOkuri = okuriganaMatch[0];
      for (let len = fullOkuri.length; len > 0; len--) {
        const candidateOkuri = fullOkuri.slice(0, len);
        if (N5_DICTIONARY[kanji + candidateOkuri]) {
          okurigana = candidateOkuri;
          lookup = N5_DICTIONARY[kanji + candidateOkuri];
          break;
        }
      }
    }

    if (!lookup) {
      lookup = lookupWord(kanji) || lookupWord(reading);
    }

    tokens.push({
      type: "ruby",
      kanji,
      reading,
      okurigana,
      lookup,
    });

    if (okurigana) {
      rubyRegex.lastIndex += okurigana.length;
    }
    lastIndex = rubyRegex.lastIndex;
  }

  if (lastIndex < annotated.length) {
    pushPlainSegment(annotated.slice(lastIndex));
  }

  return tokens;
}

export function FuriganaText({
  text,
  japanese,
  kana,
  className = "",
  autoFurigana = true,
  mode = "ruby",
  style,
  enableTooltip = false,
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

    // Fast-path when tooltips are not enabled
    if (!enableTooltip) {
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
        if (mode === "kanji-only") {
          elements.push(kanji);
        } else if (mode === "kana-only") {
          elements.push(reading);
        } else {
          elements.push(
            <ruby key={`rb-${match.index}`} className="furigana-ruby">
              {kanji}
              <rp>(</rp>
              <rt className="furigana-rt">{reading}</rt>
              <rp>)</rp>
            </ruby>
          );
        }
        lastIndex = regex.lastIndex;
      }

      if (lastIndex < annotated.length) {
        elements.push(annotated.slice(lastIndex));
      }

      return elements;
    }

    // Interactive tooltip segmentation
    const tokens = segmentWithTooltips(annotated);
    return tokens.map((token, idx) => {
      let inner: React.ReactNode;
      let displayWord = "";

      if (token.type === "ruby") {
        displayWord = (token.kanji ?? "") + (token.okurigana ?? "");
        if (mode === "kanji-only") {
          inner = displayWord;
        } else if (mode === "kana-only") {
          inner = (token.reading ?? "") + (token.okurigana ?? "");
        } else {
          inner = (
            <>
              <ruby className="furigana-ruby">
                {token.kanji}
                <rp>(</rp>
                <rt className="furigana-rt">{token.reading}</rt>
                <rp>)</rp>
              </ruby>
              {token.okurigana}
            </>
          );
        }
      } else {
        displayWord = token.raw ?? "";
        inner = token.raw;
      }

      if (token.lookup) {
        return (
          <span
            key={`w-${idx}`}
            className="furigana-tooltip-wrap"
            aria-label={`${displayWord} (${token.lookup.kana}): ${token.lookup.meaning}`}
          >
            {inner}
            <span className="furigana-tooltip-popup" role="tooltip">
              <span className="furigana-tooltip-top">
                <span className="furigana-tooltip-jp">{displayWord}</span>
                {token.lookup.kana && token.lookup.kana !== displayWord && (
                  <span className="furigana-tooltip-reading">【{token.lookup.kana}】</span>
                )}
              </span>
              <span className="furigana-tooltip-meaning">{token.lookup.meaning}</span>
            </span>
          </span>
        );
      }

      return <React.Fragment key={`t-${idx}`}>{inner}</React.Fragment>;
    });
  }, [text, japanese, kana, autoFurigana, mode, enableTooltip]);

  return (
    <span className={`furigana-wrapper ${className}`.trim()} style={style} lang="ja">
      {content}
    </span>
  );
}
