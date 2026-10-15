# LastBrowser — Audio-Synchrone Start- & Entsperr-Animation

Hochperformante WebGL2-, Canvas-2D- und Web-Audio-Animations-Engine für den **LastBrowser** Start- und Passwort-Screen (Chromium 138, Electron 37, React Renderer mit `sandbox: true`).

---

## 1. Einbau in React (`StartupScreen.tsx`)

Die Engine kapselt sämtliche WebGL2-, Partikel-, Avatar-v2- und Web-Audio-Operationen hinter einer sauberen, speicherleckfreien Imperativ-API (`createStartupAnimation`) und verzögert den echten Browserstart zu keinem Zeitpunkt.

```tsx
import React, { useEffect, useRef } from 'react';
import { createStartupAnimation, TIMING_DATA } from './startup-animation';

export interface StartupScreenProps {
  clipId?: 'welcome-in' | 'three-ascending-tones' | 'untitled' | 'spring-vibes' | 'unlock-gesture';
  soundEnabled?: boolean;
  volume?: number; // Standard: 0.35
  persona?: 'nova' | 'orion' | 'patch' | 'spark' | 'zen' | 'custom';
  locale?: 'de' | 'en' | 'it' | 'es' | 'fr' | 'pt-BR' | 'ru' | 'ja';
  rainbow?: 'classic' | 'aurora' | 'orbit' | 'none';
  phase: 'engine' | 'profile' | 'spaces' | 'connections' | 'models' | 'sidekick' | 'session' | 'ready';
  isPasswordLocked?: boolean;
  onStartupFinished: () => void;
  onOpenSettings?: () => void;
}

export const StartupScreen: React.FC<StartupScreenProps> = ({
  clipId = 'welcome-in',
  soundEnabled = false,
  volume = 0.35,
  persona = 'nova',
  locale = 'de',
  rainbow = 'classic',
  phase,
  isPasswordLocked = false,
  onStartupFinished,
  onOpenSettings
}) => {
  const containerRef = useRef<HTMLDivElement null |>(null);
  const animRef = useRef<ReturnType<typeof createStartupAnimation> | null>(null);

  useEffect(() => {
    if (!containerRef.current) return;

    const anim = createStartupAnimation(containerRef.current, {
      audio: {
        url: `audio/${clipId}.mp3`,
        timing: TIMING_DATA[clipId],
        volume,
        enabled: soundEnabled
      },
      scene: isPasswordLocked ? 'unlock-input' : 'coldstart',
      persona,
      locale,
      reducedMotion: window.matchMedia('(prefers-reduced-motion: reduce)').matches,
      rainbow,
      target: () => document.querySelector('[data-startup-sidekick-target]'),
      onSettingsClick: onOpenSettings,
      onComplete: () => {
        onStartupFinished();
      }
    });

    animRef.current = anim;
    anim.play();

    return () => {
      anim.destroy();
      animRef.current = null;
    };
  }, []);

  // Reagiere verzögerungsfrei auf echte Startphasen aus dem Main/Renderer-Prozess
  useEffect(() => {
    if (!animRef.current) return;
    if (phase === 'ready') {
      animRef.current.ready();
    } else {
      animRef.current.setPhase(phase);
    }
  }, [phase]);

  return (
    <div
      ref={containerRef}
      style={{ position: 'fixed', inset: 0, zIndex: 9999 }}
    />
  );
};