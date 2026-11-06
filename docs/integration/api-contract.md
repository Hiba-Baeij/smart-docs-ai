# API Contract

Status: reviewed
Related: FR-01…FR-28, ADR-002, ADR-003, ADR-013
Verified against: API controllers and the Phase 12 browser journey, 2026-11-02

Base path: `/api`. All request and response bodies are JSON unless stated. Types live in
`packages/contracts` and are the source of truth; this document explains them.

## Conventions

- Authentication: an `HttpOnly` cookie named `sid` carrying the JWT. No `Authorization`
  header.
- Ownership: never supplied by the client. The server derives it from the cookie.
- Dates: ISO 8601 strings.
- Ids: UUID strings.
- Pagination: `?page=1&pageSize=20`, `pageSize` max 100, default 20.
- Errors: see `error-model.md`. Success responses never contain an `error` field.
- Unknown fields in a request body are rejected with `VALIDATION_FAILED`.

## Auth

### POST /api/auth/register

```json
{ "name": "Sara Ahmed", "email": "sara@example.com", "password": "correct horse battery" }
```

| Result | Body |
|---|---|
| 201 | `{ "user": { "id": "...", "name": "Sara Ahmed", "email": "sara@example.com", "createdAt": "..." } }` |
| 409 | `AUTH_EMAIL_TAKEN` |
| 422 | `VALIDATION_FAILED` (weak or short password, invalid email) |
| 429 | `RATE_LIMITED` |

Password rules: minimum 10 characters, maximum 128. Maximum matters: bcrypt truncates
beyond 72 bytes, and silently accepting a longer password creates a false sense of
strength. Document the effective limit in the UI hint.

### POST /api/auth/login

```json
{ "email": "sara@example.com", "password": "correct horse battery" }
```

| Result | Body |
|---|---|
| 200 | `{ "user": { ... } }` and `Set-Cookie: sid=...; HttpOnly; SameSite=Lax; Path=/` |
| 401 | `AUTH_INVALID_CREDENTIALS` (same body for unknown email and wrong password) |
| 429 | `RATE_LIMITED` |

### POST /api/auth/logout

No body. Clears the cookie.

| Result | Body |
|---|---|
| 204 | empty |
| 401 | `AUTH_REQUIRED` if no valid session (still clears the cookie) |

### GET /api/auth/me

| Result | Body |
|---|---|
| 200 | `{ "id": "...", "name": "...", "email": "...", "createdAt": "..." }` |
| 401 | `AUTH_REQUIRED` |

This is how the client restores state after a reload. It must never return
`passwordHash`.

## Documents

### POST /api/documents/upload

`multipart/form-data` with a single field `file`. One file per request.

| Result | Body |
|---|---|
| 201 | `DocumentSummary` (below) |
| 413 | `FILE_TOO_LARGE` |
| 415 | `UNSUPPORTED_FILE_TYPE` |
| 422 | `VALIDATION_FAILED`, `EMPTY_EXTRACTION`, `EXTRACTION_FAILED` |
| 429 | `RATE_LIMITED` |
| 504 | `PROCESSING_TIMEOUT` |
| 500 | `INTERNAL` |

`DocumentSummary`:

```ts
type DocumentSummary = {
  id: string;
  originalName: string;
  fileType: 'pdf' | 'docx' | 'xlsx';
  status: 'PROCESSING' | 'COMPLETED' | 'FAILED';
  errorCode: string | null;
  chunkCount: number;
  createdAt: string;
};
```

In v1 the request returns only after processing finishes, so the client normally receives
`COMPLETED` or `FAILED`. `PROCESSING` is still a valid persisted state and must be
renderable; a crash mid-request can leave it.

### GET /api/documents

Query: `page`, `pageSize`, optional `status`.

```ts
type DocumentPage = {
  items: DocumentSummary[];
  page: number;
  pageSize: number;
  total: number;
};
```

Only the caller's documents, newest first.

### GET /api/documents/:id

```ts
type DocumentDetail = DocumentSummary & {
  extractedText: string;
  chunks: { chunkIndex: number; pageNumber: number | null; sheetName: string | null; preview: string }[];
};
```

`preview` is the first 200 characters of the chunk. Full chunk text is not needed by the
document page and would bloat the payload.

| Result | Body |
|---|---|
| 200 | `DocumentDetail` |
| 404 | `DOCUMENT_NOT_FOUND` (also for another user's id) |

### DELETE /api/documents/:id

| Result | Body |
|---|---|
| 204 | empty |
| 404 | `DOCUMENT_NOT_FOUND` |

Chunks are deleted in the same transaction.

## Conversations

### POST /api/conversations

```json
{ "title": "Optional title" }
```

Title is optional; empty is allowed and is replaced by a truncated first question when the
first message arrives.

| Result | Body |
|---|---|
| 201 | `{ "id": "...", "title": "...", "createdAt": "...", "updatedAt": "..." }` |

### GET /api/conversations

`ConversationPage`, ordered by `updatedAt` descending. Only the caller's rows.

### GET /api/conversations/:id/messages

Query: `page`, `pageSize`. Ordered by `createdAt` ascending.

```ts
type MessagePage = {
  items: Message[];
  page: number;
  pageSize: number;
  total: number;
};

type Message = {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  sources: SourceReference[];
  createdAt: string;
};

type SourceReference = {
  documentId: string;
  documentName: string;
  chunkIndex: number;
  pageNumber: number | null;
  sheetName: string | null;
  truncated?: boolean; // true when a passage was shortened to the evidence budget
};
```

| Result | Body |
|---|---|
| 200 | `MessagePage` |
| 404 | `CONVERSATION_NOT_FOUND` (also for another user's id) |

### POST /api/conversations/:id/messages

```json
{ "content": "What is the notice period in the contract?" }
```

| Result | Body |
|---|---|
| 201 | `{ "message": Message, "userMessage": Message }` |
| 404 | `CONVERSATION_NOT_FOUND` |
| 422 | `VALIDATION_FAILED` (empty, over 4000 characters) |
| 429 | `RATE_LIMITED` |
| 503 | `AI_UNAVAILABLE` |
| 504 | `AI_TIMEOUT` |

The user message is persisted before the model call. On `AI_*` errors the response is an
error envelope and no assistant message exists; the user message remains.

When evidence is insufficient, the assistant message content is exactly:

```
ليس لدي معلومات كافية للإجابة عن سؤالك.
```

with `sources: []`. No prefix, suffix, or explanation.

### DELETE /api/conversations/:id

| Result | Body |
|---|---|
| 204 | empty |
| 404 | `CONVERSATION_NOT_FOUND` |

Messages are deleted in the same transaction.

## Health

### GET /api/health

```json
{ "status": "ok" }
```

No authentication. Must not reveal versions, connection strings, or configuration.

## Type notes

- `errorCode` on a document is a string from the error-code union, never a free-form
  message.
- `sources` is always an array; `[]` means no citations, which is distinct from `null`.
- No endpoint ever returns `uploadedBy`, `userId`, or `passwordHash`. Ownership is
  implicit in the filtered result set.
