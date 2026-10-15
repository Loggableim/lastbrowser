export function sparkParts(uid) {
  return {
            defs: `
              <linearGradient id="${uid}-beretGrad" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" stop-color="#c084fc"/>
                <stop offset="45%" stop-color="#8b5cf6"/>
                <stop offset="100%" stop-color="#5b21b6"/>
              </linearGradient>
              <linearGradient id="${uid}-brushTip" x1="0%" y1="100%" x2="100%" y2="0%">
                <stop offset="0%" stop-color="#fbbf24"/>
                <stop offset="42%" stop-color="#ec4899"/>
                <stop offset="72%" stop-color="#8b5cf6"/>
                <stop offset="100%" stop-color="#00e5ff"/>
              </linearGradient>
            `,
            behindShell: `
              <!-- Spark Artist Paintbrush on Top-Right -->
              <g transform="translate(99, 32) rotate(26)">
                <!-- Purple Handle -->
                <path d="M -4 4 L 4 4 L 3 26 L -3 26 Z" fill="url(#${uid}-beretGrad)"/>
                <!-- Silver Ferrule -->
                <rect x="-4.5" y="-4" width="9" height="8.5" rx="1.5" fill="#cbd5e1" stroke="#64748b" stroke-width="0.8"/>
                <line x1="-4.2" y1="-1" x2="4.2" y2="-1" stroke="#94a3b8" stroke-width="1"/>
                <!-- Colorful Paint Bristles -->
                <path d="M -5 -4 C -7 -13, -2 -19, 1 -24 C 4 -18, 7 -12, 5 -4 Z" fill="url(#${uid}-brushTip)"/>
                <path d="M -2 -5 C -3 -11, 0 -16, 1 -21" fill="none" stroke="rgba(255,255,255,0.55)" stroke-width="1.2" stroke-linecap="round"/>
              </g>
            `,
            onShell: '',
            overVisor: '',
            frontAccessory: `
              <!-- Spark Plush Purple Artist Beret on Top-Left -->
              <g transform="translate(46, 25) rotate(-22)">
                <!-- Beret Stem / Nubbin -->
                <path d="M -4 -14 C -6 -20, 4 -20, 3 -14 Z" fill="url(#${uid}-beretGrad)"/>
                <!-- Plush Beret Crown -->
                <ellipse cx="0" cy="-3" rx="33" ry="12.5" fill="url(#${uid}-beretGrad)"/>
                <path d="M -24 -6 C -10 -14, 12 -14, 25 -6" fill="none" stroke="#ddd6fe" stroke-width="1.6" stroke-linecap="round" opacity="0.55"/>
                <!-- Snug Rim Shadow -->
                <path d="M -27 4 Q 0 10 27 4" fill="none" stroke="#4c1d95" stroke-width="3" stroke-linecap="round"/>
              </g>
              <!-- Idle Twinkle Star -->
              <path class="spark-idle-twinkle" d="M 108 42 L 110 47 L 115 49 L 110 51 L 108 56 L 106 51 L 101 49 L 106 47 Z" fill="#fde047"/>
            `,
            extraOverlays: `
              <!-- Spark Thinking Lightbulb / Sparkles -->
              <g class="spark-idea">
                <circle cx="66" cy="14" r="6" fill="#fde047" filter="url(#${uid}-neon)"/>
                <rect x="63.5" y="19" width="5" height="3" rx="1" fill="#cbd5e1"/>
                <line x1="66" y1="3" x2="66" y2="5.5" stroke="#fde047" stroke-width="2" stroke-linecap="round"/>
                <line x1="55" y1="9" x2="57.5" y2="10.5" stroke="#00e5ff" stroke-width="2" stroke-linecap="round"/>
                <line x1="77" y1="9" x2="74.5" y2="10.5" stroke="#ec4899" stroke-width="2" stroke-linecap="round"/>
              </g>
              <!-- Spark Working Orbiting Confetti Particles -->
              <g class="spark-orbit">
                <circle cx="64" cy="10" r="3.2" fill="#ec4899"/>
                <rect x="114" y="61" width="6" height="6" rx="1.5" transform="rotate(45 117 64)" fill="#fde047"/>
                <circle cx="64" cy="118" r="3.2" fill="#00e5ff"/>
                <polygon points="10,60 14,67 6,67" fill="#a855f7"/>
              </g>
              <!-- Spark Done Burst -->
              <g class="spark-burst">
                <circle cx="24" cy="24" r="3.5" fill="#fde047"/>
                <circle cx="104" cy="24" r="3.5" fill="#00e5ff"/>
                <circle cx="20" cy="96" r="3.5" fill="#ec4899"/>
                <circle cx="106" cy="96" r="3.5" fill="#a855f7"/>
              </g>
            `
          };
}
