import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import type { ChunkPreview } from '@smartdocs/contracts';
import { LocaleService } from '../../core/i18n/locale.service';
import { DocumentChunks } from './document-chunks';
import { DocumentTextViewer, MAX_MATCHES, TEXT_PREVIEW_CHARACTERS, highlight } from './document-text-viewer';

describe('highlight', () => {
  it('splits the text around every match, ignoring case', () => {
    const { segments, total } = highlight('The cat sat. The CAT left.', 'cat');

    expect(total).toBe(2);
    expect(segments.map((s) => s.text)).toEqual(['The ', 'cat', ' sat. The ', 'CAT', ' left.']);
    expect(segments.map((s) => s.match)).toEqual([-1, 0, -1, 1, -1]);
  });

  it('treats the query as text, not as a pattern', () => {
    expect(highlight('a.b a+b axb', 'a.b').total).toBe(1);
    expect(highlight('1 (2) 3', '(2)').total).toBe(1);
    expect(highlight('x', '[').total).toBe(0);
  });

  it('returns the text whole for an empty or blank query', () => {
    expect(highlight('abc', '').segments).toEqual([{ text: 'abc', match: -1 }]);
    expect(highlight('abc', '   ').total).toBe(0);
  });

  it('finds Arabic text', () => {
    expect(highlight('سياسة العمل عن بعد', 'العمل').total).toBe(1);
  });

  it('stops at the limit and says so', () => {
    const { total, capped } = highlight('e'.repeat(MAX_MATCHES + 50), 'e');

    expect(total).toBe(MAX_MATCHES);
    expect(capped).toBe(true);
  });
});

describe('app-document-text-viewer', () => {
  @Component({ imports: [DocumentTextViewer], template: `<app-document-text-viewer [text]="text()" />` })
  class Host {
    readonly text = signal('The cat sat. The cat left. <b>Not bold</b>');
  }

  function render() {
    TestBed.inject(LocaleService).set('en');
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    const q = (s: string) => root.querySelector<HTMLElement>(s);
    const type = (value: string) => {
      const input = q('input[type="search"]') as HTMLInputElement;
      input.value = value;
      input.dispatchEvent(new Event('input'));
      fixture.detectChanges();
    };
    return { fixture, host: fixture.componentInstance, root, q, qa: (s: string) => Array.from(root.querySelectorAll<HTMLElement>(s)), type, detect: () => fixture.detectChanges() };
  }

  afterEach(() => TestBed.inject(LocaleService).set('en'));

  it('shows the text as text, never as markup', () => {
    const { q } = render();

    expect(q('pre.text')!.textContent).toBe('The cat sat. The cat left. <b>Not bold</b>');
    expect(q('pre.text b')).toBeNull();
  });

  it('marks every match, counts them, and makes the first one active', () => {
    const { q, qa, type } = render();

    type('cat');

    expect(qa('mark')).toHaveLength(2);
    expect(qa('mark')[0].classList).toContain('active');
    expect(q('.counter')!.textContent!.trim()).toBe('1 of 2');
    expect(q('pre.text')!.textContent).toBe('The cat sat. The cat left. <b>Not bold</b>');
  });

  it('a match inside markup-like text stays text', () => {
    const { qa, q, type } = render();

    type('<b>');

    expect(qa('mark')).toHaveLength(1);
    expect(qa('mark')[0].textContent).toBe('<b>');
    expect(q('pre.text b')).toBeNull();
  });

  it('steps through the matches with the buttons and Enter, wrapping around', () => {
    const { q, qa, type, detect } = render();
    type('cat');
    const next = () => qa('app-document-text-viewer .toolbar button').find((b) => b.getAttribute('aria-label') === 'Next match')!;
    const previous = () => qa('app-document-text-viewer .toolbar button').find((b) => b.getAttribute('aria-label') === 'Previous match')!;

    next().click();
    detect();
    expect(q('.counter')!.textContent!.trim()).toBe('2 of 2');
    expect(qa('mark')[1].classList).toContain('active');

    next().click();
    detect();
    expect(q('.counter')!.textContent!.trim()).toBe('1 of 2');

    previous().click();
    detect();
    expect(q('.counter')!.textContent!.trim()).toBe('2 of 2');

    (q('input[type="search"]') as HTMLInputElement).dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    detect();
    expect(q('.counter')!.textContent!.trim()).toBe('1 of 2');
  });

  it('says there are no matches, and disables the step buttons', () => {
    const { q, qa, type } = render();

    type('zebra');

    expect(q('.counter')!.textContent!.trim()).toBe('No matches');
    expect(qa('mark')).toHaveLength(0);
    expect(qa('.toolbar button[aria-label$="match"]').every((b) => (b as HTMLButtonElement).disabled)).toBe(true);
  });

  it('a new search starts at its first match, and clearing it shows the plain text again', () => {
    const { q, qa, type, detect } = render();
    type('cat');
    qa('.toolbar button').find((b) => b.getAttribute('aria-label') === 'Next match')!.click();
    detect();

    type('the');
    expect(q('.counter')!.textContent!.trim()).toBe('1 of 2');

    (q('button.clear') as HTMLButtonElement).click();
    detect();
    expect(qa('mark')).toHaveLength(0);
    expect(q('.counter')).toBeNull();
  });

  it('searches the whole text, even the part a short preview would hide', () => {
    const { host, qa, q, type, detect } = render();
    host.text.set('x'.repeat(TEXT_PREVIEW_CHARACTERS + 100) + ' needle');
    detect();
    expect(q('pre.text')!.textContent).toHaveLength(TEXT_PREVIEW_CHARACTERS);

    type('needle');

    expect(qa('mark')).toHaveLength(1);
    expect(q('button.link')).toBeNull(); // no "Show all" while searching
  });

  it('cuts a long text and shows all of it on request', () => {
    const { host, q, detect } = render();
    host.text.set('y'.repeat(TEXT_PREVIEW_CHARACTERS + 10));
    detect();
    const toggle = () => q('button.link') as HTMLButtonElement;

    expect(q('pre.text')!.textContent).toHaveLength(TEXT_PREVIEW_CHARACTERS);
    toggle().click();
    detect();
    expect(q('pre.text')!.textContent).toHaveLength(TEXT_PREVIEW_CHARACTERS + 10);
    toggle().click();
    detect();
    expect(q('pre.text')!.textContent).toHaveLength(TEXT_PREVIEW_CHARACTERS);
  });
});

describe('app-document-chunks', () => {
  const chunks: ChunkPreview[] = Array.from({ length: 23 }, (_, i) => ({
    chunkIndex: i,
    pageNumber: i < 20 ? i + 1 : null,
    sheetName: i >= 20 ? 'Q3 Budget' : null,
    preview: i === 5 ? 'Salary table' : `Chunk number ${i + 1} text`,
  }));

  @Component({ imports: [DocumentChunks], template: `<app-document-chunks [chunks]="chunks()" />` })
  class Host {
    readonly chunks = signal<ChunkPreview[]>(chunks);
  }

  function render() {
    TestBed.configureTestingModule({ providers: [provideRouter([])] });
    TestBed.inject(LocaleService).set('en');
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const root = fixture.nativeElement as HTMLElement;
    return {
      fixture,
      root,
      host: fixture.componentInstance,
      q: (s: string) => root.querySelector<HTMLElement>(s),
      rows: () => Array.from(root.querySelectorAll<HTMLElement>('tbody .data-row')),
      type: (value: string) => {
        const input = root.querySelector<HTMLInputElement>('input[type="search"]')!;
        input.value = value;
        input.dispatchEvent(new Event('input'));
        fixture.detectChanges();
      },
      detect: () => fixture.detectChanges(),
    };
  }

  afterEach(() => TestBed.inject(LocaleService).set('en'));

  it('shows the first 10 chunks with their number, location and start, and the range', () => {
    const { rows, q } = render();

    expect(rows()).toHaveLength(10);
    expect(rows()[0].textContent).toContain('1');
    expect(rows()[0].textContent).toContain('Page 1');
    expect(rows()[0].textContent).toContain('Chunk number 1 text');
    expect(q('.mat-mdc-paginator-range-label')!.textContent!.trim()).toBe('1–10 of 23');
  });

  it('pages locally to the next chunks', () => {
    const { rows, q, detect } = render();

    (q('.mat-mdc-paginator-navigation-next') as HTMLButtonElement).click();
    detect();

    expect(rows()[0].textContent).toContain('Chunk number 11 text');
    expect(q('.mat-mdc-paginator-range-label')!.textContent!.trim()).toBe('11–20 of 23');
  });

  it('names a spreadsheet chunk by its sheet', () => {
    const { rows, q, detect } = render();
    (q('.mat-mdc-paginator-navigation-next') as HTMLButtonElement).click();
    detect();
    (q('.mat-mdc-paginator-navigation-next') as HTMLButtonElement).click();
    detect();

    expect(rows()[0].textContent).toContain('Sheet Q3 Budget');
  });

  it('filters by what the chunk says or where it is, from page 1', () => {
    const { rows, q, type, detect } = render();
    (q('.mat-mdc-paginator-navigation-next') as HTMLButtonElement).click();
    detect();

    type('salary');
    expect(rows()).toHaveLength(1);
    expect(rows()[0].textContent).toContain('Salary table');
    expect(q('mat-paginator')).toBeNull();

    type('sheet q3');
    expect(rows()).toHaveLength(3);
  });

  it('says when no chunk matches, and shows the rows again when the filter is cleared', () => {
    const { rows, q, type, detect } = render();

    type('nothing like this');
    expect(q('app-empty-state')!.textContent).toContain('No chunks match your filter.');
    expect(rows()).toHaveLength(0);

    (q('button.clear') as HTMLButtonElement).click();
    detect();
    expect(rows()).toHaveLength(10);
  });

  it('shows a chunk preview as text, never as markup', () => {
    const { host, rows, root, detect } = render();
    host.chunks.set([{ chunkIndex: 0, pageNumber: 1, sheetName: null, preview: '<img src=x onerror=alert(1)>' }]);
    detect();

    expect(rows()[0].textContent).toContain('<img src=x onerror=alert(1)>');
    expect(root.querySelector('img')).toBeNull();
  });
});
