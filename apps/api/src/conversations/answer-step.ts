import type { SourceReference } from '@smartdocs/contracts';

export type AnswerInput = {
  userId: string;
  conversationId: string;
  question: string;
};

export type Answer = {
  content: string;
  sources: SourceReference[];
};

/**
 * The step that turns a question into an answer: retrieval, the evidence rule, and the model.
 * The message flow depends on this port so persistence and answer generation stay separate.
 */
export interface AnswerStep {
  answer(input: AnswerInput): Promise<Answer>;
}

export const ANSWER_STEP = Symbol('ANSWER_STEP');

/**
 * A deliberately failing implementation retained for failure-path tests.
 */
export class UnimplementedAnswerStep implements AnswerStep {
  answer(): Promise<Answer> {
    return Promise.reject(
      new Error('The answer step is implemented in Phase 8.'),
    );
  }
}
