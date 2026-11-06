# Checkpoints

Status: reviewed
Related: `implementation-plan.md`, NFR-10
Verified against: not applicable

Two kinds of check per phase: a **predict** question answered before building, and
**explain-back** questions answered after the gate. Write answers in
`plan/progress/phase-NN.md`. If an answer is vague, the phase is not finished.

The predict questions are repeated here from the plan because this file is the checklist;
the plan is the instruction manual.

## Phase 0 — Foundations

**Predict:** If `packages/contracts` contains a function with a runtime dependency, what
breaks and when?

**Explain back:**
1. Why does the API refuse to boot with a missing `JWT_SECRET` instead of throwing on first
   login?
2. What exactly is a workspace in npm, and why is it not a monorepo tool?
3. Name the three trust zones and one rule that protects each boundary.

## Phase 1 — Schema

**Predict:** Deleting a user cascades to documents and conversations. What happens to a
conversation that cited a document deleted earlier?

**Explain back:**
1. Why is `(documentId, chunkIndex)` unique, and what bug does the constraint catch?
2. Why `findFirst({ where: { id, uploadedBy } })` instead of `findUnique` plus an `if`?
3. Which index does `WHERE "uploadedBy" = $1 ORDER BY "createdAt" DESC` use, and why?

## Phase 2 — Auth API

**Predict:** Which of these is a guard's job: rejecting a request with no cookie, or
rejecting a request for someone else's document? Why can it not be both?

**Explain back:**
1. What is in the JWT, and why is nothing else in it?
2. Why compare against a dummy hash when the email does not exist?
3. Why is `AUTH_REQUIRED` used for both expired and tampered tokens?
4. A user logs out. Which state changes, and which do not?

## Phase 3 — Auth UI

**Predict:** On a hard reload of `/documents/42`, list the exact order of: guard run,
`/auth/me` call, component creation, redirect decision.

**Explain back:**
1. Where is the token stored, and why can JavaScript not read it?
2. What stops `returnUrl` from becoming an open redirect?
3. Why does the error interceptor exclude `/auth/*`?
4. What does the route guard actually protect, given the API also checks?

## Phase 4 — Upload and Extraction

**Predict:** At which line does the first commit happen, and what would be lost if the whole
upload were one transaction?

**Explain back:**
1. Name the five validation steps in order and the code each returns.
2. Why must the magic-byte check inspect ZIP entry names for DOCX/XLSX?
3. What is the final state after extraction succeeds and the chunk insert fails?
4. Why is no original file written to disk, and what does that remove from the threat
   model?

## Phase 5 — Chunking and Search

**Predict:** Which search configuration do you expect to win for Arabic, and what evidence
would change your mind?

**Explain back:**
1. What does `to_tsvector('simple', ...)` do, and what does it deliberately not do?
2. Why must the write path and the query path share the same normaliser?
3. What do Recall@6 and MRR each tell you that the other does not?
4. Why is a 700-word chunk not automatically better than a 300-word chunk?

## Phase 6 — Documents

**Predict:** The list shows `status: PROCESSING` for a document from a crashed request. What
should the UI do, and what should the user be able to do about it?

**Explain back:**
1. How does `chunkCount` get into the list without an N+1 query?
2. Why does a failed delete show "not found" rather than "forbidden"?
3. Which four states does the list render, and in what precedence order?
4. User B logs in after user A in the same browser. What prevents A's rows from flashing?

## Phase 7 — Conversations

**Predict:** Which endpoint is most likely to forget the owner filter, and why?

**Explain back:**
1. Why is the user message committed before the answer is generated?
2. Which queries can return a conversation you do not own, and why can none of them?
3. What does deleting a conversation do to its messages, and which line guarantees it?
4. Why does `POST /conversations` reject a `userId` field instead of ignoring it?

## Phase 8 — RAG

**Predict:** A question is topically related to a document but the answer is absent. What
does retrieval return, what does the model return, and which line produces the final
sentence?

**Explain back:**
1. Why is the fallback emitted by code rather than by the model?
2. What is the difference between a retrieved chunk, packed evidence, and a cited source?
3. Why can a cited `[S5]` be a bug when only four chunks were packed?
4. What exactly does the injection defense guarantee, and what does it not?
5. Which failure is safer: a false refusal or a confident wrong answer? Why does the design
   prefer one?

## Phase 9 — Provider

**Predict:** A 429 arrives from the provider. Should the system retry, fail, or fall back?
Justify by what the user sees.

**Explain back:**
1. Why does the adapter not retry internally?
2. Which information must never appear in a provider log line?
3. How is cost per question computed, and which term dominates?
4. What would change if the provider were replaced tomorrow?

## Phase 10 — Chat UI

**Predict:** The user switches conversation while an answer is in flight. What must the store
do with the late response, and what would happen if it did not?

**Explain back:**
1. Why is the user message rendered optimistically, and how is a failure handled?
2. Why is auto-scroll conditional?
3. What does a source chip do when the cited document was deleted?
4. Which state is rendered while waiting, and why is an empty state wrong there?

## Phase 11 — Hardening

**Predict:** Which of the fourteen threats is most likely to be partially mitigated in this
codebase, and what would prove it?

**Explain back:**
1. What does `SameSite=Lax` prevent, and what does it not prevent?
2. Why is a redaction test more valuable than careful logging code?
3. Where could a secret leak even if it is not in source control?
4. Which existing control would fail first if uploads were moved to a queue?

## Phase 12 — Truth Pass

**Predict:** Which document is most likely to be stale after twelve phases, and how will you
detect it?

**Explain back:**
1. Walk from an uploaded byte to a cited sentence without opening the code.
2. Name the three guarantees this system actually makes, and one it does not.
3. Which deferred feature is the next real bottleneck, and what is its seam?
4. If you had to hand this project to another engineer, which document would you rewrite
   first and why?
