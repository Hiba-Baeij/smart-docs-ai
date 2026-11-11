import { Clipboard } from '@angular/cdk/clipboard';
import { Component, Type, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { LucideTrash2 } from '@lucide/angular';
import { AppError } from '../../core/http/app-error';
import { LocaleService } from '../../core/i18n/locale.service';
import { NotificationService } from '../../core/notifications/notification.service';
import {
  Button,
  Card,
  CopyButton,
  ErrorBanner,
  FileIcon,
  FilterChips,
  IconButton,
  Menu,
  type MenuItem,
  PageHeader,
  Skeleton,
  Tab,
  Tabs,
} from './index';

function render<T>(component: Type<T>) {
  const fixture = TestBed.createComponent(component);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    host: fixture.componentInstance,
    root,
    q: <E extends Element = HTMLElement>(selector: string) => root.querySelector<E & HTMLElement>(selector),
    all: (selector: string) => Array.from(root.querySelectorAll<HTMLElement>(selector)),
    detect: () => fixture.detectChanges(),
  };
}

beforeEach(() => {
  TestBed.configureTestingModule({ providers: [provideRouter([])] });
  TestBed.inject(LocaleService).set('en');
});

afterEach(() => TestBed.inject(LocaleService).set('en'));

describe('appButton', () => {
  @Component({
    imports: [Button],
    template: `<button appButton [variant]="variant()" [loading]="loading()" (click)="clicks = clicks + 1">Save</button>`,
  })
  class Host {
    readonly variant = signal<'primary' | 'danger'>('primary');
    readonly loading = signal(false);
    clicks = 0;
  }

  it('keeps the native button and shows its variant', () => {
    const { q } = render(Host);

    expect(q('button')!.textContent?.trim()).toBe('Save');
    expect(q('button')!.classList).toContain('variant-primary');
  });

  it('while loading: shows a spinner, says it is busy, and cannot be pressed', () => {
    const { q, host, detect } = render(Host);
    host.loading.set(true);
    detect();

    const button = q<HTMLButtonElement>('button')!;
    expect(q('app-spinner')).not.toBeNull();
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.disabled).toBe(true);
    button.click();
    expect(host.clicks).toBe(0);
  });
});

describe('appIconButton', () => {
  @Component({
    imports: [IconButton],
    template: `<button appIconButton label="Delete" tone="danger">x</button>`,
  })
  class Host {}

  it('is named by its label, since it shows only an icon', () => {
    const { q } = render(Host);

    expect(q('button')!.getAttribute('aria-label')).toBe('Delete');
    expect(q('button')!.classList).toContain('tone-danger');
  });
});

describe('app-page-header', () => {
  @Component({
    imports: [PageHeader],
    template: `
      <app-page-header title="<b>Report</b>" subtitle="Sub" backLink="/documents" backLabel="All">
        <button pageHeaderActions>Act</button>
      </app-page-header>
    `,
  })
  class Host {}

  it('renders one h1 as text, a subtitle, a back link and the actions', () => {
    const { q, all } = render(Host);

    expect(all('h1')).toHaveLength(1);
    expect(q('h1')!.textContent).toBe('<b>Report</b>');
    expect(q('h1 b')).toBeNull();
    expect(q('.subtitle')!.textContent).toBe('Sub');
    expect(q('a.back')!.getAttribute('href')).toBe('/documents');
    expect(q('.actions button')!.textContent).toBe('Act');
  });
});

describe('app-card', () => {
  @Component({
    imports: [Card],
    template: `<app-card title="Chunks" [loading]="loading()"><p class="content">Body</p></app-card>`,
  })
  class Host {
    readonly loading = signal(false);
  }

  it('is a region named by its title', () => {
    const { q } = render(Host);
    const card = q('app-card')!;

    expect(card.getAttribute('role')).toBe('region');
    expect(q('#' + card.getAttribute('aria-labelledby'))!.textContent).toBe('Chunks');
    expect(q('.content')).not.toBeNull();
  });

  it('shows skeleton lines instead of its content while loading', () => {
    const { q, host, detect } = render(Host);
    host.loading.set(true);
    detect();

    expect(q('app-skeleton')).not.toBeNull();
    expect(q('.content')).toBeNull();
    expect(q('app-card')!.getAttribute('aria-busy')).toBe('true');
  });
});

describe('app-skeleton', () => {
  @Component({ imports: [Skeleton], template: `<app-skeleton [lines]="3" />` })
  class Host {}

  it('draws one bone per line and is hidden from screen readers', () => {
    const { q, all } = render(Host);

    expect(all('.bone')).toHaveLength(3);
    expect(q('app-skeleton')!.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('app-file-icon', () => {
  @Component({ imports: [FileIcon], template: `<app-file-icon [type]="type()" />` })
  class Host {
    readonly type = signal('pdf');
  }

  it.each([
    ['pdf', 'kind-pdf'],
    ['.DOCX', 'kind-doc'],
    ['xlsx', 'kind-sheet'],
    ['zip', 'kind-other'],
  ])('maps %s to %s', (type, kind) => {
    const { q, host, detect } = render(Host);
    host.type.set(type);
    detect();

    expect(q('app-file-icon')!.classList).toContain(kind);
  });
});

describe('app-tabs', () => {
  @Component({
    imports: [Tabs, Tab],
    template: `
      <app-tabs label="Document" [(selected)]="selected">
        <app-tab label="Text"><p class="one">one</p></app-tab>
        <app-tab label="Chunks" [badge]="3"><p class="two">two</p></app-tab>
        <app-tab label="Off" [disabled]="true"><p>off</p></app-tab>
        <app-tab label="Last"><p class="four">four</p></app-tab>
      </app-tabs>
    `,
  })
  class Host {
    selected = 0;
  }

  const key = (target: HTMLElement, name: string) =>
    target.dispatchEvent(new KeyboardEvent('keydown', { key: name, bubbles: true }));

  it('follows the tabs pattern: roles, selection, and the panel each tab controls', () => {
    const { q, all } = render(Host);
    const tabs = all('[role="tab"]');

    expect(q('[role="tablist"]')!.getAttribute('aria-label')).toBe('Document');
    expect(tabs.map((t) => t.getAttribute('aria-selected'))).toEqual(['true', 'false', 'false', 'false']);
    expect(tabs.map((t) => t.getAttribute('tabindex'))).toEqual(['0', '-1', '-1', '-1']);
    const panel = q('#' + tabs[0].getAttribute('aria-controls'))!;
    expect(panel.getAttribute('role')).toBe('tabpanel');
    expect(panel.getAttribute('aria-labelledby')).toBe(tabs[0].id);
    expect(tabs[1].textContent).toContain('3');
  });

  it('shows only the selected panel, and a click selects (two-way)', () => {
    const { q, all, host, detect } = render(Host);
    expect(q('.one')!.closest<HTMLElement>('app-tab')!.hidden).toBe(false);
    expect(q('.two')!.closest<HTMLElement>('app-tab')!.hidden).toBe(true);

    all('[role="tab"]')[1].click();
    detect();

    expect(host.selected).toBe(1);
    expect(q('.two')!.closest<HTMLElement>('app-tab')!.hidden).toBe(false);
    expect(q('.one')!.closest<HTMLElement>('app-tab')!.hidden).toBe(true);
  });

  it('moves with the arrow keys, skips a disabled tab, wraps, and supports Home/End', () => {
    const { q, host, detect } = render(Host);
    /** Keys go to the tab that has focus: the selected one (roving tabindex). */
    const list = () => q('[role="tab"][aria-selected="true"]')!;

    key(list(), 'ArrowRight');
    detect();
    expect(host.selected).toBe(1);
    key(list(), 'ArrowRight');
    detect();
    expect(host.selected).toBe(3); // skipped the disabled one
    key(list(), 'ArrowRight');
    detect();
    expect(host.selected).toBe(0); // wrapped
    key(list(), 'End');
    detect();
    expect(host.selected).toBe(3);
    key(list(), 'Home');
    detect();
    expect(host.selected).toBe(0);
    expect(document.activeElement).toBe(q('[role="tab"]'));
  });

  it('mirrors the arrow keys in Arabic (right-to-left)', () => {
    TestBed.inject(LocaleService).set('ar');
    const { q, host, detect } = render(Host);

    key(q('[role="tab"]')!, 'ArrowLeft');
    detect();

    expect(host.selected).toBe(1);
  });
});

describe('app-menu', () => {
  @Component({
    imports: [Menu],
    template: `<app-menu label="More" [items]="items" />`,
  })
  class Host {
    runs: string[] = [];
    readonly items: MenuItem[] = [
      { id: 'copy', label: 'Copy', run: () => this.runs.push('copy') },
      { id: 'secret', label: 'Secret', hidden: true, run: () => this.runs.push('secret') },
      { id: 'delete', label: 'Delete', tone: 'danger', icon: LucideTrash2, run: () => this.runs.push('delete') },
    ];
  }

  const menuItems = () => Array.from(document.querySelectorAll<HTMLButtonElement>('.app-menu-panel [mat-menu-item]'));

  it('opens from a named trigger, leaves out hidden items, and runs the chosen one', async () => {
    const { q, host, detect } = render(Host);
    const trigger = q('button')!;
    expect(trigger.getAttribute('aria-label')).toBe('More');

    trigger.click();
    detect();
    await new Promise((resolve) => setTimeout(resolve));

    expect(menuItems().map((item) => item.textContent?.trim())).toEqual(['Copy', 'Delete']);
    expect(menuItems()[1].classList).toContain('danger');
    menuItems()[1].click();
    // The item runs after the menu has closed and focus is back on the trigger.
    expect(host.runs).toEqual([]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    expect(host.runs).toEqual(['delete']);
    expect(document.activeElement).toBe(trigger);
  });
});

describe('app-copy-button', () => {
  @Component({ imports: [CopyButton], template: `<app-copy-button value="report.pdf" label="Copy name" />` })
  class Host {}

  it('copies the value, says so in a toast, and shows a check mark', () => {
    const copy = vi.spyOn(TestBed.inject(Clipboard), 'copy').mockReturnValue(true);
    const success = vi.spyOn(TestBed.inject(NotificationService), 'success');
    const { q, detect } = render(Host);
    expect(q('button')!.getAttribute('aria-label')).toBe('Copy name');

    q('button')!.click();
    detect();

    expect(copy).toHaveBeenCalledWith('report.pdf');
    expect(success).toHaveBeenCalledWith('copy', 'Copied to the clipboard.');
    expect(q('svg.done')).not.toBeNull();
  });
});

describe('app-error-banner', () => {
  @Component({
    imports: [ErrorBanner],
    template: `<app-error-banner [error]="error" />`,
  })
  class Host {
    readonly error = new AppError('INTERNAL', 'x', 500, null, 'req-42');
  }

  it('offers a translated retry by default and shows the support reference', () => {
    const { q, detect } = render(Host);
    expect(q('button')!.textContent).toContain('Try again');
    expect(q('.reference')!.textContent).toBe('Reference for support: req-42');

    TestBed.inject(LocaleService).set('ar');
    detect();
    expect(q('button')!.textContent).toContain('حاول مرة أخرى');
    expect(q('.reference')!.textContent).toContain('req-42');
  });
});

describe('app-filter-chips', () => {
  @Component({
    imports: [FilterChips],
    template: `<app-filter-chips label="Status" [options]="options" [selected]="selected" (selectedChange)="changes.push($event)" />`,
  })
  class Host {
    readonly options = [
      { value: null, label: 'All' },
      { value: 'open', label: 'Open' },
    ];
    selected: string | null = null;
    changes: (string | null)[] = [];
  }

  it('is a named group of toggle buttons, and emits only a different choice', () => {
    const { q, all, host } = render(Host);
    const [allChip, open] = all('button');

    expect(q('app-filter-chips')!.getAttribute('role')).toBe('group');
    expect(allChip.getAttribute('aria-pressed')).toBe('true');
    expect(open.getAttribute('aria-pressed')).toBe('false');

    allChip.click();
    open.click();

    expect(host.changes).toEqual(['open']);
  });
});
