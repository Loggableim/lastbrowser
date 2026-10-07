import type { DesktopLocaleId } from './i18n/keys.js';

export type UpdateNoticeCandidate = { fromVersion: string | null; toVersion: string };
export type LocalReleaseNotes = { version: string; changes: readonly string[] };

// Keep release copy with the renderer bundle so What's New works offline.
// Content is tied to the application version; never infer release claims from
// the current UI or from an online changelog at runtime.
const releaseNotes: Array<{ version: string; changes: Record<DesktopLocaleId, readonly string[]> }> = [
  {
    version: '0.1.47',
    changes: {
      en: ['Provider settings and model lists now use the selected Space.', 'Quickchat keeps each Space’s history separate and confirms reset before clearing it.', 'MiMo settings show confirmed saved status and a dedicated key prompt.', 'Chat startup reports early errors promptly and adds bounded diagnostics.'],
      de: ['Provider-Einstellungen und Modelllisten verwenden jetzt den ausgewählten Space.', 'Quickchat trennt die Verläufe der Spaces und bestätigt das Zurücksetzen vor dem Leeren.', 'MiMo-Einstellungen zeigen den bestätigten Speicherstatus und einen eigenen Schlüsselhinweis.', 'Der Chat-Start meldet frühe Fehler direkt und ergänzt zeitlich begrenzte Diagnostik.'],
      it: ['Le impostazioni dei provider e gli elenchi dei modelli usano lo Space selezionato.', 'Quickchat separa la cronologia degli Space e conferma il reset prima di cancellarla.', 'Le impostazioni MiMo mostrano lo stato di salvataggio confermato e un campo chiave dedicato.', 'L’avvio della chat segnala subito gli errori iniziali e aggiunge diagnostica limitata.'],
      es: ['Los ajustes de proveedores y las listas de modelos usan el Space seleccionado.', 'Quickchat separa los historiales de los Spaces y confirma el reinicio antes de borrarlos.', 'Los ajustes de MiMo muestran el estado de guardado confirmado y una indicación de clave propia.', 'El inicio del chat informa de errores tempranos y añade diagnósticos limitados.'],
      fr: ['Les réglages des fournisseurs et les listes de modèles utilisent le Space sélectionné.', 'Quickchat sépare les historiques des Spaces et confirme la réinitialisation avant de les effacer.', 'Les réglages MiMo affichent le statut enregistré confirmé et une invite de clé dédiée.', 'Le démarrage du chat signale rapidement les erreurs initiales et ajoute un diagnostic limité.'],
      'pt-BR': ['As configurações dos provedores e listas de modelos usam o Space selecionado.', 'Quickchat separa o histórico dos Spaces e confirma a redefinição antes de limpar.', 'As configurações MiMo mostram o estado salvo confirmado e uma indicação de chave própria.', 'O início do chat informa erros iniciais rapidamente e adiciona diagnósticos limitados.'],
      ru: ['Настройки провайдеров и списки моделей используют выбранный Space.', 'Quickchat разделяет историю Spaces и подтверждает сброс перед очисткой.', 'Настройки MiMo показывают подтверждённое сохранение и отдельную подсказку для ключа.', 'Запуск чата сразу сообщает о ранних ошибках и добавляет ограниченную диагностику.'],
      ja: ['プロバイダー設定とモデル一覧は選択中の Space を使用します。', 'Quickchat は Space ごとに履歴を分け、確認済みのリセット後に消去します。', 'MiMo 設定は確認済みの保存状態と専用のキー入力案内を表示します。', 'チャット起動時の初期エラーをすぐに通知し、時間制限付きの診断を追加しました。']
    }
  },
  {
    version: '0.1.46',
    changes: {
      en: [
        'Open Zen and Focus mode directly from the compact NovaDock.',
        'Fixed Quickchat startup on Windows.',
        'Choose Teamwork models from the manual model picker.',
        'Authentication status checks remain read-only.',
        'Reasoning-only output is no longer used as a finished draft.'
      ],
      de: [
        'Zen- und Fokusmodus lassen sich direkt über das kompakte NovaDock öffnen.',
        'Der Quickchat-Start unter Windows wurde korrigiert.',
        'Teamwork-Modelle sind in der manuellen Modellauswahl verfügbar.',
        'Authentifizierungsstatus-Abfragen bleiben lesend.',
        'Reine Reasoning-Ausgaben werden nicht mehr als fertiger Entwurf verwendet.'
      ],
      it: [
        'Apri direttamente la modalità Zen e Focus dal NovaDock compatto.',
        'Corretto l’avvio di Quickchat su Windows.',
        'I modelli Teamwork sono disponibili nella selezione manuale.',
        'I controlli dello stato di autenticazione restano in sola lettura.',
        'Le sole spiegazioni del ragionamento non vengono più usate come bozze complete.'
      ],
      es: [
        'Abre los modos Zen y Enfoque directamente desde NovaDock compacto.',
        'Se corrigió el inicio de Quickchat en Windows.',
        'Los modelos Teamwork están disponibles en la selección manual.',
        'Las comprobaciones del estado de autenticación siguen siendo de solo lectura.',
        'Las respuestas que solo contienen razonamiento ya no se usan como borradores terminados.'
      ],
      fr: [
        'Ouvrez directement les modes Zen et Concentration depuis le NovaDock compact.',
        'Le démarrage de Quickchat sous Windows a été corrigé.',
        'Les modèles Teamwork sont disponibles dans le sélecteur manuel.',
        'Les vérifications de l’état d’authentification restent en lecture seule.',
        'Les sorties contenant uniquement le raisonnement ne sont plus utilisées comme brouillons terminés.'
      ],
      'pt-BR': [
        'Abra os modos Zen e Foco diretamente pelo NovaDock compacto.',
        'A inicialização do Quickchat no Windows foi corrigida.',
        'Os modelos Teamwork estão disponíveis na seleção manual.',
        'As verificações do estado de autenticação continuam somente para leitura.',
        'Saídas que contêm apenas raciocínio não são mais usadas como rascunhos concluídos.'
      ],
      ru: [
        'Открывайте режимы Zen и «Фокус» прямо из компактного NovaDock.',
        'Исправлен запуск Quickchat в Windows.',
        'Модели Teamwork доступны в ручном выборе модели.',
        'Проверки состояния аутентификации остаются только для чтения.',
        'Вывод только с рассуждениями больше не используется как готовый черновик.'
      ],
      ja: [
        'コンパクトな NovaDock から Zen／フォーカスモードを直接開けます。',
        'Windows で Quickchat が起動しない問題を修正しました。',
        '手動モデル選択で Teamwork モデルを選べます。',
        '認証状態の確認は引き続き読み取り専用です。',
        '推論だけの出力を完成した下書きとして扱わないようにしました。'
      ]
    }
  }
];

export function releaseNotesBetween(
  candidate: UpdateNoticeCandidate,
  locale: DesktopLocaleId
): LocalReleaseNotes[] {
  if (!isVersion(candidate.toVersion)
    || (candidate.fromVersion !== null
      && (!isVersion(candidate.fromVersion) || compareVersions(candidate.toVersion, candidate.fromVersion) <= 0))) return [];
  return releaseNotes
    .filter((entry) => isVersion(entry.version)
      && (candidate.fromVersion === null || compareVersions(entry.version, candidate.fromVersion) > 0)
      && compareVersions(entry.version, candidate.toVersion) <= 0)
    .sort((a, b) => compareVersions(a.version, b.version))
    .map((entry) => ({ version: entry.version, changes: entry.changes[locale] || entry.changes.en }));
}

function compareVersions(left: string, right: string): number {
  const a = parseVersion(left);
  const b = parseVersion(right);
  if (!a || !b) return 0;
  for (let index = 0; index < 3; index += 1) {
    if (a.parts[index] !== b.parts[index]) return a.parts[index] - b.parts[index];
  }
  if (a.prerelease === b.prerelease) return 0;
  if (!a.prerelease) return 1;
  if (!b.prerelease) return -1;
  return a.prerelease.localeCompare(b.prerelease, undefined, { numeric: true });
}

function isVersion(value: unknown): value is string {
  return typeof value === 'string' && parseVersion(value) !== null;
}

function parseVersion(value: string): { parts: [number, number, number]; prerelease: string } | null {
  const match = /^v?(\d+)\.(\d+)\.(\d+)(?:-([0-9A-Za-z.-]+))?(?:\+[0-9A-Za-z.-]+)?$/.exec(value.trim());
  if (!match) return null;
  return { parts: [Number(match[1]), Number(match[2]), Number(match[3])], prerelease: match[4] || '' };
}
