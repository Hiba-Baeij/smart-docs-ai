# Angular 04 — Forms, Upload, and Chat UI

Status: reviewed
Related: FR-06, FR-13…FR-24, FR-29, NFR-09
Verified against: Angular auth, upload, and chat components and the Phase 12 browser journey, 2026-11-02

## 1. Typed reactive forms

```ts
readonly form = this.fb.nonNullable.group({
  email: ['', [Validators.required, Validators.email]],
  password: ['', [Validators.required, Validators.minLength(10)]],
});
```

- `nonNullable` removes `null` from the value type; this project uses it everywhere.
- Validation is declared once, next to the field.
- Server errors are applied to controls, not shown as a single banner:

```ts
applyServerErrors(error: AppError): void {
  for (const [field, messages] of Object.entries(error.details ?? {})) {
    this.form.get(field)?.setErrors({ server: messages[0] });
  }
}
```

### Form UX rules

| Rule | Why |
|---|---|
| Disable submit while pending | prevents duplicate accounts |
| Show the error under its field | users fix faster |
| Focus the first invalid field | keyboard users are not lost |
| Keep the entered value on failure | retyping is punishment |
| Never disable a field to "prevent" an error | it hides what happened |

## 2. Upload: progress and state

```ts
readonly state = signal<'idle' | 'uploading' | 'processing' | 'done' | 'error'>('idle');
readonly progress = signal(0);
```

- `uploading`: `HttpEventType.UploadProgress` events, percentage visible.
- `processing`: the response is pending while the server extracts and chunks. Because v1
  is synchronous, this phase can last seconds; say so instead of freezing.
- `done`: show the new document in the list.
- `error`: map `FILE_TOO_LARGE`, `UNSUPPORTED_FILE_TYPE`, `EMPTY_EXTRACTION` to distinct
  messages. `EMPTY_EXTRACTION` must mention scanned PDFs, because the user's next move is
  to find a text-based copy.

Implementation notes:

- One file per request. No multi-file queue in v1.
- Client-side pre-checks (size, extension) are a courtesy; the server is authoritative.
- Reset the file input after success so selecting the same file again fires a change
  event.

## 3. Chat UI states

| State | Rendering |
|---|---|
| No conversation | empty state with "New conversation" |
| Conversation, no messages | prompt suggestions derived from document names |
| Sending | user bubble immediately, assistant bubble with a typing indicator |
| Answered | assistant bubble + source chips |
| Insufficient evidence | the exact fallback sentence, no sources |
| Failed | error banner on the message, retry button, question preserved |
| Loading history | skeleton bubbles, not an empty state |

### Optimistic user message

Render the user's message immediately with a temporary id. When the server responds,
replace it with the persisted message and append the assistant message. If the request
fails, mark the bubble as failed and offer retry; do not silently remove it, because the
server may have persisted it before the failure.

### Sources

```html
@for (source of message.sources; track source.documentId + source.chunkIndex) {
  <a class="source-chip" [routerLink]="['/documents', source.documentId]">
    {{ source.documentName }} · {{ source.pageNumber ? 'p.' + source.pageNumber : source.sheetName }}
  </a>
}
```

- A source is a link to the document, not a modal with chunk text.
- If the cited document was deleted, the chip renders as plain text; it must not throw.
- Never render model output with `innerHTML`.

## 4. Scroll and focus

- After appending a message, scroll only if the user was already near the bottom.
  Yanking a reader to the bottom while they scroll history is hostile.
- `afterNextRender` for the scroll, not a timeout.
- The composer keeps focus after sending.
- Enter sends, Shift+Enter inserts a newline. This is a chat convention, not a form.

## 5. Accessibility checklist (Phase 10 gate)

- [ ] Thread container has `role="log"` and `aria-live="polite"`.
- [ ] New assistant messages are announced once, not character by character.
- [ ] Every icon button has an accessible name.
- [ ] Source chips are reachable by keyboard and have visible focus.
- [ ] Error banners are announced and are not colour-only.
- [ ] Contrast passes at the chosen palette; check both themes if a theme exists.

## 6. Testing the UI

| Test | Approach |
|---|---|
| form invalid → submit disabled, field errors shown | TestBed + fixture, no HTTP |
| server 409 maps to the email field | dispatch a fake error through the component's handler |
| upload progress updates the bar | emit synthetic `HttpEvent`s |
| empty/loading/error states | set store signals directly, assert DOM |
| chat renders fallback with no sources | fixture with a message whose content is the constant |
| source chip does not throw for a deleted doc | fixture with a source and a 404 route |

Do not snapshot whole pages; assert the states that carry meaning.

## 7. The mistake to avoid

Building the chat UI before the RAG service exists. It is tempting and it produces a
beautiful interface wired to nothing, with state invented on the client. The plan puts the
chat UI in Phase 10 for a reason: by then the answer, the fallback, and the sources are
real, and the UI has something honest to render.
