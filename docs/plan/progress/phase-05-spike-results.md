# Phase 5 search spike: results

Date: 2026-10-31. Decision and interpretation: `docs/architecture/decisions/ADR-004-full-text-search.md`
(Amendment). Reproduce with `npm run test:e2e -w api -- search-spike` (table printed to the console).

Corpus and questions: `apps/api/test/spike/corpus.ts`, 39 passages, 23 questions, all written by
Claude. Questions 1 to 20 were written before any run; 21 to 23 were added afterwards (marked in the
code). Runs: A `simple`; B `simple` + `unaccent`; C `arabic`; D `simple` + application normaliser;
E `arabic` + application normaliser; X and Y are E and D with the question left un-normalised (the
failure drill); T is trigram word similarity. Suffix `naive` = the question passed to
`websearch_to_tsquery` as typed (every word must match); `or` = stop words removed, content words
joined with `or`. "noise" is the average number of top-6 results that are not the expected passage.
A rank of `-` means the expected passage was not returned among the first 20.

## Summary

| run | Recall@6 (first 20) | MRR (first 20) | noise | no result | Recall@6 (all) | MRR (all) |
|---|---|---|---|---|---|---|
| A-naive | 1/20 | 0.050 | 0.00 | 19 | 1/23 | 0.043 |
| A-or | 18/20 | 0.875 | 2.00 | 2 | 20/23 | 0.848 |
| B-naive | 1/20 | 0.050 | 0.00 | 19 | 1/23 | 0.043 |
| B-or | 18/20 | 0.875 | 2.00 | 2 | 20/23 | 0.848 |
| C-naive | 2/20 | 0.100 | 0.05 | 18 | 2/23 | 0.087 |
| C-or | 20/20 | 0.925 | 3.15 | 0 | 23/23 | 0.935 |
| D-naive | 1/20 | 0.050 | 0.00 | 19 | 1/23 | 0.043 |
| D-or | 19/20 | 0.875 | 2.30 | 1 | 22/23 | 0.891 |
| E-naive | 2/20 | 0.100 | 0.00 | 18 | 2/23 | 0.087 |
| E-or | 20/20 | 0.942 | 3.15 | 0 | 23/23 | 0.949 |
| X-naive | 2/20 | 0.100 | 0.00 | 18 | 2/23 | 0.087 |
| X-or | 20/20 | 0.950 | 2.75 | 0 | 23/23 | 0.957 |
| Y-naive | 0/20 | 0.000 | 0.00 | 20 | 0/23 | 0.000 |
| Y-or | 14/20 | 0.650 | 1.20 | 6 | 17/23 | 0.645 |
| T-trigram | 20/20 | 0.975 | 1.75 | 0 | 23/23 | 0.978 |

## Rank of the expected passage, per question and run

| # | kind | question | expected | A-naive | A-or | B-naive | B-or | C-naive | C-or | D-naive | D-or | E-naive | E-or | X-naive | X-or | Y-naive | Y-or | T-trigram |
|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|---|
| 1 | exact | ما هي مدة الإجازة المرضية بأجر كامل؟ | ar-02 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | - | 2 | - | 1 | 1 |
| 2 | exact | ما هي ساعات العمل الرسمية؟ | ar-03 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | 1 |
| 3 | article | كم يوماً أستحق في الإجازة السنوية؟ | ar-01 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | - | - | 2 |
| 4 | spelling | كم تبلغ مده العقد وهل يتجدد؟ | ar-10 | - | 2 | - | 2 | - | 1 | - | 2 | - | 1 | - | 1 | - | 2 | 1 |
| 5 | article | متي يجب سداد الفواتير؟ | ar-07 | - | - | - | - | - | 2 | - | - | - | 2 | - | 2 | - | - | 1 |
| 6 | diacritics | كَمْ مُدَّةُ الضَّمَانِ عَلَى المُعَدَّاتِ؟ | ar-12 | - | - | - | - | - | 2 | - | 2 | - | 3 | - | 1 | - | - | 1 |
| 7 | exact | ما هي سياسة كلمة المرور؟ | ar-05 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | 1 |
| 8 | inflection | متى يتم تقييم أداء الموظفين؟ | ar-14 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | 1 |
| 9 | article | ما شروط الاستفادة من ميزانية التدريب؟ | ar-13 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | - | - | 1 |
| 10 | diacritics | كم يوما يسمح بالعمل عن بعد؟ | ar-04 | - | 1 | - | 1 | - | 1 | - | 2 | - | 1 | - | 1 | - | 2 | 1 |
| 11 | inflection | خلال كم ساعة يجب إبلاغ فريق الأمن بالحادث؟ | ar-15 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | 1 |
| 12 | exact | من يوافق على المشتريات التي تزيد عن عشرة آلاف ريال؟ | ar-08 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | 1 |
| 13 | short | غرامة التأخير | ar-07 | - | 1 | - | 1 | 1 | 1 | - | 1 | 1 | 1 | 1 | 1 | - | - | 1 |
| 14 | typo | كم مدة الاحتفاض بالسجلات المالية؟ | ar-26 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | 1 |
| 15 | mixed | كم تستمر التزامات NDA بعد انتهاء العلاقة؟ | ar-11 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | 1 |
| 16 | english | How long are financial records retained? | en-04 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | 1 |
| 17 | english | When must an expense report be submitted? | en-05 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | 1 |
| 18 | english | How often must passwords be changed? | en-02 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | 1 |
| 19 | english | What is the annual training budget? | en-10 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | 1 |
| 20 | short | إجازة سنوية | ar-01 | 1 | 1 | 1 | 1 | 1 | 2 | 1 | 1 | 1 | 1 | 1 | 1 | - | - | 1 |
| 21 | spelling | هل التقرير الطبي من مستشفي مقبول؟ | ar-02 | - | - | - | - | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | 1 |
| 22 | digits | كم يوماً أنتظر بعد التسليم لسداد المبلغ المتبقي؟ ٤٥ | ar-29 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | - | 2 | 1 |
| 23 | digits | متى يُسدَّد المبلغ المتبقي بعد ۴۵ يوماً؟ | ar-29 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | - | 1 | - | 3 | 1 |
