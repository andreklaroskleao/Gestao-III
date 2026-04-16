import { showToast } from './ui.js';

export function createPwaModule() {
  let deferredPrompt = null;

  function registerServiceWorker() {
    if ('serviceWorker' in navigator) {
      window.addEventListener('load', async () => {
        try {
          await navigator.serviceWorker.register('./service-worker.js');
        } catch (error) {
          console.error('Erro ao registrar Service Worker:', error);
        }
      });
    }
  }

  function bindInstallPrompt(buttonSelector = '#install-app-btn') {
    const getButton = () => document.querySelector(buttonSelector);

    window.addEventListener('beforeinstallprompt', (event) => {
      event.preventDefault();
      deferredPrompt = event;

      const button = getButton();
      if (button) {
        button.classList.remove('hidden');
      }
    });

    window.addEventListener('appinstalled', () => {
      deferredPrompt = null;

      const button = getButton();
      if (button) {
        button.classList.add('hidden');
      }

      showToast('Aplicativo instalado com sucesso.', 'success');
    });

    document.addEventListener('click', async (event) => {
      const button = event.target.closest(buttonSelector);
      if (!button || !deferredPrompt) return;

      deferredPrompt.prompt();
      await deferredPrompt.userChoice;
      deferredPrompt = null;
      button.classList.add('hidden');
    });
  }

  return {
    registerServiceWorker,
    bindInstallPrompt
  };
}