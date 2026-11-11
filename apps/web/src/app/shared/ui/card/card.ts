import { Component, booleanAttribute, input, numberAttribute } from '@angular/core';
import { Skeleton } from '../skeleton/skeleton';

let nextId = 0;

/**
 * A surface for one section of a page. With a `title` it becomes a labelled region with a
 * header (icon slot, title, subtitle, actions). With `loading` it shows skeleton lines instead
 * of its content.
 *
 *   <app-card [title]="…" [loading]="store.view() === 'loading'">
 *     <svg cardIcon lucideFileText></svg>
 *     <button cardActions appIconButton …></button>
 *     …content…
 *   </app-card>
 */
@Component({
  selector: 'app-card',
  imports: [Skeleton],
  host: {
    '[attr.role]': 'title() ? "region" : null',
    '[attr.aria-labelledby]': 'title() ? headingId : null',
    '[attr.aria-busy]': 'loading() ? "true" : null',
    '[class.flush]': 'flush()',
    '[class.tone-danger]': 'tone() === "danger"',
  },
  template: `
    @if (title()) {
      <header class="card-header">
        <span class="icon"><ng-content select="[cardIcon]" /></span>
        <div class="titles">
          <h2 [id]="headingId">{{ title() }}</h2>
          @if (subtitle(); as text) {
            <p class="subtitle">{{ text }}</p>
          }
        </div>
        <div class="card-actions"><ng-content select="[cardActions]" /></div>
      </header>
    }
    <div class="card-body">
      @if (loading()) {
        <app-skeleton [lines]="loadingLines()" />
      } @else {
        <ng-content />
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      border: 1px solid var(--border);
      border-radius: 1rem;
      background: var(--surface);
      box-shadow: 0 1px 2px hsl(225 30% 10% / 0.04);
    }
    .card-header {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.9rem 1.15rem;
      border-block-end: 1px solid var(--border);
    }
    .icon:empty {
      display: none;
    }
    .icon {
      display: inline-grid;
      place-items: center;
      width: 2rem;
      height: 2rem;
      border-radius: 0.6rem;
      background: var(--accent-surface);
      color: var(--accent);
    }
    .icon ::ng-deep svg {
      width: 1.1rem;
      height: 1.1rem;
    }
    .titles {
      flex: 1;
      min-width: 0;
    }
    h2 {
      margin: 0;
      font-size: 1.05rem;
    }
    .subtitle {
      margin: 0.15rem 0 0;
      color: var(--text-muted);
      font-size: 0.875rem;
    }
    .card-actions {
      display: flex;
      align-items: center;
      gap: 0.25rem;
    }
    .card-body {
      padding: 1.15rem;
    }
    :host(.flush) .card-body {
      padding: 0;
    }
    :host(.tone-danger) {
      border-color: color-mix(in srgb, var(--error) 45%, var(--border));
    }
    :host(.tone-danger) .icon {
      background: var(--error-surface);
      color: var(--error);
    }
  `,
})
export class Card {
  readonly title = input<string | null>(null);
  readonly subtitle = input<string | null>(null);
  readonly loading = input(false, { transform: booleanAttribute });
  readonly loadingLines = input(3, { transform: numberAttribute });
  /** No padding around the content, for a table or a list that draws its own edges. */
  readonly flush = input(false, { transform: booleanAttribute });
  /** `danger` for a destructive section (red border and icon). */
  readonly tone = input<'default' | 'danger'>('default');

  protected readonly headingId = `app-card-title-${++nextId}`;
}
