// Apply saved preferences before Angular and its styles load to avoid a theme/direction flash.
// It names no language: LocaleService saves the direction next to the language code.
try {
  const savedTheme = localStorage.getItem('smartdocs.theme');
  const theme = savedTheme === 'light' || savedTheme === 'dark'
    ? savedTheme
    : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  const locale = localStorage.getItem('smartdocs.locale');
  if (locale && /^[a-z]{2,3}(-[A-Za-z0-9]{2,8})*$/.test(locale)) {
    document.documentElement.lang = locale;
    document.documentElement.dir = localStorage.getItem('smartdocs.dir') === 'rtl' ? 'rtl' : 'ltr';
  }
} catch {
  document.documentElement.dataset.theme = 'light';
}
