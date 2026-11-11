import { Component, computed, input } from '@angular/core';
import { LucideFile, LucideFileSpreadsheet, LucideFileText } from '@lucide/angular';

/**
 * A coloured file badge for a file type (pdf, docx, xlsx, anything else). It is decorative; the
 * type is always written as text next to it.
 */
@Component({
  selector: 'app-file-icon',
  imports: [LucideFile, LucideFileSpreadsheet, LucideFileText],
  host: { 'aria-hidden': 'true', '[class]': '"app-file-icon kind-" + kind() + " size-" + size()' },
  template: `
    @switch (kind()) {
      @case ('sheet') {
        <svg lucideFileSpreadsheet></svg>
      }
      @case ('other') {
        <svg lucideFile></svg>
      }
      @default {
        <svg lucideFileText></svg>
      }
    }
  `,
  styles: `
    :host {
      display: inline-grid;
      place-items: center;
      flex: none;
      width: 2.25rem;
      height: 2.25rem;
      border-radius: 0.65rem;
      background: var(--surface-muted);
      color: var(--text-muted);
    }
    :host(.size-lg) {
      width: 3.25rem;
      height: 3.25rem;
      border-radius: 0.9rem;
    }
    :host(.size-sm) {
      width: 1.75rem;
      height: 1.75rem;
      border-radius: 0.5rem;
    }
    svg {
      width: 55%;
      height: 55%;
    }
    :host(.kind-pdf) {
      background: hsl(0 80% 55% / 0.14);
      color: hsl(0 70% 50%);
    }
    :host(.kind-doc) {
      background: hsl(215 85% 55% / 0.14);
      color: hsl(215 80% 52%);
    }
    :host(.kind-sheet) {
      background: hsl(145 60% 42% / 0.15);
      color: hsl(145 60% 36%);
    }
    :host-context([data-theme='dark']):host(.kind-pdf) {
      color: hsl(0 85% 72%);
    }
    :host-context([data-theme='dark']):host(.kind-doc) {
      color: hsl(215 90% 75%);
    }
    :host-context([data-theme='dark']):host(.kind-sheet) {
      color: hsl(145 60% 65%);
    }
  `,
})
export class FileIcon {
  /** A file type or extension, such as `pdf` or `.xlsx`. */
  readonly type = input.required<string>();
  readonly size = input<'sm' | 'md' | 'lg'>('md');

  protected readonly kind = computed(() => {
    const type = this.type().toLowerCase().replace(/^\./, '');
    if (type === 'pdf') return 'pdf';
    if (type === 'doc' || type === 'docx') return 'doc';
    if (type === 'xls' || type === 'xlsx' || type === 'csv') return 'sheet';
    return 'other';
  });
}
