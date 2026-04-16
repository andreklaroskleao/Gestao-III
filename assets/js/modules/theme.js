const STORAGE_KEY = 'gestao-theme';

export function initTheme() {
  applyStoredTheme();
}

export function getPreferredTheme() {
  return localStorage.getItem(STORAGE_KEY) || 'system';
}

export function setTheme(theme) {
  localStorage.setItem(STORAGE_KEY, theme);
  applyStoredTheme();
}

function applyStoredTheme() {
  const theme = getPreferredTheme();

  document.body.classList.remove('theme-dark');

  if (theme === 'dark') {
    document.body.classList.add('theme-dark');
    return;
  }

  if (theme === 'light') {
    return;
  }

  const prefersDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
  if (prefersDark) {
    document.body.classList.add('theme-dark');
  }
}