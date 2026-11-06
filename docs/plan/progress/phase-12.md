# Phase 12 — E2E and Docs Truth Pass

Date started: 2026-11-01
Date finished: 2026-11-02
Time spent: not tracked

## Predict

The cross-cutting architecture and integration guides are most likely to become stale: they
name modules, routes, and session transitions that changed across several phases. Compare
their diagrams and code sketches to the implemented modules and routes, and run the
documentation command, path, error-code, and traceability checks.

This prediction was recorded during the truth pass, not before implementation began.

## What was completed

- The browser journey starts from a recreated `smartdocs_e2e` database, registers, logs in,
  uploads a DOCX, gets a cited answer, gets the exact fallback without sources, signs out,
  and confirms `/chat` redirects to login.
- A temporary copy excluding dependencies and build output installed offline, generated
  its Prisma client from scratch, applied migrations, seeded local development data, and
  started both applications. The API health endpoint returned `{"status":"ok"}` and the
  login page returned HTTP 200. The temporary servers were stopped afterward.
- The traceability audit checked 42 FR/NFR rows. Its deliberately broken controls failed
  as expected. Indicative test names in the PRD test map were replaced with real files.
- The documentation pass corrected registration and guard flow, module names and layout,
  provider input, the evaluation test path, configuration wiring, and the statement of
  guarantees. The command/path/error-code audit checked the living documentation.
- NFR-12 exposed a real implementation gap: `LLM_TEMPERATURE` accepted 2 although the
  requirement caps it at 0.2. A failing validation test was added, the schema ceiling was
  changed to 0.2, and the test passed.

## Gate output

```text
npm run e2e                   1 passed (register through sign-out)
npm run audit:traceability    42 rows checked, 0 problems
npm run test:scripts          20 passed, 0 failed
npm run lint                  passed
npm run typecheck             passed
npm test                      API: 23 suites / 219 tests; web: 24 files / 270 tests
npm run test:e2e -w api       31 suites / 281 tests passed
npm run build                 API and web builds passed
fresh-copy startup           /api/health = {"status":"ok"}; /login = HTTP 200
```

An earlier browser run recorded a failure at the final `/chat` redirect after sign-out.
Two fresh full runs passed without an auth code change. The old artifact is not evidence
of a currently reproducible auth defect; its precise cause remains unknown.

## Failure drill

The traceability audit's control inputs cite a missing test, omit a test, and cite a
missing document. Each is expected to fail, while the real table passes. The new
temperature test failed with a value of `0.21` before the schema fix and passed after it.

## Explain back

1. **Byte to cited sentence.** Multer receives the upload in memory. Validation checks
   size, extension, MIME, and file signature. The extractor produces structured text;
   chunking assigns order and page/sheet metadata. A database transaction stores the
   extracted text and chunks and marks the document complete. A question is persisted,
   owner-scoped keyword search returns candidate chunks, and the evidence packer applies
   the token and source budgets. The prompt sends the packed excerpts, question, and recent
   history to the configured provider. Code accepts only citations to packed sources;
   otherwise it emits the fixed fallback with no sources. The assistant message is saved
   and Angular renders it as text with document source links.
2. **Three guarantees and one limit.** Owner-scoped data access, atomic document
   completion, and a cited answer or the exact fallback are enforced and tested. A cited
   answer is traceable, but not guaranteed factually true.
3. **Next bottleneck and seam.** Keyword retrieval quality on real Arabic and company
   documents is unmeasured. First evaluate it on the intended corpus; if recall is poor,
   a hybrid or semantic retriever can implement the existing `ChunkRetriever` port.
4. **First handoff rewrite.** The system overview had accumulated stale module names,
   route shapes, and provider data claims, so it was corrected first. A new engineer needs
   this map to find the real code and understand the data boundary.

## Reflection

I would keep the retrieval evaluation corpus close to actual customer documents earlier;
the synthetic corpus proves wiring, but not search quality. I would also define the
configuration bounds alongside the NFR test when the provider adapter is introduced so
the temperature gap cannot survive until the final audit.

## Remaining manual checks

The Phase 10 human screen-reader and visual contrast review is still pending. Automated
keyboard and labelled-control checks, plus the browser journey, do not replace that
review. A live provider's answer quality, pricing, and data handling also require an
operator-selected endpoint and real corpus; they are not claimed by this gate.
