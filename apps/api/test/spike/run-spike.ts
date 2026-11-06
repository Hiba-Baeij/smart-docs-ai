import { Prisma } from '../../src/generated/prisma/client';
import { PrismaService } from '../../src/prisma/prisma.service';
import { normalizeSearchText } from '../../src/search/normalize-search-text';
import { isStopWord, tokenize } from '../../src/search/query-terms';
import {
  ORIGINAL_QUESTION_COUNT,
  PASSAGES,
  QUESTIONS,
  Question,
} from './corpus';

/**
 * The four configurations of ADR-004 / docs/tracks/ai/03-retrieval-with-postgres.md section 6,
 * plus E (the stemmer on top of the normaliser) and T (trigram similarity), which the Predict
 * answer asked about. Each one says how a passage becomes a tsvector and how a question becomes
 * a tsquery; the corpus, the questions and the ranking are identical for all of them.
 */
type Config = {
  id: string;
  label: string;
  /** SQL for the tsvector of one passage; `p` is the passage row. Constants only, never user input. */
  vector: string;
  /** SQL for the tsquery; `$1` is the query text. */
  query: string;
  /** How the question text is prepared before it is bound to `$1`. */
  prepare: (text: string) => string;
};

const identity = (text: string) => text;

export const CONFIGS: Config[] = [
  {
    id: 'A',
    label: 'simple',
    vector: `to_tsvector('simple', p.content)`,
    query: `websearch_to_tsquery('simple', $1)`,
    prepare: identity,
  },
  {
    id: 'B',
    label: 'simple + unaccent',
    vector: `to_tsvector('simple', unaccent(p.content))`,
    query: `websearch_to_tsquery('simple', unaccent($1))`,
    prepare: identity,
  },
  {
    id: 'C',
    label: 'arabic stemmer',
    vector: `to_tsvector('arabic', p.content)`,
    query: `websearch_to_tsquery('arabic', $1)`,
    prepare: identity,
  },
  {
    id: 'D',
    label: 'simple + normaliser',
    vector: `to_tsvector('simple', p.normalized)`,
    query: `websearch_to_tsquery('simple', $1)`,
    prepare: normalizeSearchText,
  },
  {
    id: 'E',
    label: 'arabic stemmer + normaliser',
    vector: `to_tsvector('arabic', p.normalized)`,
    query: `websearch_to_tsquery('arabic', $1)`,
    prepare: normalizeSearchText,
  },
  {
    // The failure drill, kept in the table: the index holds normalised text, the question is NOT
    // normalised. Same data and same engine as E; only one side forgot the shared function.
    id: 'X',
    label: 'E with the question left un-normalised (deliberate mismatch)',
    vector: `to_tsvector('arabic', p.normalized)`,
    query: `websearch_to_tsquery('arabic', $1)`,
    prepare: identity,
  },
  {
    id: 'Y',
    label: 'D with the question left un-normalised (deliberate mismatch)',
    vector: `to_tsvector('simple', p.normalized)`,
    query: `websearch_to_tsquery('simple', $1)`,
    prepare: identity,
  },
];

/**
 * How the question becomes text for websearch_to_tsquery. `naive` passes it as typed, which is
 * what the retrieval guide's query does; websearch_to_tsquery then requires EVERY word to match.
 * `or` drops the stop words and requires ANY content word, ranking by how many match.
 */
export type QueryMode = 'naive' | 'or';

function queryText(question: string, mode: QueryMode): string {
  if (mode === 'naive') {
    return question;
  }
  return tokenize(question)
    .filter((token) => !isStopWord(token))
    .join(' or ');
}

export type RankedRun = {
  config: string;
  mode: QueryMode | 'trigram';
  /** For each question, the 1-based rank of the expected passage, or null if it was not returned. */
  ranks: (number | null)[];
  /** For each question, how many results came back at all (up to the limit). */
  returned: number[];
  /** For each question, the ids of the top 6. */
  top6: string[][];
};

const LIMIT = 20;

async function rankWithTsQuery(
  prisma: PrismaService,
  config: Config,
  question: Question,
  mode: QueryMode,
): Promise<string[]> {
  const text = queryText(config.prepare(question.text), mode);
  if (text.trim() === '') {
    return [];
  }
  // The expressions come from the constants above; the question text is a bound parameter.
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT p.id
       FROM spike_passage p
       CROSS JOIN LATERAL (SELECT ${config.query} AS q) query
       CROSS JOIN LATERAL (SELECT ${config.vector} AS v) vec
      WHERE vec.v @@ query.q
      ORDER BY ts_rank_cd(vec.v, query.q) DESC, p.id
      LIMIT ${LIMIT}`,
    text,
  );
  return rows.map((row) => row.id);
}

async function rankWithTrigrams(
  prisma: PrismaService,
  question: Question,
): Promise<string[]> {
  const terms = tokenize(question.text)
    .filter((token) => !isStopWord(token))
    .map(normalizeSearchText)
    .join(' ');
  const rows = await prisma.$queryRawUnsafe<{ id: string }[]>(
    `SELECT p.id
       FROM spike_passage p
      WHERE word_similarity($1, p.normalized) > 0.3
      ORDER BY word_similarity($1, p.normalized) DESC, p.id
      LIMIT ${LIMIT}`,
    terms,
  );
  return rows.map((row) => row.id);
}

export async function prepareSpikeTable(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS spike_passage');
  await prisma.$executeRawUnsafe(
    'CREATE TABLE spike_passage (id text PRIMARY KEY, content text NOT NULL, normalized text NOT NULL)',
  );
  for (const passage of PASSAGES) {
    await prisma.$executeRaw(
      Prisma.sql`INSERT INTO spike_passage (id, content, normalized)
                 VALUES (${passage.id}, ${passage.text}, ${normalizeSearchText(passage.text)})`,
    );
  }
}

export async function dropSpikeTable(prisma: PrismaService): Promise<void> {
  await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS spike_passage');
}

export async function runSpike(prisma: PrismaService): Promise<RankedRun[]> {
  const runs: RankedRun[] = [];

  const record = (
    config: string,
    mode: RankedRun['mode'],
    results: string[][],
  ): void => {
    runs.push({
      config,
      mode,
      ranks: results.map((ids, i) => {
        const at = ids.indexOf(QUESTIONS[i].expected);
        return at === -1 ? null : at + 1;
      }),
      returned: results.map((ids) => ids.length),
      top6: results.map((ids) => ids.slice(0, 6)),
    });
  };

  for (const config of CONFIGS) {
    for (const mode of ['naive', 'or'] as const) {
      const results: string[][] = [];
      for (const question of QUESTIONS) {
        results.push(await rankWithTsQuery(prisma, config, question, mode));
      }
      record(config.id, mode, results);
    }
  }

  const trigram: string[][] = [];
  for (const question of QUESTIONS) {
    trigram.push(await rankWithTrigrams(prisma, question));
  }
  record('T', 'trigram', trigram);

  return runs;
}

export type RunSummary = {
  run: string;
  /** Over the first ORIGINAL_QUESTION_COUNT questions, written before any run. */
  original: Metrics;
  /** Over every question, including those added after the first run. */
  all: Metrics;
};

type Metrics = {
  recallAt6: number;
  mrr: number;
  /** Average number of results in the top 6 that are not the expected passage. */
  noise: number;
  /** Questions that returned nothing at all. */
  empty: number;
  questions: number;
};

function metricsOf(run: RankedRun, questions: number): Metrics {
  const ranks = run.ranks.slice(0, questions);
  const mrr =
    ranks.reduce<number>((sum, rank) => sum + (rank ? 1 / rank : 0), 0) /
    questions;
  const noise =
    run.top6.slice(0, questions).reduce((sum, ids, i) => {
      return sum + ids.filter((id) => id !== QUESTIONS[i].expected).length;
    }, 0) / questions;
  return {
    recallAt6: ranks.filter((rank) => rank !== null && rank <= 6).length,
    mrr: Math.round(mrr * 1000) / 1000,
    noise: Math.round(noise * 100) / 100,
    empty: run.returned.slice(0, questions).filter((n) => n === 0).length,
    questions,
  };
}

export function summarise(runs: RankedRun[]): RunSummary[] {
  return runs.map((run) => ({
    run: `${run.config}-${run.mode}`,
    original: metricsOf(run, ORIGINAL_QUESTION_COUNT),
    all: metricsOf(run, QUESTIONS.length),
  }));
}

/** One row per question with the rank of the expected passage under every run (`-` = not returned). */
export function rankTable(runs: RankedRun[]): string {
  const header = `| # | kind | question | expected | ${runs.map((r) => `${r.config}-${r.mode}`).join(' | ')} |`;
  const divider = `|${'---|'.repeat(4 + runs.length)}`;
  const rows = QUESTIONS.map(
    (question, i) =>
      `| ${i + 1} | ${question.kind} | ${question.text} | ${question.expected} | ${runs
        .map((run) => (run.ranks[i] === null ? '-' : String(run.ranks[i])))
        .join(' | ')} |`,
  );
  return [header, divider, ...rows].join('\n');
}

export function summaryTable(summaries: RunSummary[]): string {
  const header =
    '| run | Recall@6 (first 20) | MRR (first 20) | noise | no result | Recall@6 (all) | MRR (all) |';
  const divider = '|---|---|---|---|---|---|---|';
  const rows = summaries.map(
    (s) =>
      `| ${s.run} | ${s.original.recallAt6}/${s.original.questions} | ${s.original.mrr.toFixed(3)} | ${s.original.noise.toFixed(2)} | ${s.original.empty} | ${s.all.recallAt6}/${s.all.questions} | ${s.all.mrr.toFixed(3)} |`,
  );
  return [header, divider, ...rows].join('\n');
}
