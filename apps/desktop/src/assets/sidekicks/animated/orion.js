export function orionParts(uid) {
  return {
            defs: `
              <linearGradient id="${uid}-goldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#fef08a"/>
                <stop offset="45%" stop-color="#fbbf24"/>
                <stop offset="100%" stop-color="#b45309"/>
              </linearGradient>
              <linearGradient id="${uid}-emeraldGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#34d399"/>
                <stop offset="100%" stop-color="#059669"/>
              </linearGradient>
              <clipPath id="${uid}-monocleClip">
                <circle cx="48" cy="58" r="15.5"/>
              </clipPath>
            `,
            behindShell: '',
            onShell: '',
            overVisor: `
              <!-- Orion Golden Monocle over Left Eye -->
              <g class="orion-monocle">
                <!-- Subtle Glass Tint & Scanline -->
                <circle cx="48" cy="58" r="15.5" fill="rgba(56, 189, 248, 0.08)"/>
                <g clip-path="url(#${uid}-monocleClip)">
                  <line class="orion-scanline" x1="31" y1="58" x2="65" y2="58" stroke="#fde047" stroke-width="2" stroke-linecap="round"/>
                </g>
                <!-- Lens Specular Sheen -->
                <path d="M 41 46 A 12 12 0 0 1 56 48" fill="none" stroke="rgba(255,255,255,0.65)" stroke-width="2.2" stroke-linecap="round"/>
                <!-- Monocle Hinge Tab on Left -->
                <rect x="26.5" y="53.5" width="6.5" height="7" rx="2.2" transform="rotate(-10 30 57)" fill="url(#${uid}-goldGrad)" stroke="#78350f" stroke-width="0.8"/>
                <!-- Metallic Gold Rim -->
                <circle cx="48" cy="58" r="16.8" fill="none" stroke="#78350f" stroke-width="4.6" opacity="0.45"/>
                <circle cx="48" cy="58" r="16.8" fill="none" stroke="url(#${uid}-goldGrad)" stroke-width="3.6"/>
                <circle cx="48" cy="58" r="15" fill="none" stroke="#fef9c3" stroke-width="0.7" opacity="0.7"/>
              </g>
            `,
            frontAccessory: `
              <!-- Orion Built-in Green Checkmark Medallion on Bottom-Right Shell Rim -->
              <g transform="translate(91, 80)">
                <circle cx="0" cy="0" r="13.5" fill="url(#${uid}-shellGrad)" stroke="rgba(139,163,190,0.35)" stroke-width="1"/>
                <circle cx="0" cy="0" r="10.8" fill="url(#${uid}-emeraldGrad)" stroke="#065f46" stroke-width="1"/>
                <path d="M -5 0.5 L -1.5 4 L 5.5 -3.5" fill="none" stroke="#ffffff" stroke-width="3.2" stroke-linecap="round" stroke-linejoin="round"/>
              </g>
            `,
            extraOverlays: `
              <!-- Orion Thinking Constellation Orbit -->
              <g class="orion-constellation">
                <path d="M 34 22 L 52 14 L 76 14 L 94 22" fill="none" stroke="#fbbf24" stroke-width="1.3" stroke-dasharray="3 3" opacity="0.75"/>
                <circle cx="34" cy="22" r="2.6" fill="#fde047"/>
                <circle cx="52" cy="14" r="3.2" fill="#fbbf24"/>
                <circle cx="76" cy="14" r="3.2" fill="#00e5ff"/>
                <circle cx="94" cy="22" r="2.6" fill="#fde047"/>
              </g>
            `
          };
}
