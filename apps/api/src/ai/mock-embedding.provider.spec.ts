import { EMBEDDING_DIMENSIONS, toEmbeddingLiteral } from './embedding-provider';
import { mockVector } from './mock-embedding.provider';

const cosine = (a: number[], b: number[]) =>
  a.reduce((sum, value, i) => sum + value * b[i], 0);

describe('mock embeddings', () => {
  it('is deterministic, unit length and the stored size', () => {
    const v = mockVector('الإجازة السنوية للموظف');
    expect(v).toEqual(mockVector('الإجازة السنوية للموظف'));
    expect(v).toHaveLength(EMBEDDING_DIMENSIONS);
    expect(Math.hypot(...v)).toBeCloseTo(1);
    expect(() => toEmbeddingLiteral(v)).not.toThrow();
  });

  it('puts texts that share words closer than texts that share none', () => {
    const question = mockVector('remote work days');
    expect(
      cosine(question, mockVector('work remotely two days')),
    ).toBeGreaterThan(cosine(question, mockVector('sick leave report')));
    expect(cosine(question, mockVector('sick leave report'))).toBe(0);
  });

  it('gives an empty or stop-word-only text a valid vector', () => {
    expect(() => toEmbeddingLiteral(mockVector(''))).not.toThrow();
    expect(() => toEmbeddingLiteral(mockVector('ما هو'))).not.toThrow();
  });
});
