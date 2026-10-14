import type { DesktopLocaleId } from './i18n/keys.js';

export type UpdateNoticeCandidate = { fromVersion: string | null; toVersion: string };
export type LocalReleaseNotes = { version: string; changes: readonly string[] };

// Keep release copy with the renderer bundle so What's New works offline.
// Content is tied to the application version; never infer release claims from
// the current UI or from an online changelog at runtime.
const releaseNotes: Array<{ version: string; changes: Record<DesktopLocaleId, readonly string[]> }> = [
  {
    version: '0.1.57-beta.4',
    changes: {
      de: ['Modelllisten akzeptieren die vom Backend gelieferten Kontextquellen.', 'Custom-Sidekick mit eigenem Icon und Prompteditor in Space-Auswahl und Ersteinrichtung.', 'Kuratierte Erweiterungen mit Kategorien, Produktlinks, Installation und persönlichen Funktionsbewertungen.', 'Kompaktere Einstellungen mit Unterbereichen und Seiten; das Start-Settings-Fenster passt auch bei langen Optionen.', 'Bonsai Image als experimenteller Browserzugang; zusätzliche Modellkonfigurationen werden als ungeprüft gekennzeichnet.'],
      en: ['Model lists accept context sources supplied by the backend.', 'Custom companion with its own icon and prompt editor in Space selection and first setup.', 'Curated extensions with categories, product links, installation and personal compatibility reports.', 'Compact settings with subsections and pages; startup settings fit long options.', 'Experimental Bonsai Image browser access; additional model configurations remain marked as unverified.'],
      it: ['Gli elenchi dei modelli accettano le fonti del contesto fornite dal backend.', 'Assistente personalizzato con icona ed editor del prompt nello Space e nella prima configurazione.', 'Estensioni curate con categorie, link, installazione e valutazioni personali di compatibilità.', 'Impostazioni compatte con sottosezioni e pagine; il pannello iniziale gestisce opzioni lunghe.', 'Accesso sperimentale a Bonsai Image nel browser; le configurazioni aggiuntive restano non verificate.'],
      es: ['Las listas de modelos aceptan las fuentes de contexto del backend.', 'Compañero personalizado con icono y editor de prompt en Space y configuración inicial.', 'Extensiones seleccionadas con categorías, enlaces, instalación e informes personales de compatibilidad.', 'Ajustes compactos con subsecciones y páginas; el panel inicial admite opciones largas.', 'Acceso experimental a Bonsai Image en el navegador; las configuraciones adicionales siguen sin verificar.'],
      fr: ['Les listes de modèles acceptent les sources de contexte du backend.', 'Compagnon personnalisé avec icône et éditeur de prompt dans le Space et la configuration initiale.', 'Extensions sélectionnées avec catégories, liens, installation et retours personnels de compatibilité.', 'Paramètres compacts avec sous-sections et pages ; le panneau initial accepte les options longues.', 'Accès expérimental à Bonsai Image dans le navigateur ; les configurations supplémentaires restent non vérifiées.'],
      'pt-BR': ['As listas de modelos aceitam as fontes de contexto do backend.', 'Companheiro personalizado com ícone e editor de prompt no Space e na configuração inicial.', 'Extensões selecionadas com categorias, links, instalação e relatos pessoais de compatibilidade.', 'Configurações compactas com subseções e páginas; o painel inicial suporta opções longas.', 'Acesso experimental ao Bonsai Image no navegador; configurações adicionais permanecem não verificadas.'],
      ru: ['Списки моделей принимают источники контекста, предоставленные сервером.', 'Собственный помощник с иконкой и редактором промпта в Space и первоначальной настройке.', 'Подборка расширений с категориями, ссылками, установкой и личными оценками совместимости.', 'Компактные настройки с подразделами и страницами; стартовая панель вмещает длинные параметры.', 'Экспериментальный доступ к Bonsai Image в браузере; дополнительные конфигурации отмечены как непроверенные.'],
      ja: ['モデル一覧がバックエンドのコンテキスト情報源を受け入れるようになりました。', 'Space と初回設定で、専用アイコンとプロンプト編集を備えたカスタムアシスタントを選べます。', '拡張機能カタログにカテゴリ、製品リンク、インストール、個人の動作評価を追加しました。', '設定をコンパクトな小区分とページに整理し、起動設定の長い選択肢にも対応しました。', 'Bonsai Image をブラウザで試せます。追加のモデル構成は未検証と表示します。']
    }
  },
  {
    version: '0.1.57-beta.3',
    changes: {
          "de": [
                "First Launch führt jetzt seitenweise durch Suchmaschine, Datenimport, Dock, KI-Verbindung und den ersten Space.",
                "Die Space-Persönlichkeit wird nach der KI-Einrichtung gewählt; ohne KI bleibt die Space-Einrichtung verfügbar.",
                "Die Startseite bietet ein Dock-Raster mit verschiebbaren Bereichen, drei Größen und gespeicherten Layouts je Profil und Space.",
                "Drei Rainbow-Rahmen mit runden Ecken; der einmalige Welcome-In-Abschluss spielt mit 8 % Lautstärke.",
                "Der lokale Modellkatalog zeigt 40 kuratierte Modelle mit eigenen Detailseiten; die neuen Einträge sind noch nicht für Installation und Ausführung qualifiziert.",
                "Das Windows-Tray-Symbol lädt die gepackten Markenassets; Quickchat-Modellauswahl und Profilfehlerbehandlung wurden korrigiert."
          ],
          "en": [
                "First Launch now guides you through search, data import, dock, AI connection and your first Space in separate steps.",
                "Choose your Space companion after AI setup; Space setup also works without AI.",
                "The home screen has a dock grid with movable sections, three sizes and saved layouts per profile and Space.",
                "Three rainbow borders with rounded corners; the one-time Welcome In completion plays at 8% volume.",
                "The local model catalog lists 40 curated models with dedicated detail pages; new entries are not yet qualified for installation or execution.",
                "The Windows tray icon loads packaged brand assets; Quickchat model access and profile error handling were corrected."
          ],
          "it": [
                "La prima configurazione guida attraverso ricerca, importazione, dock, connessione IA e primo Space in pagine separate.",
                "La personalità dello Space si sceglie dopo l’IA; lo Space si configura anche senza IA.",
                "La pagina iniziale offre una griglia con sezioni spostabili, tre dimensioni e layout salvati per profilo e Space.",
                "Tre bordi arcobaleno con angoli arrotondati; Welcome In viene riprodotto una sola volta all’8% del volume.",
                "Il catalogo locale presenta 40 modelli curati e pagine dettagliate; le nuove voci non sono ancora abilitate per installazione ed esecuzione.",
                "Corretti l’icona della barra di sistema Windows, l’accesso ai modelli Quickchat e la gestione degli errori di profilo."
          ],
          "es": [
                "La configuración inicial guía por búsqueda, importación, dock, conexión de IA y primer Space en páginas separadas.",
                "La personalidad del Space se elige después de configurar la IA; el Space también se configura sin IA.",
                "La página inicial ofrece secciones móviles, tres tamaños y diseños guardados por perfil y Space.",
                "Tres bordes arcoíris con esquinas redondeadas; Welcome In se reproduce una vez al 8% de volumen.",
                "El catálogo local incluye 40 modelos seleccionados y páginas detalladas; las nuevas entradas aún no están habilitadas para instalación o ejecución.",
                "Corregidos el icono de la bandeja de Windows, el acceso a modelos de Quickchat y los errores de perfil."
          ],
          "fr": [
                "La première configuration présente recherche, importation, dock, connexion IA et premier Space sur des pages distinctes.",
                "Choisissez la personnalité du Space après l’IA ; le Space peut aussi être configuré sans IA.",
                "L’accueil propose des sections déplaçables, trois tailles et des dispositions enregistrées par profil et Space.",
                "Trois bordures arc-en-ciel aux coins arrondis ; Welcome In est joué une seule fois à 8 % du volume.",
                "Le catalogue local présente 40 modèles sélectionnés et des fiches détaillées ; les nouvelles entrées ne sont pas encore autorisées à être installées ou exécutées.",
                "Corrections de l’icône Windows, de l’accès aux modèles Quickchat et de la gestion des erreurs de profil."
          ],
          "pt-BR": [
                "A configuração inicial apresenta busca, importação, dock, conexão de IA e primeiro Space em páginas separadas.",
                "Escolha a personalidade do Space após configurar a IA; o Space também funciona sem IA.",
                "A página inicial oferece seções móveis, três tamanhos e layouts salvos por perfil e Space.",
                "Três bordas arco-íris com cantos arredondados; Welcome In toca uma única vez a 8% do volume.",
                "O catálogo local apresenta 40 modelos selecionados e páginas detalhadas; as novas entradas ainda não estão habilitadas para instalação ou execução.",
                "Corrigidos o ícone da bandeja do Windows, o acesso aos modelos Quickchat e os erros de perfil."
          ],
          "ru": [
                "Первоначальная настройка разделена на страницы: поиск, импорт, панель приложений, подключение ИИ и первый Space.",
                "Личность помощника выбирается после настройки ИИ; Space можно настроить и без ИИ.",
                "На главной странице можно перемещать блоки, выбирать три размера и сохранять расположение для каждого профиля и Space.",
                "Три радужные рамки со скруглёнными углами; Welcome In звучит один раз с громкостью 8%.",
                "В локальном каталоге представлены 40 отобранных моделей с подробными страницами; новые записи пока не допущены к установке и запуску.",
                "Исправлены значок Windows, доступ к моделям Quickchat и обработка ошибок профиля."
          ],
          "ja": [
                "初回設定は検索、データ移行、ドック、AI 接続、最初の Space の各ページに分かれました。",
                "AI 設定後に Space のキャラクターを選択します。AI を使わない場合も Space を設定できます。",
                "ホーム画面のブロックを移動し、3 種類のサイズとレイアウトをプロフィール・Space ごとに保存できます。",
                "角を丸くした3種類のレインボー枠。初回完了時の Welcome In は音量8%で一度だけ再生します。",
                "ローカルカタログに40モデルと詳細ページを追加しました。新しい項目はまだインストール・実行の対象ではありません。",
                "Windows トレイアイコン、Quickchat のモデル選択、プロフィールのエラー処理を修正しました。"
          ]
    }
  },
  {
    version: '0.1.57-beta.1',
    changes: {
      de: [
        'Schlankere KI-Navigation: Gedächtnis, zusätzliche Assistenten und Integrationen bewusst im Extension & Skill Hub aktivieren.',
        'Companion je Space wählen: Nova, Orion, Patch, Spark oder Zen, mit eigenem Namen und dezenter Antwort-Tonalität.',
        'Quickchat startet mit kurzem Kontext und bietet „Chat zurücksetzen“.',
        'Aufgaben bündeln aktuelle und geplante Arbeit; Kanban bleibt eine optionale, zunächst deaktivierte Beta-Funktion.',
        'Nutzungsübersicht mit Messungen je Anbieter und Modell; unbekannte Token und Kosten bleiben als unbekannt erkennbar.',
        'Chats mehrfach auswählen und direkt in der Sidebar mit Bestätigung löschen.',
        'Mehrseitige Einstellungen mit klareren Bereichen für Modelle und Erweiterungen.',
        'Überarbeiteter Zen-Modus für eine ruhigere Chatansicht.',
        'Ollama Cloud getrennt von lokalen Ollama-Verbindungen auswählen.',
        'Mermaid und KaTeX lokal gebündelt; externe Renderer-Skripte blockiert und Loopback-Host-Prüfung ergänzt.',
        'Beta-Runtime auf Electron 45 Alpha mit Chromium 156 angehoben. Stable bleibt Standard, Beta ist separat aktivierbar.'
      ],
      en: [
        'Simpler AI navigation: explicitly enable memory, additional assistants and integrations in the Extension & Skill Hub.',
        'Choose a companion per Space: Nova, Orion, Patch, Spark or Zen, with a custom name and subtle response tone.',
        'Quickchat starts with shorter context and includes Reset Chat.',
        'Tasks brings current and scheduled work together; Kanban remains an optional Beta feature, disabled initially.',
        'Usage shows observations by provider and model; missing token counts and prices remain visibly unknown.',
        'Select multiple chats and delete directly in the sidebar with confirmation.',
        'Paged settings with clearer model and extension sections.',
        'Updated Zen Mode for a quieter chat view.',
        'Select Ollama Cloud separately from local Ollama connections.',
        'Mermaid and KaTeX bundled locally; external renderer scripts blocked and loopback Host checks added.',
        'Beta runtime moved to Electron 45 Alpha with Chromium 156. Stable stays the default; Beta requires opt-in.'
      ],
      es: [
        'Navegación de IA simplificada: activa memoria, asistentes adicionales e integraciones en Extension & Skill Hub.',
        'Elige un compañero por Space: Nova, Orion, Patch, Spark o Zen, con nombre propio y tono de respuesta sutil.',
        'Quickchat comienza con menos contexto e incluye Restablecer chat.',
        'Tareas reúne trabajo actual y programado; Kanban sigue siendo una función Beta opcional, desactivada inicialmente.',
        'Uso muestra mediciones por proveedor y modelo; los tokens y precios no disponibles figuran como desconocidos.',
        'Selecciona varios chats y elimínalos desde la barra lateral con confirmación.',
        'Ajustes por páginas con secciones más claras para modelos y extensiones.',
        'Modo Zen renovado para una vista de chat más tranquila.',
        'Selecciona Ollama Cloud por separado de las conexiones locales de Ollama.',
        'Mermaid y KaTeX incluidos localmente; scripts externos del renderer bloqueados y comprobación Host de loopback añadida.',
        'Runtime Beta actualizado a Electron 45 Alpha con Chromium 156. Stable sigue por defecto; Beta requiere activación.'
      ],
      fr: [
        'Navigation IA simplifiée : activez mémoire, assistants supplémentaires et intégrations dans Extension & Skill Hub.',
        'Choisissez un compagnon par Space : Nova, Orion, Patch, Spark ou Zen, avec nom personnalisé et tonalité discrète.',
        'Quickchat démarre avec un contexte réduit et propose Réinitialiser le chat.',
        'Tâches regroupe le travail actuel et planifié ; Kanban reste une fonction Beta facultative, désactivée au départ.',
        'Utilisation affiche les mesures par fournisseur et modèle ; tokens et prix manquants restent indiqués comme inconnus.',
        'Sélectionnez plusieurs chats et supprimez-les dans la barre latérale avec confirmation.',
        'Paramètres répartis en pages, avec sections modèles et extensions plus claires.',
        'Mode Zen remanié pour une vue de chat plus calme.',
        'Sélectionnez Ollama Cloud séparément des connexions Ollama locales.',
        'Mermaid et KaTeX intégrés localement ; scripts externes du renderer bloqués et contrôle Host loopback ajouté.',
        'Runtime Beta porté sur Electron 45 Alpha avec Chromium 156. Stable reste le choix par défaut ; Beta exige une activation.'
      ],
      it: [
        'Navigazione IA semplificata: attiva memoria, assistenti aggiuntivi e integrazioni in Extension & Skill Hub.',
        'Scegli un compagno per Space: Nova, Orion, Patch, Spark o Zen, con nome personalizzato e tono di risposta discreto.',
        'Quickchat parte con meno contesto e include Reimposta chat.',
        'Attività riunisce il lavoro corrente e pianificato; Kanban resta una funzione Beta opzionale, inizialmente disattivata.',
        'Utilizzo mostra misurazioni per provider e modello; token e prezzi mancanti restano indicati come sconosciuti.',
        'Seleziona più chat ed eliminale dalla barra laterale con conferma.',
        'Impostazioni divise in pagine, con sezioni più chiare per modelli ed estensioni.',
        'Modalità Zen rinnovata per una vista chat più tranquilla.',
        'Seleziona Ollama Cloud separatamente dalle connessioni Ollama locali.',
        'Mermaid e KaTeX inclusi localmente; script esterni del renderer bloccati e controllo Host loopback aggiunto.',
        'Runtime Beta aggiornato a Electron 45 Alpha con Chromium 156. Stable resta predefinito; Beta richiede attivazione.'
      ],
      'pt-BR': [
        'Navegação de IA simplificada: ative memória, assistentes adicionais e integrações no Extension & Skill Hub.',
        'Escolha um companheiro por Space: Nova, Orion, Patch, Spark ou Zen, com nome próprio e tom de resposta discreto.',
        'Quickchat começa com menos contexto e inclui Redefinir chat.',
        'Tarefas reúne o trabalho atual e agendado; Kanban continua uma função Beta opcional, inicialmente desativada.',
        'Uso mostra medições por provedor e modelo; tokens e preços ausentes permanecem identificados como desconhecidos.',
        'Selecione vários chats e exclua diretamente na barra lateral com confirmação.',
        'Configurações em páginas, com áreas mais claras para modelos e extensões.',
        'Modo Zen atualizado para uma conversa mais tranquila.',
        'Selecione Ollama Cloud separadamente das conexões locais do Ollama.',
        'Mermaid e KaTeX incluídos localmente; scripts externos do renderer bloqueados e verificação Host de loopback adicionada.',
        'Runtime Beta atualizado para Electron 45 Alpha com Chromium 156. Stable continua padrão; Beta exige ativação.'
      ],
      ru: [
        'Упрощена навигация ИИ: память, дополнительных помощников и интеграции можно включить в Extension & Skill Hub.',
        'Выбор помощника для каждого Space: Nova, Orion, Patch, Spark или Zen, своё имя и ненавязчивый стиль ответа.',
        'Quickchat запускается с коротким контекстом и позволяет сбросить чат.',
        'Раздел задач объединяет текущую и запланированную работу; Kanban остаётся дополнительной Beta-функцией, изначально выключенной.',
        'Статистика использует измерения по провайдеру и модели; отсутствующие токены и цены отмечены как неизвестные.',
        'Выбирайте несколько чатов и удаляйте их прямо в боковой панели с подтверждением.',
        'Настройки разделены на страницы с более понятными разделами моделей и расширений.',
        'Обновлён режим Zen для спокойного просмотра чата.',
        'Ollama Cloud выбирается отдельно от локальных подключений Ollama.',
        'Mermaid и KaTeX включены локально; внешние скрипты renderer заблокированы, добавлена проверка Host для loopback.',
        'Среда Beta обновлена до Electron 45 Alpha с Chromium 156. Stable остаётся стандартным каналом; Beta включается отдельно.'
      ],
      ja: [
        'AIナビゲーションを簡素化。メモリ、追加アシスタント、連携機能はExtension & Skill Hubで有効にできます。',
        'SpaceごとにNova、Orion、Patch、Spark、Zenを選択。名前を変更でき、回答の口調にも穏やかに反映されます。',
        'Quickchatの開始コンテキストを短縮し、チャットのリセットを追加しました。',
        'タスク画面に現在と予定の作業を統合。Kanbanは任意のBeta機能で、初期状態では無効です。',
        '使用状況をプロバイダーとモデルごとの実測値で表示。未取得のトークン数や料金は不明と表示します。',
        '複数のチャットを選択し、確認後にサイドバーから直接削除できます。',
        '設定をページに分割し、モデルと拡張機能の項目を整理しました。',
        '落ち着いたチャット表示のためZenモードを更新しました。',
        'Ollama CloudをローカルOllama接続とは別に選択できます。',
        'MermaidとKaTeXをローカルに同梱。外部rendererスクリプトを禁止し、loopbackのHost検査を追加しました。',
        'BetaランタイムをChromium 156搭載のElectron 45 Alphaへ更新。標準はStableで、Betaは明示的に有効化します。'
      ]
    }
  },
{
  "version": "0.1.56",
  "changes": {
    "de": [
      "Neue Startseite mit wählbaren Hintergrundbildern, Dimmung und Unschärfe je Profil und Space.",
      "Kompakter Chatkopf, aufgeräumtes Eingabefeld und schneller Zugriff auf Chataktionen.",
      "Gemeinsame Anbieter- und Modellwahl in Einstellungen, Chat und Quickchat; die Auswahl bleibt an Profil und Space gebunden.",
      "Lokale KI mit geführter Modelleinrichtung und Hinweisen zur passenden Hardware.",
      "Die Suchmaschine lässt sich direkt bei der Ersteinrichtung auswählen.",
      "Einstellungen per Escape oder Schließen verlassen; Zurück führt ohne Seitenverlauf zur Startseite.",
      "Verbesserte Darstellung des ersten Fensters unter Windows.",
      "Verbesserte MCP-Konfiguration und Werkzeuge sowie lokale Gedächtnissuche und das Leeren von Notizen.",
      "Updatekanal zwischen Stable und Beta wählen; die ersten Betaversionen beginnen mit 0.1.57.",
      "Arbeitsplatz mit konfigurierbaren Widgets, lokalen Notizen, Aufgaben, Fokustimer und Plugins. Passwortimport aus Browser-CSV mit lokal verschlüsseltem Speicher und bewusstem Ausfüllen auf passenden HTTPS-Seiten.",
      "Vier Übergänge nach dem Entsperren und fünf optionale Startklänge mit passender Dauer, Lautstärke und Zufallsauswahl; Rainbow ist abschaltbar.",
      "Automatische Chattitel sowie Pinnen, Archivieren und Löschen in der Sidebar. Conversation ist in Preferences integriert; Working Models enthält ChatGPT/Codex und OpenCode Go, weitere Anbieter stehen unter Beta Models.",
      "Kompakte Nova-Research-Leiste, korrigierte Gmail-Seitenleistennavigation und erhaltene Schutzheader für eingebettete Loginseiten."
    ],
    "en": [
      "New start page with selectable wallpapers, dimming and blur for each profile and Space.",
      "Compact chat header, a cleaner composer and quick access to chat actions.",
      "Shared provider and model selection across Settings, Chat and Quickchat, scoped to each profile and Space.",
      "Guided local AI model setup with hardware guidance.",
      "Choose your search engine during first-run setup.",
      "Leave Settings with Escape or Close; Back returns to the start page when there is no page history.",
      "Improved presentation of the first window on Windows.",
      "Improved MCP configuration and tools, local memory search and clearing notes.",
      "Choose the Stable or Beta update channel; beta releases start with 0.1.57.",
      "Workspace with configurable widgets, local notes, tasks, focus timer and plugins. Import browser CSV passwords into encrypted local storage and explicitly fill matching HTTPS sites.",
      "Four unlock transitions and five optional opening sounds with matching duration, volume and random selection; the rainbow border can be disabled.",
      "Automatic chat titles and sidebar pin, archive and delete. Conversation is part of Preferences; Working Models contains ChatGPT/Codex and OpenCode Go, with other providers under Beta Models.",
      "Compact Nova Research toolbar, corrected Gmail sidepanel navigation and retained framing protections for embedded login pages."
    ],
    "es": [
      "Nueva página de inicio con fondos seleccionables, oscurecimiento y desenfoque por perfil y Space.",
      "Cabecera de chat compacta, cuadro de escritura más claro y acceso rápido a las acciones.",
      "Selección compartida de proveedor y modelo en Ajustes, Chat y Quickchat, por perfil y Space.",
      "Configuración guiada de modelos de IA local con orientación sobre el hardware.",
      "Elige el buscador durante la configuración inicial.",
      "Sal de Ajustes con Escape o Cerrar; Atrás vuelve al inicio cuando no hay historial de páginas.",
      "Presentación mejorada de la primera ventana en Windows.",
      "Mejoras en la configuración y las herramientas MCP, la búsqueda de memoria local y el borrado de notas.",
      "Elige el canal Stable o Beta; las versiones beta empiezan con 0.1.57.",
      "Espacio de trabajo con widgets, notas locales, tareas, temporizador y plugins. Importación CSV de contraseñas con almacenamiento local cifrado y rellenado en sitios HTTPS correspondientes.",
      "Cuatro transiciones y cinco sonidos opcionales sincronizados, con volumen, selección aleatoria y borde arcoíris configurables. Títulos de chat automáticos, fijar, archivar y eliminar; Working Models y Beta Models separados.",
      "Barra Nova Research compacta, navegación Gmail corregida y protección conservada para páginas de acceso incrustadas."
    ],
    "fr": [
      "Nouvelle page de démarrage avec fonds au choix, assombrissement et flou par profil et Space.",
      "En-tête de chat compact, zone de saisie simplifiée et accès rapide aux actions.",
      "Sélection commune du fournisseur et du modèle dans les paramètres, Chat et Quickchat, par profil et Space.",
      "Configuration guidée des modèles IA locaux avec des indications sur le matériel.",
      "Choisissez le moteur de recherche pendant la première configuration.",
      "Quittez les paramètres avec Échap ou Fermer ; Retour revient au démarrage sans historique de page.",
      "Affichage amélioré de la première fenêtre sous Windows.",
      "Amélioration de la configuration et des outils MCP, de la recherche en mémoire locale et de la suppression des notes.",
      "Choisissez le canal Stable ou Beta ; les versions bêta commencent avec 0.1.57.",
      "Espace de travail avec widgets, notes locales, tâches, minuteur et plugins. Importation CSV des mots de passe avec stockage local chiffré et remplissage sur les sites HTTPS correspondants.",
      "Quatre transitions et cinq sons facultatifs synchronisés, avec volume, choix aléatoire et bordure arc-en-ciel réglables. Titres de chat automatiques, épingler, archiver et supprimer ; séparation Working Models et Beta Models.",
      "Barre Nova Research compacte, navigation Gmail corrigée et protections conservées pour les pages de connexion intégrées."
    ],
    "it": [
      "Nuova pagina iniziale con sfondi selezionabili, oscuramento e sfocatura per profilo e Space.",
      "Intestazione chat compatta, area di scrittura più chiara e accesso rapido alle azioni.",
      "Selezione condivisa di provider e modello in Impostazioni, Chat e Quickchat, per profilo e Space.",
      "Configurazione guidata dei modelli IA locali con indicazioni sul tipo di hardware.",
      "Scegli il motore di ricerca durante la configurazione iniziale.",
      "Esci dalle Impostazioni con Escape o Chiudi; Indietro torna alla pagina iniziale senza cronologia.",
      "Visualizzazione migliorata della prima finestra su Windows.",
      "Miglioramenti alla configurazione e agli strumenti MCP, alla ricerca nella memoria locale e alla cancellazione delle note.",
      "Scegli il canale Stable o Beta; le versioni beta iniziano con 0.1.57.",
      "Area di lavoro con widget, note locali, attività, timer e plugin. Importazione CSV delle password con archiviazione locale cifrata e compilazione sui siti HTTPS corrispondenti.",
      "Quattro transizioni e cinque suoni opzionali sincronizzati, con volume, scelta casuale e bordo arcobaleno configurabili. Titoli chat automatici, fissare, archiviare ed eliminare; Working Models e Beta Models separati.",
      "Barra Nova Research compatta, navigazione Gmail corretta e protezioni mantenute per le pagine di accesso incorporate."
    ],
    "pt-BR": [
      "Nova página inicial com fundos selecionáveis, escurecimento e desfoque por perfil e Space.",
      "Cabeçalho de chat compacto, área de escrita mais clara e acesso rápido às ações.",
      "Seleção compartilhada de provedor e modelo em Configurações, Chat e Quickchat, por perfil e Space.",
      "Configuração guiada de modelos de IA local com orientações sobre o hardware.",
      "Escolha o mecanismo de pesquisa durante a configuração inicial.",
      "Saia das Configurações com Escape ou Fechar; Voltar retorna ao início quando não há histórico de páginas.",
      "Exibição aprimorada da primeira janela no Windows.",
      "Melhorias na configuração e nas ferramentas MCP, na busca de memória local e na limpeza de notas.",
      "Escolha o canal Stable ou Beta; as versões beta começam em 0.1.57.",
      "Área de trabalho com widgets, notas locais, tarefas, temporizador e plugins. Importação CSV de senhas com armazenamento local criptografado e preenchimento nos sites HTTPS correspondentes.",
      "Quatro transições e cinco sons opcionais sincronizados, com volume, escolha aleatória e borda arco-íris configuráveis. Títulos de chat automáticos, fixar, arquivar e excluir; Working Models e Beta Models separados.",
      "Barra Nova Research compacta, navegação Gmail corrigida e proteções mantidas para páginas de login incorporadas."
    ],
    "ru": [
      "Новая стартовая страница с выбором фона, затемнением и размытием для каждого профиля и Space.",
      "Компактный заголовок чата, упорядоченное поле ввода и быстрый доступ к действиям.",
      "Общий выбор провайдера и модели в настройках, чате и Quickchat с привязкой к профилю и Space.",
      "Пошаговая настройка локальных моделей ИИ с рекомендациями по оборудованию.",
      "Выбор поисковой системы при первоначальной настройке.",
      "Выход из настроек клавишей Escape или кнопкой закрытия; Назад возвращает на стартовую страницу без истории переходов.",
      "Улучшено отображение первого окна в Windows.",
      "Улучшены настройки и инструменты MCP, поиск в локальной памяти и очистка заметок.",
      "Выбор канала обновлений Stable или Beta; бета-версии начинаются с 0.1.57.",
      "Рабочий стол с виджетами, локальными заметками, задачами, таймером и плагинами. Импорт паролей из CSV с локальным шифрованием и заполнением на соответствующих HTTPS-сайтах.",
      "Четыре перехода и пять необязательных звуков с синхронизацией, громкостью и случайным выбором; радужная рамка отключается. Автоматические названия чатов, закрепление, архивирование и удаление; Working Models и Beta Models разделены.",
      "Компактная панель Nova Research, исправленная навигация Gmail и сохранение защиты встроенных страниц входа."
    ],
    "ja": [
      "プロファイルとSpaceごとに背景画像、暗さ、ぼかしを選べる新しいスタートページ。",
      "コンパクトなチャットヘッダー、整理された入力欄、操作メニューへの素早いアクセス。",
      "設定、チャット、Quickchatで共通のプロバイダー・モデル選択を使用し、プロファイルとSpaceごとに保持。",
      "ハードウェアの案内付きでローカルAIモデルを設定。",
      "初回設定で検索エンジンを選択。",
      "Escapeまたは閉じるボタンで設定を終了。ページ履歴がない場合、戻る操作でスタートページに移動。",
      "Windowsで最初のウィンドウの表示を改善。",
      "MCP設定とツール、ローカルメモリー検索、ノートの消去を改善。",
      "更新チャネルをStableとBetaから選択。ベータ版は0.1.57から開始。",
      "ウィジェット、ローカルメモ、タスク、タイマー、プラグインを備えたワークスペース。CSVからパスワードを読み込み、ローカルで暗号化し、一致するHTTPSサイトに入力できます。",
      "4種類の画面遷移と5種類の任意の起動音を同期。音量、ランダム選択、虹色の枠を設定できます。チャットの自動タイトル、固定、アーカイブ、削除と、Working Models・Beta Modelsの分離。",
      "コンパクトなNova Research、Gmailのナビゲーション修正、埋め込みログインページの保護維持。"
    ]
  }
},

  {
    version: '0.1.53',
    changes: {
      en: ['First-run setup no longer blocks the sidebar or top navigation.', 'Escape lets you leave the AI choice and finish browser-only setup safely.'],
      de: ['Die Ersteinrichtung blockiert die Seitenleiste und obere Navigation nicht mehr.', 'Mit Escape lässt sich die KI-Auswahl verlassen und die reine Browser-Einrichtung sicher abschließen.'],
      it: ['La configurazione iniziale non blocca più la barra laterale o la navigazione superiore.', 'Con Escape puoi uscire dalla scelta dell’IA e completare in sicurezza la configurazione del solo browser.'],
      es: ['La configuración inicial ya no bloquea la barra lateral ni la navegación superior.', 'Escape permite salir de la selección de IA y completar de forma segura la configuración solo del navegador.'],
      fr: ['La première configuration ne bloque plus la barre latérale ni la navigation supérieure.', 'Échap permet de quitter le choix de l’IA et de terminer la configuration du navigateur seul en toute sécurité.'],
      'pt-BR': ['A configuração inicial não bloqueia mais a barra lateral nem a navegação superior.', 'Escape permite sair da escolha de IA e concluir com segurança a configuração somente do navegador.'],
      ru: ['Первоначальная настройка больше не блокирует боковую панель и верхнюю навигацию.', 'Клавиша Escape позволяет выйти из выбора ИИ и безопасно завершить настройку только браузера.'],
      ja: ['初回設定でサイドバーや上部ナビゲーションが操作できなくなる問題を修正しました。', 'Escape キーで AI の選択を終了し、ブラウザーのみの設定を安全に完了できます。']
    }
  },
  {
    version: '0.1.48',
    changes: {
      en: ['Complete or cancel persistent goals with confirmed saved state.', 'Teamwork discards late results after Stop and distinguishes timeouts.', 'Accent colors apply to browser controls; page tools are in the action menu.', 'Hardware checks accept stable redirected profile paths.', 'Downloaded updates retain the normal quit path when shutdown times out.'],
      de: ['Persistente Ziele mit bestätigtem Speicherzustand abschließen oder abbrechen.', 'Teamwork verwirft späte Ergebnisse nach Stop und unterscheidet Zeitüberschreitungen.', 'Akzentfarben gelten für Browser-Bedienelemente; Seitenwerkzeuge liegen im Aktionsmenü.', 'Hardwareprüfungen akzeptieren stabile umgeleitete Profilpfade.', 'Heruntergeladene Updates behalten bei verzögertem Herunterfahren den normalen Beenden-Pfad.'],
      it: ['Completa o annulla gli obiettivi persistenti con stato salvato confermato.', 'Teamwork scarta risultati tardivi dopo Stop e distingue i timeout.', 'I colori accento si applicano ai controlli; gli strumenti pagina sono nel menu azioni.', 'Il controllo hardware accetta percorsi profilo reindirizzati stabili.', 'Gli aggiornamenti scaricati mantengono la chiusura normale anche se lo spegnimento supera il tempo limite.'],
      es: ['Completa o cancela objetivos persistentes con estado guardado confirmado.', 'Teamwork descarta resultados tardíos tras Detener y distingue tiempos agotados.', 'Los colores de acento se aplican a los controles; las herramientas están en el menú de acciones.', 'La comprobación de hardware acepta rutas de perfil redirigidas estables.', 'Las actualizaciones descargadas mantienen el cierre normal si se agota el tiempo de apagado.'],
      fr: ['Terminez ou annulez les objectifs persistants avec un état enregistré confirmé.', 'Teamwork ignore les résultats tardifs après Arrêter et distingue les délais dépassés.', 'Les couleurs d’accent s’appliquent aux commandes ; les outils de page sont dans le menu d’actions.', 'La vérification matérielle accepte les chemins de profil redirigés stables.', 'Les mises à jour téléchargées conservent la fermeture normale si l’arrêt dépasse son délai.'],
      'pt-BR': ['Conclua ou cancele objetivos persistentes com estado salvo confirmado.', 'Teamwork descarta resultados tardios após Parar e distingue tempos limite.', 'As cores de destaque se aplicam aos controles; ferramentas ficam no menu de ações.', 'A verificação de hardware aceita caminhos de perfil redirecionados estáveis.', 'Atualizações baixadas mantêm o encerramento normal quando o desligamento excede o prazo.'],
      ru: ['Завершайте или отменяйте постоянные цели с подтверждённым сохранением.', 'Teamwork отбрасывает поздние результаты после остановки и различает тайм-ауты.', 'Акцентные цвета применяются к элементам браузера; инструменты страницы находятся в меню действий.', 'Проверка оборудования принимает стабильные перенаправленные пути профиля.', 'Загруженные обновления сохраняют обычное завершение приложения при превышении срока остановки.'],
      ja: ['保存状態を確認して永続的な目標を完了またはキャンセルできます。', 'Teamwork は停止後の遅延結果を破棄し、タイムアウトを区別します。', 'アクセント色がブラウザーの操作部に適用され、ページツールはアクションメニューに移動しました。', 'ハードウェア確認は安定したリダイレクト済みプロファイルパスに対応します。', '終了処理がタイムアウトしても、ダウンロード済み更新のための通常の終了経路を維持します。']
    }
  },
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
        'Open Zen Mode directly from the compact NovaDock.',
        'Fixed Quickchat startup on Windows.',
        'Choose Teamwork models from the manual model picker.',
        'Authentication status checks remain read-only.',
        'Reasoning-only output is no longer used as a finished draft.'
      ],
      de: [
        'Zen Mode lässt sich direkt über das kompakte NovaDock öffnen.',
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
  const notes = releaseNotes
    .filter((entry) => isVersion(entry.version)
      && (candidate.fromVersion === null || compareVersions(entry.version, candidate.fromVersion) > 0)
      && compareVersions(entry.version, candidate.toVersion) <= 0)
    .sort((a, b) => compareVersions(a.version, b.version))
    .map((entry) => ({ version: entry.version, changes: entry.changes[locale] || entry.changes.en }));
  if (notes.some((entry) => compareVersions(entry.version, candidate.toVersion) === 0)) return notes;

  return [...notes, {
    version: candidate.toVersion,
    changes: [updateConfirmation(candidate.toVersion, locale)]
  }];
}

function updateConfirmation(version: string, locale: DesktopLocaleId): string {
  const messages: Record<DesktopLocaleId, string> = {
    en: `Lastbrowser is now updated to version ${version}.`,
    de: `Lastbrowser wurde auf Version ${version} aktualisiert.`,
    it: `Lastbrowser è stato aggiornato alla versione ${version}.`,
    es: `Lastbrowser se ha actualizado a la versión ${version}.`,
    fr: `Lastbrowser a été mis à jour vers la version ${version}.`,
    'pt-BR': `O Lastbrowser foi atualizado para a versão ${version}.`,
    ru: `Lastbrowser обновлён до версии ${version}.`,
    ja: `Lastbrowser をバージョン ${version} に更新しました。`
  };
  return messages[locale] || messages.en;
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
