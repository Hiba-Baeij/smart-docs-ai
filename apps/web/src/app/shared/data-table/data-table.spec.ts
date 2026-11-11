import { Component, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { AppError } from '../../core/http/app-error';
import { LocaleService } from '../../core/i18n/locale.service';
import type { Sort } from '../data/types';
import { CellDef, type ColumnDef, DataTable, type RowAction, TableEmpty } from './index';

interface Person {
  id: string;
  name: string;
  age: number | null;
  joined: string;
}

const people: Person[] = [
  { id: '1', name: 'Sara', age: 1234, joined: '2026-01-05T10:00:00.000Z' },
  { id: '2', name: '<b>Omar</b>', age: null, joined: '2026-02-01T10:00:00.000Z' },
];

@Component({
  imports: [DataTable, CellDef, TableEmpty],
  template: `
    <app-data-table
      [rows]="rows()"
      [columns]="columns"
      [trackBy]="byId"
      caption="People"
      [loading]="loading()"
      [error]="error()"
      [page]="page()"
      [pageSize]="2"
      [total]="total()"
      [sort]="sort()"
      [actions]="actions"
      [rowLabel]="name"
      (pageChange)="pages.push($event)"
      (sortChange)="sorts.push($event)"
      (retry)="retries = retries + 1"
    >
      <ng-template appCell="badge" [appCellRows]="rows()" let-row let-i="index">
        <b class="custom">{{ row.name }}#{{ i }}</b>
      </ng-template>
      @if (customEmpty()) {
        <ng-template appTableEmpty><p class="custom-empty">Nobody</p></ng-template>
      }
    </app-data-table>
  `,
})
class Host {
  readonly rows = signal<Person[]>(people);
  readonly loading = signal(false);
  readonly error = signal<AppError | null>(null);
  readonly page = signal(1);
  readonly total = signal<number | null>(null);
  readonly sort = signal<Sort | null>(null);
  readonly customEmpty = signal(false);
  readonly columns: ColumnDef<Person>[] = [
    { key: 'name', header: 'Name', type: 'link', primary: true, link: (p) => ['/people', p.id], sortable: true },
    { key: 'age', header: 'Age', type: 'number' },
    { key: 'joined', header: 'Joined', type: 'date', hideWhenNarrow: true },
    { key: 'badge', header: 'Badge', type: 'custom' },
  ];
  ran: string[] = [];
  readonly actions: RowAction<Person>[] = [
    { id: 'open', label: 'Open', run: (p) => this.ran.push(`open:${p.id}`) },
    { id: 'delete', label: 'Delete', tone: 'danger', hidden: (p) => p.id === '2', run: (p) => this.ran.push(`delete:${p.id}`) },
  ];
  readonly byId = (p: Person) => p.id;
  readonly name = (p: Person) => p.name;
  pages: number[] = [];
  sorts: (Sort | null)[] = [];
  retries = 0;
}

describe('app-data-table', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    TestBed.inject(LocaleService).set('en');
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    fixture.detectChanges();
  });

  afterEach(() => TestBed.inject(LocaleService).set('en'));

  const root = () => fixture.nativeElement as HTMLElement;
  const q = <T extends HTMLElement = HTMLElement>(s: string) => root().querySelector<T>(s);
  const qa = (s: string) => Array.from(root().querySelectorAll<HTMLElement>(s));
  const detect = () => fixture.detectChanges();
  const settle = async () => {
    await new Promise((resolve) => setTimeout(resolve));
    detect();
  };
  const cells = (row: number) => qa('tbody tr')[row].querySelectorAll('td');

  describe('rows and cells', () => {
    it('has a caption and one header per column (plus actions)', () => {
      expect(q('caption')!.textContent!.trim()).toBe('People');
      expect(qa('thead th').map((th) => th.textContent!.trim())).toEqual(['Name', 'Age', 'Joined', 'Badge', 'Actions']);
    });

    it('formats numbers and dates in the current language, and shows a dash for no value', () => {
      expect(cells(0)[1].textContent!.trim()).toBe('1,234');
      expect(cells(1)[1].textContent!.trim()).toBe('—');
      expect(cells(0)[2].textContent).toContain('2026');
      expect(cells(0)[1].className).toContain('align-end');

      TestBed.inject(LocaleService).set('ar');
      detect();
      expect(cells(0)[1].textContent!.trim()).toBe(new Intl.NumberFormat('ar').format(1234));
    });

    it('renders a link cell as a router link, with the value as text, never as markup', () => {
      const link = qa('tbody a.cell-link')[1];
      expect(link.getAttribute('href')).toBe('/people/2');
      expect(link.textContent).toBe('<b>Omar</b>');
      expect(link.querySelector('b')).toBeNull();
    });

    it('renders a custom cell from its appCell template, with the row and its index', () => {
      expect(qa('.custom').map((b) => b.textContent)).toEqual(['Sara#0', '<b>Omar</b>#1']);
    });

    it('labels each cell for the narrow (card) layout, except the primary one', () => {
      expect(cells(0)[0].hasAttribute('data-label')).toBe(false);
      expect(cells(0)[1].getAttribute('data-label')).toBe('Age');
      expect(cells(0)[2].classList).toContain('hide-narrow');
    });
  });

  describe('states', () => {
    it('loading with no rows: skeleton rows, a status for screen readers, and aria-busy', () => {
      host.rows.set([]);
      host.loading.set(true);
      detect();

      expect(qa('tbody .skeleton-row')).toHaveLength(2);
      expect(q('[role="status"]')!.textContent).toContain('Loading');
      expect(q('table')!.getAttribute('aria-busy')).toBe('true');
    });

    it('loading with rows (next page): keeps the rows, dimmed, so nothing jumps', () => {
      host.loading.set(true);
      detect();

      expect(qa('tbody .data-row')).toHaveLength(2);
      expect(q('app-data-table')!.classList).toContain('refreshing');
    });

    it('empty: the default empty state, or the page’s own template', () => {
      host.rows.set([]);
      detect();
      expect(q('app-empty-state')!.textContent).toContain('Nothing here yet.');

      host.customEmpty.set(true);
      detect();
      expect(q('.custom-empty')!.textContent).toBe('Nobody');
      expect(q('table')).toBeNull();
    });

    it('error: the banner instead of the table, and its retry is passed on', () => {
      host.error.set(new AppError('NETWORK', 'x', 0));
      detect();

      expect(q('table')).toBeNull();
      q<HTMLButtonElement>('app-error-banner button')!.click();
      expect(host.retries).toBe(1);
    });
  });

  describe('sorting', () => {
    it('only sortable columns get a sort button, announced with aria-sort', () => {
      const [name, age] = qa('thead th');
      expect(name.querySelector('button.sort')!.getAttribute('aria-label')).toBe('Sort by Name');
      expect(name.getAttribute('aria-sort')).toBe('none');
      expect(age.querySelector('button')).toBeNull();
      expect(age.hasAttribute('aria-sort')).toBe(false);
    });

    it('cycles none → ascending → descending → none', () => {
      const click = () => q<HTMLButtonElement>('button.sort')!.click();

      click();
      host.sort.set({ active: 'name', direction: 'asc' });
      detect();
      expect(q('thead th')!.getAttribute('aria-sort')).toBe('ascending');
      click();
      host.sort.set({ active: 'name', direction: 'desc' });
      detect();
      expect(q('thead th')!.getAttribute('aria-sort')).toBe('descending');
      click();

      expect(host.sorts).toEqual([
        { active: 'name', direction: 'asc' },
        { active: 'name', direction: 'desc' },
        null,
      ]);
    });
  });

  describe('paging', () => {
    it('shows no paginator without a total, or when everything fits one page', () => {
      expect(q('mat-paginator')).toBeNull();
      host.total.set(2);
      detect();
      expect(q('mat-paginator')).toBeNull();
    });

    it('shows the range and emits the 1-based page', () => {
      host.total.set(5);
      detect();

      expect(q('.mat-mdc-paginator-range-label')!.textContent!.trim()).toBe('1–2 of 5');
      q<HTMLButtonElement>('.mat-mdc-paginator-navigation-next')!.click();
      expect(host.pages).toEqual([2]);
    });

    it('translates the paginator', () => {
      host.total.set(5);
      TestBed.inject(LocaleService).set('ar');
      detect();

      expect(q('.mat-mdc-paginator-range-label')!.textContent).toContain('من');
      expect(q('.mat-mdc-paginator-navigation-next')!.getAttribute('aria-label')).toBe('الصفحة التالية');
    });
  });

  describe('row actions', () => {
    it('each row has a menu named after it, without the actions hidden for that row', async () => {
      const triggers = qa('td.actions-col button');
      expect(triggers.map((t) => t.getAttribute('aria-label'))).toEqual(['Actions for Sara', 'Actions for <b>Omar</b>']);

      triggers[1].click();
      await settle();
      const items = Array.from(document.querySelectorAll<HTMLButtonElement>('.app-menu-panel [mat-menu-item]'));
      expect(items.map((i) => i.textContent!.trim())).toEqual(['Open']);

      items[0].click();
      await new Promise((resolve) => setTimeout(resolve, 50)); // runs once the menu has closed
      expect(host.ran).toEqual(['open:2']);
    });
  });
});
