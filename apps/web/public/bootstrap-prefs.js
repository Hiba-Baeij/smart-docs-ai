// Apply saved preferences before Angular and its styles load to avoid a theme/direction flash.
try {
  const savedTheme = localStorage.getItem('smartdocs.theme');
  const theme = savedTheme === 'light' || savedTheme === 'dark'
    ? savedTheme
    : matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
  document.documentElement.dataset.theme = theme;
  document.documentElement.style.colorScheme = theme;
  const locale = localStorage.getItem('smartdocs.locale') === 'ar' ? 'ar' : 'en';
  document.documentElement.lang = locale;
  document.documentElement.dir = locale === 'ar' ? 'rtl' : 'ltr';
} catch {
  document.documentElement.dataset.theme = 'light';
}
