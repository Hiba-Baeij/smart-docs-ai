import { TestingModule } from '@nestjs/testing';
import { PrismaService } from './../src/prisma/prisma.service';
import { QUESTIONS } from './spike/corpus';
import {
  dropSpikeTable,
  prepareSpikeTable,
  rankTable,
  runSpike,
  summarise,
  summaryTable,
} from './spike/run-spike';
import { createPrismaTestModule } from './support/prisma-test-module';

/**
 * The Phase 5 search spike (ADR-004): the same 20 questions over the same 38 passages, run under
 * each search configuration. It prints the results table that is copied into the ADR, and it
 * asserts the decision, so a change that makes the chosen configuration worse is noticed.
 */
describe('Search configuration spike (e2e)', () => {
  let moduleRef: TestingModule;
  let prisma: PrismaService;

  beforeAll(async () => {
    ({ moduleRef, prisma } = await createPrismaTestModule());
    await prepareSpikeTable(prisma);
  });

  afterAll(async () => {
    await dropSpikeTable(prisma);
    await moduleRef.close();
  });

  it('runs every configuration and prints the evidence', async () => {
    const [{ available }] = await prisma.$queryRaw<{ available: boolean }[]>`
      SELECT EXISTS (SELECT 1 FROM pg_ts_config WHERE cfgname = 'arabic') AS available`;
    expect(available).toBe(true);

    const runs = await runSpike(prisma);
    const summaries = summarise(runs);

    console.log(`\n${summaryTable(summaries)}\n\n${rankTable(runs)}\n`);

    expect(runs).toHaveLength(15);
    expect(QUESTIONS).toHaveLength(23);
  });

  describe('the decision recorded in ADR-004', () => {
    let byRun: Record<string, ReturnType<typeof summarise>[number]>;

    beforeAll(async () => {
      const summaries = summarise(await runSpike(prisma));
      byRun = Object.fromEntries(summaries.map((s) => [s.run, s]));
    });

    it('the arabic configuration finds the answer in the top 6 for every question', () => {
      expect(byRun['C-or'].original.recallAt6).toBe(20);
      expect(byRun['C-or'].all.recallAt6).toBe(23);
      expect(byRun['C-or'].original.mrr).toBeGreaterThanOrEqual(0.9);
    });

    it('beats plain simple and the normaliser on simple, on both measures', () => {
      for (const weaker of ['A-or', 'D-or']) {
        expect(byRun['C-or'].original.recallAt6).toBeGreaterThan(
          byRun[weaker].original.recallAt6,
        );
        expect(byRun['C-or'].original.mrr).toBeGreaterThan(
          byRun[weaker].original.mrr,
        );
      }
    });

    it('the normaliser adds nothing measurable on top of arabic (so it is not in the index)', () => {
      // Within a few hundredths of MRR and the same recall: not worth a second column and a
      // function that both the write path and the read path must remember to call.
      expect(
        Math.abs(byRun['E-or'].original.mrr - byRun['C-or'].original.mrr),
      ).toBeLessThan(0.05);
      expect(byRun['E-or'].original.recallAt6).toBe(
        byRun['C-or'].original.recallAt6,
      );
    });

    it('requiring every word of a question to match finds almost nothing, in every configuration', () => {
      for (const config of ['A', 'B', 'C', 'D', 'E']) {
        expect(byRun[`${config}-naive`].original.recallAt6).toBeLessThanOrEqual(
          2,
        );
        expect(byRun[`${config}-or`].original.recallAt6).toBeGreaterThanOrEqual(
          18,
        );
      }
    });

    it('a normaliser used on one side only collapses recall on simple (the drill), and arabic masks it', () => {
      expect(byRun['Y-or'].original.recallAt6).toBeLessThan(
        byRun['D-or'].original.recallAt6 - 3,
      );
      expect(byRun['X-or'].original.recallAt6).toBe(
        byRun['E-or'].original.recallAt6,
      );
    });
  });
});
