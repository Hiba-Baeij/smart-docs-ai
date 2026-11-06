# Phase 10 — Chat UI

Date: 2026-11-01

## Prediction

A response to conversation A can arrive after the user opens B. The store keeps threads and
drafts by conversation id; the visible thread is selected by id. Late history responses are
dropped when their selection ticket is stale, while a completed send for A updates only A.

## Implementation

- Protected `/chat` route and shell navigation.
- Conversation list with create, select, delete confirmation, server order, and pagination.
- Thread with history pagination, optimistic questions, pending state, assistant responses,
  failure bubble, retry, and draft preservation. A failed request may already have saved the
  user question server-side, and the UI says so.
- Source links use Angular text interpolation; a 404 document check turns a chip into plain
  unavailable text. No model content is rendered as HTML.
- Composer uses Enter to send and Shift+Enter for a newline. Drafts are keyed by conversation.
  Focus returns to the composer after a send. Scrolling is conditional on being near the bottom.
- Thread has `role="log"`, `aria-live="polite"`; errors use `role="alert"`; controls have
  labels and visible focus styles.

## Verification

- Web tests: **24 files, 270 tests passed**. New tests cover optimistic replacement, retry,
  late replies, stale history, account isolation, conversation actions, fallback without sources,
  deleted sources, escaped content, keyboard send, focus, failure, and separate drafts.
- Web typecheck, lint, and production build passed.
- The network-disconnect failure drill is represented by a status-0 HTTP response in the
  component test: the question remains in the composer and failed bubble, retry is offered,
  and pending state ends. The API contract says the server might have persisted the question
  before the connection failed, so retry may create a second user message.

## Manual gate still pending

The live browser journey with an answerable and an unanswerable question, real scroll behavior,
keyboard and screen reader checks, and visual contrast inspection have not been run. The
automated tests verify the fallback text and zero source chips, but a real provider or local
mock server session is still needed before declaring the Phase 10 exit criteria fully green.
