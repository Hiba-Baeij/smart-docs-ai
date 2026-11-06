import type { SourceReference } from '@smartdocs/contracts';
import type { Answer } from '../conversations/answer-step';

export const INSUFFICIENT_EVIDENCE_ANSWER =
  'ليس لدي معلومات كافية للإجابة عن سؤالك.';

const fallback = (): Answer => ({
  content: INSUFFICIENT_EVIDENCE_ANSWER,
  sources: [],
});

/** A sentinel anywhere as a whole token invalidates all provider text. */
export function policeAnswer(
  text: string,
  usedSources: SourceReference[],
): Answer {
  if (/(?<![\p{L}\p{N}_])NO_EVIDENCE(?![\p{L}\p{N}_])/iu.test(text)) {
    return fallback();
  }
  const cited = [...text.matchAll(/\[S(\d+)\]/g)].map((match) =>
    Number(match[1]),
  );
  if (
    cited.length === 0 ||
    cited.some((index) => index < 1 || index > usedSources.length)
  ) {
    return fallback();
  }
  return {
    content: text.trim(),
    sources: usedSources,
  };
}

export function noEvidenceAnswer(): Answer {
  return fallback();
}
