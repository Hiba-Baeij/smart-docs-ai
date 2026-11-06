import { ProviderFailure } from './provider-failure';
import { isStopWord, tokenize } from '../search/query-terms';
import { GenerateInput, LlmProvider } from './llm-provider';

export type MockBehavior = 'answer' | 'no_evidence' | 'timeout' | 'error';

/** Deterministic local stand-in; its wording and overlap rule are not real model quality. */
export class MockLlmProvider implements LlmProvider {
  constructor(private readonly behavior: MockBehavior = 'answer') {}

  generate(input: GenerateInput): Promise<{ text: string }> {
    if (this.behavior === 'timeout')
      return Promise.reject(new ProviderFailure('AI_TIMEOUT', true));
    if (this.behavior === 'error')
      return Promise.reject(new ProviderFailure('AI_UNAVAILABLE', false));
    if (this.behavior === 'no_evidence')
      return Promise.resolve({ text: 'NO_EVIDENCE' });

    const question = input.messages.at(-1)?.content ?? '';
    const terms = tokenize(question)
      .filter((term) => !isStopWord(term))
      .map(canonical);
    const blocks = [
      ...input.system.matchAll(/\[S(\d+)\][^\n]*\n<<<\n([\s\S]*?)\n>>>/g),
    ];
    const options: { text: string; score: number }[] = [];
    for (const block of blocks) {
      const sentences = block[2].split(/(?<=[.!?؟])\s+/u);
      for (const sentence of sentences) {
        if (
          /ignore (all |the )?(previous|above|system) instructions|reveal (the )?system prompt|NO_EVIDENCE/i.test(
            sentence,
          )
        )
          continue;
        const words = new Set(tokenize(sentence).map(canonical));
        const overlap = new Set(terms.filter((term) => words.has(term))).size;
        if (overlap >= Math.min(2, terms.length) && overlap > 0) {
          const asksForDuration =
            /\b(period|when|duration|due|deadline)\b/i.test(question);
          const suppliesDuration =
            /\b(?:\d+|thirty|seven|fourteen)\s+(?:days|months|years)\b/i.test(
              sentence,
            );
          options.push({
            text: `${sentence.trim()} [S${block[1]}]`,
            score: overlap + (asksForDuration && suppliesDuration ? 10 : 0),
          });
        }
      }
    }
    options.sort((a, b) => b.score - a.score);
    return Promise.resolve({ text: options[0]?.text ?? 'NO_EVIDENCE' });
  }
}

function canonical(token: string): string {
  return token.replace(/s$/i, '').toLowerCase();
}
