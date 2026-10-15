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

The public copies named by personality are `lastbrowser.com/assets/companions/{nova,orion,patch,spark,zen}.png` on `bolt/beta9-ui-personality-settings`.

Custom agents have no image file. The agents panel draws the Lucide `Bot` icon inline in `apps/desktop/src/renderer/panels/AgentPanels.tsx` (header, empty state). The demo figure `custom` uses that idea: a plain shell plus a plus mark.

`sidekick-05.png` is in the same folder and is not one of these five.

Open `demo.html`. Nova uses the Gemini state machine from `nova-sidekick-demo.html`. The others share `createSidekick(element).setState(state)` and `.setMini(on)`.
