# Glossary

Status: reviewed
Related: all documents
Verified against: not applicable

One term, one meaning. If a document needs a new term, add it here in the same change.

| Term | Meaning in this project |
|---|---|
| **Owner** | The authenticated user whose id is stored on a document or conversation. Derived from the verified token, never from the request body. |
| **Resource** | A document, chunk, conversation, or message addressed by an id. |
| **Processing status** | `PROCESSING`, `COMPLETED`, or `FAILED`. Describes the document row, not the HTTP request. |
| **Extraction** | Turning an uploaded file into text plus structure (pages, sheets, headings). |
| **Extracted text** | The complete text of a document, stored on `Document.extractedText` for display and traceability. Not chunked storage. |
| **Chunk** | A contiguous, ordered slice of extracted text, stored as a `DocumentChunk` row with optional page or sheet metadata. The unit of retrieval. |
| **Chunking** | The deterministic process that turns extracted text into chunks. A pure function of text plus configuration. |
| **Retrieval** | Selecting chunks relevant to a question, restricted to the asking user's completed documents. |
| **Evidence** | The specific chunks placed in the prompt for one question. Retrieval produces candidates; the budget turns them into evidence. |
| **RAG** | Retrieval-Augmented Generation: answer from retrieved evidence instead of model memory. |
| **Evidence-only answer** | An answer derived solely from the supplied evidence. Unsupported claims are a defect, not a style choice. |
| **Sentinel** | A reserved token the model returns to signal a condition the code must handle. Here, `NO_EVIDENCE`. |
| **Fallback** | The exact Arabic sentence returned when evidence is insufficient. Byte-for-byte, never paraphrased. |
| **Prompt injection** | Instructions embedded in document content that attempt to override system rules. Treated as data, never as instructions. |
| **Source reference** | The citation attached to an answer: document id, filename, chunk index, page or sheet. |
| **Port** | An interface owned by the application layer describing what it needs from the outside world. |
| **Adapter** | An implementation of a port for a specific technology. |
| **Mock provider** | A deterministic `LlmProvider` used in development and tests. No network, no cost. |
| **Trust zone** | A boundary across which data is not trusted: browser → API, API → provider. |
| **404-not-403 rule** | A resource owned by another user is reported as not found, so its existence is never confirmed. |
| **Error code** | A stable machine-readable string from `packages/contracts`, e.g. `EMPTY_EXTRACTION`. |
| **Ownership matrix** | The test set that calls every endpoint with another user's ids and expects no data. |
| **tsvector / tsquery** | PostgreSQL full-text document representation and query representation. |
| **GIN index** | The PostgreSQL index type used for `tsvector` columns. |
| **Spike** | A time-boxed experiment that produces a decision, not production code. |
| **Phase gate** | The verification that must pass before the next phase starts. |
| **Failure drill** | A deliberate, observed failure used to prove understanding of error paths. |
| **Traceability** | The mapping from requirement to document to phase to test. |
| **Vertical slice** | One feature delivered end to end through database, API, and UI. The execution unit of the plan. |
| **Track** | A technology-oriented document series: Angular, NestJS, or AI. |
