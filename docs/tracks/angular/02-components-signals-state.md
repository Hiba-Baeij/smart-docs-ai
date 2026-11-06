# Angular 02 — Components, Signals, and State

Status: reviewed
Related: ADR-012, FR-29, FR-30
Verified against: Angular 22.2 signal `input()` / `output()` / `computed` / `effect`, 2026-10-31 (Phase 6); the store pattern below is simplified, see "As built" in section 3

## 1. A component is a class plus a template

```ts
@Component({
  selector: 'app-document-row',
  standalone: true,
  template: `
    <div class="row" (click)="open.emit(document().id)">
      <span class="name">{{ document().originalName }}</span>
      <app-status-badge [status]="document().status" />
    </div>
  `,
})
export class DocumentRowComponent {
  readonly document = input.required<DocumentSummary>();
  readonly open = output<string>();
}
```

- `input.required<T>()` replaces `@Input()` with a required contract.
- `output<T>()` replaces `@Output() EventEmitter`.
- Calling `document()` in the template reads the signal.

The parent binds `[document]="doc"` and `(open)="navigate($event)"`. Same shape as Vue
props/emits, with types enforced at compile time.

## 2. Signals: the three primitives

```ts
const count = signal(0);                 // writable
const doubled = computed(() => count() * 2); // derived, memoised
effect(() => console.log(count()));      // side effect, runs on change
```

Rules used in this project:

1. **`computed` for derivation, never a method in the template.** A template method runs
   on every change-detection pass; a computed runs when its inputs change.
2. **`effect` only for external side effects** (localStorage, title, scroll). State
   synchronisation between signals inside an effect is usually a design smell; derive
   instead.
3. **Immutability.** Signals compare by reference; mutating an array in place will not
   notify anyone.

## 3. The feature store pattern

```ts
@Injectable({ providedIn: 'root' })
export class DocumentsStore {
  private readonly api = inject(DocumentsApi);

  private readonly _items = signal<DocumentSummary[]>([]);
  private readonly _status = signal<'idle' | 'loading' | 'error'>('idle');
  private readonly _error = signal<AppError | null>(null);

  readonly items = this._items.asReadonly();
  readonly status = this._status.asReadonly();
  readonly error = this._error.asReadonly();
  readonly isEmpty = computed(() => this._status() === 'idle' && this._items().length === 0);

  async load(): Promise<void> {
    this._status.set('loading');
    this._error.set(null);
    try {
      const page = await firstValueFrom(this.api.list());
      this._items.set(page.items);
      this._status.set('idle');
    } catch (error) {
      this._error.set(asAppError(error));
      this._status.set('error');
    }
  }
}
```

Properties of this pattern:

- Private writable signals, public readonly signals.
- Explicit status: `idle | loading | error` — the UI cannot invent a fourth state.
- Errors are values, not thrown into the void.
- The component does not know how data is fetched.

This is deliberately not NgRx. The store is a service; the store is testable with a fake
API; there is no action/reducer ceremony for three operations.

### As built (Phase 6): what the snippet above gets wrong

`apps/web/src/app/features/documents/documents.store.ts` differs from the simplified store in
three ways, each from a bug the tests or the browser showed:

- **Four statuses, not three.** `idle | loading | error` makes a store that was never asked look
  like "idle and empty", so the page would flash the empty state before the first request. The real
  store is `idle | loading | ready | error`, and a computed `view` maps them to the four screen states
  with the precedence error, loading (idle too), empty, data.
- **The store knows whose rows it holds.** It remembers the owner of what it has and exposes nothing
  unless that owner is the signed-in user, so when user B signs in after user A in the same tab, A's
  rows cannot be shown, not for an instant. A late answer to A's request is dropped, and the owner is
  cleared by an effect as well, so the old rows do not linger in memory.
- **A request default is evaluated too early.** `load(page = this._page())` took the previous user's
  page as its default before the owner check ran, so a new user opened the list on page 3 of their own
  documents. The parameter is optional and resolved after the owner check.

## 4. Component communication rules

| Need | Use |
|---|---|
| Parent → child data | `input()` |
| Child → parent event | `output()` |
| Two-way binding | `model()` (use rarely) |
| Sibling/shared state | inject the feature store |
| Cross-feature navigation | router link with an id |
| Global session | `AuthStore` |

Never pass a store into a presentational component; pass values and emit events. That is
what keeps `shared/` dumb and testable.

## 5. Lifecycle, the short version

| Hook | Use here |
|---|---|
| `ngOnInit` | start loading data for a route component |
| `ngOnDestroy` | not needed for signals; use `takeUntilDestroyed` for subscriptions |
| `afterNextRender` | scroll the chat thread after new messages |
| `effect` cleanup | unregister listeners |

With signals and `toSignal`, most manual subscriptions disappear. Every remaining
subscription must be tied to the component lifetime.

## 6. Loading, empty, and error states

Every data component renders exactly four states, in this order of precedence:

```
1. error   → <app-error-banner [error]="error()" (retry)="load()" />
2. loading → <app-spinner /> or a skeleton
3. empty   → <app-empty-state message="..." actionLabel="Upload a document" />
4. data    → the list or detail
```

The order matters. Showing an empty state while a request is in flight teaches users that
the app is broken. This is checked in Phase 6 tests.

## 7. Styling

- Component SCSS with default emulated encapsulation.
- Design tokens (colour, spacing, radius) as CSS custom properties in `styles.scss`.
- No utility framework in v1; six presentational components carry the visual language.
- Never style by element selector globally; it leaks.

## 8. Accessibility baseline

- Every input has a `<label for>`.
- Buttons that trigger async work show a busy state and disable themselves.
- Status changes (upload done, error) are announced with `aria-live="polite"`.
- Focus moves to the first error field on a failed submit.
- The chat thread is a `role="log"` region.

## 9. Exercise (before Phase 6)

Build `DocumentsStore` against a hard-coded array, render the four states with a fake API
that you can make slow, failing, or empty. Do not connect it to the real backend yet. The
point is to feel how signals express UI state before HTTP is involved.
