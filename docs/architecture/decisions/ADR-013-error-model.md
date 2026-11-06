# ADR-013: One error envelope, stable codes, 404 for foreign resources

Status: accepted
Date: 2026-10-23

## Context

Inconsistent error shapes force the client to guess, and a `403` on someone else's
resource confirms that the resource exists.

## Decision

Every error response uses one shape:

```json
{
  "statusCode": 404,
  "code": "DOCUMENT_NOT_FOUND",
  "message": "Document not found.",
  "details": null,
  "requestId": "01J...",
  "timestamp": "2026-10-23T12:00:00.000Z",
  "path": "/api/documents/9f1c..."
}
```

- `code` values live in `packages/contracts` as a union type and a const object.
- A global exception filter maps domain errors, validation errors, and unknown errors.
- Unknown errors become `INTERNAL` with a generic message; the real error goes to logs
  with the `requestId` only.
- Ownership failures map to the resource's `*_NOT_FOUND` code with status 404.
- Validation errors include a field-level `details` object, never the raw payload.

## Alternatives considered

- **Nest's default error shape.** Fine internally, but `message` can be an array and there
  is no stable code.
- **RFC 7807 problem+json.** More standard, more fields; the team is one person and
  `code` is what the client branches on. Could migrate later; the envelope is a superset
  of the useful parts.
- **`403` with a generic message.** Still leaks existence through the status code.

## Consequences

- The Angular interceptor switches on `code`, not on message text.
- Adding a code is a contracts change and therefore visible in review.
- Tests assert the envelope itself, so a stray `throw new Error()` is caught.
