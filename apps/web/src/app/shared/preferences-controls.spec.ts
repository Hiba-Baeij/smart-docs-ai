import { TestBed } from '@angular/core/testing';
import { LocaleService } from '../core/i18n/locale.service';
import { ThemeService } from '../core/presentation/theme.service';
import { PreferencesControls } from './preferences-controls';

describe('PreferencesControls', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
  });
  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem('smartdocs.theme', 'light');
    TestBed.configureTestingModule({ imports: [PreferencesControls] });
  });

  it('changes the theme and language from keyboard-accessible buttons', () => {
    const fixture = TestBed.createComponent(PreferencesControls);
    fixture.detectChanges();
    const buttons = fixture.nativeElement.querySelectorAll(
      'button',
    ) as NodeListOf<HTMLButtonElement>;
    expect(buttons).toHaveLength(2);
    buttons[0].click();
    buttons[1].click();
    fixture.detectChanges();
    expect(TestBed.inject(ThemeService).current()).toBe('dark');
    expect(TestBed.inject(LocaleService).current()).toBe('ar');
    expect(buttons[0].getAttribute('aria-label')).toBe('التبديل إلى الوضع الفاتح');
    expect(document.documentElement.dir).toBe('rtl');
  });
});
