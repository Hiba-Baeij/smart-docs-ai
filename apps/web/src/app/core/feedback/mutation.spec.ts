import { HttpErrorResponse } from '@angular/common/http';
import { Injector, runInInjectionContext } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { MatDialog } from '@angular/material/dialog';
import { Subject, of, throwError } from 'rxjs';
import { AppError } from '../http/app-error';
import { NotificationService } from '../notifications/notification.service';
import { createMutation, type MutationOptions } from './mutation';

describe('createMutation', () => {
  let notifications: {
    loading: ReturnType<typeof vi.fn>;
    success: ReturnType<typeof vi.fn>;
    error: ReturnType<typeof vi.fn>;
    dismiss: ReturnType<typeof vi.fn>;
  };

  beforeEach(() => {
    notifications = { loading: vi.fn(), success: vi.fn(), error: vi.fn(), dismiss: vi.fn() };
    TestBed.configureTestingModule({
      providers: [{ provide: NotificationService, useValue: notifications }],
    });
  });

  afterEach(() => TestBed.inject(MatDialog).closeAll());

  const make = <V = void, R = unknown>(
    action: Parameters<typeof createMutation<V, R>>[0],
    options?: MutationOptions<V, R>,
  ) => runInInjectionContext(TestBed.inject(Injector), () => createMutation(action, options));

  const settle = () => new Promise((resolve) => setTimeout(resolve));

  describe('without a confirm', () => {
    it('runs, turns the loading toast into a success toast, and calls onSuccess', async () => {
      const onSuccess = vi.fn();
      const mutation = make((n: number) => of(n * 2), {
        toastId: () => 'op',
        loading: 'Saving…',
        success: (result) => `Saved ${result}`,
        onSuccess,
      });

      const result = await mutation.run(21);

      expect(result).toEqual({ status: 'success', value: 42 });
      expect(notifications.loading).toHaveBeenCalledWith('op', 'Saving…');
      expect(notifications.success).toHaveBeenCalledWith('op', 'Saved 42');
      expect(onSuccess).toHaveBeenCalledWith(42, 21);
      expect(mutation.pending()).toBe(false);
    });

    it('accepts a promise as well as an observable', async () => {
      const mutation = make(() => Promise.resolve('ok'));

      expect(await mutation.run()).toEqual({ status: 'success', value: 'ok' });
    });

    it('dismisses the loading toast when there is no success text', async () => {
      const mutation = make(() => of(1), { toastId: () => 'op', loading: 'Working…' });

      await mutation.run();

      expect(notifications.dismiss).toHaveBeenCalledWith('op');
      expect(notifications.success).not.toHaveBeenCalled();
    });

    it('reports a failure in the user words for its code, keeps it, and calls onError', async () => {
      const onError = vi.fn();
      const mutation = make<void, never>(() => throwError(() => new HttpErrorResponse({ status: 0 })), {
        toastId: () => 'op',
        onError,
      });

      const result = await mutation.run();

      expect(result.status).toBe('error');
      expect(mutation.error()).toBeInstanceOf(AppError);
      expect(mutation.error()!.code).toBe('NETWORK');
      expect(notifications.error).toHaveBeenCalledWith(
        'op',
        expect.stringContaining('Cannot reach the server'),
      );
      expect(onError).toHaveBeenCalledWith(mutation.error(), undefined);
    });

    it('shows no error toast when the error text is null (the screen handles it)', async () => {
      const mutation = make(() => throwError(() => new Error('x')), {
        toastId: () => 'op',
        loading: 'Working…',
        error: () => null,
      });

      await mutation.run();

      expect(notifications.error).not.toHaveBeenCalled();
      expect(notifications.dismiss).toHaveBeenCalledWith('op');
    });

    it('is pending while in flight and ignores a second run, so a double click sends one request', async () => {
      const answer = new Subject<string>();
      const action = vi.fn(() => answer);
      const mutation = make(action);

      const first = mutation.run();
      expect(mutation.pending()).toBe(true);
      expect(await mutation.run()).toEqual({ status: 'busy' });
      expect(action).toHaveBeenCalledTimes(1);

      answer.next('done');
      answer.complete();
      expect(await first).toEqual({ status: 'success', value: 'done' });
      expect(mutation.pending()).toBe(false);
    });

    it('clears the previous error when it runs again', async () => {
      let fail = true;
      const mutation = make(() => (fail ? throwError(() => new Error('x')) : of(1)));
      await mutation.run();
      expect(mutation.error()).not.toBeNull();

      fail = false;
      await mutation.run();
      expect(mutation.error()).toBeNull();
    });
  });

  describe('with a confirm', () => {
    const dialogButton = (label: RegExp) =>
      Array.from(document.querySelectorAll<HTMLButtonElement>('app-confirm-dialog button')).find(
        (b) => label.test(b.textContent ?? ''),
      )!;

    it('does nothing when the person cancels', async () => {
      const action = vi.fn(() => of(1));
      const mutation = make(action, {
        confirm: () => ({ title: 'Sure?', message: 'Really?', cancelLabel: 'No', confirmLabel: 'Yes' }),
      });

      const result = mutation.run();
      await settle();
      expect(mutation.busy()).toBe(true);
      expect(mutation.pending()).toBe(false);
      dialogButton(/No/).click();

      expect(await result).toEqual({ status: 'cancelled' });
      expect(action).not.toHaveBeenCalled();
      expect(mutation.busy()).toBe(false);
    });

    it('runs inside the dialog when confirmed, and the dialog closes after', async () => {
      const answer = new Subject<number>();
      const mutation = make(() => answer, {
        confirm: () => ({ title: 'Sure?', message: 'Really?', cancelLabel: 'No', confirmLabel: 'Yes' }),
      });

      const result = mutation.run();
      await settle();
      dialogButton(/Yes/).click();
      await settle();
      expect(mutation.pending()).toBe(true);
      expect(dialogButton(/Yes/).disabled).toBe(true);
      expect(await mutation.run()).toEqual({ status: 'busy' });

      answer.next(7);
      answer.complete();
      expect(await result).toEqual({ status: 'success', value: 7 });
      await settle();
      expect(document.querySelector('app-confirm-dialog')).toBeNull();
    });
  });
});
