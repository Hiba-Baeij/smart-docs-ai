import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { LocaleService } from '../i18n/locale.service';
import { ConfirmService } from './confirm.service';

describe('ConfirmService', () => {
  let service: ConfirmService;

  beforeEach(() => {
    service = TestBed.inject(ConfirmService);
    TestBed.inject(LocaleService).set('en');
  });

  afterEach(() => {
    TestBed.inject(MatDialog).closeAll();
    TestBed.inject(LocaleService).set('en');
  });

  const settle = () => new Promise((resolve) => setTimeout(resolve));
  const dialog = () => document.querySelector<HTMLElement>('app-confirm-dialog');
  const dialogButton = (label: RegExp) =>
    Array.from(document.querySelectorAll<HTMLButtonElement>('app-confirm-dialog button')).find(
      (b) => label.test(b.textContent ?? ''),
    )!;

  it('shows the title, message and warning as text, with translated default labels', async () => {
    void service.confirm({ title: 'Remove <b>x</b>?', message: 'It goes.', warning: 'For good.' });
    await settle();

    expect(dialog()!.querySelector('h2')!.textContent).toBe('Remove <b>x</b>?');
    expect(dialog()!.querySelector('b')).toBeNull();
    expect(dialog()!.textContent).toContain('It goes.');
    expect(dialog()!.textContent).toContain('For good.');
    expect(dialogButton(/Confirm/)).toBeDefined();
    expect(dialogButton(/Cancel/)).toBeDefined();
  });

  it('is an alertdialog', async () => {
    void service.confirm({ title: 'T', message: 'M' });
    await settle();

    expect(document.querySelector('mat-dialog-container')!.getAttribute('role')).toBe('alertdialog');
  });

  it('resolves true on confirm and false on cancel', async () => {
    const yes = service.confirm({ title: 'T', message: 'M' });
    await settle();
    dialogButton(/Confirm/).click();
    expect(await yes).toBe(true);

    const no = service.confirm({ title: 'T', message: 'M' });
    await settle();
    dialogButton(/Cancel/).click();
    expect(await no).toBe(false);
  });

  it('resolves false when closed with Escape', async () => {
    const answer = service.confirm({ title: 'T', message: 'M' });
    await settle();

    document
      .querySelector('mat-dialog-container')!
      // CDK reads the legacy keyCode (27) to recognise Escape.
      .dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', keyCode: 27, bubbles: true }));

    expect(await answer).toBe(false);
  });

  it('focuses Cancel first for a destructive action, and Confirm otherwise', async () => {
    void service.confirm({ title: 'T', message: 'M', tone: 'danger' });
    await settle();
    expect(document.activeElement).toBe(dialogButton(/Cancel/));
    TestBed.inject(MatDialog).closeAll();
    await settle();

    void service.confirm({ title: 'T', message: 'M' });
    await settle();
    expect(document.activeElement).toBe(dialogButton(/Confirm/));
  });

  it('follows the current language direction', async () => {
    TestBed.inject(LocaleService).set('ar');
    void service.confirm({ title: 'T', message: 'M' });
    await settle();

    expect(dialog()!.closest('[dir]')!.getAttribute('dir')).toBe('rtl');
    expect(dialogButton(/إلغاء/)).toBeDefined();
  });

  it('keeps the dialog open with both buttons disabled while the action runs', async () => {
    let finish: () => void = () => undefined;
    const answer = service.confirm({
      title: 'T',
      message: 'M',
      action: () => new Promise<void>((resolve) => (finish = resolve)),
    });
    await settle();

    dialogButton(/Confirm/).click();
    await settle();
    expect(dialog()).not.toBeNull();
    expect(dialogButton(/Confirm/).disabled).toBe(true);
    expect(dialogButton(/Cancel/).disabled).toBe(true);

    finish();
    expect(await answer).toBe(true);
  });
});
