# SmartDocs AI

[![CI](https://github.com/Hiba-Baeij/smart-docs-ai/actions/workflows/ci.yml/badge.svg)](https://github.com/Hiba-Baeij/smart-docs-ai/actions/workflows/ci.yml)

A single-company application for asking questions about your own documents. You upload PDF, Word
(.docx) or Excel (.xlsx) files, ask a question, and get an answer built **only** from those files,
with the sources it came from, or, when the files do not contain the answer, exactly this sentence
and nothing else:

> ليس لدي معلومات كافية للإجابة عن سؤالك.

Stack: Angular 22 (standalone, signals) · NestJS 11 · PostgreSQL 17 with Prisma 7 · an `LlmProvider`
port with a deterministic mock and one OpenAI-compatible adapter. npm workspaces: `apps/api`,
`apps/web`, `packages/contracts` (the types shared by both).

## Features

- Upload PDF, Word and Excel files; text is extracted and split into chunks in one transaction.
- **Hybrid retrieval**: PostgreSQL full-text search (Arabic configuration) combined with vector
  similarity over chunk embeddings, so synonyms and cross-language questions still find the passage
  (ADR-018).
- Answers cite their sources; with no evidence, the answer is the fixed fallback sentence above.
- Each user sees only their own documents and conversations.
- Arabic and English UI (RTL/LTR), light and dark themes.
- Unit, API integration and browser (Playwright) tests.

## Run it

You need Node 24 (npm 11), Docker Desktop, and Google Chrome (only for the browser test).

```bash
docker compose up -d db                 # PostgreSQL on 127.0.0.1:5433
npm install
cp .env.example apps/api/.env           # then give it a JWT secret (next command)
node -e "const fs=require('fs');const p='apps/api/.env';fs.writeFileSync(p,fs.readFileSync(p,'utf8').replace(/^JWT_SECRET=.*$/m,'JWT_SECRET='+require('crypto').randomBytes(32).toString('hex')))"
npm run db:generate -w apps/api         # the Prisma client is generated, not committed
npm run db:migrate -w apps/api
npm run db:seed -w apps/api             # optional: a dev user and two sample documents
npm run db:embed -w apps/api            # optional: add embeddings to existing chunks
npm run dev                             # API and web together
```

The API is on `http://localhost:3000` (`/api/health` answers `{"status":"ok"}`) and the web app on
`http://localhost:4200`. With `LLM_PROVIDER=mock`, the default, no key is needed: the mock picks a
sentence from the retrieved passages, which proves the plumbing and is **not** a measure of how a real
model answers. To use a real model, set `LLM_PROVIDER=openai`, `LLM_BASE_URL`, `LLM_MODEL` and
`LLM_API_KEY` in `apps/api/.env`; the key lives only there and never reaches the browser.

Every command, and every environment variable, is explained in `docs/ops/commands.md` and
`docs/ops/local-setup.md`.

## Check it

```bash
npm run lint && npm run typecheck
npm test                                # unit tests of the API and the web app
npm run test:e2e -w api                 # API integration tests against smartdocs_test
npm run build && npm run test:scripts   # also scans the built bundle for secrets, audits the docs
npm run e2e                             # one browser journey, from an empty database
```

`npm run e2e` starts its own API (port 3100), web server (port 4300) and database (`smartdocs_e2e`,
recreated every run), so it can run next to the development servers and never touches their data.

## What this system guarantees, and what it does not

It guarantees three things, each enforced in code and covered by a test that fails if the code is
changed:

1. **Privacy between users.** Every query that reads or changes a document or a conversation carries
   the owner taken from the session. Another user's id answers `404`, never `403`, so ids cannot be
   probed, and a client-supplied `userId` is rejected, not ignored (`ownership.e2e-spec.ts`).
2. **A cited answer or the exact fallback.** An answer is returned only if it cites passages that were
   actually given to the model; otherwise the answer is the fixed sentence above with no sources.
   Passages come only from the asking user's finished documents (`evidence-policy.spec.ts`,
   `chat-provider.e2e-spec.ts`, the browser journey).
3. **An upload is complete or it is nothing.** A document is `COMPLETED` exactly when its text and all
   of its chunks were stored in one transaction; any failure leaves `FAILED` with an error code and zero
   chunks, and the original file is never written to disk (`documents-chunking.e2e-spec.ts`,
   `documents-failures.e2e-spec.ts`).

It does **not** guarantee that an answer is true. A model can misread or over-summarise the passage it
cites; the system makes the answer traceable to a passage, not correct. Without an
`EMBEDDING_MODEL`, search is by keywords only: a question that shares no word with the right passage
will not find it, and a paraphrase will be refused.

## Known limitations

- **Search quality was measured on a corpus written for the purpose**, not on real documents
  (`docs/architecture/decisions/ADR-004-full-text-search.md`). Repeat the measurement on yours.
- **No OCR**: a scanned PDF fails with a message that says so.
- **Vector search is an exact scan** over a `real[]` column (no pgvector index), fine at this size.
  The keyword side uses PostgreSQL's `arabic` configuration, whose stemmer has quirks (a bare word
  starting with ف does not match the same word with the article).
- **One instance only**: rate-limit counters live in the process. Document parsers run in the API
  process, and a parser that overruns its 30-second budget is abandoned, not cancelled.
- **Sessions**: a stateless one-hour cookie. Signing out clears it, but a copied token stays valid until
  it expires; there is no revocation list. No Content-Security-Policy header yet.
- **A document left `PROCESSING` by a crash** is shown as "did not finish" after three minutes and has
  to be deleted and uploaded again; nothing cleans it up.
- Files are limited to 10 MB and 2,000,000 characters of extracted text. The detail page loads a
  document's whole text.
- Dependency advisories change over time; run `npm audit` and `npm audit --omit=dev` for the
  current picture. Multer 2.5.0 is pinned
  through a direct dependency because npm 11 did not honour an `overrides` entry for it
  (`docs/plan/progress/phase-04.md`); `npm ls` therefore prints a harmless "invalid" for it.
- Keyboard and screen-reader use of the chat page has not been checked by a person; the browser journey
  uses labelled controls and the keyboard to send, which is not the same thing.

## Where to read next

`docs/README.md` is the map: the requirements (`docs/product/PRD.md`), the architecture and its
decisions (`docs/architecture/`), the three teaching tracks (`docs/tracks/`), the contracts between the
API and the web app (`docs/integration/`), and the build log of every phase with its predictions,
mistakes and measurements (`docs/plan/progress/`).
