# Web UI: kit, patterns and conventions

How the UI layer of `apps/web` is built and how to extend it. The decision behind it is
[ADR-019](../../../../../docs/architecture/decisions/ADR-019-ui-component-library.md); the plan it came from is
[web-ui-architecture-plan.md](../../../../../docs/plan/web-ui-architecture-plan.md).

## Layers (who may import whom)

```
core/      singletons: http interceptors, auth, i18n, loading, feedback (dialog, toasts, mutations), shell
shared/    reusable and app-agnostic: ui/ (kit), data/ (REST + list state), data-table/, forms/
features/  one folder per area (auth, documents, chat); a feature never imports another feature
```

- `shared/ui` is presentational: inputs in, outputs out. No stores, no HTTP.
- Features import the kit from `@shared/ui`, never Angular Material directly. Material is an implementation
  detail behind the wrappers, so it can be replaced in one place.
- Path aliases: `@core/*`, `@shared/*`, `@features/*`.

## The patterns (use these, do not re-invent them)

| Need | Use | Notes |
|---|---|---|
| Any create/update/delete/sign-out | `createMutation()` (`core/feedback`) | confirm → loading toast → success/error toast → callbacks. Blocks double submit. Exposes `pending()` and `busy()`. |
| "Are you sure?" | `ConfirmService` (or `confirm:` in a mutation) | Modal, focus trap, Esc, focus returns to the trigger. `tone: 'danger'` starts on Cancel. |
| Waiting for the server | nothing: it is global | `loadingInterceptor` drives the top bar. Opt out with `skipGlobalLoading()` (uploads, polling). |
| A button that waits | `<button appButton [loading]="mutation.pending()">` | Bind to `pending()`, not `busy()` (see "Focus" below). |
| REST calls for a resource | extend `ResourceApi` | `list/detail/remove` for free; add only what is special. |
| A paged list | extend `PaginatedStore` | Four views, race guard, per-user isolation, last-page step-back. |
| Page/filter/sort in the URL | `bindListToUrl(store, options)` | The URL is the source of truth. Unknown values are ignored, never sent to the API. |
| Keep a list fresh | `pollWhile(condition, () => store.refresh({ background: true }), ms)` | Silent: no bar, no loading state, failures ignored. |
| A table | `app-data-table` + `ColumnDef[]` | Skeleton/error/empty states, sort, paging, row actions, card layout on narrow containers. |
| Errors | queries: `app-error-banner` inline; mutations: toast via `createMutation` | The interceptor turns every failure into an `AppError`; wording comes from `userMessage()`. |

### Minimal examples

```ts
// A mutation with a confirm (field initializer: it needs an injection context)
protected readonly remove = createMutation((id: string) => this.api.remove(id), {
  confirm: () => ({ tone: 'danger', title: …, message: … }),
  toastId: (id) => `delete-${id}`,
  loading: () => this.locale.t('…'),
  success: () => this.locale.t('…'),
  onSuccess: () => this.store.refresh(),
});
```

```ts
// A list resource in ~15 lines
@Injectable({ providedIn: 'root' })
export class ThingsApi extends ResourceApi<Thing, ThingDetail, ThingFilters> {
  protected readonly path = 'things';
}

@Injectable({ providedIn: 'root' })
export class ThingsStore extends PaginatedStore<Thing, ThingFilters> {
  private readonly api = inject(ThingsApi);
  constructor() { super({ pageSize: 20 }); }
  protected fetch(query, options) { return this.api.list(query, options); }
  protected idOf(thing: Thing) { return thing.id; }
}
```

```html
<app-data-table [rows]="rows()" [columns]="columns()" [trackBy]="byId" [caption]="…"
  [loading]="store.view() === 'loading'" [error]="store.error()"
  [page]="store.page()" [pageSize]="store.pageSize()" [total]="store.total()"
  [actions]="actions()" (pageChange)="list.goTo($event)" (retry)="list.refresh()">
  <ng-template appCell="status" [appCellRows]="rows()" let-row>…</ng-template>
</app-data-table>
```

Define `columns` and `actions` in a `computed()` so their text follows a language switch.

## UI kit (`shared/ui`)

| Component | For |
|---|---|
| `appButton` (on `<button>`/`<a>`) | primary / secondary / ghost / danger, sizes, `[loading]` |
| `appIconButton` | icon-only button: `label` is required (accessible name + tooltip) |
| `app-page-header` | the page's only `h1`, back link, leading/meta/actions slots |
| `app-card`, `app-stat-card`, `app-details-grid` | sections and facts; `app-card [loading]` shows a skeleton |
| `app-tabs` / `app-tab` | WAI-ARIA tabs (arrows mirrored in RTL, Home/End) |
| `app-menu` | "⋮" menu from `MenuItem[]`; items run after the menu closes |
| `app-filter-chips`, `app-search-input` | single-choice filter; search box with clear |
| `app-badge`, `app-file-icon`, `app-skeleton`, `app-spinner`, `app-copy-button` | small pieces |
| `app-empty-state`, `app-error-banner` | the two non-data states |

## Conventions

- **Text.** Every visible string comes from `LocaleService.t(key)`. Keys live in `messages.en.ts` (typed) and
  `messages.ar.ts`. User content (file names, extracted text, chat) is rendered by interpolation only, never as HTML.
- **RTL.** Use logical properties (`margin-inline-start`, `inset-inline-end`, `text-align: start`). Mirror directional
  icons with `:host-context([dir='rtl'])`. `LocaleService` also tells CDK the direction, so overlays follow a switch.
- **Colour.** Tokens only (`var(--accent)` …), never literals. Check both themes.
- **Motion.** Short and purposeful (150–350 ms). `prefers-reduced-motion` is honoured globally; do not fight it.
- **Accessibility.**
  - Targets at least 24×24 px (buttons 44 px); icon-only controls need a label.
  - The edge of an input/button uses `--border-control` (3:1). `--border` is decoration only (cards, dividers).
  - Text pairs must reach 4.5:1; the token pairs in `styles.scss` were checked in both themes.
  - Landmarks: one `main`, one `h1` per page (from `app-page-header`), no skipped heading levels.
- **Focus.** A button that opens a dialog must stay enabled while the dialog is open: disabling it drops focus and the
  dialog cannot return it. That is why buttons bind to `pending()`. `app-menu` runs an item only after the menu has
  closed, so a dialog opened from a menu returns focus to the "⋮" button.
- **Animations in tests.** `src/test-providers.ts` disables Material animations for all unit tests (jsdom never fires
  `animationend`).

## Testing notes

- Unit: Vitest via `ng test`. A menu action is asynchronous (it runs after the menu closes): wait a tick before asserting.
- Browser: `npm run e2e:frontend` (mocked API) and `npm run e2e` (real API on its own `*_e2e` database).
  `e2e/support.ts` has `signOut(page)`: sign-out lives in the header user menu.
- Selectors in e2e should follow roles and accessible names (`getByRole('menuitem', { name: 'Sign out' })`) rather than
  CSS classes, which change with the UI.
