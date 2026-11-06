# User Stories and Requirements

Status: reviewed
Related: PRD §4–§12
Verified against: not applicable

Every other document cites these identifiers. `plan/traceability.md` maps each one to a
document, a phase, and a test. Adding a requirement means adding it here first.

## Functional requirements

### Accounts

| ID | Requirement | Acceptance (short) |
|---|---|---|
| FR-01 | A visitor can register with name, email, password | 201, user persisted, password hashed |
| FR-02 | A registered user can log in | 200, JWT cookie set with `HttpOnly`, `SameSite=Lax` |
| FR-03 | A logged-in user can fetch their own profile | 200 `{ id, name, email }`, no hash |
| FR-04 | A user can log out | Cookie cleared, subsequent protected calls 401 |
| FR-05 | Protected Angular routes require a session | Unauthenticated navigation redirects to login, preserving the intended URL |

### Documents

| ID | Requirement | Acceptance (short) |
|---|---|---|
| FR-06 | A user can upload PDF, DOCX, or XLSX within the size limit | 201 with document summary; unsupported type → 415 `UNSUPPORTED_FILE_TYPE` |
| FR-07 | Upload validates extension, MIME, magic bytes, and emptiness | Each failure has a distinct code; no row created for rejected files |
| FR-08 | Text is extracted with structure kept where available | PDF pages, DOCX headings/order, XLSX sheet/headers/rows |
| FR-09 | Extraction with no text is reported, not silently accepted | `FAILED` + `EMPTY_EXTRACTION` with the scanned-PDF message |
| FR-10 | Extracted text is stored on the document | `extractedText` equals extraction output |
| FR-11 | Text is chunked into ordered, non-empty chunks with metadata | Unique `(documentId, chunkIndex)`, page/sheet preserved |
| FR-12 | Document status reflects processing truth | `PROCESSING` → `COMPLETED` or `FAILED`; never a half-written state |
| FR-13 | A user can list only their documents with pagination | Filename, type, date, status; no foreign rows |
| FR-14 | A user can open one of their documents | Extracted text + chunk count; foreign id → 404 |
| FR-15 | A user can delete their document | Chunks deleted in the same transaction; foreign id → 404 |
| FR-16 | The original uploaded file is not retained | No disk or object storage write in the upload path |

### Conversations and answers

| ID | Requirement | Acceptance (short) |
|---|---|---|
| FR-17 | A user can create a conversation | Owner set from the token; title defaults to the first question |
| FR-18 | A user can list their conversations, most recent first | Paginated; no foreign rows |
| FR-19 | A user can read messages of their conversation | Ordered by `createdAt`; foreign id → 404 |
| FR-20 | A user can send a question and receive an answer | User message persisted before the model call |
| FR-21 | Answers use only the user's completed documents | Retrieval filtered by `uploadedBy` and `status` |
| FR-22 | Answers include source references when evidence is used | Document id, filename, chunk index, page or sheet |
| FR-23 | Answers with insufficient evidence return the exact fallback | Byte-for-byte match, no extra text |
| FR-24 | A user can delete their conversation | Messages deleted with it; foreign id → 404 |
| FR-25 | Document content cannot override system instructions | Injection fixture does not change behavior |

### Cross-cutting behaviour

| ID | Requirement | Acceptance (short) |
|---|---|---|
| FR-26 | Every resource operation enforces ownership from the token | Ownership matrix test: A vs B → 404 everywhere |
| FR-27 | All errors use one envelope with a stable code | Shape and codes match `integration/api-contract.md` |
| FR-28 | Auth, upload, and message endpoints are rate limited | Exceeding the limit → 429 `RATE_LIMITED` |
| FR-29 | The frontend shows loading, empty, validation, and error states | Each state reachable and tested |
| FR-30 | The UI never displays another user's data, even transiently | No speculative rendering before a scoped response |

## Non-functional requirements

| ID | Requirement | Acceptance (short) |
|---|---|---|
| NFR-01 | Secrets and provider keys exist only in the backend environment | Grep of the web bundle finds none; `.env` is ignored |
| NFR-02 | Passwords use bcrypt with cost 12 | Hash prefix `$2b$12$`; login compares hashes |
| NFR-03 | No cross-user data leakage through any endpoint or log | Ownership matrix plus log audit in Phase 11 |
| NFR-04 | The AI provider is replaceable without touching use cases | Only `AiModule` imports the adapter |
| NFR-05 | Retrieval size and chunking are configurable | Values come from env with validated defaults |
| NFR-06 | The PRD's test list is implemented, not asserted | Every case in PRD §12 appears in a phase gate |
| NFR-07 | Logs carry `requestId` and never carry secrets or document text | Redaction test |
| NFR-08 | Upload completes within a 30 s budget or fails cleanly | Timeout path leaves `FAILED`, zero chunks |
| NFR-09 | Core flows are keyboard operable with labelled controls | Manual checklist in Phase 10 |
| NFR-10 | Documentation stays true to the code | `verified_against` dates and the Phase 12 truth pass |
| NFR-11 | The system runs locally with documented commands | Fresh-clone setup succeeds in Phase 12 |
| NFR-12 | Answers are bounded in cost and latency | Token budget, temperature ≤ 0.2, timeout, one retry |
