# Animated sidekicks

Standalone demo. The desktop app does not load these files.

Original icons, mapped in `apps/desktop/src/renderer/personality-avatar.ts`:

| Sidekick | File |
| --- | --- |
| Nova | `apps/desktop/src/renderer/startup/assets/sidekick-01.png` |
| Orion | `apps/desktop/src/renderer/startup/assets/sidekick-04.png` |
| Patch | `apps/desktop/src/renderer/startup/assets/sidekick-03.png` |
| Spark | `apps/desktop/src/renderer/startup/assets/sidekick-02.png` |
| Zen | `apps/desktop/src/renderer/startup/assets/sidekick-06.png` |

`sidekick-05.png` is in the same folder and is not one of these five.

Open `demo.html`. The shared API is `createSidekick(element).setState(state)` and `.setMini(on)`. States: idle, thinking, working, done, needs_input, error. Mini mode is 40px. Motion stops for `prefers-reduced-motion` and while the figure is outside the viewport.
