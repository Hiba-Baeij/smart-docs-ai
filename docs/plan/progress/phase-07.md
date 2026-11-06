# Phase 7 — Conversations and Messages API

Date started: 2026-10-31
Date finished: 2026-10-31
Time spent: 1h 10m

## Predict (written before building)

Question: which endpoint is most likely to forget the owner filter, and why?

Provenance: **[me]** is my own wording; **[Claude]** is what Claude corrected or added.

**[me]** `GET /conversations`, because it is general and shows all the conversations.

**[Claude]** A reasonable guess, and the reason is right in spirit: a list is where "everything" is
the natural query. My correction is about which mistake is easy to make. In a list the owner is the
ONLY filter, so forgetting it is obvious the first time two users exist: everything appears. The
endpoint that forgets it more quietly is the one under a conversation id, `GET` or `POST
/conversations/:id/messages`: a `Message` row has no owner column, only a `conversationId`, so
`WHERE conversationId = :id` looks like a complete query, returns exactly what the test expects for
the owner, and is a data leak (an IDOR) for anyone who knows or guesses the id. The owner has to be
checked on the conversation first, and that is easy to leave out because the message query itself
"works". That is where I will look hardest, and it is why the matrix tests the foreign id against
the database, not only against the response.

## What I built

- Owner-scoped create, paginated list, message history, and deletion for conversations.
- Message-write service scaffolding: validates a trimmed question, persists it before the answer
  step, titles an untitled conversation from its first question, and touches `updatedAt` on both
  writes. The HTTP message route remains intentionally absent until Phase 8.
- Parameterised ownership checks and persistence/failure-drill coverage, including the database
  assertion that a foreign conversation receives no message and is never touched.

### Mutation checks

The earlier background process was not this project, so its claimed 22-mutation result could not
be recovered. I reran eight isolated, restored mutations against this workspace; each was killed
by its named e2e test:

- omit the list owner filter;
- reverse list ordering;
- advance the list-page offset by one page;
- omit the message-history ownership lookup;
- omit the delete owner filter;
- reject exactly 4,000 characters;
- count UTF-16 units rather than characters; and
- omit default title or the explicit conversation touch.

## Gate output

```
npm run test:e2e -w api -- --runTestsByPath test/conversations.e2e-spec.ts --verbose
24 passed

npm run test:e2e -w api -- --runTestsByPath test/ownership.e2e-spec.ts --verbose
17 passed

npm run test:e2e -w api -- --runTestsByPath test/send-message.e2e-spec.ts --verbose
22 passed

npm run test -w api -- conversation-title.spec.ts
8 passed

npm run typecheck -w api
npm run lint -w api
both exited successfully
```

## Failure drill

What I broke: attempted to send a question through `SendMessageService` to another user's
conversation.
What I expected: `CONVERSATION_NOT_FOUND`, no message row, no title/timestamp touch, and no call
to the answer step.
What actually happened: the e2e failure-drill test verifies exactly that state from the database.
Why: the question write first finds the conversation with both `id` and the authenticated `userId`
inside the same transaction.

## Explain back

Messages have no `userId`, so a message query cannot safely establish ownership itself. The
conversation is first looked up with `{ id, userId }`; only then may a query use its
`conversationId`. Deletion puts both fields in `deleteMany` for the same reason. The question is
committed before an answer is attempted, so a provider failure preserves the user's question but
cannot fabricate an assistant response.

## Where I was wrong

The reported background mutation processes belonged to `E:\Projects\matrix-pos`, not this
workspace. They were not evidence for Phase 7 and were not used as such.

## Open questions

## Next phase readiness

- [x] Gate commands run and seen
- [x] Failure drill observed
- [x] Explain-back answered
- [x] Traceability updated
- [x] Docs updated with anything that changed
