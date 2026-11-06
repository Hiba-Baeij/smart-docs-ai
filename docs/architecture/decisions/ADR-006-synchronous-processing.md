# ADR-006: Synchronous upload processing, transactional chunk write, no stored file

Status: accepted
Date: 2026-10-23

## Context

Uploads require extraction and chunking, both of which can be slow or fail. The PRD
requires visible status, cleanup, no retained originals, and no inconsistent rows. It
also permits "an appropriate processing strategy".

## Decision

- Process synchronously within the HTTP request, with a 30-second budget.
- Buffer in memory (`multer.memoryStorage`); never write the original to disk.
- Commit `Document(PROCESSING)` before extraction.
- Commit chunks and `COMPLETED` in one transaction.
- On failure, roll back chunks and persist `FAILED` with an error code.
- No queue, no worker, no retry job in v1.

## Alternatives considered

- **Queue + worker.** Better for large files and bursty traffic; adds Redis, a worker
  process, job state, and a second failure surface. Deferred, with the status model
  already in place to support it.
- **Store the file then process.** PRD forbids permanent storage; temporary disk storage
  adds cleanup code for no v1 benefit.
- **Fire-and-forget after responding.** The client would need polling; status semantics
  become ambiguous. Not needed at this scale.

## Consequences

- Requests can take seconds; the client shows a processing state and a 30 s ceiling.
- Very large documents are rejected rather than queued; the limit is documented.
- Moving to a queue later means extracting `UploadProcessingService` from the request
  path; the transaction boundaries stay the same.
- Memory usage is bounded by the size limit multiplied by concurrent uploads, which is
  why the rate limit exists.
