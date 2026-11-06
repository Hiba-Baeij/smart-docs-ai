# Phase 6 — Documents API and UI

Date started: 2026-10-31
Date finished: 2026-10-31
Time spent:

## Predict (written before building)

Question: the list shows `status: PROCESSING` for a document from a crashed request. What should
the UI do, and what should the user be able to do about it?

Provenance: **[me]** is my own wording; **[Claude]** is what Claude corrected or added.

**[me]** The error message that was sent should be shown so the user knows what is wrong with the
file: it may be corrupted, or empty, or larger than the allowed size, or its format does not allow
us to upload it.

**[Claude]** Right idea, and it applies to most failures, but it answers a slightly different
question. Missing or to correct:
1. A crashed request leaves `PROCESSING` with `errorCode: null`: there is no message to show, because
   nothing was ever recorded. The messages you list belong to other states: a file that is too
   large, empty or of an unsupported type is rejected at upload time and creates no row, so its
   message appears in the upload response; a corrupted or text-less file becomes a `FAILED` row with
   an `errorCode` the list can turn into a sentence.
2. The upload is synchronous, so a row that is still `PROCESSING` long after the 30-second budget is
   not running any more. The UI cannot know it crashed, but it can know it is old: after a few
   minutes it should stop saying "processing" and say it did not finish.
3. What the user can do: delete it, and upload the file again. There is no retry and no background
   job in v1, so nothing else is possible, and the UI must not leave them waiting on a spinner.

**Result [Claude]:** built as point 2 and 3 say (a `PROCESSING` row older than three minutes reads
"Did not finish" with "Delete it and upload the file again"), and as your answer says for the rest
(each upload failure and each stored failure has its own sentence, chosen by the error code).

## What I built

- **6.1 List.** `GET /api/documents?page&pageSize&status`: owner from the session, newest first (the
  id breaks ties so pages never overlap), `chunkCount` from `_count` in the same query, page size 1 to
  100, an unknown field such as `userId` is a 422. A page past the end is an empty page that echoes
  the page asked for.
- **6.2 Detail.** `GET /api/documents/:id`: `findFirst({ id, uploadedBy })`, then the chunks'
  previews cut to 200 characters inside the database (`left(content, 200)`) instead of shipping every
  chunk's full text. A foreign id, a missing id and a malformed id are the same 404 body.
- **6.3 Delete.** `DELETE /api/documents/:id`: one `deleteMany({ id, uploadedBy })` in a transaction,
  zero rows is a 404, chunks go by the foreign key cascade (proved through the API: 0 chunks after
  the 204, and other documents untouched).
- Contracts gained `DocumentDetail` and `ChunkPreview`. `PrismaService` now emits query events
  (ignored unless something listens) so a test can count statements.
- **6.4 `DocumentsStore`** (`features/documents/documents.store.ts`): signals, status
  `idle | loading | ready | error` and a computed `view` with the four screen states; it knows the
  owner of what it holds and exposes nothing for anyone else; late answers are dropped; a page past
  the end steps back to the last page (with a guard against looping).
- **6.5 List page**, **6.6 upload**, **6.7 detail page**, and the shared `ErrorBanner`,
  `EmptyState`, `StatusBadge`, a `userMessage(error)` mapping by error code, and
  `documentState(doc, now)` (processing / stalled / completed / failed). The upload shows upload
  progress, then "processing" (a different wait, with no percentage), disables itself while pending,
  clears the input in both outcomes, and says what is wrong with the file in words. The detail page
  shows extracted text as text (cut at 5,000 characters with "Show all"), the chunk list with page or
  sheet, delete with an inline confirmation, and a calm not-found screen.
- Tests: `documents-manage.e2e-spec.ts` (29), `documents.api.spec.ts` (6), `user-message.spec.ts`,
  `document-state.spec.ts`, `documents.store.spec.ts` (23), `shared-components.spec.ts` (9),
  `document-upload.spec.ts` (22, with synthetic progress events), `documents-page.spec.ts` (16),
  `document-detail.spec.ts` (23). `app.routes.spec.ts` was updated: it had relied on the placeholder
  page ("Document 42").

### Mutation checks, each confirmed applied

- **API (11 mutations):** list ignoring the owner → 2 failures; oldest first → 1; wrong page offset → 6;
  a count query per row (N+1) → 1 (the statement-count test); detail ignoring the owner → 1; preview
  not cut → 1; delete ignoring the owner → 1; delete never answering 404 → 2; status filter ignored →
  1; page size not capped → 1; chunks in the wrong order → 2. None survived.
- **Store (11):** rows not guarded by the owner → 1; effect not forgetting the old user → 1; late
  answers not dropped → 1; empty shown before the answer → 4; error not taking precedence → 3; no step
  back from a page past the end → 1; step back that can loop → the suite crashed; forget not lowering
  the total → 1; ticket taken before the owner reset (my earlier real bug, reintroduced) → 24.
  Two survived at first: "owner not part of the staleness check" (still survives: the ticket and the
  owner guard each cover it, defence in depth) and "clear keeps the page", which exposed a real bug (see
  "Where I was wrong"); it is fixed and now fails 1 test when reintroduced.
- **Components (17):** upload guard, processing phase, input not cleared, settled not emitted, server
  wording shown (9 failures), subscription outliving the component, old error kept → all caught
  (1 to 9). Detail: late answer, 404 as an error, delete 404 as a failure (3), list not told, text never
  cut → caught; "double delete not guarded" survived because the button is disabled, so I added a test
  that calls the handler twice (now caught). Page: refresh instead of page 1, stalled rows without a
  note, Previous never disabled, name as `innerHTML` (the XSS check) → caught.

## Gate output

Run 2026-10-31 on the final code; database `smartdocs_test` for the e2e:

```
npm run lint        All files pass linting.
npm run typecheck   0 errors
npm test            api: Test Suites: 14 passed   Tests: 180 passed
                    web: Test Files 22 passed     Tests: 257 passed
npm run test:e2e -w api
                    Test Suites: 23 passed, 23 total   Tests: 194 passed, 194 total
npm run build       Application bundle generation complete.
```

Manual journey, in the in-app browser against the real API and database (a throwaway user, the
files served from the fixtures folder and attached to the real file input): uploaded the PDF, the XLSX
and the DOCX (each "was uploaded", list refreshed, status Ready, chunks 1 / 2 / 1); a scanned PDF showed
the upload error with the support reference and a Failed row with its sentence; opened the workbook's
page (extracted text, two chunks with "Sheet Q3 Budget" and "Sheet Deadlines"); deleted the DOCX through
the page (confirmation, back to the list, row gone).

## Failure drill

| What I broke | I expected | What actually happened |
|---|---|---|
| The workbook's detail page open; the same document deleted from "a second tab" (a `DELETE` straight to the API); then I pressed Delete and confirmed in the first | a 404 handled calmly, not a crash | the page switched to "This document was already deleted, so there is nothing more to do here." with a way back; no error banner, no failure box, no delete button left to press; the list no longer showed it |
| User A signed out and user B signed in through the real forms, no page reload; the page sampled every 40 ms from the sign-in click | none of A's rows ever on screen | none seen in 12 samples; B's list showed the empty state |

Why the first is not a crash: the delete's goal was "this document gone", and it is. The API answers
404 for "not yours", "never existed" and "already deleted" alike, so the page cannot and should not
tell them apart; showing an error or a retry would invite the person to press a button that can
never work. The store also forgets the id so the list does not show a ghost.

## Explain back

Provenance for this whole section: I asked Claude to write these answers. They are
**[Claude, at my request]**, not my own words, and they have not been checked against my own
understanding. My own attempt at the Predict question is in the Predict section.

1. How does `chunkCount` get into the list without an N+1 query?

   **[Claude, at my request]** The list query asks Prisma for `_count: { select: { chunks: true } }`
   in the same `findMany` that fetches the page, so the database computes each document's count in
   that one statement; there is no second query per row. An N+1 would be a loop that, for each of 20
   documents, asks "how many chunks?" (1 + 20 queries). It is tested, not assumed: a test counts the
   SELECT statements the endpoint issues with 3 documents and again with 20 and requires the same
   number, and replacing `_count` with a per-row count makes that test fail.

2. Why does a failed delete show "not found" rather than "forbidden"?

   **[Claude, at my request]** Because the delete is `deleteMany({ id, uploadedBy })`: another user's
   document, a document that never existed and one already deleted all match zero rows, and the API
   cannot (and should not) tell them apart. "Forbidden" would confirm that the id exists and belongs
   to someone, which lets a stranger probe for valid ids, so ownership is part of the lookup and every
   miss is the same 404 with the same body (asserted). In the UI, a 404 on delete is the person's own
   goal already reached, so the page says it was already deleted instead of showing an error.

3. Which four states does the list render, and in what precedence order?

   **[Claude, at my request]** Error, loading, empty, data, in that order. Error comes first because a
   failed request must not hide behind whatever else the screen could say. Loading comes before empty
   because "you have no documents" is only true after the answer arrived; showing it while the request
   is in flight teaches the person the app is broken, so a store that was never asked counts as loading
   too (its status `idle` maps to loading). Empty beats data only because data means at least one row.
   The store computes this as one `view` value, so the page cannot invent a fifth state.

4. User B logs in after user A in the same browser. What prevents A's rows from flashing?

   **[Claude, at my request]** The store remembers whose rows it holds and exposes nothing unless that
   owner is the signed-in user, so the moment the session changes, `items` is empty, before any effect
   runs and before B's request exists (tested synchronously). An effect then clears A's rows from
   memory too, a request ticket drops a late answer to A's request, and the first load for the new user
   starts at page 1, not at A's page. I also watched it in the real browser: sign out, sign in as
   another user without reloading, the list sampled every 40 ms, never showing A's documents.

## Where I was wrong

- **[Claude]** My own store test crashed the test worker (exit code 134). The test asked for page 3
  of a 41-document list and called it "past the end", but 41 documents are three pages, so the store
  asked for page 3 again, forever. Two mistakes: a wrong test case, and no loop guard in the code. The
  store now steps back only when the last page is really before the requested one, and a test proves
  it does not loop on a server that keeps answering an empty page.
- **[Claude]** A real bug, found only because I mutated the code beyond what the tests demanded:
  `load(page = this._page())` evaluated its default before the owner check, so after a user switch
  the new user opened the list on the previous user's page (page 3 of their own documents). The page
  accessor hid it from the tests. Fixed (the parameter is resolved after the owner check) and the
  angular guide records it.
- **[Claude]** An earlier real bug of mine, caught by the store tests the first time they ran: the
  request ticket was taken before the owner reset, and the reset incremented it, so the store ignored
  its own answer. The mutation that reintroduces it fails 24 tests.
- **[Claude]** Two of my tests passed for the wrong reason until I mutated the code: the delete
  double-click guard (the button was disabled anyway) and the page-reset default.
- **[Claude]** Tooling: the preview server named `dev` sets `PORT`, which made the Angular dev server
  and the API fight for port 3000, so I ran the API and the web server separately; my first browser
  screenshot was taken before Angular rendered and looked blank, which I checked in the DOM before
  assuming anything; the shell quoting that mangles backslashes broke a helper script once more, and I
  rewrote it with the file tool.
- The plan's gate says `npm run test -w apps/web`; the workspace is named `web` here.

## Open questions

- **The detail page ships the whole extracted text** (up to 2,000,000 characters, about 4 MB of
  JSON) because the contract says so. The page shows 5,000 characters until asked; a paged or
  on-demand text endpoint would be better if documents are large.
- **No client-side check of size or extension.** The limit lives only on the server, so a 12 MB file
  is sent before it is refused (the message is right, the bandwidth is wasted). Exposing the limit to
  the client would remove the wait, at the cost of one more thing that can drift.
- **The "did not finish" threshold (3 minutes) is a constant in the web app** that mirrors the
  server's 30-second budget; nothing links the two. If the budget changes, change it too.
- The API supports filtering by status; the list page has no filter control yet.
- Left in the development database: two throwaway users from the browser journey
  (`phase6-browser@example.com`, `phase6-second@example.com`) and the documents of the first one, plus
  the users from earlier drills. I did not delete them; deleting needs your word.

## Next phase readiness

- [x] Gate commands run and seen
- [x] Failure drill observed (in the real browser)
- [x] Explain-back filled (by Claude at my request, not verified as my own understanding)
- [x] Traceability updated (FR-13, FR-14, FR-15, FR-29, FR-30 name the real tests)
- [x] Docs updated with anything that changed (angular state guide "As built", contracts)
