import { Component, computed, input, viewChild } from '@angular/core';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { MatTooltip } from '@angular/material/tooltip';
import { LucideDynamicIcon, LucideEllipsisVertical, type LucideIcon } from '@lucide/angular';
import { IconButton } from '../icon-button/icon-button';

export interface MenuItem {
  id: string;
  label: string;
  icon?: LucideIcon;
  tone?: 'default' | 'danger';
  disabled?: boolean;
  /** Leave the item out (permissions, state). */
  hidden?: boolean;
  run: () => void;
}

/**
 * A "more actions" menu (⋮) built from data, so the same item list can serve a page header,
 * a table row, or a card. Keyboard and screen-reader behaviour come from Angular Material.
 *
 *   <app-menu [label]="locale.t('common.moreActions')" [items]="actions()" />
 */
@Component({
  selector: 'app-menu',
  imports: [IconButton, MatMenu, MatMenuItem, MatMenuTrigger, LucideDynamicIcon, LucideEllipsisVertical],
  template: `
    <!-- The tooltip names the trigger; it is hidden while the menu it opened is showing. -->
    <button
      type="button"
      appIconButton
      [label]="label()"
      [matMenuTriggerFor]="menu"
      (menuOpened)="tooltip()?.hide(0)"
    >
      <svg lucideEllipsisVertical></svg>
    </button>
    <mat-menu #menu="matMenu" xPosition="before" class="app-menu-panel" (closed)="runChosen()">
      @for (item of visibleItems(); track item.id) {
        <button
          type="button"
          mat-menu-item
          [class.danger]="item.tone === 'danger'"
          [disabled]="item.disabled ?? false"
          (click)="chosen = item"
        >
          @if (item.icon) {
            <svg matMenuItemIcon [lucideIcon]="item.icon" class="item-icon" aria-hidden="true"></svg>
          }
          <span>{{ item.label }}</span>
        </button>
      }
    </mat-menu>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
  `,
})
export class Menu {
  readonly items = input.required<readonly MenuItem[]>();
  /** Accessible name and tooltip of the trigger. */
  readonly label = input.required<string>();

  protected readonly visibleItems = computed(() => this.items().filter((item) => !item.hidden));
  protected readonly tooltip = viewChild(MatTooltip);

  /** The item the person clicked. It runs once the menu has closed (see `runChosen`). */
  protected chosen: MenuItem | null = null;

  /**
   * An item runs after the menu closed, not at the click. The menu returns focus to its trigger as
   * it closes; an action that opens a dialog from the click would remember the menu item (about
   * to be destroyed) as the place to return focus to, and focus would be lost on cancel.
   */
  protected runChosen(): void {
    const item = this.chosen;
    this.chosen = null;
    if (item) {
      setTimeout(() => item.run());
    }
  }
}
