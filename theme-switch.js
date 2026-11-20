(() => {
  'use strict';

  const themeKey = 'echoes-color-mode-v1';
  const root = document.documentElement;
  const buttons = [...document.querySelectorAll('[data-set-theme]')];
  const systemTheme = matchMedia('(prefers-color-scheme: light)');

  function syncTheme(theme) {
    root.dataset.theme = theme;
    const light = theme === 'light';
    const iconPath = light ? 'public/livelog-icon-light.svg' : 'public/livelog-icon.svg';
    document.querySelectorAll('[data-brand-icon]').forEach(icon => icon.setAttribute(icon.tagName === 'LINK' ? 'href' : 'src', iconPath));
    document.getElementById('browserThemeColor').content = light ? '#f5f5f3' : '#050505';
    buttons.forEach(button => button.setAttribute('aria-pressed', String(button.dataset.setTheme === theme)));
  }

  buttons.forEach(button => button.addEventListener('click', () => {
    const theme = button.dataset.setTheme;
    syncTheme(theme);
    try { localStorage.setItem(themeKey, theme); } catch {}
  }));

  systemTheme.addEventListener('change', event => {
    let saved;
    try { saved = localStorage.getItem(themeKey); } catch {}
    if (saved !== 'light' && saved !== 'dark') syncTheme(event.matches ? 'light' : 'dark');
  });
  window.addEventListener('storage', event => {
    if (event.key === themeKey) syncTheme(event.newValue === 'light' || event.newValue === 'dark' ? event.newValue : (systemTheme.matches ? 'light' : 'dark'));
  });

  syncTheme(root.dataset.theme === 'light' ? 'light' : 'dark');
})();
