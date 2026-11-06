import { Component, inject } from '@angular/core';
import { RouterOutlet } from '@angular/router';
import { NgxSonnerToaster } from 'ngx-sonner';
import { LocaleService } from './core/i18n/locale.service';
import { ThemeService } from './core/presentation/theme.service';

@Component({
  imports: [RouterOutlet, NgxSonnerToaster],
  selector: 'app-root',
  styleUrl: './app.scss',
  templateUrl: './app.html',
})
export class App {
  protected readonly locale = inject(LocaleService);
  protected readonly theme = inject(ThemeService);

  // Initialize document-wide preferences even on routes without controls (such as 404).
}
