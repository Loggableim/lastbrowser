const feedback = document.getElementById('press-copy-status');
const locale = document.documentElement.lang.split('-')[0];
const messages = {
  de: ['Text kopiert.', 'Kopieren nicht verfügbar. Bitte den Text direkt markieren und kopieren.'],
  en: ['Text copied.', 'Copy is unavailable. Please select and copy the text.'],
  es: ['Texto copiado.', 'Selecciona y copia el texto directamente.'],
  fr: ['Texte copié.', 'Veuillez sélectionner et copier le texte directement.'],
  it: ['Testo copiato.', 'Seleziona e copia direttamente il testo.'],
  pt: ['Texto copiado.', 'Selecione e copie o texto diretamente.'],
  ja: ['テキストをコピーしました。', 'テキストを選択してコピーしてください。']
}[locale] || ['Text copied.', 'Please select and copy the text.'];
document.querySelectorAll('[data-copy]').forEach(button => {
  button.addEventListener('click', async () => {
    const target = document.getElementById(button.dataset.copy);
    if (!target) return;
    button.disabled = true;
    try {
      await navigator.clipboard.writeText(target.innerText.trim());
      if (feedback) feedback.textContent = messages[0];
    } catch {
      const selection = window.getSelection();
      if (selection) { const range = document.createRange(); range.selectNodeContents(target); selection.removeAllRanges(); selection.addRange(range); }
      if (feedback) feedback.textContent = messages[1];
    } finally { button.disabled = false; }
  });
});
