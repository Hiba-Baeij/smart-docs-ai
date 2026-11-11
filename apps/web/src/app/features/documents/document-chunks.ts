import { Component, computed, inject, input, signal } from '@angular/core';
import type { ChunkPreview } from '@smartdocs/contracts';
import { LocaleService } from '../../core/i18n/locale.service';
import { type ColumnDef, DataTable, TableEmpty } from '../../shared/data-table';
import { EmptyState, SearchInput } from '@shared/ui';

export const CHUNK_PAGE_SIZES = [10, 25, 50] as const;

/** Where a chunk comes from, in words: "Page 3", "Sheet Q3 Budget", or a dash. */
export function chunkLocation(chunk: ChunkPreview, t: (key: 'docs.detail.page' | 'docs.detail.sheet') => string): string {
  if (chunk.pageNumber !== null) return `${t('docs.detail.page')} ${chunk.pageNumber}`;
  if (chunk.sheetName !== null) return `${t('docs.detail.sheet')} ${chunk.sheetName}`;
  return '—';
}

/**
 * The pieces a document was split into, in the generic table. The list is already in memory, so
 * filtering and paging happen here, in the page: the table is controlled exactly as it is for a
 * list that is paged by the server.
 */
@Component({
  selector: 'app-document-chunks',
  imports: [DataTable, EmptyState, SearchInput, TableEmpty],
  template: `
    <app-data-table
      [rows]="pageRows()"
      [columns]="columns()"
      [trackBy]="byIndex"
      [caption]="locale.t('docs.detail.chunkCaption')"
      [page]="page()"
      [pageSize]="pageSize()"
      [total]="filtered().length"
      [pageSizeOptions]="pageSizes"
      (pageChange)="page.set($event)"
      (pageSizeChange)="setPageSize($event)"
    >
      <app-search-input
        tableToolbar
        class="filter"
        [label]="locale.t('docs.detail.chunkFilter')"
        [clearLabel]="locale.t('docs.detail.clearSearch')"
        [value]="query()"
        (valueChange)="setQuery($event)"
      />
      <ng-template appTableEmpty>
        <app-empty-state [message]="locale.t('docs.detail.noChunks')" />
      </ng-template>
    </app-data-table>
  `,
  styles: `
    .filter {
      flex: 1;
      max-width: 24rem;
    }
  `,
})
export class DocumentChunks {
  protected readonly locale = inject(LocaleService);

  readonly chunks = input.required<readonly ChunkPreview[]>();

  protected readonly pageSizes = CHUNK_PAGE_SIZES;
  protected readonly query = signal('');
  protected readonly page = signal(1);
  protected readonly pageSize = signal<number>(CHUNK_PAGE_SIZES[0]);

  /** Each chunk with its location text, computed once per change and language. */
  private readonly all = computed(() =>
    this.chunks().map((chunk) => ({ ...chunk, location: chunkLocation(chunk, (key) => this.locale.t(key)) })),
  );

  protected readonly filtered = computed(() => {
    const needle = this.query().trim().toLocaleLowerCase(this.locale.current());
    if (!needle) return this.all();
    return this.all().filter((chunk) =>
      `${chunk.location} ${chunk.preview}`.toLocaleLowerCase(this.locale.current()).includes(needle),
    );
  });

  protected readonly pageRows = computed(() => {
    const start = (this.page() - 1) * this.pageSize();
    return this.filtered().slice(start, start + this.pageSize());
  });

  protected readonly columns = computed<ColumnDef<ChunkRow>[]>(() => [
    { key: 'index', header: '#', type: 'number', value: (row) => row.chunkIndex + 1, width: '4rem' },
    { key: 'location', header: this.locale.t('docs.detail.where'), width: '9rem' },
    { key: 'preview', header: this.locale.t('docs.detail.preview'), primary: true },
  ]);

  protected readonly byIndex = (row: ChunkRow) => String(row.chunkIndex);

  protected setQuery(value: string): void {
    this.query.set(value);
    this.page.set(1);
  }

  protected setPageSize(size: number): void {
    this.pageSize.set(size);
    this.page.set(1);
  }
}

interface ChunkRow extends ChunkPreview {
  location: string;
}
