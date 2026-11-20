export const visibleMainTextLimit = 4000;

export function visibleMainTextScript(origin: string): string {
  return `(${readVisibleMainText.toString()})(${JSON.stringify(origin)}, ${visibleMainTextLimit})`;
}

// This function runs in an isolated Chromium world. Its only inputs come from the native binding.
function readVisibleMainText(expectedOrigin: string, limit: number): string {
  if (window.location.origin !== expectedOrigin || document.visibilityState !== 'visible'
    || document.readyState === 'loading') return '';
  const viewport = window.visualViewport;
  if (!viewport || viewport.scale !== 1 || viewport.offsetLeft !== 0 || viewport.offsetTop !== 0) return '';
  const root = document.querySelector('main, [role="main"]') ?? document.querySelector('article');
  if (!root) return '';
  if (document.querySelector('input[type="password" i],input[autocomplete*="password" i],input[autocomplete="one-time-code" i]')) return '';
  const prose = 'p,h1,h2,h3,h4,h5,h6,li,blockquote,dt,dd,figcaption';
  const excluded = [
    'form,fieldset,input,textarea,select,option,label,button,a,details,summary,dialog,iframe,object,embed',
    'script,style,template,noscript,svg,canvas,code,pre,nav,header,footer,aside',
    '[contenteditable],[spellcheck="true"],[tabindex],[onclick],[aria-hidden="true"],[hidden],[inert],[data-sensitive]',
    '[role="button"],[role="link"],[role="search"],[role="searchbox"],[role="form"],[role="textbox"]',
    '[role="combobox"],[role="listbox"],[role="menuitem"],[role="switch"],[role="checkbox"],[role="radio"],[role="dialog"]',
    '[class*="credential" i],[id*="credential" i],[class*="password" i],[id*="password" i],[class*="secret" i],[id*="secret" i]'
  ].join(',');
  const credentialContext = /\b(?:password|passphrase|passcode|username|credentials?|secret|authorization|bearer|account id|pin number|private key|api key|access token|session (?:id|token)|verification code|recovery code|sign.in code|one.time code|otp|credit card|social security|passwort|kennwort|zugangsdaten|benutzername|geheimnis|anmeldecode|einmalcode|bestätigungscode|wiederherstellungscode|zugriffstoken|sitzungstoken|api.schlüssel|privater schlüssel|kreditkarte)\b/i;
  const sensitiveValue = /[\w.+-]+@[\w.-]+\.[a-z]{2,}|(?:https?:\/\/|\bwww\.)|[a-z0-9_-]{24,}|\b\d{4,}\b|\b(?:\d[ -]?){8,}\b/i;
  const styles = new Map<Element, CSSStyleDeclaration>();
  function styleOf(element: Element): CSSStyleDeclaration {
    let style = styles.get(element);
    if (!style) {
      style = window.getComputedStyle(element);
      styles.set(element, style);
    }
    return style;
  }

  // Hit-test sampling can miss small overlays, including layers with pointer-events:none.
  const elements = document.querySelectorAll('*');
  if (elements.length > 3500) return '';
  const visibleBoxes: Array<{ element: Element; rect: DOMRect }> = [];
  for (const element of elements) {
    if (!element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })) continue;
    for (const pseudo of ['::before', '::after']) {
      const style = window.getComputedStyle(element, pseudo);
      if (style.content !== 'none' && style.content !== 'normal'
        && style.visibility === 'visible' && Number(style.opacity) > 0
        && (style.position !== 'static' || style.transform !== 'none' || style.filter !== 'none')) return '';
    }
    for (const rect of element.getClientRects()) {
      if (rect.width > 0 && rect.height > 0) visibleBoxes.push({ element, rect });
    }
    if (visibleBoxes.length > 5000) return '';
  }

  function clipsVisibleRect(rect: DOMRect, element: Element, style: CSSStyleDeclaration): boolean {
    if (style.overflowX === 'visible' && style.overflowY === 'visible') return false;
    if (style.borderRadius !== '0px') return true;
    const bounds = element.getBoundingClientRect();
    const x = bounds.left + element.clientLeft;
    const y = bounds.top + element.clientTop;
    return (style.overflowX !== 'visible' && (rect.left < x || rect.right > x + element.clientWidth))
      || (style.overflowY !== 'visible' && (rect.top < y || rect.bottom > y + element.clientHeight));
  }

  function visibleRange(node: Text, parent: Element): boolean {
    if (!parent.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true, contentVisibilityAuto: true })) return false;
    const fill = styleOf(parent).getPropertyValue('-webkit-text-fill-color') || styleOf(parent).color;
    // The normalized rgb() form represents an opaque color in Chromium.
    if (!fill.startsWith('rgb(')) return false;
    const range = document.createRange();
    range.selectNodeContents(node);
    const rects = Array.from(range.getClientRects());
    if (!rects.length || rects.length > 30) return false;
    let backgroundChecked = false;
    for (let ancestor: Element | null = parent; ancestor; ancestor = ancestor.parentElement) {
      const style = styleOf(ancestor);
      if (style.visibility !== 'visible' || Number(style.opacity) !== 1 || style.filter !== 'none'
        || style.clipPath !== 'none' || style.clip !== 'auto' || style.maskImage !== 'none'
        || style.mixBlendMode !== 'normal' || style.transform !== 'none'
        || /\b(?:paint|strict|content)\b/.test(style.contain)
        || style.getPropertyValue('-webkit-text-security') !== 'none') return false;
      if (!backgroundChecked && style.backgroundColor.startsWith('rgb(')) {
        if (fill === style.backgroundColor) return false;
        backgroundChecked = true;
      }
      for (const pseudo of ['::before', '::after']) {
        const { content } = window.getComputedStyle(ancestor, pseudo);
        if (content !== 'none' && content !== 'normal') return false;
      }
      if (rects.some(rect => clipsVisibleRect(rect, ancestor!, style))) return false;
    }
    return rects.every(rect => {
      if (rect.width < 1 || rect.height < 1 || rect.left < 0 || rect.top < 0
        || rect.right > viewport!.width || rect.bottom > viewport!.height) return false;
      if (visibleBoxes.some(({ element, rect: box }) => box.left < rect.right && box.right > rect.left
        && box.top < rect.bottom && box.bottom > rect.top && !element.contains(parent))) return false;
      const dx = Math.min(rect.width / 4, 1);
      const dy = Math.min(rect.height / 4, 1);
      const points = [
        [rect.left + dx, rect.top + dy], [rect.right - dx, rect.top + dy],
        [rect.left + dx, rect.bottom - dy], [rect.right - dx, rect.bottom - dy],
        [(rect.left + rect.right) / 2, (rect.top + rect.bottom) / 2]
      ];
      return points.every(([x, y]) => document.elementFromPoint(x, y) === parent);
    });
  }

  const blocks = new Map<Element, string[]>();
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let count = 0, node = walker.nextNode() as Text | null; node && count < 1400;
    count++, node = walker.nextNode() as Text | null) {
    const parent = node.parentElement;
    if (!parent || parent.closest(excluded) || node.length > 1200) continue;
    if (!visibleRange(node, parent)) continue;
    const text = node.data.normalize('NFKC');
    if (credentialContext.test(text)) return '';
    const block = parent.closest(prose);
    if (!block || !root.contains(block)) continue;
    const parts = blocks.get(block) ?? [];
    parts.push(text);
    blocks.set(block, parts);
  }
  const lines: string[] = [];
  let outputLength = 0;
  for (const parts of blocks.values()) {
    const line = parts.join('').replace(/[\u0000-\u001f\u007f\u200b-\u200f\u202a-\u202e\u2066-\u2069]/g, ' ')
      .replace(/\s+/g, ' ').trim();
    if (credentialContext.test(line)) return '';
    if (!line || sensitiveValue.test(line)) continue;
    outputLength += line.length + (lines.length > 0 ? 1 : 0);
    if (outputLength > limit) break;
    lines.push(line);
  }
  return lines.join('\n');
}
