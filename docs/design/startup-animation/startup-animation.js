/**
 * LastBrowser Startup & Unlock Animation Engine (State of the Art)
 * ES Module — Zero external dependencies, CSP & Electron sandbox compliant.
 */

export const TIMING_DATA = {
  'welcome-in': {
    id: 'welcome-in',
    theme: 'welcome-aurora',
    durationMs: 6014,
    mainPeakMs: 250,
    peaksMs: [250, 700, 1030, 1280],
    onsetsMs: [120, 440, 1210, 1470],
    tailStartMs: 3100,
    hasTail: true,
    cues: [
      { at: 120, attack: 20, do: 'gatherLight' },
      { at: 250, attack: 25, do: 'mainPeakAwaken' },
      { at: 440, attack: 20, do: 'revealWordmark' },
      { at: 700, attack: 20, do: 'auroraPulse' },
      { at: 1030, attack: 20, do: 'startQuoteStream' },
      { at: 1210, attack: 20, do: 'orbitBoost' },
      { at: 1280, attack: 15, do: 'shimmerPeak' },
      { at: 1470, attack: 20, do: 'sidekickDone' },
      { at: 3100, attack: 0, do: 'tailTransitionWindow' }
    ],
    // 50ms relative dB envelope (-60 to 0 dB) sampled across duration
    envelope_50ms_db_rel: [
      -55,-42,-18,-6,0,-3,-9,-14,-11,-7,-12,-16,-11,-8,-4,-9,-15,-18,-14,-9,
      -5,-2,-7,-12,-6,-3,-8,-11,-9,-4,-10,-14,-17,-19,-21,-22,-24,-25,-26,-27,
      -28,-29,-30,-31,-32,-33,-33,-34,-35,-36,-36,-37,-38,-38,-39,-40,-40,-41,-42,-42,
      -43,-44,-44,-45,-46,-46,-47,-48,-48,-49,-50,-50,-51,-52,-52,-53,-54,-54,-55,-56,
      -56,-57,-57,-58,-58,-59,-59,-60,-60,-60
    ]
  },
  'three-ascending-tones': {
    id: 'three-ascending-tones',
    theme: 'tones-rise',
    durationMs: 6494,
    mainPeakMs: 900,
    peaksMs: [900, 1270, 1930],
    onsetsMs: [200, 390, 620, 830, 1050, 1270, 1490, 1700, 1930, 2140, 2570, 3010, 3220, 3720],
    tailStartMs: 1150,
    hasTail: true,
    cues: [
      { at: 200, attack: 20, do: 'toneStep', step: 0 },
      { at: 390, attack: 20, do: 'toneStep', step: 1 },
      { at: 620, attack: 20, do: 'toneStep', step: 2 },
      { at: 830, attack: 20, do: 'toneStep', step: 3 },
      { at: 900, attack: 25, do: 'mainPeakAwaken' },
      { at: 1050, attack: 20, do: 'toneStep', step: 4 },
      { at: 1150, attack: 0, do: 'tailStart' },
      { at: 1270, attack: 20, do: 'toneStep', step: 5 },
      { at: 1490, attack: 15, do: 'harmonicEcho', step: 6 },
      { at: 1700, attack: 15, do: 'harmonicEcho', step: 7 },
      { at: 1930, attack: 15, do: 'harmonicEcho', step: 8 },
      { at: 2140, attack: 15, do: 'harmonicEcho', step: 9 },
      { at: 2570, attack: 15, do: 'tailTransitionWindow' },
      { at: 3010, attack: 15, do: 'harmonicEcho', step: 11 },
      { at: 3220, attack: 15, do: 'harmonicEcho', step: 12 },
      { at: 3720, attack: 15, do: 'harmonicEcho', step: 13 }
    ],
    envelope_50ms_db_rel: [
      -58,-48,-32,-18,-12,-15,-10,-6,-11,-5,-2,-7,-3,-1,0,-2,-5,-8,-6,-4,
      -9,-7,-5,-11,-8,-6,-12,-14,-10,-15,-17,-13,-18,-19,-14,-20,-22,-18,-23,-25,
      -26,-28,-29,-30,-31,-32,-34,-35,-36,-37,-38,-35,-37,-39,-40,-42,-43,-44,-45,-46,
      -42,-44,-46,-47,-45,-47,-48,-50,-51,-52,-53,-54,-55,-49,-51,-53,-55,-56,-57,-58,
      -58,-59,-59,-60,-60,-60
    ]
  },
  'untitled': {
    id: 'untitled',
    theme: 'first-light',
    durationMs: 6414,
    mainPeakMs: 3260,
    peaksMs: [3260, 3620, 4200, 5920],
    onsetsMs: [2760, 2910, 3060, 3200, 3340, 3480, 3620, 3770, 4200, 5920],
    tailStartMs: 6410,
    hasTail: false,
    cues: [
      { at: 80, attack: 0, do: 'slowHorizonBuild' },
      { at: 1200, attack: 0, do: 'revealWordmarkSoft' },
      { at: 2760, attack: 20, do: 'firstLightRay', step: 0 },
      { at: 2910, attack: 20, do: 'firstLightRay', step: 1 },
      { at: 3060, attack: 20, do: 'firstLightRay', step: 2 },
      { at: 3200, attack: 20, do: 'firstLightRay', step: 3 },
      { at: 3260, attack: 25, do: 'mainPeakAwaken' },
      { at: 3340, attack: 15, do: 'cascadePulse', step: 4 },
      { at: 3480, attack: 15, do: 'cascadePulse', step: 5 },
      { at: 3620, attack: 15, do: 'cascadePulse', step: 6 },
      { at: 3770, attack: 15, do: 'cascadePulse', step: 7 },
      { at: 4200, attack: 20, do: 'tailTransitionWindow' },
      { at: 5920, attack: 25, do: 'crescendoFinalCut' }
    ],
    envelope_50ms_db_rel: [
      -56,-55,-54,-53,-52,-51,-50,-49,-48,-47,-46,-45,-44,-43,-42,-41,-40,-39,-38,-37,
      -36,-35,-34,-33,-32,-31,-30,-29,-28,-27,-26,-25,-24,-23,-22,-21,-20,-19,-18,-17,
      -16,-15,-14,-13,-12,-11,-10,-9,-8,-7,-6,-5,-4,-3,-2,-1,0,-1,-2,-2,
      -1,-2,-3,-2,-1,-3,-4,-5,-6,-5,-4,-3,-5,-6,-7,-6,-5,-4,-3,-2,
      -2,-1,-1,0,-1,-1,0,0
    ]
  },
  'spring-vibes': {
    id: 'spring-vibes',
    theme: 'spring-orbit',
    durationMs: 5614,
    mainPeakMs: 180,
    peaksMs: [180, 480, 860, 1480],
    onsetsMs: [240, 360, 480, 610, 730, 860, 1110, 1360, 1480, 1610, 1860, 2110],
    tailStartMs: 920,
    hasTail: true,
    cues: [
      { at: 180, attack: 25, do: 'mainPeakAwaken' },
      { at: 240, attack: 15, do: 'orbitPulse', step: 0 },
      { at: 360, attack: 15, do: 'orbitPulse', step: 1 },
      { at: 480, attack: 15, do: 'orbitPulse', step: 2 },
      { at: 610, attack: 15, do: 'orbitPulse', step: 3 },
      { at: 730, attack: 15, do: 'orbitPulse', step: 4 },
      { at: 860, attack: 15, do: 'orbitPulse', step: 5 },
      { at: 920, attack: 0, do: 'tailStart' },
      { at: 1110, attack: 15, do: 'orbitPulse', step: 6 },
      { at: 1360, attack: 15, do: 'orbitPulse', step: 7 },
      { at: 1480, attack: 15, do: 'orbitPulse', step: 8 },
      { at: 1610, attack: 15, do: 'orbitPulse', step: 9 },
      { at: 1860, attack: 15, do: 'orbitPulse', step: 10 },
      { at: 2110, attack: 15, do: 'tailTransitionWindow' }
    ],
    envelope_50ms_db_rel: [
      -50,-22,-4,0,-3,-5,-2,-6,-3,-7,-4,-8,-4,-9,-5,-10,-6,-4,-12,-15,
      -17,-18,-13,-16,-19,-21,-15,-18,-14,-17,-16,-20,-22,-24,-21,-25,-27,-29,-24,-28,
      -30,-32,-27,-31,-34,-36,-38,-39,-41,-42,-43,-45,-46,-47,-48,-49,-50,-51,-52,-53,
      -54,-55,-56,-57,-57,-58,-58,-59,-59,-60,-60
    ]
  },
  'unlock-gesture': {
    id: 'unlock-gesture',
    theme: 'unlock-ripple',
    durationMs: 5614,
    mainPeakMs: 330,
    peaksMs: [330, 540, 810, 1080],
    onsetsMs: [330, 540, 810, 1080, 1350, 1620, 1950, 2290, 2660],
    tailStartMs: 370,
    hasTail: true,
    cues: [
      { at: 330, attack: 25, do: 'unlockFlash' },
      { at: 370, attack: 0, do: 'tailStart' },
      { at: 540, attack: 15, do: 'unlockRipple', step: 1 },
      { at: 810, attack: 15, do: 'unlockRipple', step: 2 },
      { at: 1080, attack: 15, do: 'unlockRipple', step: 3 },
      { at: 1350, attack: 15, do: 'unlockRipple', step: 4 },
      { at: 1620, attack: 15, do: 'unlockRipple', step: 5 },
      { at: 1950, attack: 15, do: 'tailTransitionWindow' },
      { at: 2290, attack: 15, do: 'unlockRipple', step: 7 },
      { at: 2660, attack: 15, do: 'unlockRipple', step: 8 }
    ],
    envelope_50ms_db_rel: [
      -54,-40,-25,-12,-3,0,-2,-8,-12,-14,-9,-13,-16,-19,-12,-16,-19,-22,-15,-19,
      -23,-25,-18,-22,-26,-28,-21,-25,-29,-31,-24,-28,-32,-34,-36,-38,-31,-35,-38,-40,
      -42,-44,-37,-41,-44,-46,-48,-49,-43,-47,-49,-51,-52,-53,-54,-55,-56,-57,-58,-58,
      -59,-59,-60,-60
    ]
  }
};

export const PERSONAS = {
  nova: {
    id: 'nova',
    name: 'Nova',
    fallbackPng: 'brand/sidekick-01.png',
    shellColor: '#ffffff',
    shellShadow: '#d9e6ff',
    visorColor: '#0c1729',
    eyeColor: '#29e3ff',
    scarfColor: '#63dbad',
    accentColor: '#ff6b9d',
    glowColor: [0.16, 0.89, 1.0],
    earStyle: 'round-single'
  },
  orion: {
    id: 'orion',
    name: 'Orion',
    fallbackPng: 'brand/sidekick-02.png',
    shellColor: '#eef3ff',
    shellShadow: '#b8c9f0',
    visorColor: '#091326',
    eyeColor: '#7c9fe5',
    scarfColor: '#4e67b8',
    accentColor: '#ffe578',
    glowColor: [0.49, 0.62, 0.9],
    earStyle: 'antenna-dual'
  },
  patch: {
    id: 'patch',
    name: 'Patch',
    fallbackPng: 'brand/sidekick-03.png',
    shellColor: '#fff8f0',
    shellShadow: '#ebd5c0',
    visorColor: '#161824',
    eyeColor: '#ffad59',
    scarfColor: '#ff785a',
    accentColor: '#63dbad',
    glowColor: [1.0, 0.68, 0.35],
    earStyle: 'cat-ears'
  },
  spark: {
    id: 'spark',
    name: 'Spark',
    fallbackPng: 'brand/sidekick-04.png',
    shellColor: '#f7f4ff',
    shellShadow: '#d5c8f5',
    visorColor: '#120f29',
    eyeColor: '#ffe578',
    scarfColor: '#a88bff',
    accentColor: '#5abfff',
    glowColor: [0.66, 0.55, 1.0],
    earStyle: 'lightning-crest'
  },
  zen: {
    id: 'zen',
    name: 'Zen',
    fallbackPng: 'brand/sidekick-05.png',
    shellColor: '#f0fbf8',
    shellShadow: '#bfe6dc',
    visorColor: '#0a1f22',
    eyeColor: '#60d9d1',
    scarfColor: '#3aa89e',
    accentColor: '#ffe578',
    glowColor: [0.38, 0.85, 0.82],
    earStyle: 'halo-leaf'
  },
  custom: {
    id: 'custom',
    name: 'Custom',
    fallbackPng: 'brand/sidekick-06.png',
    shellColor: '#f5f0ff',
    shellShadow: '#d38cda',
    visorColor: '#171026',
    eyeColor: '#ff537b',
    scarfColor: '#8188ee',
    accentColor: '#60d9d1',
    glowColor: [0.83, 0.55, 0.85],
    earStyle: 'crystal-crown'
  }
};

export const I18N_TEXTS = {
  de: {
    quotes: [
      'Dein Sidekick wird wach. Bitte noch keine Prompts.',
      'Hamster beim Vortrainieren des Sprachmodells …',
      'Kontext wird geladen. Brainrot wird aussortiert …',
      'Neuronale Pfade werden frisch gebügelt …'
    ],
    phases: {
      engine: 'Browser-Engine wird initialisiert …',
      profile: 'Profil & Tresor werden entschlüsselt …',
      spaces: 'Spaces & Arbeitsbereiche werden sortiert …',
      connections: 'Sichere Verbindungen werden aufgebaut …',
      models: 'Lokale & Cloud-Modelle werden geprüft …',
      sidekick: 'Verbinde mit Sidekick …',
      session: 'Sitzung wird wiederhergestellt …',
      ready: 'Bereit für den Abflug.'
    },
    unlockPrompt: 'Profil gesperrt — Passwort eingeben',
    unlockError: 'Passwort nicht korrekt. Bitte erneut versuchen.'
  },
  en: {
    quotes: [
      'Loading context. Sorting out the brainrot …',
      'Waking up your Sidekick. Hold your prompts.',
      'Pre-training the hamsters on fresh tokens …',
      'Aligning attention heads and cosmic rays …'
    ],
    phases: {
      engine: 'Initializing browser engine …',
      profile: 'Loading profile & encrypted vault …',
      spaces: 'Restoring spaces & tabs …',
      connections: 'Establishing secure connections …',
      models: 'Warming up AI models …',
      sidekick: 'Connecting to Sidekick …',
      session: 'Restoring session state …',
      ready: 'Ready.'
    },
    unlockPrompt: 'Profile locked — Enter password',
    unlockError: 'Incorrect password. Please try again.'
  },
  it: {
    quotes: [
      'Il tuo Sidekick si sta svegliando. Niente prompt per ora.',
      'Caricamento del contesto. Filtro del brainrot in corso …',
      'Criceti al lavoro sul pre-training del modello …'
    ],
    phases: {
      engine: 'Avvio del motore del browser …',
      profile: 'Caricamento del profilo …',
      spaces: 'Ripristino degli spazi …',
      connections: 'Connessione in corso …',
      models: 'Preparazione dei modelli IA …',
      sidekick: 'Connessione al Sidekick …',
      session: 'Ripristino della sessione …',
      ready: 'Pronto.'
    },
    unlockPrompt: 'Profilo bloccato — Inserisci la password',
    unlockError: 'Password errata. Riprova.'
  },
  es: {
    quotes: [
      'Tu Sidekick está despertando. Aún sin prompts, por favor.',
      'Cargando contexto. Filtrando el brainrot …',
      'Hámsters pre-entrenando el modelo de lenguaje …'
    ],
    phases: {
      engine: 'Iniciando motor del navegador …',
      profile: 'Cargando perfil …',
      spaces: 'Restaurando espacios …',
      connections: 'Estableciendo conexiones …',
      models: 'Preparando modelos de IA …',
      sidekick: 'Conectando con Sidekick …',
      session: 'Restaurando sesión …',
      ready: 'Listo.'
    },
    unlockPrompt: 'Perfil bloqueado — Introduce la contraseña',
    unlockError: 'Contraseña incorrecta. Inténtalo de nuevo.'
  },
  fr: {
    quotes: [
      'Votre Sidekick se réveille. Pas encore de prompts.',
      'Chargement du contexte. Tri du brainrot en cours …',
      'Les hamsters pré-entraînent le modèle linguistique …'
    ],
    phases: {
      engine: 'Initialisation du moteur …',
      profile: 'Chargement du profil …',
      spaces: 'Restauration des espaces …',
      connections: 'Établissement des connexions …',
      models: 'Préparation des modèles IA …',
      sidekick: 'Connexion au Sidekick …',
      session: 'Restauration de la session …',
      ready: 'Prêt.'
    },
    unlockPrompt: 'Profil verrouillé — Entrez le mot de passe',
    unlockError: 'Mot de passe incorrect. Veuillez réessayer.'
  },
  'pt-BR': {
    quotes: [
      'Seu Sidekick está acordando. Sem prompts por enquanto.',
      'Carregando contexto. Filtrando o brainrot …',
      'Hamsters pré-treinando o modelo de linguagem …'
    ],
    phases: {
      engine: 'Inicializando motor do navegador …',
      profile: 'Carregando perfil …',
      spaces: 'Restaurando espaços …',
      connections: 'Estabelecendo conexões …',
      models: 'Aquecendo modelos de IA …',
      sidekick: 'Conectando ao Sidekick …',
      session: 'Restaurando sessão …',
      ready: 'Pronto.'
    },
    unlockPrompt: 'Perfil bloqueado — Digite a senha',
    unlockError: 'Senha incorreta. Tente novamente.'
  },
  ru: {
    quotes: [
      'Ваш Sidekick просыпается. Пожалуйста, подождите с промптами.',
      'Загрузка контекста. Отфильтровываем брейнрот …',
      'Хомячки предобучают языковую модель на свежих токенах …'
    ],
    phases: {
      engine: 'Инициализация движка браузера …',
      profile: 'Загрузка профиля и хранилища …',
      spaces: 'Восстановление пространств …',
      connections: 'Установка защищённых соединений …',
      models: 'Подготовка моделей ИИ …',
      sidekick: 'Подключение к Sidekick …',
      session: 'Восстановление сессии …',
      ready: 'Готово.'
    },
    unlockPrompt: 'Профиль защищён — Введите пароль',
    unlockError: 'Неверный пароль. Попробуйте ещё раз.'
  },
  ja: {
    quotes: [
      'Sidekickが起動中です。プロンプトはまだお待ちください。',
      'コンテキストを読み込み中。ブレインロットを整理しています…',
      'ハムスターが言語モデルを事前学習しています…'
    ],
    phases: {
      engine: 'ブラウザエンジンを初期化しています…',
      profile: 'プロファイルを読み込んでいます…',
      spaces: 'スペースを復元しています…',
      connections: '安全な接続を確立しています…',
      models: 'AIモデルを準備しています…',
      sidekick: 'Sidekickに接続しています…',
      session: 'セッションを復元しています…',
      ready: '準備完了。'
    },
    unlockPrompt: 'プロファイルはロックされています — パスワードを入力',
    unlockError: 'パスワードが正しくありません。もう一度お試しください。'
  }
};

const VERTEX_SHADER = `#version 300 es
in vec2 a_pos;
out vec2 v_uv;
void main() {
  v_uv = a_pos * 0.5 + 0.5;
  gl_Position = vec4(a_pos, 0.0, 1.0);
}`;

const FRAGMENT_SHADER = `#version 300 es
precision highp float;
in vec2 v_uv;
out vec4 outColor;

uniform vec2 u_res;
uniform float u_time;
uniform float u_energy;
uniform float u_peakFlash;
uniform float u_unlockRipple;
uniform float u_dissolve;
uniform float u_errorTint;
uniform vec3 u_glowColor;
uniform int u_theme;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

float noise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  vec2 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(hash(i + vec2(0.0, 0.0)), hash(i + vec2(1.0, 0.0)), u.x),
    mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),
    u.y
  );
}

float fbm(vec2 p) {
  float v = 0.0;
  float a = 0.5;
  mat2 rot = mat2(0.8, 0.6, -0.6, 0.8);
  for (int i = 0; i < 4; i++) {
    v += a * noise(p);
    p = rot * p * 2.02 + vec2(0.13, 0.27);
    a *= 0.5;
  }
  return v;
}

void main() {
  vec2 uv = v_uv;
  vec2 aspect = vec2(u_res.x / max(u_res.y, 1.0), 1.0);
  vec2 center = vec2(0.5, 0.56);
  vec2 p = (uv - center) * aspect;
  float dist = length(p);

  // Base LastBrowser dark-blue gradient (#071426 -> #0a1b31 -> #071426)
  float diag = clamp((uv.x * 0.57 + (1.0 - uv.y) * 0.82), 0.0, 1.0);
  vec3 cEdge = vec3(0.027, 0.078, 0.149);
  vec3 cMid  = vec3(0.039, 0.106, 0.192);
  vec3 col = mix(cEdge, cMid, 1.0 - abs(diag - 0.55) * 1.8);

  // Aurora / Theme volumetric field
  float t = u_time * 0.00035;
  vec2 q = p * 2.2 + vec2(sin(t * 1.3), cos(t * 1.1)) * 0.3;
  float n1 = fbm(q + vec2(t * 0.9, -t * 0.6));
  float n2 = fbm(q * 1.6 - vec2(t * 0.5, t * 0.8) + n1);

  vec3 auroraA = vec3(0.376, 0.851, 0.820); // #60d9d1
  vec3 auroraB = vec3(0.506, 0.533, 0.933); // #8188ee
  vec3 auroraC = vec3(0.827, 0.549, 0.855); // #d38cda

  vec3 auroraMix = mix(auroraA, auroraB, smoothstep(0.2, 0.8, n1));
  auroraMix = mix(auroraMix, auroraC, smoothstep(0.35, 0.85, n2));
  auroraMix = mix(auroraMix, u_glowColor, 0.45);

  float radialMask = exp(-dist * dist * (3.4 - u_energy * 1.2));
  float auroraStrength = (0.14 + u_energy * 0.38 + u_peakFlash * 0.45) * radialMask;
  col += auroraMix * auroraStrength * (0.6 + 0.6 * n2);

  // Volumetric core glow behind Sidekick
  float coreGlow = exp(-dist * (5.2 - u_energy * 1.5)) * (0.28 + u_energy * 0.55 + u_peakFlash * 0.7);
  col += u_glowColor * coreGlow;

  // Theme-specific or Unlock concentric light ripples
  if (u_unlockRipple > 0.001) {
    float rDist = abs(dist - u_unlockRipple * 0.95);
    float ring = exp(-rDist * 42.0) * (1.0 - u_unlockRipple * 0.65);
    col += mix(u_glowColor, vec3(0.95, 0.98, 1.0), 0.6) * ring * 0.9;
  }

  // Error state subtle crimson tint (#ffdce1 / #e3d3dc)
  if (u_errorTint > 0.001) {
    vec3 errCol = vec3(0.85, 0.22, 0.34);
    col = mix(col, col + errCol * radialMask * 0.55, u_errorTint);
  }

  // Scene C: Glass / Light dissolution towards browser surface
  float alpha = 1.0;
  if (u_dissolve > 0.001) {
    float glassNoise = n2 * 0.28;
    float threshold = u_dissolve * 1.35 - dist * 0.35 + glassNoise;
    float edgeGlow = smoothstep(0.35, 0.5, threshold) * (1.0 - smoothstep(0.5, 0.68, threshold));
    col += vec3(0.75, 0.93, 1.0) * edgeGlow * 1.1;
    alpha = 1.0 - smoothstep(0.48, 0.78, threshold);
  }

  outColor = vec4(col, alpha);
}`;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function lerp(a, b, t) {
  return a + (b - a) * t;
}

/**
 * Physically plausible critically/under-damped spring evaluation
 */
function springDecay(elapsedMs, durationMs = 420, frequencyHz = 8.5, damping = 6.5) {
  if (elapsedMs <= 0 || elapsedMs >= durationMs) return 0;
  const t = elapsedMs / 1000;
  return Math.exp(-damping * t) * Math.sin(2 * Math.PI * frequencyHz * t);
}

/**
 * Interpolate 50ms relative dB envelope to linear [0..1] amplitude
 */
function sampleEnvelopeLinear(timingObj, timeMs) {
  const env = timingObj?.envelope_50ms_db_rel;
  if (!env || !env.length) return 0.25;
  const idxFloat = clamp(timeMs / 50, 0, env.length - 1);
  const i0 = Math.floor(idxFloat);
  const i1 = Math.min(env.length - 1, i0 + 1);
  const frac = idxFloat - i0;
  const db = lerp(env[i0], env[i1], frac);
  return clamp(Math.pow(10, db / 28), 0, 1);
}

const STYLESHEET_CONTENT = `
.lb-startup-root {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 420px;
  overflow: hidden;
  user-select: none;
  font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
  color: #f4f7ff;
  background: linear-gradient(145deg, #071426 0%, #0a1b31 55%, #071426 100%);
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  box-sizing: border-box;
  contain: layout style paint;
}
.lb-startup-gl, .lb-startup-particles {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  pointer-events: none;
}
.lb-startup-rainbow-frame {
  position: absolute;
  inset: 0;
  pointer-events: none;
  padding: 2px;
  box-sizing: border-box;
  opacity: 0;
  transition: opacity 320ms ease;
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor;
  mask-composite: exclude;
}
.lb-startup-rainbow-frame[data-rainbow="classic"],
.lb-startup-rainbow-frame[data-rainbow="aurora"],
.lb-startup-rainbow-frame[data-rainbow="orbit"] {
  opacity: 0.88;
}
.lb-startup-rainbow-frame::before {
  content: "";
  position: absolute;
  inset: -50%;
  background: conic-gradient(from var(--lb-angle, 0deg), #ff537b, #ffad59, #ffe578, #63dbad, #5abfff, #a88bff, #ff537b);
  will-change: transform;
}
.lb-startup-rainbow-frame[data-rainbow="aurora"]::before {
  background: conic-gradient(from var(--lb-angle, 0deg), #60d9d1, #8188ee, #d38cda, #7c9fe5, #60d9d1);
}
.lb-startup-rainbow-frame[data-rainbow="orbit"]::before {
  background: conic-gradient(from var(--lb-angle, 0deg), transparent 0deg, #5abfff 65deg, #63dbad 130deg, transparent 190deg, #a88bff 280deg, transparent 360deg);
}
.lb-startup-stage {
  position: relative;
  z-index: 2;
  display: flex;
  flex-direction: column;
  align-items: center;
  text-align: center;
  max-width: 680px;
  width: 90%;
  padding: 24px;
  pointer-events: none;
  will-change: transform, opacity;
}
.lb-avatar-wrap {
  position: relative;
  width: 184px;
  height: 172px;
  display: flex;
  align-items: center;
  justify-content: center;
  will-change: transform, opacity;
}
.lb-avatar-canvas {
  width: 184px;
  height: 172px;
  display: block;
}
.lb-avatar-fallback-img {
  position: absolute;
  width: 148px;
  height: auto;
  object-fit: contain;
  opacity: 0;
  pointer-events: none;
}
.lb-wordmark {
  margin-top: 8px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.34em;
  text-transform: uppercase;
  color: rgba(244, 247, 255, 0.86);
  will-change: transform, opacity;
}
.lb-quote-container {
  margin-top: 18px;
  min-height: 36px;
  display: flex;
  align-items: center;
  justify-content: center;
}
.lb-quote {
  font-size: clamp(18px, 2.2vw, 24px);
  font-weight: 700;
  line-height: 1.35;
  letter-spacing: -0.015em;
  color: #f4f7ff;
  margin: 0;
  will-change: opacity, transform;
}
.lb-status {
  margin-top: 14px;
  min-height: 22px;
  font-size: 13.5px;
  font-weight: 400;
  color: rgba(244, 247, 255, 0.64);
  transition: color 200ms ease;
}
.lb-unlock-box {
  margin-top: 16px;
  display: none;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  pointer-events: auto;
}
.lb-unlock-box[data-visible="true"] {
  display: flex;
}
.lb-unlock-pill {
  display: flex;
  align-items: center;
  gap: 10px;
  width: 240px;
  height: 40px;
  padding: 0 16px;
  border-radius: 999px;
  background: rgba(12, 27, 49, 0.78);
  border: 1px solid rgba(90, 191, 255, 0.35);
  box-shadow: 0 8px 28px rgba(0, 0, 0, 0.38);
  will-change: transform;
}
.lb-unlock-input {
  width: 100%;
  background: transparent;
  border: none;
  outline: none;
  color: #f4f7ff;
  font-size: 14px;
  letter-spacing: 0.18em;
  text-align: center;
}
.lb-unlock-input::placeholder {
  letter-spacing: 0.02em;
  color: rgba(244, 247, 255, 0.45);
}
.lb-gear-btn {
  position: absolute;
  right: 16px;
  bottom: 16px;
  z-index: 4;
  width: 32px;
  height: 32px;
  border-radius: 8px;
  border: 1px solid rgba(244, 247, 255, 0.14);
  background: rgba(10, 27, 49, 0.65);
  color: rgba(244, 247, 255, 0.72);
  display: flex;
  align-items: center;
  justify-content: center;
  cursor: pointer;
  pointer-events: auto;
  transition: background 160ms ease, color 160ms ease, transform 160ms ease;
}
.lb-gear-btn:hover {
  background: rgba(25, 52, 88, 0.85);
  color: #f4f7ff;
  transform: rotate(24deg);
}
`;

/**
 * Procedural Sidekick v2 Renderer (Canvas 2D)
 * Renders Nova, Orion, Patch, Spark, Zen, or Custom with states:
 * 'idle' | 'thinking' | 'working' | 'done' | 'needs-input' | 'error'
 */
function drawSidekickAvatar(ctx, persona, state, timeMs, pulse, scale = 1, alpha = 1) {
  if (alpha <= 0.001) return;
  const w = ctx.canvas.width;
  const h = ctx.canvas.height;
  const cx = w * 0.5;
  const cy = h * 0.52;

  ctx.save();
  ctx.globalAlpha = clamp(alpha, 0, 1);

  const breathe = Math.sin(timeMs * 0.0028) * 0.025;
  const hoverY = Math.sin(timeMs * 0.0032) * 3.5;
  const tilt = state === 'thinking'
    ? Math.sin(timeMs * 0.006) * 0.08
    : state === 'error'
      ? Math.sin(timeMs * 0.035) * 0.12
      : Math.sin(timeMs * 0.002) * 0.035;

  ctx.translate(cx, cy + hoverY);
  ctx.scale(scale * (1 + breathe + pulse * 0.08), scale * (1 + breathe + pulse * 0.08));
  ctx.rotate(tilt);

  // Soft outer startup-glow-breathe
  const [gr, gg, gb] = persona.glowColor;
  const glowRadius = 64 + pulse * 22 + Math.sin(timeMs * 0.003) * 6;
  const radGrad = ctx.createRadialGradient(0, 0, 14, 0, 0, glowRadius);
  radGrad.addColorStop(0, `rgba(${Math.round(gr * 255)}, ${Math.round(gg * 255)}, ${Math.round(gb * 255)}, ${0.42 + pulse * 0.3})`);
  radGrad.addColorStop(1, 'rgba(0, 0, 0, 0)');
  ctx.fillStyle = radGrad;
  ctx.beginPath();
  ctx.arc(0, 0, glowRadius, 0, Math.PI * 2);
  ctx.fill();

  // Persona specific ears / crest
  ctx.fillStyle = persona.shellColor;
  if (persona.earStyle === 'round-single') {
    ctx.beginPath();
    ctx.arc(38, -28, 11, 0, Math.PI * 2);
    ctx.fill();
  } else if (persona.earStyle === 'antenna-dual') {
    ctx.strokeStyle = persona.shellShadow;
    ctx.lineWidth = 4;
    ctx.beginPath();
    ctx.moveTo(-24, -38);
    ctx.lineTo(-32, -52);
    ctx.moveTo(24, -38);
    ctx.lineTo(32, -52);
    ctx.stroke();
    ctx.fillStyle = persona.accentColor;
    ctx.beginPath();
    ctx.arc(-32, -53, 5, 0, Math.PI * 2);
    ctx.arc(32, -53, 5, 0, Math.PI * 2);
    ctx.fill();
  } else if (persona.earStyle === 'cat-ears') {
    ctx.beginPath();
    ctx.moveTo(-38, -20);
    ctx.lineTo(-44, -48);
    ctx.lineTo(-18, -38);
    ctx.moveTo(38, -20);
    ctx.lineTo(44, -48);
    ctx.lineTo(18, -38);
    ctx.fill();
  } else if (persona.earStyle === 'lightning-crest') {
    ctx.fillStyle = persona.eyeColor;
    ctx.beginPath();
    ctx.moveTo(0, -56);
    ctx.lineTo(10, -40);
    ctx.lineTo(2, -40);
    ctx.lineTo(8, -28);
    ctx.lineTo(-8, -42);
    ctx.lineTo(0, -42);
    ctx.closePath();
    ctx.fill();
  } else if (persona.earStyle === 'halo-leaf') {
    ctx.strokeStyle = persona.eyeColor;
    ctx.lineWidth = 3;
    ctx.beginPath();
    ctx.ellipse(0, -49, 22, 5, 0, 0, Math.PI * 2);
    ctx.stroke();
  } else if (persona.earStyle === 'crystal-crown') {
    ctx.fillStyle = persona.accentColor;
    ctx.beginPath();
    ctx.moveTo(-14, -42);
    ctx.lineTo(0, -56);
    ctx.lineTo(14, -42);
    ctx.closePath();
    ctx.fill();
  }

  // Left floating hand/paw
  ctx.fillStyle = persona.shellShadow;
  ctx.beginPath();
  ctx.ellipse(-42, 22, 9, 7, 0.3, 0, Math.PI * 2);
  ctx.fill();

  // Main Robot Head Shell (3D shaded capsule)
  const headGrad = ctx.createLinearGradient(-35, -42, 35, 38);
  headGrad.addColorStop(0, persona.shellColor);
  headGrad.addColorStop(1, persona.shellShadow);
  ctx.fillStyle = headGrad;
  ctx.beginPath();
  ctx.roundRect(-46, -40, 92, 72, 34);
  ctx.fill();

  // Dark Visor Screen
  ctx.fillStyle = persona.visorColor;
  ctx.beginPath();
  ctx.roundRect(-34, -27, 68, 46, 22);
  ctx.fill();

  // Eyes & Mouth based on Avatar state
  const eyeColor = state === 'error' ? '#ff537b' : persona.eyeColor;
  ctx.strokeStyle = eyeColor;
  ctx.fillStyle = eyeColor;
  ctx.lineWidth = 3.8;
  ctx.lineCap = 'round';
  ctx.shadowColor = eyeColor;
  ctx.shadowBlur = 10 + pulse * 8;

  if (state === 'idle' || state === 'done') {
    // Happy cyan smiling arches (like Nova in current-startup.png)
    ctx.beginPath();
    ctx.arc(-15, -6, 7.5, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(15, -6, 7.5, Math.PI * 1.1, Math.PI * 1.9);
    ctx.stroke();
    // Smile
    ctx.beginPath();
    ctx.arc(0, 3, 5.5, 0.15 * Math.PI, 0.85 * Math.PI);
    ctx.stroke();
  } else if (state === 'thinking' || state === 'working') {
    // Attentive glowing orbs + scanning dot
    const scanX = Math.sin(timeMs * 0.008) * 3.5;
    ctx.beginPath();
    ctx.arc(-15 + scanX, -5, 5.2, 0, Math.PI * 2);
    ctx.arc(15 + scanX, -5, 5.2, 0, Math.PI * 2);
    ctx.fill();
    ctx.lineWidth = 2.6;
    ctx.beginPath();
    ctx.moveTo(-4, 6);
    ctx.lineTo(4, 6);
    ctx.stroke();
  } else if (state === 'needs-input') {
    // Focused pulsing rings
    const r = 5.5 + pulse * 2.2;
    ctx.lineWidth = 2.8;
    ctx.beginPath();
    ctx.arc(-15, -5, r, 0, Math.PI * 2);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(15, -5, r, 0, Math.PI * 2);
    ctx.stroke();
  } else if (state === 'error') {
    // Concerned angled eyes + wavy frown
    ctx.beginPath();
    ctx.moveTo(-21, -9);
    ctx.lineTo(-10, -4);
    ctx.moveTo(21, -9);
    ctx.lineTo(10, -4);
    ctx.stroke();
    ctx.beginPath();
    ctx.arc(0, 9, 5, Math.PI * 1.15, Math.PI * 1.85);
    ctx.stroke();
  }

  ctx.shadowBlur = 0;

  // Mint Scarf & Pink Heart Badge (Nova signature & persona tinted)
  ctx.fillStyle = persona.scarfColor;
  ctx.beginPath();
  ctx.roundRect(-38, 17, 76, 16, 8);
  ctx.fill();

  // Scarf tails on bottom right
  ctx.beginPath();
  ctx.roundRect(10, 24, 15, 20, 6);
  ctx.roundRect(22, 20, 18, 16, 6);
  ctx.fill();

  // Pink Heart clasp on scarf
  ctx.fillStyle = persona.accentColor;
  ctx.beginPath();
  const hx = 14;
  const hy = 25;
  ctx.moveTo(hx, hy + 4);
  ctx.bezierCurveTo(hx - 6, hy, hx - 6, hy - 5, hx, hy - 2);
  ctx.bezierCurveTo(hx + 6, hy - 5, hx + 6, hy, hx, hy + 4);
  ctx.fill();

  ctx.restore();
}

export function createStartupAnimation(el, options = {}) {
  if (!el) throw new Error('LastBrowser createStartupAnimation requires a valid container element.');

  const opts = {
    audio: {
      url: options.audio?.url || 'audio/welcome-in.mp3',
      timing: options.audio?.timing || null,
      volume: typeof options.audio?.volume === 'number' ? clamp(options.audio.volume, 0, 1) : 0.35,
      enabled: Boolean(options.audio?.enabled ?? false)
    },
    scene: options.scene || 'full',
    persona: (options.persona || 'nova').toLowerCase(),
    locale: options.locale || 'de',
    texts: options.texts || null,
    reducedMotion: Boolean(
      options.reducedMotion ??
      (typeof window !== 'undefined' && window.matchMedia?.('(prefers-reduced-motion: reduce)').matches)
    ),
    rainbow: options.rainbow ?? 'classic',
    target: options.target || (() => document.querySelector('[data-startup-sidekick-target]')),
    onComplete: typeof options.onComplete === 'function' ? options.onComplete : null,
    onCue: typeof options.onCue === 'function' ? options.onCue : null,
    onFrame: typeof options.onFrame === 'function' ? options.onFrame : null,
    onSettingsClick: typeof options.onSettingsClick === 'function' ? options.onSettingsClick : null
  };

  // Resolve clip timing profile
  const resolveTiming = () => {
    if (opts.audio.timing && typeof opts.audio.timing === 'object') return opts.audio.timing;
    const urlStr = String(opts.audio.url || 'welcome-in');
    for (const key of Object.keys(TIMING_DATA)) {
      if (urlStr.includes(key)) return TIMING_DATA[key];
    }
    return TIMING_DATA['welcome-in'];
  };

  let currentTiming = resolveTiming();
  let currentPersona = PERSONAS[opts.persona] || PERSONAS.nova;

  // Inject scoped stylesheet once
  if (typeof document !== 'undefined' && !document.getElementById('lb-startup-styles')) {
    const styleEl = document.createElement('style');
    styleEl.id = 'lb-startup-styles';
    styleEl.textContent = STYLESHEET_CONTENT;
    document.head.appendChild(styleEl);
  }

  // Build DOM hierarchy matching current-startup.png
  const root = document.createElement('div');
  root.className = 'lb-startup-root';

  const glCanvas = document.createElement('canvas');
  glCanvas.className = 'lb-startup-gl';
  glCanvas.setAttribute('aria-hidden', 'true');

  const particleCanvas = document.createElement('canvas');
  particleCanvas.className = 'lb-startup-particles';
  particleCanvas.setAttribute('aria-hidden', 'true');

  const rainbowFrame = document.createElement('div');
  rainbowFrame.className = 'lb-startup-rainbow-frame';
  rainbowFrame.setAttribute('aria-hidden', 'true');
  rainbowFrame.dataset.rainbow = opts.rainbow || 'none';

  const stage = document.createElement('div');
  stage.className = 'lb-startup-stage';

  const avatarWrap = document.createElement('div');
  avatarWrap.className = 'lb-avatar-wrap';
  avatarWrap.setAttribute('aria-hidden', 'true');

  const avatarCanvas = document.createElement('canvas');
  avatarCanvas.className = 'lb-avatar-canvas';
  avatarCanvas.width = 368;
  avatarCanvas.height = 344;

  const fallbackImg = document.createElement('img');
  fallbackImg.className = 'lb-avatar-fallback-img';
  fallbackImg.alt = '';
  fallbackImg.src = currentPersona.fallbackPng;

  avatarWrap.appendChild(avatarCanvas);
  avatarWrap.appendChild(fallbackImg);

  const wordmark = document.createElement('div');
  wordmark.className = 'lb-wordmark';
  wordmark.textContent = 'LASTBROWSER';

  const quoteContainer = document.createElement('div');
  quoteContainer.className = 'lb-quote-container';
  const quoteEl = document.createElement('h1');
  quoteEl.className = 'lb-quote';
  quoteContainer.appendChild(quoteEl);

  const statusEl = document.createElement('div');
  statusEl.className = 'lb-status';
  statusEl.setAttribute('aria-live', 'polite');

  const unlockBox = document.createElement('div');
  unlockBox.className = 'lb-unlock-box';
  const unlockPill = document.createElement('div');
  unlockPill.className = 'lb-unlock-pill';
  const unlockInput = document.createElement('input');
  unlockInput.type = 'password';
  unlockInput.className = 'lb-unlock-input';
  unlockInput.autocomplete = 'off';
  unlockPill.appendChild(unlockInput);
  unlockBox.appendChild(unlockPill);

  const gearBtn = document.createElement('button');
  gearBtn.type = 'button';
  gearBtn.className = 'lb-gear-btn';
  gearBtn.setAttribute('aria-label', 'Startup Settings');
  gearBtn.innerHTML = `<svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2"><circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 1 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 1 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 1 1-2.83-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 1 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 1 1 2.83-2.83l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 1 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 1 1 2.83 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 1 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z"/></svg>`;

  stage.appendChild(avatarWrap);
  stage.appendChild(wordmark);
  stage.appendChild(quoteContainer);
  stage.appendChild(statusEl);
  stage.appendChild(unlockBox);

  root.appendChild(glCanvas);
  root.appendChild(particleCanvas);
  root.appendChild(rainbowFrame);
  root.appendChild(stage);
  root.appendChild(gearBtn);
  el.appendChild(root);

  // WebGL2 setup with automatic Canvas2D/CSS fallback & context-lost handling
  let gl = null;
  let glProgram = null;
  let glUniforms = {};
  let glVao = null;
  let glContextLost = false;

  function initWebGL() {
    try {
      gl = glCanvas.getContext('webgl2', { alpha: true, antialias: false, powerPreference: 'high-performance' });
      if (!gl) return;
      const vs = gl.createShader(gl.VERTEX_SHADER);
      gl.shaderSource(vs, VERTEX_SHADER);
      gl.compileShader(vs);
      if (!gl.getShaderParameter(vs, gl.COMPILE_STATUS)) { gl = null; return; }

      const fs = gl.createShader(gl.FRAGMENT_SHADER);
      gl.shaderSource(fs, FRAGMENT_SHADER);
      gl.compileShader(fs);
      if (!gl.getShaderParameter(fs, gl.COMPILE_STATUS)) { gl = null; return; }

      glProgram = gl.createProgram();
      gl.attachShader(glProgram, vs);
      gl.attachShader(glProgram, fs);
      gl.linkProgram(glProgram);
      if (!gl.getProgramParameter(glProgram, gl.LINK_STATUS)) { gl = null; return; }

      glVao = gl.createVertexArray();
      gl.bindVertexArray(glVao);
      const buf = gl.createBuffer();
      gl.bindBuffer(gl.ARRAY_BUFFER, buf);
      gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]), gl.STATIC_DRAW);
      const posLoc = gl.getAttribLocation(glProgram, 'a_pos');
      gl.enableVertexAttribArray(posLoc);
      gl.vertexAttribPointer(posLoc, 2, gl.FLOAT, false, 0, 0);

      glUniforms = {
        res: gl.getUniformLocation(glProgram, 'u_res'),
        time: gl.getUniformLocation(glProgram, 'u_time'),
        energy: gl.getUniformLocation(glProgram, 'u_energy'),
        peakFlash: gl.getUniformLocation(glProgram, 'u_peakFlash'),
        unlockRipple: gl.getUniformLocation(glProgram, 'u_unlockRipple'),
        dissolve: gl.getUniformLocation(glProgram, 'u_dissolve'),
        errorTint: gl.getUniformLocation(glProgram, 'u_errorTint'),
        glowColor: gl.getUniformLocation(glProgram, 'u_glowColor'),
        theme: gl.getUniformLocation(glProgram, 'u_theme')
      };
    } catch (_) {
      gl = null;
    }
  }

  const onGlContextLost = (e) => {
    e.preventDefault();
    glContextLost = true;
  };
  const onGlContextRestored = () => {
    glContextLost = false;
    initWebGL();
  };
  glCanvas.addEventListener('webglcontextlost', onGlContextLost);
  glCanvas.addEventListener('webglcontextrestored', onGlContextRestored);
  initWebGL();

  // Subtle depth particles for 2D overlay
  const pCtx = particleCanvas.getContext('2d');
  const avatarCtx = avatarCanvas.getContext('2d');
  const particles = Array.from({ length: 28 }, (_, i) => ({
    angle: (i / 28) * Math.PI * 2,
    radius: 55 + (i % 7) * 28,
    speed: (0.00025 + (i % 5) * 0.00008) * (i % 2 === 0 ? 1 : -1),
    size: 1.2 + (i % 3) * 0.8,
    alpha: 0.18 + (i % 4) * 0.12
  }));

  function resizeCanvases() {
    const rect = root.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.max(1, Math.round(rect.width * dpr));
    const h = Math.max(1, Math.round(rect.height * dpr));
    if (glCanvas.width !== w || glCanvas.height !== h) {
      glCanvas.width = w;
      glCanvas.height = h;
      particleCanvas.width = w;
      particleCanvas.height = h;
    }
  }
  resizeCanvases();
  const resizeObserver = typeof ResizeObserver !== 'undefined' ? new ResizeObserver(resizeCanvases) : null;
  resizeObserver?.observe(root);

  // Audio & Clock State
  let audioCtx = null;
  let gainNode = null;
  let analyserNode = null;
  let analyserData = null;
  let sourceNode = null;
  let audioStartTimeSec = 0;
  let perfStartTimeMs = 0;
  let externalClock = null; // lastbrowser:startup-audio-clock
  let watchdogTimer = null;
  let rafId = 0;
  let destroyed = false;
  let completed = false;
  let isReady = false;
  let transitionStartTimeMs = -1;
  let lastQuoteSwitchMs = 0;
  let quoteIndex = 0;
  let currentPhaseKey = 'sidekick';
  let errorTriggerMs = -1000;
  let keypressTriggerMs = -1000;
  let unlockSuccessTriggerMs = -1000;
  let triggeredCues = new Set();

  // FPS & Drift telemetry
  let lastFramePerfMs = performance.now();
  let smoothedFps = 60;
  let currentDriftMs = 0;

  let resolveFinished;
  const finishedPromise = new Promise((res) => { resolveFinished = res; });

  function getLocalePack() {
    const pack = I18N_TEXTS[opts.locale] || I18N_TEXTS.de;
    return {
      quotes: opts.texts?.quotes?.length ? opts.texts.quotes : pack.quotes,
      phases: pack.phases,
      customPhase: opts.texts?.phase || null,
      unlockPrompt: pack.unlockPrompt,
      unlockError: pack.unlockError
    };
  }

  function updateStatusText(phaseKey) {
    currentPhaseKey = phaseKey || currentPhaseKey;
    const pack = getLocalePack();
    if (opts.scene === 'unlock-input') {
      statusEl.textContent = pack.unlockPrompt;
      statusEl.style.color = 'rgba(244, 247, 255, 0.78)';
      return;
    }
    if (pack.customPhase && !phaseKey) {
      statusEl.textContent = pack.customPhase;
    } else {
      statusEl.textContent = pack.phases[currentPhaseKey] || pack.phases.sidekick;
    }
    statusEl.style.color = 'rgba(244, 247, 255, 0.64)';
  }

  // External App Event Adapter: lastbrowser:startup-audio-clock
  const onExternalAudioClock = (ev) => {
    const d = ev?.detail;
    if (!d || typeof d.currentTimeMs !== 'number') return;
    externalClock = {
      currentTimeMs: d.currentTimeMs,
      durationMs: d.durationMs || currentTiming.durationMs,
      beat: d.beat || 0,
      playing: Boolean(d.playing),
      ended: Boolean(d.ended),
      receivedAtPerfMs: performance.now()
    };
    if (d.ended && !completed) {
      finishAnimation();
    }
  };
  if (typeof window !== 'undefined') {
    window.addEventListener('lastbrowser:startup-audio-clock', onExternalAudioClock);
  }

  async function startWebAudio() {
    if (!opts.audio.enabled || !opts.audio.url) return false;
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      if (!Ctx) return false;
      if (!audioCtx) audioCtx = new Ctx();
      if (audioCtx.state === 'suspended') {
        await audioCtx.resume().catch(() => {});
      }
      if (audioCtx.state !== 'running') return false;

      const resp = await fetch(opts.audio.url);
      if (!resp.ok) return false;
      const arrayBuf = await resp.arrayBuffer();
      const audioBuf = await audioCtx.decodeAudioData(arrayBuf);

      gainNode = audioCtx.createGain();
      gainNode.gain.value = opts.audio.volume;
      analyserNode = audioCtx.createAnalyser();
      analyserNode.fftSize = 64;
      analyserData = new Uint8Array(analyserNode.frequencyBinCount);

      sourceNode = audioCtx.createBufferSource();
      sourceNode.buffer = audioBuf;
      sourceNode.connect(gainNode);
      gainNode.connect(analyserNode);
      analyserNode.connect(audioCtx.destination);

      audioStartTimeSec = audioCtx.currentTime;
      sourceNode.start(0);
      return true;
    } catch (_) {
      return false;
    }
  }

  function readClockMs(nowPerfMs) {
    // 1. Priority: External App Event lastbrowser:startup-audio-clock
    if (externalClock) {
      const interp = externalClock.playing ? (nowPerfMs - externalClock.receivedAtPerfMs) : 0;
      const t = externalClock.currentTimeMs + interp;
      currentDriftMs = interp;
      return t;
    }
    // 2. Priority: Web Audio API hardware clock with latency compensation
    if (audioCtx && audioCtx.state === 'running' && sourceNode) {
      const latencySec = (audioCtx.baseLatency || 0) + (audioCtx.outputLatency || 0);
      const audioMs = Math.max(0, (audioCtx.currentTime - audioStartTimeSec - latencySec) * 1000);
      const wallMs = nowPerfMs - perfStartTimeMs;
      currentDriftMs = audioMs - wallMs;
      return audioMs;
    }
    // 3. Fallback: performance.now()
    currentDriftMs = 0;
    return Math.max(0, nowPerfMs - perfStartTimeMs);
  }

  function getLiveEnergy(timeMs) {
    const envAmp = sampleEnvelopeLinear(currentTiming, timeMs % currentTiming.durationMs);
    if (analyserNode && analyserData && audioCtx?.state === 'running') {
      analyserNode.getByteFrequencyData(analyserData);
      let sum = 0;
      for (let i = 0; i < analyserData.length; i++) sum += analyserData[i];
      const live = sum / (analyserData.length * 255);
      return lerp(envAmp, live, 0.35);
    }
    return envAmp;
  }

  function evaluateCues(timeMs) {
    let nextCue = null;
    for (const cue of currentTiming.cues) {
      const triggerTime = Math.max(0, cue.at - (cue.attack || 0));
      if (timeMs >= triggerTime && !triggeredCues.has(cue.at)) {
        triggeredCues.add(cue.at);
        if (cue.do === 'tailTransitionWindow' && isReady && transitionStartTimeMs < 0) {
          transitionStartTimeMs = timeMs;
        }
        opts.onCue?.(cue, timeMs);
      }
      if (triggerTime > timeMs && !nextCue) {
        nextCue = cue;
      }
    }
    return nextCue;
  }

  function renderQuoteStream(timeMs) {
    const pack = getLocalePack();
    const quotes = pack.quotes;
    if (!quotes || !quotes.length) return;

    const streamStartMs = currentTiming.id === 'untitled' ? 400 : 280;
    const elapsed = Math.max(0, timeMs - streamStartMs);
    const cycleMs = 4000;
    const currentIdx = Math.floor(elapsed / cycleMs) % quotes.length;
    const withinCycleMs = elapsed % cycleMs;
    const activeQuote = quotes[currentIdx];

    if (currentIdx !== quoteIndex) {
      quoteIndex = currentIdx;
      lastQuoteSwitchMs = timeMs;
    }

    // Character-by-character streaming (approx 28 ms per char) + soft crossfade at end of 4s window
    const charsToShow = opts.reducedMotion
      ? activeQuote.length
      : clamp(Math.floor(withinCycleMs / 26), 0, activeQuote.length);
    const subText = activeQuote.slice(0, charsToShow);
    if (quoteEl.textContent !== subText) {
      quoteEl.textContent = subText;
    }

    let fadeAlpha = 1;
    if (!opts.reducedMotion) {
      if (withinCycleMs < 240) fadeAlpha = withinCycleMs / 240;
      else if (withinCycleMs > cycleMs - 320) fadeAlpha = (cycleMs - withinCycleMs) / 320;
    }
    quoteEl.style.opacity = String(clamp(fadeAlpha, 0, 1));
  }

  function renderFrame(nowPerfMs) {
    if (destroyed || completed) return;

    const dt = Math.max(1, nowPerfMs - lastFramePerfMs);
    lastFramePerfMs = nowPerfMs;
    smoothedFps = lerp(smoothedFps, 1000 / dt, 0.12);

    const rawTimeMs = readClockMs(nowPerfMs);
    const clipDur = currentTiming.durationMs;

    // Reduced Motion shortcut (<= 260ms gentle opacity fade)
    if (opts.reducedMotion) {
      const rmOpacity = clamp(rawTimeMs / 240, 0, 1);
      stage.style.opacity = String(rmOpacity);
      renderQuoteStream(rawTimeMs);
      avatarCtx.clearRect(0, 0, avatarCanvas.width, avatarCanvas.height);
      drawSidekickAvatar(avatarCtx, currentPersona, 'done', 0, 0, 1, 1);
      if (opts.scene === 'transition' || (isReady && rawTimeMs >= 260)) {
        finishAnimation();
        return;
      }
      rafId = requestAnimationFrame(renderFrame);
      return;
    }

    // Determine effective timeline position (handle A-Loop if not ready)
    const isLoopingScene = opts.scene === 'coldstart-loop';
    const timeMs = isLoopingScene ? (1500 + (rawTimeMs % 2400)) : rawTimeMs;

    const nextCue = evaluateCues(timeMs);
    const energy = getLiveEnergy(timeMs);

    // Calculate peak flash & ripple states
    const distFromMainPeak = timeMs - currentTiming.mainPeakMs;
    const peakFlash = distFromMainPeak >= -25 && distFromMainPeak < 550
      ? Math.exp(-Math.max(0, distFromMainPeak) / 180)
      : 0;

    let unlockRipple = 0;
    if (opts.scene === 'unlock-success' || currentTiming.id === 'unlock-gesture' || unlockSuccessTriggerMs > 0) {
      const originMs = unlockSuccessTriggerMs > 0 ? unlockSuccessTriggerMs : 330;
      const sinceUnlock = timeMs - originMs;
      if (sinceUnlock >= -20 && sinceUnlock < 1400) {
        unlockRipple = clamp((sinceUnlock + 20) / 1200, 0, 1);
      }
    }

    // Error state B3: damped horizontal spring (< 450 ms) & crimson tint (#ffdce1 / #e3d3dc)
    const sinceErrorMs = nowPerfMs - errorTriggerMs;
    const isErrorActive = opts.scene === 'unlock-error'
      ? rawTimeMs < 440
      : (sinceErrorMs >= 0 && sinceErrorMs < 440);
    const errorElapsed = opts.scene === 'unlock-error' ? rawTimeMs : sinceErrorMs;
    const errorShakeX = isErrorActive ? springDecay(errorElapsed, 430, 9.2, 6.8) * 18 : 0;
    const errorTint = isErrorActive ? clamp(1 - errorElapsed / 440, 0, 1) : 0;

    if (isErrorActive) {
      quoteEl.style.color = '#ffdce1';
      statusEl.style.color = '#e3d3dc';
    } else {
      quoteEl.style.color = '#f4f7ff';
    }

    // Keypress B1 subtle pulse without revealing character count
    const sinceKeypressMs = nowPerfMs - keypressTriggerMs;
    const keypressPulse = (sinceKeypressMs >= 0 && sinceKeypressMs < 240)
      ? Math.sin((1 - sinceKeypressMs / 240) * Math.PI) * 0.55
      : 0;

    // Scene C: Transition into Browser (Sidekick flies to [data-startup-sidekick-target])
    let dissolveProgress = 0;
    let flyX = 0;
    let flyY = 0;
    let flyScale = 1;

    if (opts.scene === 'transition') {
      if (transitionStartTimeMs < 0) transitionStartTimeMs = 0;
    } else if (isReady && transitionStartTimeMs < 0 && timeMs >= Math.min(currentTiming.tailStartMs, clipDur - 950)) {
      transitionStartTimeMs = timeMs;
    }

    if (transitionStartTimeMs >= 0) {
      const transDur = Math.max(520, Math.min(1100, clipDur - transitionStartTimeMs));
      const p = clamp((timeMs - transitionStartTimeMs) / transDur, 0, 1);
      // Smooth cubic ease-in-out
      const ease = p < 0.5 ? 4 * p * p * p : 1 - Math.pow(-2 * p + 2, 3) / 2;
      dissolveProgress = ease;

      const targetEl = typeof opts.target === 'function' ? opts.target() : null;
      if (targetEl) {
        const tRect = targetEl.getBoundingClientRect();
        const aRect = avatarWrap.getBoundingClientRect();
        const dx = (tRect.left + tRect.width * 0.5) - (aRect.left + aRect.width * 0.5);
        const dy = (tRect.top + tRect.height * 0.5) - (aRect.top + aRect.height * 0.5);
        flyX = dx * ease;
        flyY = dy * ease - Math.sin(ease * Math.PI) * 42;
        flyScale = lerp(1, Math.max(0.18, tRect.width / 160), ease);
      } else {
        flyScale = lerp(1, 1.18, ease);
      }
    }

    // Render WebGL2 Fullscreen Volumetric Shader (or CSS fallback)
    if (gl && glProgram && !glContextLost) {
      gl.viewport(0, 0, glCanvas.width, glCanvas.height);
      gl.useProgram(glProgram);
      gl.bindVertexArray(glVao);
      gl.uniform2f(glUniforms.res, glCanvas.width, glCanvas.height);
      gl.uniform1f(glUniforms.time, timeMs);
      gl.uniform1f(glUniforms.energy, energy + keypressPulse * 0.35);
      gl.uniform1f(glUniforms.peakFlash, peakFlash);
      gl.uniform1f(glUniforms.unlockRipple, unlockRipple);
      gl.uniform1f(glUniforms.dissolve, dissolveProgress);
      gl.uniform1f(glUniforms.errorTint, errorTint);
      gl.uniform3fv(glUniforms.glowColor, currentPersona.glowColor);
      gl.uniform1i(glUniforms.theme, 0);
      gl.drawArrays(gl.TRIANGLES, 0, 6);
    } else {
      root.style.opacity = String(1 - dissolveProgress);
    }

    // Render 2D Particles
    if (pCtx) {
      pCtx.clearRect(0, 0, particleCanvas.width, particleCanvas.height);
      const cx = particleCanvas.width * 0.5;
      const cy = particleCanvas.height * 0.46;
      const [r, g, b] = currentPersona.glowColor.map((c) => Math.round(c * 255));
      for (const pt of particles) {
        const a = pt.angle + timeMs * pt.speed * (1 + energy * 0.8);
        const rad = pt.radius * (1 + peakFlash * 0.15) * (1 - dissolveProgress * 0.4);
        const px = cx + Math.cos(a) * rad * 1.35;
        const py = cy + Math.sin(a) * rad * 0.85;
        pCtx.fillStyle = `rgba(${r}, ${g}, ${b}, ${pt.alpha * (1 - dissolveProgress)})`;
        pCtx.beginPath();
        pCtx.arc(px, py, pt.size * (1 + energy * 0.6), 0, Math.PI * 2);
        pCtx.fill();
      }
    }

    // Rotate Rainbow Frame conic-gradient angle deterministically
    const angleDeg = (timeMs * 0.045) % 360;
    rainbowFrame.style.setProperty('--lb-angle', `${angleDeg.toFixed(1)}deg`);

    // Determine Sidekick Avatar State & Render
    let avatarState = 'idle';
    if (isErrorActive) {
      avatarState = 'error';
    } else if (opts.scene === 'unlock-input') {
      avatarState = 'needs-input';
    } else if (timeMs < currentTiming.mainPeakMs) {
      avatarState = 'idle';
    } else if (timeMs < 1100) {
      avatarState = 'thinking';
    } else if (timeMs < 1470 && !isReady) {
      avatarState = 'working';
    } else {
      avatarState = 'done';
    }

    avatarCtx.clearRect(0, 0, avatarCanvas.width, avatarCanvas.height);

    if (opts.scene === 'sidekick-ensemble' || opts.scene === 'D') {
      // Scene D: All 6 personas appear on onsets, then merge into chosen persona
      const personaKeys = Object.keys(PERSONAS);
      const mergeProgress = clamp((timeMs - 1450) / 550, 0, 1);
      personaKeys.forEach((key, idx) => {
        const onsetMs = currentTiming.onsetsMs[idx] || (200 + idx * 180);
        if (timeMs < onsetMs - 20) return;
        const entryP = clamp((timeMs - (onsetMs - 20)) / 240, 0, 1);
        const angle = (idx / personaKeys.length) * Math.PI * 2 - Math.PI * 0.5;
        const orbitR = (1 - mergeProgress) * 62;
        avatarCtx.save();
        avatarCtx.translate(Math.cos(angle) * orbitR, Math.sin(angle) * orbitR * 0.7);
        const pAlpha = key === currentPersona.id ? entryP : entryP * (1 - mergeProgress);
        const pScale = key === currentPersona.id ? lerp(0.58, 1, mergeProgress) : 0.48;
        drawSidekickAvatar(avatarCtx, PERSONAS[key], avatarState, timeMs, energy + keypressPulse, pScale, pAlpha);
        avatarCtx.restore();
      });
    } else {
      const materialScale = currentTiming.id === 'untitled'
        ? clamp(0.84 + (timeMs / 3260) * 0.16, 0.84, 1)
        : clamp((timeMs - 60) / 280, 0, 1);
      const matEase = 1 - Math.pow(1 - materialScale, 3);
      drawSidekickAvatar(
        avatarCtx,
        currentPersona,
        avatarState,
        timeMs,
        energy * 0.65 + peakFlash * 0.6 + keypressPulse,
        0.72 + matEase * 0.28,
        clamp(timeMs / 180, 0, 1) * (1 - dissolveProgress * 0.85)
      );
    }

    // Apply GPU-friendly transforms to Avatar, Wordmark, Stage
    avatarWrap.style.transform = `translate3d(${(flyX + errorShakeX).toFixed(2)}px, ${flyY.toFixed(2)}px, 0) scale(${flyScale.toFixed(3)})`;
    unlockPill.style.transform = `translate3d(${errorShakeX.toFixed(2)}px, 0, 0) scale(${(1 + keypressPulse * 0.035).toFixed(3)})`;

    const wmStart = currentTiming.id === 'untitled' ? 900 : 360;
    const wmP = clamp((timeMs - wmStart) / 420, 0, 1);
    wordmark.style.opacity = String(wmP * (1 - dissolveProgress));
    wordmark.style.transform = `translate3d(0, ${((1 - wmP) * 8).toFixed(2)}px, 0)`;
    wordmark.style.letterSpacing = `${lerp(0.52, 0.34, wmP).toFixed(3)}em`;

    renderQuoteStream(timeMs);
    quoteContainer.style.opacity = String(1 - dissolveProgress);
    statusEl.style.opacity = String(clamp((timeMs - 500) / 350, 0, 1) * (1 - dissolveProgress));

    opts.onFrame?.({
      currentTimeMs: timeMs,
      durationMs: clipDur,
      fps: Math.round(smoothedFps),
      driftMs: Number(currentDriftMs.toFixed(2)),
      nextCue: nextCue ? `${nextCue.do} @ ${nextCue.at}ms` : 'end',
      energy
    });

    // End condition: never longer than the clip
    if (!isLoopingScene && opts.scene !== 'unlock-input' && rawTimeMs >= clipDur) {
      finishAnimation();
      return;
    }

    rafId = requestAnimationFrame(renderFrame);
  }

  function finishAnimation() {
    if (completed || destroyed) return;
    completed = true;
    if (rafId) cancelAnimationFrame(rafId);
    if (watchdogTimer) clearTimeout(watchdogTimer);
    resolveFinished?.();
    opts.onComplete?.();
  }

  // Keyboard & Click skip handling (80ms fast audio fade-out)
  const onKeyDown = (e) => {
    if (destroyed || completed) return;
    if (opts.scene === 'unlock-input' && document.activeElement === unlockInput) {
      if (e.key === 'Escape') {
        api.skip();
      } else if (e.key === 'Enter') {
        api.unlockSuccess();
      } else if (e.key.length === 1 || e.key === 'Backspace') {
        api.keypress();
      }
      return;
    }
    if (e.key === 'Escape' || e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      api.skip();
    }
  };

  const onRootClick = (e) => {
    if (gearBtn.contains(e.target) || unlockBox.contains(e.target)) return;
    if (opts.scene !== 'unlock-input') {
      api.skip();
    }
  };

  const onGearClick = (e) => {
    e.stopPropagation();
    opts.onSettingsClick?.();
  };

  window.addEventListener('keydown', onKeyDown);
  root.addEventListener('click', onRootClick);
  gearBtn.addEventListener('click', onGearClick);

  const api = {
    finished: finishedPromise,

    async play(newScene) {
      if (destroyed) return;
      if (newScene) opts.scene = newScene;
      completed = false;
      triggeredCues.clear();
      transitionStartTimeMs = opts.scene === 'transition' ? 0 : -1;
      isReady = opts.scene === 'transition' || opts.scene === 'full';

      currentTiming = resolveTiming();
      currentPersona = PERSONAS[opts.persona] || PERSONAS.nova;
      fallbackImg.src = currentPersona.fallbackPng;
      unlockBox.dataset.visible = opts.scene === 'unlock-input' ? 'true' : 'false';
      if (opts.scene === 'unlock-input') {
        unlockInput.placeholder = '••••••••';
        setTimeout(() => unlockInput.focus(), 20);
      }

      updateStatusText(currentPhaseKey);
      perfStartTimeMs = performance.now();
      lastFramePerfMs = perfStartTimeMs;

      if (sourceNode) {
        try { sourceNode.stop(); } catch (_) {}
        sourceNode = null;
      }
      await startWebAudio();

      // Watchdog guarantees termination at latest at duration + 5000 ms
      if (watchdogTimer) clearTimeout(watchdogTimer);
      if (opts.scene !== 'coldstart-loop' && opts.scene !== 'unlock-input') {
        watchdogTimer = setTimeout(() => {
          if (!completed) finishAnimation();
        }, currentTiming.durationMs + 5000);
      }

      if (rafId) cancelAnimationFrame(rafId);
      rafId = requestAnimationFrame(renderFrame);
    },

    setPhase(phaseKey) {
      updateStatusText(phaseKey);
      if (phaseKey === 'ready') this.ready();
    },

    ready() {
      isReady = true;
      updateStatusText('ready');
      const nowMs = readClockMs(performance.now());
      if (opts.scene === 'coldstart-loop') {
        opts.scene = 'transition';
        transitionStartTimeMs = nowMs;
      } else if (transitionStartTimeMs < 0) {
        transitionStartTimeMs = nowMs;
      }
    },

    error() {
      errorTriggerMs = performance.now();
      const pack = getLocalePack();
      statusEl.textContent = pack.unlockError;
    },

    keypress() {
      keypressTriggerMs = performance.now();
    },

    unlockSuccess() {
      unlockSuccessTriggerMs = readClockMs(performance.now());
      unlockBox.dataset.visible = 'false';
      opts.scene = 'unlock-success';
      isReady = true;
    },

    setPersona(personaId) {
      opts.persona = String(personaId).toLowerCase();
      currentPersona = PERSONAS[opts.persona] || PERSONAS.nova;
      fallbackImg.src = currentPersona.fallbackPng;
    },

    setRainbow(style) {
      opts.rainbow = style;
      rainbowFrame.dataset.rainbow = style || 'none';
    },

    setLocale(locale) {
      opts.locale = locale;
      updateStatusText(currentPhaseKey);
    },

    setAudioOptions(audioOpts = {}) {
      Object.assign(opts.audio, audioOpts);
      if (gainNode && audioCtx && typeof audioOpts.volume === 'number') {
        gainNode.gain.setValueAtTime(clamp(audioOpts.volume, 0, 1), audioCtx.currentTime);
      }
    },

    setReducedMotion(val) {
      opts.reducedMotion = Boolean(val);
    },

    skip() {
      if (destroyed || completed) return;
      if (gainNode && audioCtx && audioCtx.state === 'running') {
        const now = audioCtx.currentTime;
        gainNode.gain.setValueAtTime(gainNode.gain.value, now);
        gainNode.gain.linearRampToValueAtTime(0.0001, now + 0.08);
        setTimeout(() => {
          try { sourceNode?.stop(); } catch (_) {}
        }, 85);
      }
      root.style.opacity = '0';
      finishAnimation();
    },

    destroy() {
      if (destroyed) return;
      destroyed = true;
      if (rafId) cancelAnimationFrame(rafId);
      if (watchdogTimer) clearTimeout(watchdogTimer);
      resizeObserver?.disconnect();
      window.removeEventListener('keydown', onKeyDown);
      window.removeEventListener('lastbrowser:startup-audio-clock', onExternalAudioClock);
      root.removeEventListener('click', onRootClick);
      gearBtn.removeEventListener('click', onGearClick);
      glCanvas.removeEventListener('webglcontextlost', onGlContextLost);
      glCanvas.removeEventListener('webglcontextrestored', onGlContextRestored);
      try { sourceNode?.stop(); } catch (_) {}
      try { audioCtx?.close(); } catch (_) {}
      if (gl && glProgram) {
        gl.deleteProgram(glProgram);
      }
      root.remove();
    }
  };

  return api;
}