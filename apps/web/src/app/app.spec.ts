import { TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { provideRouter } from '@angular/router';
import { NgxSonnerToaster } from 'ngx-sonner';
import { LocaleService } from './core/i18n/locale.service';
import { App } from './app';

describe('App', () => {
  beforeAll(() => {
    // jsdom has no matchMedia; ngx-sonner listens for system-theme changes.
    window.matchMedia ??= (() => ({
      matches: false,
      addEventListener: () => undefined,
      removeEventListener: () => undefined,
    })) as unknown as typeof window.matchMedia;
  });
  afterEach(() => {
    localStorage.clear();
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
    document.documentElement.removeAttribute('data-theme');
  });
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      providers: [provideRouter([])],
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);

    expect(fixture.componentInstance).toBeTruthy();
  });

  it('renders a router outlet for the pages', async () => {
    const fixture = TestBed.createComponent(App);
    await fixture.whenStable();

    const compiled = fixture.nativeElement as HTMLElement;
    expect(compiled.querySelector('router-outlet')).not.toBeNull();
  });

  it('applies saved display preferences before a route renders', () => {
    localStorage.setItem('smartdocs.theme', 'dark');
    localStorage.setItem('smartdocs.locale', 'ar');
    TestBed.createComponent(App).detectChanges();
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(document.documentElement.dir).toBe('rtl');
    localStorage.clear();
  });

  it('hosts one toaster whose direction follows the selected language', () => {
    const fixture = TestBed.createComponent(App);
    fixture.detectChanges();
    const toaster = fixture.nativeElement.querySelector('ngx-sonner-toaster') as HTMLElement;
    expect(toaster).not.toBeNull();
    const component = fixture.debugElement.query(By.directive(NgxSonnerToaster)).componentInstance as NgxSonnerToaster;
    expect(component.dir()).toBe('ltr');
    TestBed.inject(LocaleService).set('ar');
    fixture.detectChanges();
    expect(component.dir()).toBe('rtl');
  });
});
