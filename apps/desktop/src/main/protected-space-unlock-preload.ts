import { ipcRenderer } from 'electron';

window.addEventListener('DOMContentLoaded', () => {
  const form = document.querySelector('form')!;
  const password = document.querySelector('input')!;
  const submit = document.querySelector('button')!;
  const message = document.querySelector('p')!;
  form.addEventListener('submit', async event => {
    event.preventDefault();
    if (submit.disabled || !password.value) return;
    const bytes = new TextEncoder().encode(password.value);
    password.value = '';
    submit.disabled = password.disabled = true;
    message.textContent = '';
    try {
      const attempt = ipcRenderer.invoke('lastbrowser:unlock-protected-space', bytes);
      bytes.fill(0);
      if (await attempt) return;
    } catch {
      // The launcher presents a single failure state for every unlock attempt.
    } finally {
      bytes.fill(0);
      submit.disabled = password.disabled = false;
      password.focus();
    }
    message.textContent = message.dataset.failure ?? '';
  });
});
