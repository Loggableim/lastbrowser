export function novaParts(uid) {
  return {
            defs: `
              <linearGradient id="${uid}-podGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#0099ff"/>
                <stop offset="55%" stop-color="#0052ff"/>
                <stop offset="100%" stop-color="#002b99"/>
              </linearGradient>
            `,
            behindShell: '',
            onShell: `
              <!-- Nova Blue Lower Shell Trim Stripe -->
              <g transform="rotate(-11 64 64)">
                <path d="M 25 81 Q 64 98 103 81" fill="none" stroke="#0047e1" stroke-width="4.5" stroke-linecap="round"/>
                <path class="nova-trim-light" d="M 28 81 Q 64 97 100 81" fill="none" stroke="#00e5ff" stroke-width="2" stroke-linecap="round" filter="url(#${uid}-neon)"/>
              </g>
            `,
            overVisor: '',
            frontAccessory: `
              <!-- Nova Left Electric-Blue Ear-Pod -->
              <g transform="rotate(-11 64 64)">
                <ellipse cx="22" cy="59" rx="7.5" ry="18.5" fill="#0035b5" stroke="#001f70" stroke-width="1"/>
                <ellipse cx="20.5" cy="59" rx="6" ry="14.5" fill="url(#${uid}-podGrad)"/>
                <path class="nova-ear-light" d="M 19.5 50 A 4.5 10 0 0 1 19.5 68" fill="none" stroke="#00e5ff" stroke-width="2.4" stroke-linecap="round" filter="url(#${uid}-neon)"/>
              </g>
            `,
            extraOverlays: ''
          };
}
