export function patchParts(uid) {
  return {
            defs: `
              <linearGradient id="${uid}-redGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#ff5c6c"/>
                <stop offset="50%" stop-color="#ef233c"/>
                <stop offset="100%" stop-color="#990f22"/>
              </linearGradient>
              <linearGradient id="${uid}-darkPad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#334155"/>
                <stop offset="100%" stop-color="#0f172a"/>
              </linearGradient>
            `,
            behindShell: `
              <!-- Patch Headset Top Band Arching Over Shell -->
              <g transform="rotate(-11 64 64)">
                <path d="M 18 54 C 16 12, 112 12, 110 54" fill="none" stroke="#1e293b" stroke-width="7.5" stroke-linecap="round"/>
                <path d="M 16 55 C 14 9, 114 9, 112 55" fill="none" stroke="url(#${uid}-redGrad)" stroke-width="5.5" stroke-linecap="round"/>
                <path d="M 28 27 C 48 13, 80 13, 100 27" fill="none" stroke="#fda4af" stroke-width="1.4" stroke-linecap="round" opacity="0.7"/>
              </g>
            `,
            onShell: `
              <!-- Patch Bottom Chin Tech Dock with Cyan LED Bar -->
              <g transform="rotate(-11 64 64)">
                <path d="M 41 97 L 87 97 L 82 106 C 72 109, 56 109, 46 106 Z" fill="url(#${uid}-darkPad)" stroke="#334155" stroke-width="1"/>
                <rect x="52" y="100" width="24" height="4" rx="2" fill="#06101a"/>
                <rect class="patch-led-bar" x="53" y="100.8" width="22" height="2.4" rx="1.2" fill="#00e5ff" filter="url(#${uid}-neon)"/>
              </g>
            `,
            overVisor: `
              <!-- Patch Subtle Visor Scanlines & Terminal Glyphs -->
              <g class="patch-scanlines" transform="rotate(-11 64 64)">
                <line x1="38" y1="48" x2="90" y2="48" stroke="#00e5ff" stroke-width="0.8" opacity="0.35"/>
                <line x1="35" y1="58" x2="93" y2="58" stroke="#00e5ff" stroke-width="0.8" opacity="0.35"/>
                <line x1="35" y1="68" x2="93" y2="68" stroke="#00e5ff" stroke-width="0.8" opacity="0.35"/>
                <line x1="38" y1="78" x2="90" y2="78" stroke="#00e5ff" stroke-width="0.8" opacity="0.35"/>
              </g>
              <!-- Patch Thinking Code Glyph </> -->
              <g class="patch-code-glyph" transform="translate(64, 45)">
                <path d="M -9 -3 L -13 0 L -9 3 M 9 -3 L 13 0 L 9 3 M 2 -4 L -2 4" fill="none" stroke="#00e5ff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" filter="url(#${uid}-neon)"/>
              </g>
              <!-- Patch Needs-Input Terminal Prompt _ -->
              <g class="patch-prompt" transform="translate(76, 80)">
                <rect x="-5" y="-2" width="10" height="3" rx="1" fill="#00e5ff" filter="url(#${uid}-neon)"/>
              </g>
            `,
            frontAccessory: `
              <!-- Patch Left & Right Headset Ear-Cups + Boom Mic -->
              <g transform="rotate(-11 64 64)">
                <!-- Left Ear Cushion & Red Cup -->
                <ellipse cx="22" cy="56" rx="6.5" ry="18" fill="url(#${uid}-darkPad)"/>
                <ellipse cx="16.5" cy="56" rx="5.5" ry="15" fill="url(#${uid}-redGrad)"/>
                <!-- Mechanical Gear Joint on Left Ear-Cup -->
                <g class="patch-gear" transform="translate(16.5, 56)">
                  <circle cx="0" cy="0" r="3.2" fill="#0f172a" stroke="#fca5a5" stroke-width="1.2" stroke-dasharray="2 1.5"/>
                </g>
                <!-- Right Ear Cushion & Red Cup -->
                <ellipse cx="106" cy="58" rx="6" ry="17" fill="url(#${uid}-darkPad)"/>
                <ellipse cx="111" cy="58" rx="5" ry="14" fill="url(#${uid}-redGrad)"/>
                <!-- Curved Red Boom Microphone Arm & Capsule -->
                <path d="M 109 68 C 108 82, 96 89, 82 86" fill="none" stroke="url(#${uid}-redGrad)" stroke-width="4.2" stroke-linecap="round"/>
                <g transform="translate(77, 85) rotate(8)">
                  <rect x="-8" y="-5.5" width="14" height="11" rx="5.5" fill="url(#${uid}-darkPad)" stroke="#475569" stroke-width="0.8"/>
                  <rect x="4" y="-5.5" width="2.8" height="11" rx="1.2" fill="#ef233c"/>
                </g>
              </g>
            `,
            extraOverlays: ''
          };
}
