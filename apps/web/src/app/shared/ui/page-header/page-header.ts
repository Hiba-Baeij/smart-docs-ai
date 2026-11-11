import { Component, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideArrowLeft } from '@lucide/angular';

/**
 * The top of every page: an optional back link, a leading slot (icon), the title (the page's
 * only `<h1>`), a subtitle, a meta line, and the page's actions.
 *
 *   <app-page-header [title]="doc.name" backLink="/documents" [backLabel]="…">
 *     <app-file-icon pageHeaderLeading type="pdf" size="lg" />
 *     <div pageHeaderMeta><app-badge …/></div>
 *     <ng-container pageHeaderActions><button appButton>…</button></ng-container>
 *   </app-page-header>
 */
@Component({
  selector: 'app-page-header',
  imports: [RouterLink, LucideArrowLeft],
  template: `
    @if (backLink(); as link) {
      <a class="back" [routerLink]="link">
        <svg lucideArrowLeft class="back-icon" aria-hidden="true"></svg>
        {{ backLabel() }}
      </a>
    }
    <div class="row">
      <ng-content select="[pageHeaderLeading]" />
      <div class="heading">
        <!-- The h1 follows the page direction, so it lines up with the icon, the status and the
             actions; the name itself is isolated with bdi so Latin text inside Arabic reads right. -->
        <h1><bdi>{{ title() }}</bdi></h1>
        @if (subtitle(); as text) {
          <p class="subtitle">{{ text }}</p>
        }
        <ng-content select="[pageHeaderMeta]" />
      </div>
      <div class="actions">
        <ng-content select="[pageHeaderActions]" />
      </div>
    </div>
  `,
  styles: `
    :host {
      display: block;
      margin-block-end: 1.5rem;
      animation: header-in 0.3s ease-out both;
    }
    .back {
      display: inline-flex;
      min-height: 1.75rem; /* a 24px target at least (WCAG 2.5.8) */
      align-items: center;
      gap: 0.35rem;
      margin-block-end: 0.75rem;
      color: var(--text-muted);
      font-size: 0.9rem;
      font-weight: 600;
      text-decoration: none;
    }
    .back:hover {
      color: var(--accent);
    }
    .back:focus-visible {
      outline: 3px solid var(--focus);
      outline-offset: 2px;
      border-radius: 0.25rem;
    }
    .back-icon {
      width: 1rem;
      height: 1rem;
    }
    :host-context([dir='rtl']) .back-icon {
      transform: scaleX(-1);
    }
    .row {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 1rem;
    }
    .heading {
      flex: 1 1 16rem;
      min-width: 0;
    }
    h1 {
      margin: 0;
      font-size: clamp(1.4rem, 2.5vw, 1.85rem);
      line-height: 1.2;
      overflow-wrap: anywhere;
    }
    .subtitle {
      margin: 0.35rem 0 0;
      color: var(--text-muted);
    }
    .actions {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 0.5rem;
    }
    .actions:empty {
      display: none;
    }
    @keyframes header-in {
      from {
        opacity: 0;
        transform: translateY(-4px);
      }
    }
  `,
})
export class PageHeader {
  readonly title = input.required<string>();
  readonly subtitle = input<string | null>(null);
  readonly backLink = input<string | readonly unknown[] | null>(null);
  readonly backLabel = input('');
}
