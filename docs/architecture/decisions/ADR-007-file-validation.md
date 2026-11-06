# ADR-007: Upload validation — three independent checks

Status: accepted
Date: 2026-10-23

## Context

The declared filename and MIME type are attacker-controlled. Accepting either as truth
allows a polyglot file or a renamed archive into a parser.

## Decision

Validate in this order, cheapest first:

1. Size limit enforced by the multipart parser (default 10 MB, configurable).
2. Extension allowlist: `.pdf`, `.docx`, `.xlsx`.
3. Declared MIME allowlist matching the extension.
4. Non-empty buffer (`VALIDATION_FAILED`). This sits before the signature check on purpose:
   an empty file has no signature, so checking bytes first would report it as an unsupported
   type (415), while the failure table in `data-flow.md` says an empty file is 422.
5. Magic bytes matching the declared type
   (PDF `%PDF-` at offset 0; DOCX/XLSX are ZIP containers, so the `PK\x03\x04` signature at
   offset 0, then a container check: `[Content_Types].xml` plus `word/document.xml` for DOCX or
   `xl/workbook.xml` for XLSX).
6. Non-empty extraction output.

(Order amended in Phase 4, task 4.2: steps 4 and 5 were listed the other way round.)

Reject with a specific code at each step: `FILE_TOO_LARGE`, `UNSUPPORTED_FILE_TYPE`,
`VALIDATION_FAILED`, `EMPTY_EXTRACTION`.

## Alternatives considered

- **Extension only.** Trivially bypassed.
- **MIME only.** Also client-supplied.
- **Magic bytes only.** Cannot distinguish DOCX from XLSX (both ZIP); container
  inspection or the parser is required.
- **Full antivirus scanning.** Out of scope; listed as a production gap.

## Consequences

- A magic-byte library may be ESM-only; the import strategy is verified at Phase 0, with
  a small manual signature check as fallback.
- The DOCX/XLSX check must inspect the archive's entry names, not just `PK\x03\x04`.
- Nothing is written to disk, so rejection has no cleanup cost.
