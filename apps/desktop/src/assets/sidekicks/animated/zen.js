export function zenParts(uid) {
  return {
            defs: `
              <linearGradient id="${uid}-zenGold" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#fef08a"/>
                <stop offset="50%" stop-color="#f59e0b"/>
                <stop offset="100%" stop-color="#b45309"/>
              </linearGradient>
            `,
            behindShell: '',
            onShell: '',
            overVisor: `
              <!-- Zen Round Golden Eyeglasses Framing Both Eyes -->
              <g transform="rotate(-11 64 64)">
                <!-- Left & Right Lens Subtle Glass Sheen -->
                <circle cx="48" cy="59" r="14.2" fill="rgba(254, 240, 138, 0.05)"/>
                <circle cx="79" cy="59" r="14.2" fill="rgba(254, 240, 138, 0.05)"/>
                <path d="M 41 49 A 10 10 0 0 1 53 49" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="1.8" stroke-linecap="round"/>
                <path d="M 72 49 A 10 10 0 0 1 84 49" fill="none" stroke="rgba(255,255,255,0.45)" stroke-width="1.8" stroke-linecap="round"/>
                <!-- Arched Golden Bridge -->
                <path d="M 62 58 Q 63.5 53.5 65 58" fill="none" stroke="url(#${uid}-zenGold)" stroke-width="3.2" stroke-linecap="round"/>
                <!-- Left & Right Temple Hinge Lugs -->
                <rect x="30" y="56" width="4.5" height="4.5" rx="1.5" fill="url(#${uid}-zenGold)"/>
                <rect x="92.5" y="56" width="4.5" height="4.5" rx="1.5" fill="url(#${uid}-zenGold)"/>
                <!-- Golden Round Frames -->
                <circle cx="48" cy="59" r="14.5" fill="none" stroke="url(#${uid}-zenGold)" stroke-width="3.2"/>
                <circle cx="79" cy="59" r="14.5" fill="none" stroke="url(#${uid}-zenGold)" stroke-width="3.2"/>
              </g>
            `,
            frontAccessory: `
              <!-- Zen Open Book Emblem on Bottom-Right Shell Rim -->
              <g transform="translate(88, 84) rotate(8)">
                <!-- Gold Book Cover -->
                <path d="M -13 -7 Q -6 -10 0 -6 Q 6 -10 13 -7 L 11 9 Q 5 6 0 10 Q -5 6 -11 9 Z" fill="url(#${uid}-zenGold)" stroke="#92400e" stroke-width="1"/>
                <!-- Blue Inner Binding -->
                <path d="M -11 -5.5 Q -5 -8 0 -4.5 Q 5 -8 11 -5.5 L 9.5 7 Q 4.5 4.5 0 8 Q -4.5 4.5 -9.5 7 Z" fill="#1d4ed8"/>
                <!-- Cream Open Pages -->
                <path d="M -9.5 -4.5 Q -4.5 -7 0 -3.5 L 0 6.5 Q -4.5 3.5 -8.5 5.5 Z" fill="#fffbeb"/>
                <path d="M 9.5 -4.5 Q 4.5 -7 0 -3.5 L 0 6.5 Q 4.5 3.5 8.5 5.5 Z" fill="#fef3c7"/>
                <line x1="0" y1="-3.5" x2="0" y2="6.5" stroke="#d97706" stroke-width="1"/>
              </g>
            `,
            extraOverlays: `
              <!-- Zen Concentric Ripple Rings in Thinking -->
              <g class="zen-ripples">
                <circle class="zen-ripple-1" cx="64" cy="64" r="50" fill="none" stroke="#fbbf24" stroke-width="1.6"/>
                <circle class="zen-ripple-2" cx="64" cy="64" r="50" fill="none" stroke="#00e5ff" stroke-width="1.2"/>
              </g>
            `
          };
}
