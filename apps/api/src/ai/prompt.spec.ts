import { buildPrompt } from './prompt';

describe('buildPrompt', () => {
  it('labels untrusted evidence and limits history to the newest turns', () => {
    const result = buildPrompt({
      question: 'What is the term?',
      history: [
        { role: 'user', content: 'old' },
        { role: 'assistant', content: 'older answer' },
        { role: 'user', content: 'new' },
      ],
      historyLimit: 1,
      chunks: [
        {
          id: '1',
          documentId: 'd',
          documentName: 'contract.pdf',
          chunkIndex: 2,
          pageNumber: 3,
          sheetName: null,
          score: 1,
          content: 'The term is 30 days.',
        },
      ],
    });
    expect(result.system).toContain('NO_EVIDENCE');
    expect(result.system).toContain('untrusted');
    expect(result.messages).toEqual([
      { role: 'user', content: 'new' },
      { role: 'user', content: 'What is the term?' },
    ]);
    expect(result.system).toContain('[S1]\n<<<');
    expect(result.system).not.toContain('contract.pdf');
    expect(result.system).toContain('<<<\nThe term is 30 days.\n>>>');
    expect(result).toMatchSnapshot();
  });
});
