import { Directionality } from '@angular/cdk/bidi';
import { TestBed } from '@angular/core/testing';
import { LocaleService } from './locale.service';

describe('LocaleService', () => {
  afterEach(() => {
    localStorage.clear();
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
  });
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
  });

  it('switches language and document direction immediately', () => {
    const locale = TestBed.inject(LocaleService);
    locale.set('ar');
    expect(locale.current()).toBe('ar');
    expect(document.documentElement.lang).toBe('ar');
    expect(document.documentElement.dir).toBe('rtl');
    expect(localStorage.getItem('smartdocs.locale')).toBe('ar');
    expect(locale.t('nav.documents')).toBe('المستندات');
  });

  it('tells CDK the new direction, so dialogs, menus and tooltips follow a switch without a reload', () => {
    const locale = TestBed.inject(LocaleService);
    const directionality = TestBed.inject(Directionality);
    const changes: string[] = [];
    directionality.change.subscribe((dir) => changes.push(dir));

    locale.set('ar');
    expect(directionality.value).toBe('rtl');
    locale.set('ar'); // no change, no event
    locale.set('en');

    expect(directionality.value).toBe('ltr');
    expect(changes).toEqual(['rtl', 'ltr']);
  });

  it('loads the saved locale and falls back to English for missing Arabic text', () => {
    localStorage.setItem('smartdocs.locale', 'ar');
    const locale = TestBed.inject(LocaleService);
    expect(locale.current()).toBe('ar');
    expect(locale.t('brand.name')).toBe('SmartDocs AI');
    expect(locale.t('auth.login.heading')).toBe('تسجيل الدخول');
  });
});

describe('LocaleService registry', () => {
  beforeEach(() => localStorage.clear());
  afterEach(() => {
    localStorage.clear();
    document.documentElement.lang = 'en';
    document.documentElement.dir = 'ltr';
  });

  it('ignores a saved value that is not a supported language', () => {
    localStorage.setItem('smartdocs.locale', 'xx');
    expect(TestBed.inject(LocaleService).current()).toBe('en');
  });

  it('takes the direction from the registry and saves it for the start-up script', () => {
    const locale = TestBed.inject(LocaleService);
    locale.set('ar');
    expect(locale.dir()).toBe('rtl');
    expect(localStorage.getItem('smartdocs.dir')).toBe('rtl');
    locale.set('en');
    expect(locale.dir()).toBe('ltr');
    expect(localStorage.getItem('smartdocs.dir')).toBe('ltr');
  });

  it('offers every registered language and names the next one in its own language', () => {
    const locale = TestBed.inject(LocaleService);
    expect(locale.available).toEqual(['en', 'ar']);
    expect(locale.nativeName(locale.next())).toBe('العربية');
    locale.set(locale.next());
    expect(locale.nativeName(locale.next())).toBe('English');
  });

  it('fills placeholders', () => {
    expect(TestBed.inject(LocaleService).t('form.required', { label: 'Email' })).toBe(
      'Email is required.',
    );
  });
});
