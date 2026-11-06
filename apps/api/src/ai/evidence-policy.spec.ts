import { INSUFFICIENT_EVIDENCE_ANSWER, policeAnswer } from './evidence-policy';

describe('evidence policy', () => {
  it('maps a decorated sentinel to the exact Arabic fallback with no citations', () => {
    expect(
      policeAnswer('No_evidence\nI cannot tell.', [
        {
          documentId: 'd',
          documentName: 'x',
          chunkIndex: 0,
          pageNumber: null,
          sheetName: null,
        },
      ]),
    ).toEqual({ content: INSUFFICIENT_EVIDENCE_ANSWER, sources: [] });
  });

  it('keeps packed source positions so [S2] still resolves to the second source', () => {
    const sources = [0, 1].map((chunkIndex) => ({
      documentId: 'd',
      documentName: 'x',
      chunkIndex,
      pageNumber: null,
      sheetName: null,
    }));
    expect(policeAnswer('Thirty days [S2].', sources)).toEqual({
      content: 'Thirty days [S2].',
      sources,
    });
  });

  it('rejects an answer that cites no packed evidence', () => {
    expect(
      policeAnswer('Thirty days [S9].', [
        {
          documentId: 'd',
          documentName: 'x',
          chunkIndex: 0,
          pageNumber: null,
          sheetName: null,
        },
      ]),
    ).toEqual({ content: INSUFFICIENT_EVIDENCE_ANSWER, sources: [] });
  });
});
