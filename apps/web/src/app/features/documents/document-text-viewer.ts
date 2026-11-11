import {
  Component,
  ElementRef,
  Injector,
  afterNextRender,
  computed,
  effect,
  inject,
  input,
  signal,
  untracked,
} from '@angular/core';
import { LucideChevronDown, LucideChevronUp } from '@lucide/angular';
import { LocaleService } from '../../core/i18n/locale.service';
import { Button, CopyButton, IconButton, SearchInput } from '@shared/ui';

/** Characters shown before "Show all": a long document is not put in the page whole. */
export const TEXT_PREVIEW_CHARACTERS = 5_000;
/** Matches that are marked and counted; a search for "e" in a long text stops here. */
export const MAX_MATCHES = 1_000;

export interface TextSegment {
  text: string;
  /** Index among the matches, or -1 for plain text. */
  match: number;
}

/**
 * Splits `text` around every occurrence of `query` (case-insensitive, up to `MAX_MATCHES`).
 * The pieces are shown as text nodes, never as HTML, so a document that contains markup stays text.
 */
export function highlight(text: string, query: string): { segments: TextSegment[]; total: number; capped: boolean } {
  const needle = query.trim();
  if (!needle) {
    return { segments: [{ text, match: -1 }], total: 0, capped: false };
  }
  const pattern = new RegExp(needle.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'), 'giu');
  const segments: TextSegment[] = [];
  let last = 0;
  let total = 0;
  let capped = false;
  for (const found of text.matchAll(pattern)) {
    if (total === MAX_MATCHES) {
      capped = true;
      break;
    }
    const start = found.index;
    if (start > last) segments.push({ text: text.slice(last, start), match: -1 });
    segments.push({ text: found[0], match: total++ });
    last = start + found[0].length;
  }
  if (last < text.length) segments.push({ text: text.slice(last), match: -1 });
  return { segments, total, capped };
}

/**
 * The extracted text of a document: cut to a preview until "Show all", with a search box that
 * marks every match, counts them, and steps through them (Enter / the arrow buttons).
 */
@Component({
  selector: 'app-document-text-viewer',
  imports: [Button, CopyButton, IconButton, SearchInput, LucideChevronDown, LucideChevronUp],
  templateUrl: './document-text-viewer.html',
  styleUrl: './document-text-viewer.scss',
})
export class DocumentTextViewer {
  protected readonly locale = inject(LocaleService);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  readonly text = input.required<string>();

  protected readonly query = signal('');
  protected readonly current = signal(0);
  protected readonly showAll = signal(false);

  protected readonly searching = computed(() => this.query().trim().length > 0);
  protected readonly cut = computed(() => this.text().length > TEXT_PREVIEW_CHARACTERS);

  /** While searching, the whole text is searched, so a match is never hidden behind "Show all". */
  protected readonly shown = computed(() =>
    this.showAll() || this.searching() ? this.text() : this.text().slice(0, TEXT_PREVIEW_CHARACTERS),
  );

  protected readonly result = computed(() => highlight(this.shown(), this.query()));
  protected readonly total = computed(() => this.result().total);
  protected readonly counter = computed(() => {
    const total = this.total();
    if (total === 0) return this.locale.t('docs.detail.noMatches');
    const label = this.locale.t('docs.detail.matches', { current: this.current() + 1, total: this.result().capped ? `${total}+` : total });
    return label;
  });

  constructor() {
    // A new query starts at its first match.
    effect(() => {
      this.query();
      untracked(() => this.current.set(0));
    });
    // The active match is brought into view, inside the text box only (the page does not jump).
    effect(() => {
      const active = this.current();
      const total = this.total();
      if (total === 0) return;
      untracked(() =>
        afterNextRender(() => {
          const box = this.host.nativeElement.querySelector<HTMLElement>('.text');
          const mark = box?.querySelector<HTMLElement>(`mark[data-match="${active}"]`);
          if (box && mark) {
            box.scrollTop = mark.offsetTop - box.offsetTop - box.clientHeight / 2;
          }
        }, { injector: this.injector }),
      );
    });
  }

  private readonly injector = inject(Injector);

  protected step(direction: 1 | -1): void {
    const total = this.total();
    if (total > 0) {
      this.current.set((this.current() + direction + total) % total);
    }
  }

  protected toggleShowAll(): void {
    this.showAll.update((value) => !value);
  }
}
