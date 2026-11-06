import { TestBed } from '@angular/core/testing';
import { ThemeService } from './theme.service';

describe('ThemeService', () => {
  afterEach(() => {
    localStorage.removeItem('smartdocs.theme');
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';
  });
  beforeEach(() => {
    localStorage.clear();
    document.documentElement.removeAttribute('data-theme');
    document.documentElement.style.colorScheme = '';
  });

  it('uses the system preference on first visit', () => {
    const original = window.matchMedia;
    window.matchMedia = (() => ({ matches: true })) as unknown as typeof window.matchMedia;
    try {
      const theme = TestBed.inject(ThemeService);
      expect(theme.current()).toBe('dark');
      expect(document.documentElement.dataset['theme']).toBe('dark');
    } finally {
      window.matchMedia = original;
    }
  });

  it('persists an explicit choice and updates the document', () => {
    const theme = TestBed.inject(ThemeService);
    theme.set('dark');
    expect(theme.current()).toBe('dark');
    expect(localStorage.getItem('smartdocs.theme')).toBe('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');
    expect(document.documentElement.style.colorScheme).toBe('dark');
    theme.set('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });
});
