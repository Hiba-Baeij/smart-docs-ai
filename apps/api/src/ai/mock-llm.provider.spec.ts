import { MockLlmProvider } from './mock-llm.provider';

const prompt = (evidence: string, question = 'When are invoices paid?') => ({
  system: `EVIDENCE:\n[S1] file: handbook.pdf\n<<<\n${evidence}\n>>>`,
  messages: [{ role: 'user' as const, content: question }],
  temperature: 0.2,
  maxTokens: 700,
  timeoutMs: 1000,
});

describe('MockLlmProvider', () => {
  it('answers a supported question with a valid source marker', async () => {
    const provider = new MockLlmProvider();
    expect(
      (await provider.generate(prompt('Invoices are paid within thirty days.')))
        .text,
    ).toBe('Invoices are paid within thirty days. [S1]');
  });

  it('refuses adjacent evidence that does not answer the question', async () => {
    const provider = new MockLlmProvider();
    expect(
      (
        await provider.generate(
          prompt(
            'Invoices are paid within thirty days.',
            'What is the invoice tax rate?',
          ),
        )
      ).text,
    ).toBe('NO_EVIDENCE');
  });

  it('prefers the sentence with the requested period across two evidence blocks', async () => {
    const provider = new MockLlmProvider();
    const input = prompt(
      'Codepair0 cancellation applies to every account.',
      'What is codepair0 cancellation period?',
    );
    input.system +=
      '\n[S2] file: policy.pdf\n<<<\nCodepair0 period is 30 days.\n>>>';
    expect((await provider.generate(input)).text).toBe(
      'Codepair0 period is 30 days. [S2]',
    );
  });

  it('supports scripted sentinel, timeout and error without a network call', async () => {
    expect(
      (
        await new MockLlmProvider('no_evidence').generate(
          prompt('Invoices are paid within thirty days.'),
        )
      ).text,
    ).toBe('NO_EVIDENCE');
    await expect(
      new MockLlmProvider('timeout').generate(prompt('a')),
    ).rejects.toMatchObject({ code: 'AI_TIMEOUT' });
    await expect(
      new MockLlmProvider('error').generate(prompt('a')),
    ).rejects.toMatchObject({ code: 'AI_UNAVAILABLE' });
  });
});
