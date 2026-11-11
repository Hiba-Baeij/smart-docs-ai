import { Component, computed, inject, input, output } from '@angular/core';
import { MatMenu, MatMenuItem, MatMenuTrigger } from '@angular/material/menu';
import { LucideChevronDown, LucideLogOut } from '@lucide/angular';
import type { UserSummary } from '@smartdocs/contracts';
import { Spinner } from '../../shared/ui/spinner/spinner';
import { LocaleService } from '../i18n/locale.service';

/**
 * The signed-in person in the header: an avatar and name that open a menu with who they are
 * (name and email) and Sign out. Name and email are shown as text, never as markup.
 */
@Component({
  selector: 'app-user-menu',
  imports: [LucideChevronDown, LucideLogOut, MatMenu, MatMenuItem, MatMenuTrigger, Spinner],
  template: `
    <button
      type="button"
      class="user-trigger"
      [matMenuTriggerFor]="menu"
      [attr.aria-label]="user().name"
      [attr.aria-busy]="signingOut() ? 'true' : null"
    >
      <span class="avatar" aria-hidden="true">{{ initial() }}</span>
      <span class="user-name" dir="auto">{{ user().name }}</span>
      <svg lucideChevronDown class="chevron" aria-hidden="true"></svg>
    </button>
    <mat-menu #menu="matMenu" xPosition="before" class="app-menu-panel user-menu-panel">
      <div class="identity" role="presentation" (click)="$event.stopPropagation()" (keydown)="$event.stopPropagation()">
        <span class="avatar large" aria-hidden="true">{{ initial() }}</span>
        <div class="who">
          <p class="who-name" dir="auto">{{ user().name }}</p>
          <p class="who-email" dir="ltr">{{ user().email }}</p>
        </div>
      </div>
      <button type="button" mat-menu-item class="sign-out" [disabled]="signingOut()" (click)="signOut.emit()">
        @if (signingOut()) {
          <app-spinner matMenuItemIcon class="item-icon" />
        } @else {
          <svg matMenuItemIcon lucideLogOut class="item-icon" aria-hidden="true"></svg>
        }
        <span>{{ signingOut() ? locale.t('nav.signingOut') : locale.t('nav.signOut') }}</span>
      </button>
    </mat-menu>
  `,
  styles: `
    :host {
      display: inline-flex;
    }
    .user-trigger {
      display: inline-flex;
      align-items: center;
      gap: 0.55rem;
      min-height: 2.75rem;
      padding: 0.25rem 0.65rem 0.25rem 0.3rem;
      border: 1px solid var(--border-control);
      border-radius: 999px;
      background: var(--surface-raised);
      color: var(--text);
      font: inherit;
      font-weight: 650;
      cursor: pointer;
      transition:
        border-color 0.18s ease,
        background-color 0.18s ease;
    }
    :host-context([dir='rtl']) .user-trigger {
      padding: 0.25rem 0.3rem 0.25rem 0.65rem;
    }
    .user-trigger:hover {
      border-color: var(--accent);
    }
    .user-trigger:focus-visible {
      outline: 3px solid var(--focus);
      outline-offset: 2px;
    }
    .avatar {
      display: inline-grid;
      place-items: center;
      flex: none;
      width: 2rem;
      height: 2rem;
      border-radius: 50%;
      background: var(--accent-surface);
      color: var(--accent);
      font-size: 0.9rem;
      font-weight: 800;
    }
    .avatar.large {
      width: 2.75rem;
      height: 2.75rem;
      font-size: 1.1rem;
    }
    .user-name {
      max-width: 10rem;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .chevron {
      width: 1rem;
      height: 1rem;
      color: var(--text-muted);
    }
    .identity {
      display: flex;
      align-items: center;
      gap: 0.75rem;
      padding: 0.85rem 1rem;
      border-block-end: 1px solid var(--border);
      cursor: default;
    }
    .who {
      min-width: 0;
    }
    .who p {
      margin: 0;
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
    }
    .who-name {
      font-weight: 700;
    }
    .who-email {
      color: var(--text-muted);
      font-size: 0.85rem;
    }
    @media (max-width: 700px) {
      .user-name,
      .chevron {
        display: none;
      }
      .user-trigger {
        padding: 0.25rem;
      }
    }
  `,
})
export class UserMenu {
  protected readonly locale = inject(LocaleService);

  readonly user = input.required<UserSummary>();
  readonly signingOut = input(false);
  readonly signOut = output<void>();

  protected readonly initial = computed(() => this.user().name.trim().charAt(0).toUpperCase() || '?');
}
