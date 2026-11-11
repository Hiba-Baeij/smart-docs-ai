import {
  Component,
  ElementRef,
  booleanAttribute,
  contentChildren,
  effect,
  inject,
  input,
  model,
  signal,
  viewChildren,
} from '@angular/core';
import { LocaleService } from '../../../core/i18n/locale.service';

let nextId = 0;

/** One panel of `app-tabs`. It hides itself unless it is the selected tab. */
@Component({
  selector: 'app-tab',
  host: {
    role: 'tabpanel',
    tabindex: '0',
    '[id]': 'panelId()',
    '[attr.aria-labelledby]': 'tabId()',
    '[hidden]': '!active()',
    '[class.active]': 'active()',
  },
  template: '<ng-content />',
  styles: `
    :host.active {
      display: block;
      animation: panel-in 0.25s ease-out both;
    }
    :host:focus-visible {
      outline: 3px solid var(--focus);
      outline-offset: 4px;
      border-radius: 0.5rem;
    }
    @keyframes panel-in {
      from {
        opacity: 0;
        transform: translateY(4px);
      }
    }
  `,
})
export class Tab {
  readonly label = input.required<string>();
  /** A count shown next to the label, such as the number of chunks. */
  readonly badge = input<string | number | null>(null);
  readonly disabled = input(false, { transform: booleanAttribute });

  /** Set by `app-tabs`. */
  readonly active = signal(false);
  readonly panelId = signal('');
  readonly tabId = signal('');
}

/**
 * Accessible tabs (WAI-ARIA tabs pattern): `tablist`/`tab`/`tabpanel` roles, roving tabindex,
 * Arrow keys (mirrored in RTL), Home and End. `selected` is a two-way model.
 *
 *   <app-tabs [(selected)]="tab" [label]="…">
 *     <app-tab [label]="…">…</app-tab>
 *     <app-tab [label]="…" [badge]="count">…</app-tab>
 *   </app-tabs>
 */
@Component({
  selector: 'app-tabs',
  template: `
    <div class="tablist" role="tablist" [attr.aria-label]="label()">
      @for (tab of tabs(); track tab; let i = $index) {
        <button
          #tabButton
          type="button"
          role="tab"
          class="tab"
          [id]="tab.tabId()"
          [attr.aria-selected]="i === selected()"
          [attr.aria-controls]="tab.panelId()"
          [attr.tabindex]="i === selected() ? 0 : -1"
          [disabled]="tab.disabled()"
          (click)="select(i)"
          (keydown)="onKeydown($event)"
        >
          {{ tab.label() }}
          @if (tab.badge() !== null) {
            <span class="badge">{{ tab.badge() }}</span>
          }
        </button>
      }
    </div>
    <div class="panels"><ng-content /></div>
  `,
  styles: `
    :host {
      display: block;
    }
    .tablist {
      display: flex;
      gap: 0.25rem;
      overflow-x: auto;
      border-block-end: 1px solid var(--border);
      scrollbar-width: none;
    }
    .tab {
      display: inline-flex;
      align-items: center;
      gap: 0.45rem;
      min-height: 2.75rem;
      margin-block-end: -1px;
      padding: 0 1rem;
      border: 0;
      border-block-end: 2px solid transparent;
      background: none;
      color: var(--text-muted);
      font: inherit;
      font-weight: 600;
      white-space: nowrap;
      cursor: pointer;
      transition:
        color 0.18s ease,
        border-color 0.18s ease;
    }
    .tab:hover {
      color: var(--text);
    }
    .tab[aria-selected='true'] {
      border-block-end-color: var(--accent);
      color: var(--accent);
    }
    .tab:focus-visible {
      outline: 3px solid var(--focus);
      outline-offset: -3px;
      border-radius: 0.5rem;
    }
    .tab:disabled {
      cursor: not-allowed;
      opacity: 0.5;
    }
    .badge {
      min-width: 1.5rem;
      padding: 0 0.4rem;
      border-radius: 999px;
      background: var(--surface-muted);
      color: var(--text-muted);
      font-size: 0.75rem;
      text-align: center;
    }
    .tab[aria-selected='true'] .badge {
      background: var(--accent-surface);
      color: var(--accent);
    }
    .panels {
      padding-block-start: 1.25rem;
    }
  `,
})
export class Tabs {
  readonly label = input<string | null>(null);
  readonly selected = model(0);

  protected readonly tabs = contentChildren(Tab);
  private readonly buttons = viewChildren<ElementRef<HTMLButtonElement>>('tabButton');
  private readonly locale = inject(LocaleService);
  private readonly baseId = `app-tabs-${++nextId}`;

  constructor() {
    effect(() => {
      const selected = this.selected();
      this.tabs().forEach((tab, i) => {
        tab.tabId.set(`${this.baseId}-tab-${i}`);
        tab.panelId.set(`${this.baseId}-panel-${i}`);
        tab.active.set(i === selected);
      });
    });
  }

  protected select(index: number): void {
    if (!this.tabs()[index]?.disabled()) {
      this.selected.set(index);
    }
  }

  protected onKeydown(event: KeyboardEvent): void {
    const count = this.tabs().length;
    if (count === 0) {
      return;
    }
    const rtl = this.locale.dir() === 'rtl';
    let next: number | null = null;
    if (event.key === (rtl ? 'ArrowLeft' : 'ArrowRight')) next = this.firstEnabled(this.selected() + 1, 1);
    else if (event.key === (rtl ? 'ArrowRight' : 'ArrowLeft')) next = this.firstEnabled(this.selected() - 1, -1);
    else if (event.key === 'Home') next = this.firstEnabled(0, 1);
    else if (event.key === 'End') next = this.firstEnabled(count - 1, -1);
    if (next === null) {
      return;
    }
    event.preventDefault();
    this.selected.set(next);
    this.buttons()[next]?.nativeElement.focus();
  }

  /** The first enabled tab from `start` (wrapping around) in `direction`. */
  private firstEnabled(start: number, direction: 1 | -1): number | null {
    const tabs = this.tabs();
    const count = tabs.length;
    for (let n = 0; n < count; n++) {
      const i = (((start + n * direction) % count) + count) % count;
      if (!tabs[i].disabled()) return i;
    }
    return null;
  }
}
