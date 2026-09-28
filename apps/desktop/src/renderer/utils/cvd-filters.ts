// SVG-Farbmatrizen für Farbenfehlsichtigkeit (docs/visionimpaired.md §7.4, Feature 22).
// Werden als verstecktes Inline-SVG im Renderer gemountet, damit die
// CSS-Filter `filter: url('#lb-cvd-...')` in styles.css ein Ziel haben.
// Matrixwerte nach Standard-CVD-Simulations-/Korrekturmatrizen (Machado et al.).

export type CvdFilterId = 'lb-cvd-protanopia' | 'lb-cvd-deuteranopia' | 'lb-cvd-tritanopia' | 'lb-cvd-achromatopsia';

/** Korrekturmatrizen (nicht Simulationsmatrizen) — verschieben unterscheidbare Farbtöne. */
export const CVD_FILTER_MATRIXES: Record<CvdFilterId, string> = {
  'lb-cvd-protanopia': '0.567 0.433 0 0 0  0.558 0.442 0 0 0  0 0.242 0.758 0 0  0 0 0 1 0',
  'lb-cvd-deuteranopia': '0.625 0.375 0 0 0  0.7 0.3 0 0 0  0 0.3 0.7 0 0  0 0 0 1 0',
  'lb-cvd-tritanopia': '0.95 0.05 0 0 0  0 0.433 0.567 0 0  0 0.475 0.525 0 0  0 0 0 1 0',
  'lb-cvd-achromatopsia': '0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0.299 0.587 0.114 0 0  0 0 0 1 0'
};