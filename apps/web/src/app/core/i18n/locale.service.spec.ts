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

  it('loads the saved locale and falls back to English for missing Arabic text', () => {
    localStorage.setItem('smartdocs.locale', 'ar');
    const locale = TestBed.inject(LocaleService);
    expect(locale.current()).toBe('ar');
    expect(locale.t('brand.name')).toBe('SmartDocs AI');
    expect(locale.t('auth.login.heading')).toBe('تسجيل الدخول');
  });
});
