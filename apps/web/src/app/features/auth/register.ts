import { Component, inject } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { AuthApi } from '../../core/auth/auth.api';
import { LocaleService } from '../../core/i18n/locale.service';
import { AppField, AppForm, createSchemaForm, registerSchema } from '../../shared/forms';
import { AuthLayout } from './auth-layout';

@Component({
  imports: [RouterLink, AuthLayout, AppForm, AppField],
  selector: 'app-register',
  styleUrl: './auth-page.scss',
  templateUrl: './register.html',
})
export class Register {
  private readonly api = inject(AuthApi);
  protected readonly locale = inject(LocaleService);
  private readonly router = inject(Router);

  protected readonly form = createSchemaForm({
    id: 'register',
    schema: registerSchema,
    initial: { name: '', email: '', password: '' },
    submit: (data) => this.api.register(data),
    // No automatic sign-in: registration and login stay separate steps.
    onSuccess: () => this.router.navigate(['/login'], { queryParams: { registered: 1 } }),
  });
}
