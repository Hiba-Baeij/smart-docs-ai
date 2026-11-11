import { HttpClient, HttpParams } from '@angular/common/http';
import { inject } from '@angular/core';
import { Observable } from 'rxjs';
import { API_BASE_URL } from '../../core/config/api-base';
import { skipGlobalLoading } from '../../core/http/http-context';
import { activeFilters, type Filters, type ListQuery, type Page, type RequestOptions } from './types';

/**
 * The REST calls every resource has, written once. A feature API is a small subclass that names
 * its path and adds what is special to it:
 *
 *   @Injectable({ providedIn: 'root' })
 *   export class DocumentsApi extends ResourceApi<DocumentSummary, DocumentDetail> {
 *     protected readonly path = 'documents';
 *     upload(file: File) { … }
 *   }
 *
 * `list` sends `page`, `pageSize`, the filters that are set, and `sort`/`order` only when a sort
 * is chosen. The API rejects unknown query fields, so nothing is sent that was not asked for.
 */
export abstract class ResourceApi<TItem, TDetail = TItem, F extends Filters = Filters> {
  protected readonly http = inject(HttpClient);
  protected readonly base = inject(API_BASE_URL);

  /** The path under the API base, without slashes, e.g. `documents`. */
  protected abstract readonly path: string;

  protected get url(): string {
    return `${this.base}/${this.path}`;
  }

  /** The URL of one item. The id is escaped, so it cannot add path segments or a query. */
  protected itemUrl(id: string): string {
    return `${this.url}/${encodeURIComponent(id)}`;
  }

  /** `background`: a refresh nobody is waiting for (polling), so it stays out of the progress bar. */
  list(query: ListQuery<F>, options: RequestOptions = {}): Observable<Page<TItem>> {
    let params = new HttpParams().set('page', query.page).set('pageSize', query.pageSize);
    for (const [key, value] of Object.entries(activeFilters(query.filters))) {
      params = params.set(key, value);
    }
    if (query.sort) {
      params = params.set('sort', query.sort.active).set('order', query.sort.direction);
    }
    return this.http.get<Page<TItem>>(this.url, {
      params,
      context: options.background ? skipGlobalLoading() : undefined,
    });
  }

  detail(id: string): Observable<TDetail> {
    return this.http.get<TDetail>(this.itemUrl(id));
  }

  remove(id: string): Observable<void> {
    return this.http.delete<void>(this.itemUrl(id));
  }
}
