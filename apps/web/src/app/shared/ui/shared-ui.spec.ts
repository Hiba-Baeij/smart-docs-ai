import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { AppError } from '../../core/http/app-error';
import type { DocumentState } from '../../features/documents/document-state';
import { EmptyState } from './empty-state/empty-state';
import { ErrorBanner } from './error-banner/error-banner';
import { StatusBadge } from '../../features/documents/document-status-badge';

@Component({
  imports: [ErrorBanner, EmptyState, StatusBadge],
  template: `
    <app-error-banner
      [error]="error()"
      [retryLabel]="retryLabel()"
      (retry)="retries = retries + 1"
    />
    <app-empty-state
      message="No documents yet."
      [actionLabel]="action()"
      (action)="actions = actions + 1"
    />
    <app-status-badge [state]="state()" />
  `,
})
class Host {
  readonly error = signal(new AppError('NETWORK', 'x', 0));
  readonly retryLabel = signal<string | null>('Try again');
  readonly action = signal<string | null>('Upload a document');
  readonly state = signal<DocumentState>('completed');
  retries = 0;
  actions = 0;
}

describe('shared presentational components', () => {
  let host: Host;
  let root: HTMLElement;
  let detect: () => void;

  beforeEach(() => {
    const fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    root = fixture.nativeElement as HTMLElement;
    detect = () => fixture.detectChanges();
    detect();
  });

  const q = <T extends HTMLElement>(selector: string) => root.querySelector<T>(selector);

  describe('ErrorBanner', () => {
    it('says what went wrong in words, as an alert', () => {
      const banner = q('app-error-banner [role="alert"]');

      expect(banner?.textContent).toContain('Cannot reach the server');
    });

    it('offers a retry that emits, and can leave the button out', () => {
      q<HTMLButtonElement>('app-error-banner button')!.click();
      expect(host.retries).toBe(1);

      host.retryLabel.set(null);
      detect();
      expect(q('app-error-banner button')).toBeNull();
    });

    it('shows the support reference only when the API sent one', () => {
      expect(q('app-error-banner .reference')).toBeNull();

      host.error.set(new AppError('INTERNAL', 'x', 500, null, 'req-123'));
      detect();

      expect(q('app-error-banner .reference')?.textContent).toContain('req-123');
    });
  });

  describe('EmptyState', () => {
    it('shows its message and an action that emits', () => {
      expect(q('app-empty-state')?.textContent).toContain('No documents yet.');

      q<HTMLButtonElement>('app-empty-state button')!.click();

      expect(host.actions).toBe(1);
    });

    it('has no button when there is no action', () => {
      host.action.set(null);
      detect();

      expect(q('app-empty-state button')).toBeNull();
    });
  });

  describe('StatusBadge', () => {
    it.each([
      ['processing', 'Processing', 'tone-info'],
      ['stalled', 'Did not finish', 'tone-warning'],
      ['completed', 'Ready', 'tone-success'],
      ['failed', 'Failed', 'tone-danger'],
    ] as const)('writes %s as "%s" with the %s colour', (state, label, tone) => {
      host.state.set(state);
      detect();

      expect(q('app-status-badge')?.textContent?.trim()).toBe(label);
      expect(q('app-status-badge app-badge')?.classList.contains(tone)).toBe(true);
    });

    it('pulses only while processing', () => {
      host.state.set('processing');
      detect();
      expect(q('app-badge')?.classList.contains('pulse')).toBe(true);

      host.state.set('completed');
      detect();
      expect(q('app-badge')?.classList.contains('pulse')).toBe(false);
    });
  });
});
