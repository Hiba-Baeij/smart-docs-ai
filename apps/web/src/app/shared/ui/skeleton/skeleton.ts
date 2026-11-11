import { Component, computed, input, numberAttribute } from '@angular/core';

export type SkeletonVariant = 'text' | 'circle' | 'rect';

/**
 * A placeholder in the shape of the content that is loading, with a shimmer. It is decorative
 * (`aria-hidden`); the page announces "loading" once, elsewhere.
 *
 *   <app-skeleton variant="text" [lines]="3" />
 *   <app-skeleton variant="rect" height="8rem" />
 */
@Component({
  selector: 'app-skeleton',
  host: { 'aria-hidden': 'true', class: 'app-skeleton' },
  template: `
    @for (line of rows(); track $index; let last = $last) {
      <span
        class="bone"
        [class]="'bone ' + variant()"
        [style.width]="variant() === 'text' && last && rows().length > 1 ? '60%' : width()"
        [style.height]="variant() === 'circle' ? width() : height()"
      ></span>
    }
  `,
  styles: `
    :host {
      display: grid;
      gap: 0.55rem;
    }
    .bone {
      display: block;
      border-radius: 0.5rem;
      background: linear-gradient(
        90deg,
        var(--surface-muted) 0%,
        var(--surface-raised) 50%,
        var(--surface-muted) 100%
      );
      background-size: 200% 100%;
      animation: shimmer 1.4s ease-in-out infinite;
    }
    .circle {
      border-radius: 50%;
    }
    :host-context([dir='rtl']) .bone {
      animation-direction: reverse;
    }
    @keyframes shimmer {
      from {
        background-position: 100% 0;
      }
      to {
        background-position: -100% 0;
      }
    }
  `,
})
export class Skeleton {
  readonly variant = input<SkeletonVariant>('text');
  /** Number of lines (text only). The last of several lines is shorter, like a paragraph. */
  readonly lines = input(1, { transform: numberAttribute });
  readonly width = input('100%');
  readonly height = input('0.9rem');

  protected readonly rows = computed(() =>
    Array.from({ length: this.variant() === 'text' ? Math.max(1, this.lines()) : 1 }),
  );
}
