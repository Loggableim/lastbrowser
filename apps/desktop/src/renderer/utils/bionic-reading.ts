// Bionic Reading Blickfixierung (docs/visionimpaired.md §3.5, Feature 6).
// Fettet die ersten ~45% jedes Wortes, damit das Auge einen Ankerpunkt pro
// Wort bekommt. Reine Funktion — kein DOM-Zugriff, direkt testbar.

export function toBionicHtml(text: string): string {
  return text
    .split(/(\s+)/)
    .map((token) => {
      // Whitespace-Tokens unverändert lassen (erhält Abstände exakt).
      if (/^\s*$/.test(token)) return token;
      // Wörter mit ≤3 Zeichen komplett fetteten — sie sind der Fixpunkt.
      if (token.length <= 3) return `<b>${token}</b>`;
      const mid = Math.ceil(token.length * 0.45);
      return `<b>${token.slice(0, mid)}</b>${token.slice(mid)}`;
    })
    .join('');
}

/** Wie toBionicHtml, aber als React-Children-Segmente ohne HTML-Injektion. */
export function toBionicSegments(text: string): Array<{ text: string; bold: boolean }> {
  const segments: Array<{ text: string; bold: boolean }> = [];
  for (const token of text.split(/(\s+)/)) {
    if (token === '') continue;
    if (/^\s*$/.test(token)) {
      const prev = segments[segments.length - 1];
      if (prev && !prev.bold) prev.text += token;
      else segments.push({ text: token, bold: false });
      continue;
    }
    // Count Unicode code points rather than UTF-16 code units so emoji and
    // supplementary-plane letters are never split into invalid surrogates.
    const characters = Array.from(token);
    if (characters.length <= 3) {
      segments.push({ text: token, bold: true });
      continue;
    }
    const mid = Math.ceil(characters.length * 0.45);
    segments.push({ text: characters.slice(0, mid).join(''), bold: true });
    segments.push({ text: characters.slice(mid).join(''), bold: false });
  }
  return segments;
}
