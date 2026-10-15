/* Shared animated sidekick. Not mounted by the desktop app. */
const STATES = ['idle', 'thinking', 'working', 'done', 'needs_input', 'error'];

const FACES = {
  nova: { accent: '#3aa0ff', extra: 'button' },
  orion: { accent: '#ff9a1f', extra: 'monocle' },
  patch: { accent: '#ff4d4d', extra: 'headset' },
  spark: { accent: '#b06bff', extra: 'spark' },
  zen: { accent: '#7fd0ff', extra: 'book' },
  custom: { accent: '#9aa4b8', extra: 'plus' }
};

function svg(kind) {
  const face = FACES[kind] || FACES.nova;
  const extra = {
    button: '<circle class="accent" cx="46" cy="118" r="16" fill="#1d7dff"/><path d="M46 106a12 12 0 0 1 0 24" fill="none" stroke="#9ad4ff" stroke-width="3"/>',
    monocle: '<circle class="accent" cx="118" cy="124" r="28" fill="none" stroke="#ff9a1f" stroke-width="6"/><circle cx="104" cy="124" r="4" fill="#ff9a1f"/>',
    headset: '<path class="accent" d="M70 78h140a46 46 0 0 1 0 70" fill="none" stroke="#ff4d4d" stroke-width="10" stroke-linecap="round"/><circle cx="62" cy="150" r="16" fill="#ff4d4d"/><path class="tool" d="M214 168l18 18" stroke="#d7dde8" stroke-width="6" stroke-linecap="round"/>',
    spark: '<path class="accent" d="M78 70h120a28 28 0 0 1 0 36H96z" fill="#8d4dff"/><g class="sparks"><circle cx="214" cy="86" r="4" fill="#ffe56b"/><circle cx="228" cy="104" r="3" fill="#ff8ad4"/><circle cx="206" cy="108" r="2" fill="#9ad4ff"/></g>',
    book: '<circle class="accent" cx="118" cy="126" r="22" fill="none" stroke="#ffb020" stroke-width="4"/><circle cx="168" cy="126" r="22" fill="none" stroke="#ffb020" stroke-width="4"/><path d="M140 126h6" stroke="#ffb020" stroke-width="4"/><g class="book"><path d="M196 176h36v22h-36z" fill="#f4efe4"/><path d="M214 176v22" stroke="#7aa2ff" stroke-width="2"/></g>',
    plus: '<circle class="accent" cx="214" cy="188" r="18" fill="#243044"/><path class="plus" d="M214 178v20M204 188h20" stroke="#d7dde8" stroke-width="4" stroke-linecap="round"/>'
  }[face.extra];
  return `<svg viewBox="0 0 280 280" aria-hidden="true">
    <g class="body">
      <ellipse cx="140" cy="168" rx="104" ry="92" fill="#f7f8ff"/>
      <ellipse cx="78" cy="214" rx="28" ry="24" fill="#efeaff"/>
      <ellipse cx="206" cy="92" rx="22" ry="20" fill="#efeaff"/>
      <rect class="visor" x="78" y="96" width="132" height="96" rx="48" fill="#07111f"/>
      <g class="eyes"><path d="M104 128c10-14 28-14 36 0" fill="none" stroke="#3ee0ff" stroke-width="8" stroke-linecap="round"/><path d="M156 128c10-14 28-14 36 0" fill="none" stroke="#3ee0ff" stroke-width="8" stroke-linecap="round"/></g>
      <path class="mouth" d="M118 156c12 14 32 14 46 0" fill="none" stroke="#3ee0ff" stroke-width="8" stroke-linecap="round"/>
      <path class="ring" d="M86 188h112" fill="none" stroke="${face.accent}" stroke-width="8" stroke-linecap="round"/>
      ${extra}
    </g>
  </svg>`;
}

export function createSidekick(el) {
  const kind = FACES[el.dataset.sidekick] ? el.dataset.sidekick : 'nova';
  el.classList.add('sidekick', `sidekick-${kind}`);
  el.innerHTML = svg(kind);
  el.dataset.state = 'idle';
  let mini = false;
  const reduced = window.matchMedia('(prefers-reduced-motion: reduce)');
  const applyMotion = () => el.classList.toggle('sidekick-reduced', reduced.matches);
  applyMotion();
  reduced.addEventListener?.('change', applyMotion);
  const observer = new IntersectionObserver(entries => {
    el.classList.toggle('sidekick-paused', !entries.some(entry => entry.isIntersecting));
  });
  observer.observe(el);
  return {
    setState(state) {
      el.dataset.state = STATES.includes(state) ? state : 'idle';
      return this;
    },
    setMini(on) {
      mini = Boolean(on);
      el.classList.toggle('sidekick-mini', mini);
      return this;
    },
    destroy() {
      observer.disconnect();
      reduced.removeEventListener?.('change', applyMotion);
    }
  };
}

const api = { createSidekick, STATES };
if (typeof window !== 'undefined') window.createSidekick = createSidekick;
export default api;
