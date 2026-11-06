import { Component, ElementRef, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router, RouterLink } from '@angular/router';
import { firstValueFrom } from 'rxjs';
import { AuthApi } from '../../core/auth/auth.api';
import { toAppError } from '../../core/http/app-error';
import { LocaleService } from '../../core/i18n/locale.service';
import { PreferencesControls } from '../../shared/preferences-controls';
import { applyFieldErrors, fieldMessage, focusFirstInvalid, toAuthFailure } from './auth-form';
import { registerSchema, schemaFieldErrors } from './auth-schema';

@Component({
  imports: [ReactiveFormsModule, RouterLink, PreferencesControls],
  selector: 'app-register',
  styleUrl: './auth-form.scss',
  templateUrl: './register.html',
})
export class Register {
  private readonly api = inject(AuthApi);
  protected readonly locale = inject(LocaleService);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  // The limits mirror the API's RegisterDto; the server stays the authority.
  protected readonly form = new FormGroup({
    name: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.maxLength(100)],
    }),
    email: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.email, Validators.maxLength(254)],
    }),
    password: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(10), Validators.maxLength(128)],
    }),
  });

  protected readonly submitting = signal(false);
  protected readonly formError = signal<string | null>(null);

  protected message(name: 'name' | 'email' | 'password', label: string): string | null {
    return fieldMessage(this.form.controls[name], label, this.locale.current());
  }

  protected async submit(): Promise<void> {
    if (this.submitting()) {
      return; // a double click or a second Enter must not send a second request
    }
    this.formError.set(null);

    this.form.patchValue({
      name: this.form.controls.name.value.trim(),
      email: this.form.controls.email.value.trim(),
    });

    if (this.form.invalid) {
      this.form.markAllAsTouched();
      focusFirstInvalid(this.host.nativeElement, this.form);
      return;
    }

    const parsed = registerSchema.safeParse(this.form.getRawValue());
    if (!parsed.success) {
      const unplaced = applyFieldErrors(
        this.form,
        schemaFieldErrors(parsed.error, this.locale.current()),
      );
      this.formError.set(unplaced.length ? unplaced.join(' ') : null);
      focusFirstInvalid(this.host.nativeElement, this.form);
      return;
    }

    this.submitting.set(true);
    try {
      await firstValueFrom(this.api.register(parsed.data));
      // No automatic sign-in: registration and login stay separate steps.
      await this.router.navigate(['/login'], { queryParams: { registered: 1 } });
    } catch (error) {
      this.showFailure(toAppError(error));
    } finally {
      this.submitting.set(false);
    }
  }

  private showFailure(error: ReturnType<typeof toAppError>): void {
    const failure = toAuthFailure(error, this.locale.current());
    const unplaced = applyFieldErrors(this.form, failure.fieldErrors);

    this.formError.set(failure.formMessage ?? (unplaced.length > 0 ? unplaced.join(' ') : null));

    focusFirstInvalid(this.host.nativeElement, this.form);
  }
}
