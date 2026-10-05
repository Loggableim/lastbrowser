/** Keep the actual selection when Chromium dispatches a right mouse press. */
export const preserveContextSelectionScript = `(() => {
  const key = Symbol.for('lastbrowser.preserveContextSelection');
  if (window[key]) return;
  window[key] = true;
  window.addEventListener('mousedown', event => {
    if (event.button !== 2) return;
    const selection = window.getSelection();
    const editable = event.target?.closest?.('input,textarea,[contenteditable="true"]');
    if (editable && editable.selectionStart !== editable.selectionEnd) {
      event.preventDefault();
      return;
    }
    if (!selection || selection.isCollapsed || !selection.toString().trim()) return;
    for (let i = 0; i < selection.rangeCount; i++) {
      if (Array.from(selection.getRangeAt(i).getClientRects()).some(rect =>
        event.clientX >= rect.left && event.clientX <= rect.right &&
        event.clientY >= rect.top && event.clientY <= rect.bottom)) {
        event.preventDefault();
        event.stopImmediatePropagation();
        return;
      }
    }
  }, true);
})()`;
