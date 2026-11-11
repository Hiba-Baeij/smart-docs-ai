import { Signal, computed, inject, signal } from '@angular/core';
import { Observable, firstValueFrom, isObservable } from 'rxjs';
import { AppError, toAppError } from '../http/app-error';
import { userMessage } from '../http/user-message';
import { NotificationService } from '../notifications/notification.service';
import { ConfirmService, type ConfirmOptions } from './confirm.service';

/** A text that may depend on the call's variables. */
type Text<V> = string | ((vars: V) => string);

export interface MutationOptions<V, R> {
  /** Ask first. The request runs inside the dialog, which shows a spinner until it ends. */
  confirm?: (vars: V) => Omit<ConfirmOptions, 'action'>;
  /** Shown as a loading toast while the request runs; the same toast becomes success or error. */
  loading?: Text<V>;
  /** Success toast. Omit for no toast. */
  success?: string | ((result: R, vars: V) => string);
  /**
   * Error toast text. Defaults to `userMessage(error)`. Return `null` to show no error toast,
   * for a failure the screen handles itself.
   */
  error?: (error: AppError, vars: V) => string | null;
  onSuccess?: (result: R, vars: V) => void | Promise<unknown>;
  onError?: (error: AppError, vars: V) => void;
  /** Stable toast id, so a retry updates one toast instead of stacking them. */
  toastId?: (vars: V) => string;
}

export type MutationResult<R> =
  | { status: 'success'; value: R }
  | { status: 'error'; error: AppError }
  | { status: 'cancelled' }
  | { status: 'busy' };

export interface Mutation<V, R> {
  /**
   * True while the request is in flight. Bind a trigger button's `disabled` here, not to `busy`:
   * disabling the trigger while its confirm dialog is open drops its focus, so the dialog could
   * not return focus to it on cancel.
   */
  readonly pending: Signal<boolean>;
  /** True from the click until the end: confirm dialog open, or request in flight. */
  readonly busy: Signal<boolean>;
  /** The last failure, cleared when a new run starts. */
  readonly error: Signal<AppError | null>;
  /** Runs it. Never rejects. A second call while busy does nothing and returns `busy`. */
  run(vars: V): Promise<MutationResult<R>>;
}

let sequence = 0;

/**
 * Every create, update, delete, and similar action goes through this, so the whole app gives
 * the same feedback in the same way:
 *
 *   optional confirm dialog → loading toast → success or error toast → `onSuccess` / `onError`.
 *
 * It also blocks double submits and exposes `pending`/`busy` signals, so a component never keeps
 * its own loading flag or writes try/catch around a request. Call it in an injection context
 * (a field initializer).
 */
export function createMutation<V = void, R = unknown>(
  action: (vars: V) => Observable<R> | Promise<R>,
  options: MutationOptions<V, R> = {},
): Mutation<V, R> {
  const notifications = inject(NotificationService);
  const confirmService = inject(ConfirmService);
  const pending = signal(false);
  const confirming = signal(false);
  const error = signal<AppError | null>(null);
  const fallbackId = `mutation-${++sequence}`;

  async function execute(vars: V): Promise<MutationResult<R>> {
    const id = options.toastId?.(vars) ?? fallbackId;
    pending.set(true);
    error.set(null);
    if (options.loading !== undefined) {
      notifications.loading(id, resolve(options.loading, vars));
    }

    try {
      const outcome = action(vars);
      const value = isObservable(outcome) ? await firstValueFrom(outcome) : await outcome;
      if (options.success !== undefined) {
        const text =
          typeof options.success === 'function' ? options.success(value, vars) : options.success;
        notifications.success(id, text);
      } else if (options.loading !== undefined) {
        notifications.dismiss(id);
      }
      pending.set(false);
      await options.onSuccess?.(value, vars);
      return { status: 'success', value };
    } catch (failure) {
      const appError = toAppError(failure);
      error.set(appError);
      const text = options.error ? options.error(appError, vars) : userMessage(appError);
      if (text !== null) {
        notifications.error(id, text);
      } else if (options.loading !== undefined) {
        notifications.dismiss(id);
      }
      pending.set(false);
      options.onError?.(appError, vars);
      return { status: 'error', error: appError };
    }
  }

  return {
    pending: pending.asReadonly(),
    busy: computed(() => pending() || confirming()),
    error: error.asReadonly(),
    async run(vars: V): Promise<MutationResult<R>> {
      if (pending() || confirming()) {
        return { status: 'busy' };
      }
      if (!options.confirm) {
        return execute(vars);
      }

      confirming.set(true);
      let result: MutationResult<R> = { status: 'cancelled' };
      try {
        await confirmService.confirm({
          ...options.confirm(vars),
          action: async () => {
            result = await execute(vars);
          },
        });
      } finally {
        confirming.set(false);
      }
      return result;
    },
  };
}

function resolve<V>(text: Text<V>, vars: V): string {
  return typeof text === 'function' ? text(vars) : text;
}
