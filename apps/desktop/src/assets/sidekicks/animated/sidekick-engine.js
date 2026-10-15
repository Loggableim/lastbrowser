import { novaParts } from './nova.js';
import { orionParts } from './orion.js';
import { patchParts } from './patch.js';
import { sparkParts } from './spark.js';
import { zenParts } from './zen.js';
import { customParts } from './custom.js';

/**
     * LastBrowser Sidekick Engine (v2.0)
     * Personas: nova | orion | patch | spark | zen | custom
     */
    const VALID_STATES = ['idle', 'thinking', 'working', 'done', 'needs-input', 'error'];

    const STATE_LABELS_DE = {
      'idle': 'bereit',
      'thinking': 'denkt nach',
      'working': 'arbeitet',
      'done': 'fertig',
      'needs-input': 'wartet auf Eingabe',
      'error': 'Fehler'
    };

    const PERSONA_META = {
      nova: {
        id: 'nova',
        name: 'Nova',
        tagline: 'Freundlicher Allrounder',
        motionNote: 'Ausgewogener Referenz-Rhythmus (3.6s Breathe, 0.65s Bob, Squash-&-Stretch Hop).',
        primary: '#0066ff',
        accent: '#00e5ff',
        glowColor: '#0077ff'
      },
      orion: {
        id: 'orion',
        name: 'Orion',
        tagline: 'Gründlich & strukturiert',
        motionNote: 'Ruhig & symmetrisch: 4.2s Breathe, Sternbild-Orbit & Monokel-Scan, Metronom-Ring, gesetztes Nicken.',
        primary: '#ff9900',
        accent: '#10b981',
        glowColor: '#f59e0b'
      },
      patch: {
        id: 'patch',
        name: 'Patch',
        tagline: 'Präzise & technisch',
        motionNote: 'Mechanisch & knackig: steps()-Taktung, </> Code-Prompt, rotierendes Gear, Glitch-Jitter bei Error.',
        primary: '#ff2a3c',
        accent: '#00e5ff',
        glowColor: '#ef4444'
      },
      spark: {
        id: 'spark',
        name: 'Spark',
        tagline: 'Kreativ & verspielt',
        motionNote: 'Elastisch & lebendig: Overshoot-Kurven, Ideen-Glühbirne, Konfetti-Orbit, großer Squash-Hop.',
        primary: '#8b5cf6',
        accent: '#ec4899',
        glowColor: '#a855f7'
      },
      zen: {
        id: 'zen',
        name: 'Zen',
        tagline: 'Geduldig & klar',
        motionNote: 'Meditativ & fließend: 6s Atmung, konzentrische Wellenringe, sanftes Aufblühen, kein Shake bei Error.',
        primary: '#fbbf24',
        accent: '#3b82f6',
        glowColor: '#f59e0b'
      },
      custom: {
        id: 'custom',
        name: 'Custom Agent',
        tagline: 'Neutral & konfigurierbar',
        motionNote: 'Neutrales Slate/Silber-Gehäuse mit LastBrowser-Cyan, rotierendem Gear & aktivem Slider.',
        primary: '#94a3b8',
        accent: '#00e5ff',
        glowColor: '#64748b'
      }
    };

    let instanceCounter = 0;

    /**
     * Generates the persona-specific vector layers and overlays inside viewBox="0 0 128 128"
     */
    function buildPersonaParts(persona, uid) {
      const builders = { nova: novaParts, orion: orionParts, patch: patchParts, spark: sparkParts, zen: zenParts, custom: customParts };
      return (builders[persona] || customParts)(uid);
    }

function buildSidekickSVG(persona, uid) {
      const meta = PERSONA_META[persona] || PERSONA_META.nova;
      const parts = buildPersonaParts(persona, uid);
      const isCustom = persona === 'custom';

      // Shell colors: Pure 3D white with cyan/violet rim bounce (or brushed metallic slate-silver for Custom Agent)
      const shellStops = isCustom
        ? `<stop offset="0%" stop-color="#f8fafc"/>
           <stop offset="55%" stop-color="#cbd5e1"/>
           <stop offset="88%" stop-color="#94a3b8"/>
           <stop offset="100%" stop-color="#64748b"/>`
        : `<stop offset="0%" stop-color="#ffffff"/>
           <stop offset="65%" stop-color="#f1f5f9"/>
           <stop offset="88%" stop-color="#e2e8f0"/>
           <stop offset="100%" stop-color="#d8b4fe"/>`;

      return `
        <svg class="sidekick-svg ${persona}-svg" viewBox="0 0 128 128" xmlns="http://www.w3.org/2000/svg" aria-hidden="true" focusable="false">
          <defs>
            <!-- Ambient Glow Gradients -->
            <radialGradient id="${uid}-glowGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="${meta.glowColor}" stop-opacity="0.55"/>
              <stop offset="65%" stop-color="${meta.glowColor}" stop-opacity="0.16"/>
              <stop offset="100%" stop-color="${meta.glowColor}" stop-opacity="0"/>
            </radialGradient>
            <radialGradient id="${uid}-glowDoneGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#10b981" stop-opacity="0.6"/>
              <stop offset="65%" stop-color="#10b981" stop-opacity="0.18"/>
              <stop offset="100%" stop-color="#10b981" stop-opacity="0"/>
            </radialGradient>
            <radialGradient id="${uid}-glowErrorGrad" cx="50%" cy="50%" r="50%">
              <stop offset="0%" stop-color="#ff334b" stop-opacity="0.6"/>
              <stop offset="65%" stop-color="#ff334b" stop-opacity="0.18"/>
              <stop offset="100%" stop-color="#ff334b" stop-opacity="0"/>
            </radialGradient>

            <!-- 3D Shell & Visor Gradients -->
            <linearGradient id="${uid}-shellGrad" x1="15%" y1="10%" x2="85%" y2="95%">
              ${shellStops}
            </linearGradient>
            <linearGradient id="${uid}-visorGrad" x1="20%" y1="10%" x2="80%" y2="90%">
              <stop offset="0%" stop-color="#0f253e"/>
              <stop offset="45%" stop-color="#071324"/>
              <stop offset="100%" stop-color="#02060d"/>
            </linearGradient>

            <!-- Subtle Neon Filter for Eyes, Mouth & LEDs -->
            <filter id="${uid}-neon" x="-25%" y="-25%" width="150%" height="150%">
              <feDropShadow dx="0" dy="0" stdDeviation="2.2" flood-color="#00e5ff" flood-opacity="0.8"/>
            </filter>

            ${parts.defs}
          </defs>

          <!-- 1. #glow: Ambient Radial-Gradient Circles (r=56) -->
          <g id="${uid}-glow" class="glow-layer">
            <circle class="glow-default" cx="64" cy="64" r="56" fill="url(#${uid}-glowGrad)"/>
            <circle class="glow-done" cx="64" cy="64" r="56" fill="url(#${uid}-glowDoneGrad)"/>
            <circle class="glow-error" cx="64" cy="64" r="56" fill="url(#${uid}-glowErrorGrad)"/>
          </g>

          <!-- 2. #status-ring: r=56 Base, Runner, Done (Green) & Error (Red) -->
          <g id="${uid}-status-ring" class="status-ring">
            <circle class="ring-base" cx="64" cy="64" r="56" fill="none" stroke="${meta.primary}" stroke-width="2.5"/>
            <circle class="ring-runner" cx="64" cy="64" r="56" fill="none" stroke="${meta.accent}" stroke-width="3.2" stroke-linecap="round"/>
            <circle class="ring-done" cx="64" cy="64" r="56" fill="none" stroke="#10b981" stroke-width="3.2"/>
            <circle class="ring-error" cx="64" cy="64" r="56" fill="none" stroke="#ff334b" stroke-width="3.2"/>
          </g>

          <!-- 3. .{name}-rig: Character Group -->
          <g class="sidekick-rig ${persona}-rig">
            ${parts.behindShell}

            <!-- Iconic LastBrowser 3D Shell Nubs (Bottom-Left Foot & Top-Right Antenna Bulb) -->
            <g transform="rotate(-11 64 64)">
              <!-- Bottom-Left Foot Nub -->
              <ellipse cx="33" cy="91" rx="13" ry="11.5" fill="url(#${uid}-shellGrad)"/>
              <!-- Top-Right Antenna/Ear Nub -->
              <ellipse cx="94" cy="34" rx="11" ry="12.5" fill="url(#${uid}-shellGrad)"/>

              <!-- Main 3D Rounded Squircle Head Shell -->
              <rect x="20" y="25" width="88" height="74" rx="35" fill="url(#${uid}-shellGrad)"/>
              <!-- Cyan Left Rim Bounce Highlight -->
              <path d="M 52 25.5 C 32 26, 20.5 40, 20.5 60 C 20.5 76, 28 89, 41 95" fill="none" stroke="#00e5ff" stroke-width="2.2" stroke-linecap="round" opacity="0.55"/>
              <!-- Violet Bottom-Right Rim Bounce Highlight -->
              <path d="M 62 98.5 C 88 98.5, 106 86, 107.5 64" fill="none" stroke="${isCustom ? '#38bdf8' : '#e879f9'}" stroke-width="2" stroke-linecap="round" opacity="0.45"/>

              <!-- Deep Dark Navy Visor -->
              <rect x="31" y="36" width="66" height="54" rx="26" fill="url(#${uid}-visorGrad)" stroke="#1e293b" stroke-width="1"/>
            </g>

            ${parts.onShell}

            <!-- Glowing Cyan Eyes & Mouth Group -->
            <g class="face-gaze">
              <g transform="rotate(-11 64 64)">
                <!-- Left Eye (#eye-left) -->
                <g id="${uid}-eye-left" class="eye-left">
                  <path class="eye-normal" d="M 40 60 A 8.5 8.5 0 0 1 56 60" fill="none" stroke="#00e5ff" stroke-width="5.2" stroke-linecap="round" filter="url(#${uid}-neon)"/>
                  <path class="eye-happy" d="M 39 61 A 9 9.5 0 0 1 57 61" fill="none" stroke="#00e5ff" stroke-width="5.6" stroke-linecap="round" filter="url(#${uid}-neon)"/>
                  <line class="eye-half" x1="40" y1="58" x2="56" y2="58" stroke="#00e5ff" stroke-width="4.6" stroke-linecap="round" filter="url(#${uid}-neon)"/>
                </g>

                <!-- Right Eye (#eye-right) -->
                <g id="${uid}-eye-right" class="eye-right">
                  <path class="eye-normal" d="M 71 60 A 8.5 8.5 0 0 1 87 60" fill="none" stroke="#00e5ff" stroke-width="5.2" stroke-linecap="round" filter="url(#${uid}-neon)"/>
                  <path class="eye-happy" d="M 70 61 A 9 9.5 0 0 1 88 61" fill="none" stroke="#00e5ff" stroke-width="5.6" stroke-linecap="round" filter="url(#${uid}-neon)"/>
                  <line class="eye-half" x1="71" y1="58" x2="87" y2="58" stroke="#00e5ff" stroke-width="4.6" stroke-linecap="round" filter="url(#${uid}-neon)"/>
                </g>

                <!-- Mouth (#mouth) -->
                <g id="${uid}-mouth" class="mouth-group">
                  <path class="mouth-smile" d="M 56 71.5 A 8.5 7.5 0 0 0 71 71.5" fill="none" stroke="#00e5ff" stroke-width="4.8" stroke-linecap="round" filter="url(#${uid}-neon)"/>
                  <ellipse class="mouth-small" cx="63.5" cy="73.5" rx="3.8" ry="3.2" fill="#00e5ff" filter="url(#${uid}-neon)"/>
                  <path class="mouth-sad" d="M 56.5 76.5 A 8 6.5 0 0 1 70.5 76.5" fill="none" stroke="#00e5ff" stroke-width="4.4" stroke-linecap="round" filter="url(#${uid}-neon)"/>
                </g>
              </g>
            </g>

            ${parts.overVisor}
            ${parts.frontAccessory}
          </g>

          ${parts.extraOverlays}

          <!-- 4. .thinking-dots: Three Staggered Dots (0 / 0.22 / 0.44s, 1.35s cycle) -->
          <g class="thinking-dots">
            <circle class="dot dot-1" cx="52" cy="16" r="3.4" fill="${meta.accent}"/>
            <circle class="dot dot-2" cx="64" cy="14" r="3.8" fill="#00e5ff"/>
            <circle class="dot dot-3" cx="76" cy="16" r="3.4" fill="${meta.accent}"/>
          </g>

          <!-- 5. #badge at Bottom-Right (~96, 94) -->
          <g id="${uid}-badge" class="badge-group">
            <!-- .badge-done (Check) -->
            <g class="badge-done">
              <circle cx="96" cy="94" r="14" fill="#10b981" stroke="#06101a" stroke-width="2.5"/>
              <path d="M 90 94.2 L 94.2 98.2 L 102.2 90.2" fill="none" stroke="#ffffff" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
            </g>
            <!-- .badge-input ("?") -->
            <g class="badge-input">
              <circle cx="96" cy="94" r="14" fill="#00e5ff" stroke="#06101a" stroke-width="2.5"/>
              <path d="M 93 90.2 C 93 87.8, 99 87.8, 99 90.8 C 99 92.6, 96 93.2, 96 95.4" fill="none" stroke="#06101a" stroke-width="2.6" stroke-linecap="round"/>
              <circle cx="96" cy="99.2" r="1.6" fill="#06101a"/>
            </g>
            <!-- .badge-error ("!") -->
            <g class="badge-error">
              <circle cx="96" cy="94" r="14" fill="#ff334b" stroke="#06101a" stroke-width="2.5"/>
              <line x1="96" y1="88" x2="96" y2="95" stroke="#ffffff" stroke-width="3" stroke-linecap="round"/>
              <circle cx="96" cy="99.5" r="1.7" fill="#ffffff"/>
            </g>
          </g>
        </svg>
      `.trim();
    }

    /**
     * Core Sidekick Factory — Identical API for every persona:
     * const s = createSidekick(el, { persona: 'orion', mini: false, onVisibilityChange });
     */
    function createSidekick(el, options = {}) {
      if (!el) {
        throw new Error('createSidekick requires a valid DOM host element.');
      }

      const rawPersona = (options.persona || el.dataset.persona || 'nova').toLowerCase();
      const persona = PERSONA_META[rawPersona] ? rawPersona : 'nova';
      const mini = Boolean(options.mini || el.classList.contains('sidekick-mini') || el.classList.contains(`${persona}-mini`));
      if (persona === 'custom' && typeof options.color === 'string' && /^#[0-9a-fA-F]{3,8}$/.test(options.color)) {
        el.style.setProperty('--sidekick-custom', options.color);
      }
      const onVisibilityChange = typeof options.onVisibilityChange === 'function' ? options.onVisibilityChange : null;

      instanceCounter += 1;
      const uid = `${persona}-${instanceCounter}`;

      // Configure Host Classes & Accessibility Attributes
      el.dataset.persona = persona;
      el.classList.add('sidekick-host', `${persona}-host`);
      if (mini) {
        el.classList.add('sidekick-mini', `${persona}-mini`);
      }
      el.setAttribute('role', 'img');

      // Inject SVG template if host is empty
      if (!el.querySelector('svg')) {
        el.innerHTML = buildSidekickSVG(persona, uid);
      }

      let currentState = 'idle';
      let doneTimer = null;
      let blinkTimeout = null;
      let blinkResetTimeout = null;
      let isOffscreen = false;
      const listeners = new Set();

      const reducedMotionQuery = window.matchMedia
        ? window.matchMedia('(prefers-reduced-motion: reduce)')
        : { matches: false, addEventListener: () => {}, removeEventListener: () => {} };

      function isReducedMotionActive() {
        return Boolean(
          reducedMotionQuery.matches ||
          document.body.classList.contains('simulate-reduced-motion')
        );
      }

      function updateAriaLabel(state) {
        const meta = PERSONA_META[persona];
        const stateText = STATE_LABELS_DE[state] || state;
        el.setAttribute('aria-label', `${meta.name} – ${stateText}`);
      }

      function clearBlinkTimers() {
        if (blinkTimeout) {
          clearTimeout(blinkTimeout);
          blinkTimeout = null;
        }
        if (blinkResetTimeout) {
          clearTimeout(blinkResetTimeout);
          blinkResetTimeout = null;
        }
        el.classList.remove('is-blinking');
      }

      function scheduleNextBlink() {
        clearBlinkTimers();
        if (mini || currentState !== 'idle' || isOffscreen || isReducedMotionActive()) {
          return;
        }
        // Random blink every 3–6 seconds (140 ms duration)
        const delay = 3000 + Math.random() * 3000;
        blinkTimeout = setTimeout(() => {
          if (currentState === 'idle' && !isOffscreen && !isReducedMotionActive()) {
            el.classList.add('is-blinking');
            blinkResetTimeout = setTimeout(() => {
              el.classList.remove('is-blinking');
              scheduleNextBlink();
            }, 140);
          }
        }, delay);
      }

      function normalizeState(inputState) {
        if (typeof inputState !== 'string') return null;
        const trimmed = inputState.trim().toLowerCase();
        if (trimmed === 'needs_input') return 'needs-input';
        return VALID_STATES.includes(trimmed) ? trimmed : null;
      }

      function setState(nextStateRaw) {
        const normalized = normalizeState(nextStateRaw);
        if (!normalized) {
          console.warn(`[LastBrowser Sidekick] Unknown state "${nextStateRaw}" for ${persona}. Keeping "${currentState}".`);
          return currentState;
        }

        if (doneTimer) {
          clearTimeout(doneTimer);
          doneTimer = null;
        }

        const prevState = currentState;
        currentState = normalized;
        el.dataset.state = currentState;
        updateAriaLabel(currentState);

        if (currentState === 'idle') {
          scheduleNextBlink();
        } else {
          clearBlinkTimers();
        }

        // Auto-return from done -> idle after 1.5s
        if (currentState === 'done') {
          doneTimer = setTimeout(() => {
            setState('idle');
          }, 1500);
        }

        if (prevState !== currentState) {
          listeners.forEach((fn) => {
            try {
              fn(currentState, prevState);
            } catch (err) {
              console.error(err);
            }
          });
        }

        return currentState;
      }

      function getState() {
        return currentState;
      }

      function onStateChange(fn) {
        if (typeof fn === 'function') {
          listeners.add(fn);
        }
        return () => listeners.delete(fn);
      }

      // IntersectionObserver for offscreen pause (.is-offscreen)
      let observer = null;
      if ('IntersectionObserver' in window) {
        observer = new IntersectionObserver((entries) => {
          entries.forEach((entry) => {
            isOffscreen = !entry.isIntersecting;
            el.classList.toggle('is-offscreen', isOffscreen);
            if (isOffscreen) {
              clearBlinkTimers();
            } else if (currentState === 'idle') {
              scheduleNextBlink();
            }
            if (onVisibilityChange) {
              onVisibilityChange(!isOffscreen);
            }
          });
        }, { threshold: 0.05 });
        observer.observe(el);
      }

      // Live listener for prefers-reduced-motion changes
      function handleMotionPreferenceChange() {
        if (isReducedMotionActive()) {
          clearBlinkTimers();
        } else if (currentState === 'idle' && !isOffscreen) {
          scheduleNextBlink();
        }
      }

      if (reducedMotionQuery.addEventListener) {
        reducedMotionQuery.addEventListener('change', handleMotionPreferenceChange);
      }

      // Initialize state
      const initialAttrState = normalizeState(el.dataset.state) || 'idle';
      setState(initialAttrState);

      function destroy() {
        clearBlinkTimers();
        if (doneTimer) clearTimeout(doneTimer);
        if (observer) observer.disconnect();
        if (reducedMotionQuery.removeEventListener) {
          reducedMotionQuery.removeEventListener('change', handleMotionPreferenceChange);
        }
        listeners.clear();
      }

      return {
        persona,
        mini,
        setState,
        getState,
        onStateChange,
        destroy,
        _refreshMotion: handleMotionPreferenceChange
      };
    }

    // Expose globally
    export { createSidekick, buildSidekickSVG, PERSONA_META, VALID_STATES };
export default createSidekick;
  