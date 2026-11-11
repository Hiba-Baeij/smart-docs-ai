import { Injectable, effect, inject } from '@angular/core';
import { MatPaginatorIntl } from '@angular/material/paginator';
import { LocaleService } from './locale.service';

/**
 * Material paginator labels in the current language. They update on a language switch
 * (`changes.next()` re-renders every paginator). `app-data-table` provides it for its own
 * paginator, so no app-level setup is needed.
 */
@Injectable()
export class LocalePaginatorIntl extends MatPaginatorIntl {
  private readonly locale = inject(LocaleService);

  constructor() {
    super();
    effect(() => {
      this.locale.current();
      this.itemsPerPageLabel = this.locale.t('paginator.itemsPerPage');
      this.nextPageLabel = this.locale.t('paginator.next');
      this.previousPageLabel = this.locale.t('paginator.previous');
      this.firstPageLabel = this.locale.t('paginator.first');
      this.lastPageLabel = this.locale.t('paginator.last');
      this.changes.next();
    });
  }

  override getRangeLabel = (page: number, pageSize: number, length: number): string => {
    const number = new Intl.NumberFormat(this.locale.current());
    if (length === 0) {
      return this.locale.t('paginator.range', { start: 0, end: 0, total: 0 });
    }
    const start = page * pageSize + 1;
    const end = Math.min(length, (page + 1) * pageSize);
    return this.locale.t('paginator.range', {
      start: number.format(start),
      end: number.format(end),
      total: number.format(length),
    });
  };
}
