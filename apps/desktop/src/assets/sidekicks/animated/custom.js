export function customParts(uid) {
  return {
            defs: `
              <linearGradient id="${uid}-slateMetal" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#f1f5f9"/>
                <stop offset="50%" stop-color="#94a3b8"/>
                <stop offset="100%" stop-color="#475569"/>
              </linearGradient>
            `,
            behindShell: '',
            onShell: `
              <!-- Custom Agent Modular Faceplate Seam Lines & Configurable Slider Track -->
              <g transform="rotate(-11 64 64)">
                <!-- Modular Seam Lines on Shell -->
                <line x1="34" y1="30" x2="40" y2="38" stroke="#64748b" stroke-width="1.4" stroke-linecap="round" opacity="0.65"/>
                <line x1="94" y1="30" x2="88" y2="38" stroke="#64748b" stroke-width="1.4" stroke-linecap="round" opacity="0.65"/>
                <!-- Cyan Visor Accent Bezel -->
                <rect x="31" y="36" width="66" height="54" rx="26" fill="none" stroke="var(--sidekick-custom, #00e5ff)" stroke-width="1.3" opacity="0.65"/>
                <!-- Configurable Bottom Slider Motif -->
                <rect x="46" y="93" width="36" height="6" rx="3" fill="#0f172a" stroke="#475569" stroke-width="1"/>
                <line x1="50" y1="96" x2="78" y2="96" stroke="var(--sidekick-custom, #00e5ff)" stroke-width="1.8" stroke-linecap="round" opacity="0.75"/>
                <g class="custom-slider-thumb">
                  <circle cx="64" cy="96" r="4.2" fill="url(#${uid}-slateMetal)" stroke="var(--sidekick-custom, #00e5ff)" stroke-width="1.5"/>
                </g>
              </g>
            `,
            overVisor: '',
            frontAccessory: `
              <!-- Custom Agent Left Side Precision Configurable Gear Module -->
              <g transform="rotate(-11 64 64)">
                <g transform="translate(21, 58)">
                  <g class="custom-gear">
                    <circle cx="0" cy="0" r="10.5" fill="none" stroke="url(#${uid}-slateMetal)" stroke-width="4" stroke-dasharray="4.2 3.8"/>
                    <circle cx="0" cy="0" r="8.5" fill="url(#${uid}-slateMetal)" stroke="#334155" stroke-width="1"/>
                  </g>
                  <circle cx="0" cy="0" r="3.6" fill="#06101a" stroke="var(--sidekick-custom, #00e5ff)" stroke-width="1.6"/>
                </g>
              </g>
            `,
            extraOverlays: ''
          };
}
