import type { DesktopCatalog, DesktopLocaleId } from './keys.js';

export const teamworkUxTranslations: Record<DesktopLocaleId, Partial<DesktopCatalog>> = {
  en: {
    'teamwork.status.on': 'On', 'teamwork.status.off': 'Off', 'teamwork.status.unknown': 'Status unknown',
    'teamwork.overview.title': 'Choose a working style', 'teamwork.overview.description': 'Pick the balance that fits this task. Teamwork coordinates available GPT, Gemini and Ollama Cloud models when they are configured.',
    'teamwork.preset.cost': 'Resource-saving', 'teamwork.preset.costDescription': 'Fewer parallel contributions and faster models for everyday tasks.', 'teamwork.preset.balanced': 'Balanced', 'teamwork.preset.balancedDescription': 'A practical mix of speed and a second opinion.', 'teamwork.preset.quality': 'Thorough', 'teamwork.preset.qualityDescription': 'More parallel review for complex or high-impact work.',
    'teamwork.advanced': 'Advanced settings', 'teamwork.provider.title': 'Models found in provider catalogs',
    'teamwork.provider.note': 'Catalog entries are not a live connection or quota check. Access is confirmed when a model is used.',
    'teamwork.provider.none': 'No Teamwork models were found in the current catalogs.', 'teamwork.provider.found': 'Models found; access is checked when used.', 'teamwork.provider.refresh': 'Refresh model list',
    'teamwork.process.summary': '{count} contributions · {status}', 'teamwork.process.details': 'Show contributions',
    'teamwork.process.complete': 'Complete', 'teamwork.process.partial': 'Partly complete', 'teamwork.process.failed': 'Could not complete', 'teamwork.process.running': 'Working', 'teamwork.process.stopped': 'Stopped', 'teamwork.process.skipped': 'Not started', 'teamwork.process.planned': 'Planned', 'teamwork.process.aborted': 'Aborted', 'teamwork.process.diagnostic': 'Diagnostic: {code}', 'teamwork.process.candidateDiagnostics': 'Provider diagnostics ({count})',
    'teamwork.process.critic': 'Review', 'teamwork.process.contributor': 'Contributor', 'teamwork.process.final': 'The combined answer appears as the chat message below.',
    'teamwork.fallback.enabled': 'Try another model if one fails', 'teamwork.fallback.enabledDescription': 'Retry with another model after a provider error, subject to the same account and usage limits.', 'teamwork.fallback.quorum': 'Minimum successful contributions'
  },
  de: {
    'teamwork.status.on': 'Aktiv', 'teamwork.status.off': 'Aus', 'teamwork.status.unknown': 'Status unbekannt',
    'teamwork.overview.title': 'Arbeitsweise wählen', 'teamwork.overview.description': 'Wähle, was zu dieser Aufgabe passt. Teamwork koordiniert verfügbare GPT-, Gemini- und Ollama-Cloud-Modelle, sofern sie eingerichtet sind.',
    'teamwork.preset.cost': 'Ressourcenschonend', 'teamwork.preset.costDescription': 'Weniger parallele Beiträge und schnelle Modelle für Alltagsaufgaben.', 'teamwork.preset.balanced': 'Ausgewogen', 'teamwork.preset.balancedDescription': 'Eine gute Mischung aus Tempo und einer zweiten Einschätzung.', 'teamwork.preset.quality': 'Gründlich', 'teamwork.preset.qualityDescription': 'Mehr parallele Prüfung für komplexe oder wichtige Aufgaben.',
    'teamwork.advanced': 'Erweiterte Einstellungen', 'teamwork.provider.title': 'Modelle in Provider-Katalogen',
    'teamwork.provider.note': 'Katalogeinträge prüfen weder Live-Verbindung noch Kontingent. Der Zugriff wird erst beim Verwenden eines Modells geprüft.',
    'teamwork.provider.none': 'In den aktuellen Katalogen wurden keine Teamwork-Modelle gefunden.', 'teamwork.provider.found': 'Modelle erkannt; Zugriff wird beim Verwenden geprüft.', 'teamwork.provider.refresh': 'Modellliste aktualisieren',
    'teamwork.process.summary': '{count} Beiträge · {status}', 'teamwork.process.details': 'Beiträge anzeigen',
    'teamwork.process.complete': 'Abgeschlossen', 'teamwork.process.partial': 'Teilweise abgeschlossen', 'teamwork.process.failed': 'Fehlgeschlagen', 'teamwork.process.running': 'Läuft', 'teamwork.process.stopped': 'Abgebrochen', 'teamwork.process.skipped': 'Nicht gestartet', 'teamwork.process.planned': 'Geplant', 'teamwork.process.aborted': 'Abgebrochen', 'teamwork.process.diagnostic': 'Diagnosecode: {code}', 'teamwork.process.candidateDiagnostics': 'Provider-Diagnosen ({count})',
    'teamwork.process.critic': 'Prüfung', 'teamwork.process.contributor': 'Beitrag', 'teamwork.process.final': 'Die gemeinsame Antwort steht im Chatbeitrag unter dieser Übersicht.',
    'teamwork.fallback.enabled': 'Bei Fehler anderes Modell versuchen', 'teamwork.fallback.enabledDescription': 'Nach einem Providerfehler mit einem anderen Modell erneut versuchen; Konten- und Nutzungslimits gelten weiter.', 'teamwork.fallback.quorum': 'Mindestens erfolgreiche Beiträge'
  },
  it: {
    'teamwork.status.on': 'Attivo', 'teamwork.status.off': 'Disattivato', 'teamwork.status.unknown': 'Stato sconosciuto',
    'teamwork.overview.title': 'Scegli lo stile di lavoro', 'teamwork.overview.description': 'Scegli l’equilibrio adatto al compito. Teamwork coordina i modelli GPT, Gemini e Ollama Cloud disponibili se configurati.',
    'teamwork.preset.cost': 'Risparmio risorse', 'teamwork.preset.costDescription': 'Meno contributi paralleli e modelli rapidi per le attività quotidiane.', 'teamwork.preset.balanced': 'Equilibrato', 'teamwork.preset.balancedDescription': 'Un buon mix di velocità e un secondo parere.', 'teamwork.preset.quality': 'Approfondito', 'teamwork.preset.qualityDescription': 'Più revisioni parallele per attività complesse o importanti.',
    'teamwork.advanced': 'Impostazioni avanzate', 'teamwork.provider.title': 'Modelli trovati nei cataloghi dei provider',
    'teamwork.provider.note': 'Le voci del catalogo non verificano connessione o quota. L’accesso viene controllato quando il modello è usato.',
    'teamwork.provider.none': 'Nessun modello Teamwork trovato nei cataloghi attuali.', 'teamwork.provider.found': 'Modelli rilevati; accesso verificato all’uso.', 'teamwork.provider.refresh': 'Aggiorna elenco modelli',
    'teamwork.process.summary': '{count} contributi · {status}', 'teamwork.process.details': 'Mostra contributi',
    'teamwork.process.complete': 'Completato', 'teamwork.process.partial': 'Completato in parte', 'teamwork.process.failed': 'Non completato', 'teamwork.process.running': 'In corso', 'teamwork.process.stopped': 'Interrotto', 'teamwork.process.skipped': 'Non avviato', 'teamwork.process.planned': 'Pianificato', 'teamwork.process.aborted': 'Interrotto', 'teamwork.process.diagnostic': 'Codice diagnostico: {code}', 'teamwork.process.candidateDiagnostics': 'Diagnostica provider ({count})',
    'teamwork.process.critic': 'Revisione', 'teamwork.process.contributor': 'Contributo', 'teamwork.process.final': 'La risposta combinata appare nel messaggio della chat qui sotto.',
    'teamwork.fallback.enabled': 'Prova un altro modello in caso di errore', 'teamwork.fallback.enabledDescription': 'Riprova con un altro modello dopo un errore del provider, mantenendo gli stessi limiti dell’account e di utilizzo.', 'teamwork.fallback.quorum': 'Contributi riusciti minimi'
  },
  es: {
    'teamwork.status.on': 'Activo', 'teamwork.status.off': 'Desactivado', 'teamwork.status.unknown': 'Estado desconocido',
    'teamwork.overview.title': 'Elige un estilo de trabajo', 'teamwork.overview.description': 'Elige el equilibrio adecuado para la tarea. Teamwork coordina modelos GPT, Gemini y Ollama Cloud disponibles cuando están configurados.',
    'teamwork.preset.cost': 'Ahorro de recursos', 'teamwork.preset.costDescription': 'Menos aportaciones paralelas y modelos rápidos para tareas cotidianas.', 'teamwork.preset.balanced': 'Equilibrado', 'teamwork.preset.balancedDescription': 'Una buena mezcla de rapidez y una segunda opinión.', 'teamwork.preset.quality': 'Exhaustivo', 'teamwork.preset.qualityDescription': 'Más revisión en paralelo para tareas complejas o importantes.',
    'teamwork.advanced': 'Configuración avanzada', 'teamwork.provider.title': 'Modelos encontrados en catálogos de proveedores',
    'teamwork.provider.note': 'El catálogo no confirma la conexión ni la cuota. El acceso se comprueba al usar el modelo.',
    'teamwork.provider.none': 'No se encontraron modelos de Teamwork en los catálogos actuales.', 'teamwork.provider.found': 'Modelos detectados; el acceso se comprueba al usarlos.', 'teamwork.provider.refresh': 'Actualizar modelos',
    'teamwork.process.summary': '{count} aportaciones · {status}', 'teamwork.process.details': 'Mostrar aportaciones',
    'teamwork.process.complete': 'Completado', 'teamwork.process.partial': 'Parcialmente completado', 'teamwork.process.failed': 'No se pudo completar', 'teamwork.process.running': 'En curso', 'teamwork.process.stopped': 'Detenido', 'teamwork.process.skipped': 'No iniciado', 'teamwork.process.planned': 'Previsto', 'teamwork.process.aborted': 'Interrumpido', 'teamwork.process.diagnostic': 'Diagnóstico: {code}', 'teamwork.process.candidateDiagnostics': 'Diagnósticos del proveedor ({count})',
    'teamwork.process.critic': 'Revisión', 'teamwork.process.contributor': 'Participante', 'teamwork.process.final': 'La respuesta combinada aparece en el mensaje de chat siguiente.',
    'teamwork.fallback.enabled': 'Probar otro modelo si falla', 'teamwork.fallback.enabledDescription': 'Reintenta con otro modelo tras un error del proveedor, respetando los mismos límites de cuenta y uso.', 'teamwork.fallback.quorum': 'Aportaciones correctas mínimas'
  },
  fr: {
    'teamwork.status.on': 'Activé', 'teamwork.status.off': 'Désactivé', 'teamwork.status.unknown': 'État inconnu',
    'teamwork.overview.title': 'Choisir un style de travail', 'teamwork.overview.description': 'Choisissez l’équilibre adapté à la tâche. Teamwork coordonne les modèles GPT, Gemini et Ollama Cloud disponibles lorsqu’ils sont configurés.',
    'teamwork.preset.cost': 'Économe en ressources', 'teamwork.preset.costDescription': 'Moins de contributions parallèles et des modèles rapides pour les tâches courantes.', 'teamwork.preset.balanced': 'Équilibré', 'teamwork.preset.balancedDescription': 'Un bon compromis entre rapidité et second avis.', 'teamwork.preset.quality': 'Approfondi', 'teamwork.preset.qualityDescription': 'Plus de vérifications parallèles pour les tâches complexes ou importantes.',
    'teamwork.advanced': 'Paramètres avancés', 'teamwork.provider.title': 'Modèles trouvés dans les catalogues des fournisseurs',
    'teamwork.provider.note': 'Le catalogue ne vérifie ni la connexion en direct ni le quota. L’accès est vérifié à l’utilisation du modèle.',
    'teamwork.provider.none': 'Aucun modèle Teamwork trouvé dans les catalogues actuels.', 'teamwork.provider.found': 'Modèles détectés ; accès vérifié lors de l’utilisation.', 'teamwork.provider.refresh': 'Actualiser les modèles',
    'teamwork.process.summary': '{count} contributions · {status}', 'teamwork.process.details': 'Afficher les contributions',
    'teamwork.process.complete': 'Terminé', 'teamwork.process.partial': 'Partiellement terminé', 'teamwork.process.failed': 'Échec', 'teamwork.process.running': 'En cours', 'teamwork.process.stopped': 'Arrêté', 'teamwork.process.skipped': 'Non démarré', 'teamwork.process.planned': 'Prévu', 'teamwork.process.aborted': 'Interrompu', 'teamwork.process.diagnostic': 'Code de diagnostic : {code}', 'teamwork.process.candidateDiagnostics': 'Diagnostics fournisseur ({count})',
    'teamwork.process.critic': 'Vérification', 'teamwork.process.contributor': 'Contribution', 'teamwork.process.final': 'La réponse combinée apparaît dans le message de chat ci-dessous.',
    'teamwork.fallback.enabled': 'Essayer un autre modèle en cas d’échec', 'teamwork.fallback.enabledDescription': 'Réessayer avec un autre modèle après une erreur fournisseur, dans les mêmes limites de compte et d’utilisation.', 'teamwork.fallback.quorum': 'Contributions réussies minimales'
  },
  'pt-BR': {
    'teamwork.status.on': 'Ativo', 'teamwork.status.off': 'Desativado', 'teamwork.status.unknown': 'Status desconhecido',
    'teamwork.overview.title': 'Escolha um estilo de trabalho', 'teamwork.overview.description': 'Escolha o equilíbrio adequado para a tarefa. O Teamwork coordena modelos GPT, Gemini e Ollama Cloud disponíveis quando configurados.',
    'teamwork.preset.cost': 'Econômico em recursos', 'teamwork.preset.costDescription': 'Menos contribuições paralelas e modelos rápidos para tarefas do dia a dia.', 'teamwork.preset.balanced': 'Equilibrado', 'teamwork.preset.balancedDescription': 'Uma boa combinação de velocidade e uma segunda opinião.', 'teamwork.preset.quality': 'Minucioso', 'teamwork.preset.qualityDescription': 'Mais revisão paralela para tarefas complexas ou importantes.',
    'teamwork.advanced': 'Configurações avançadas', 'teamwork.provider.title': 'Modelos encontrados nos catálogos dos provedores',
    'teamwork.provider.note': 'O catálogo não confirma conexão ativa nem cota. O acesso é verificado quando o modelo é usado.',
    'teamwork.provider.none': 'Nenhum modelo Teamwork foi encontrado nos catálogos atuais.', 'teamwork.provider.found': 'Modelos encontrados; acesso verificado durante o uso.', 'teamwork.provider.refresh': 'Atualizar lista de modelos',
    'teamwork.process.summary': '{count} contribuições · {status}', 'teamwork.process.details': 'Mostrar contribuições',
    'teamwork.process.complete': 'Concluído', 'teamwork.process.partial': 'Parcialmente concluído', 'teamwork.process.failed': 'Não foi possível concluir', 'teamwork.process.running': 'Em andamento', 'teamwork.process.stopped': 'Interrompido', 'teamwork.process.skipped': 'Não iniciado', 'teamwork.process.planned': 'Planejado', 'teamwork.process.aborted': 'Interrompido', 'teamwork.process.diagnostic': 'Código de diagnóstico: {code}', 'teamwork.process.candidateDiagnostics': 'Diagnósticos do provedor ({count})',
    'teamwork.process.critic': 'Revisão', 'teamwork.process.contributor': 'Contribuição', 'teamwork.process.final': 'A resposta combinada aparece na mensagem de chat abaixo.',
    'teamwork.fallback.enabled': 'Tentar outro modelo se houver falha', 'teamwork.fallback.enabledDescription': 'Tentar novamente com outro modelo após um erro do provedor, mantendo os mesmos limites de conta e uso.', 'teamwork.fallback.quorum': 'Contribuições bem-sucedidas mínimas'
  },
  ru: {
    'teamwork.status.on': 'Включено', 'teamwork.status.off': 'Выключено', 'teamwork.status.unknown': 'Статус неизвестен',
    'teamwork.overview.title': 'Выберите стиль работы', 'teamwork.overview.description': 'Выберите подходящий баланс. Teamwork координирует доступные модели GPT, Gemini и Ollama Cloud, если они настроены.',
    'teamwork.preset.cost': 'Экономия ресурсов', 'teamwork.preset.costDescription': 'Меньше параллельных ответов и быстрые модели для повседневных задач.', 'teamwork.preset.balanced': 'Сбалансированный', 'teamwork.preset.balancedDescription': 'Практичный баланс скорости и дополнительного мнения.', 'teamwork.preset.quality': 'Тщательный', 'teamwork.preset.qualityDescription': 'Больше параллельной проверки для сложных и важных задач.',
    'teamwork.advanced': 'Расширенные настройки', 'teamwork.provider.title': 'Модели в каталогах провайдеров',
    'teamwork.provider.note': 'Каталог не подтверждает подключение в реальном времени или квоту. Доступ проверяется при использовании модели.',
    'teamwork.provider.none': 'В текущих каталогах модели Teamwork не найдены.', 'teamwork.provider.found': 'Модели найдены; доступ проверяется при использовании.', 'teamwork.provider.refresh': 'Обновить список моделей',
    'teamwork.process.summary': '{count} вкладов · {status}', 'teamwork.process.details': 'Показать вклад',
    'teamwork.process.complete': 'Завершено', 'teamwork.process.partial': 'Завершено частично', 'teamwork.process.failed': 'Не удалось завершить', 'teamwork.process.running': 'Выполняется', 'teamwork.process.stopped': 'Остановлено', 'teamwork.process.skipped': 'Не запущено', 'teamwork.process.planned': 'Запланировано', 'teamwork.process.aborted': 'Прервано', 'teamwork.process.diagnostic': 'Код диагностики: {code}', 'teamwork.process.candidateDiagnostics': 'Диагностика провайдера ({count})',
    'teamwork.process.critic': 'Проверка', 'teamwork.process.contributor': 'Участник', 'teamwork.process.final': 'Общий ответ будет показан следующим сообщением чата.',
    'teamwork.fallback.enabled': 'При сбое попробовать другую модель', 'teamwork.fallback.enabledDescription': 'Повторить запрос с другой моделью после ошибки провайдера с теми же ограничениями аккаунта и использования.', 'teamwork.fallback.quorum': 'Минимум успешных вкладов'
  },
  ja: {
    'teamwork.status.on': '有効', 'teamwork.status.off': '無効', 'teamwork.status.unknown': '状態不明',
    'teamwork.overview.title': '作業スタイルを選択', 'teamwork.overview.description': 'タスクに合うバランスを選択してください。Teamworkは設定済みの利用可能なGPT、Gemini、Ollama Cloudモデルを連携します。',
    'teamwork.preset.cost': 'リソースを節約', 'teamwork.preset.costDescription': '日常のタスク向けに、並列参加を抑えて高速モデルを使います。', 'teamwork.preset.balanced': 'バランス重視', 'teamwork.preset.balancedDescription': '速度と別の視点を実用的に両立します。', 'teamwork.preset.quality': '丁寧に確認', 'teamwork.preset.qualityDescription': '複雑または重要なタスクで、並列レビューを増やします。',
    'teamwork.advanced': '詳細設定', 'teamwork.provider.title': 'プロバイダーのカタログで見つかったモデル',
    'teamwork.provider.note': 'カタログはリアルタイム接続や利用枠を確認しません。モデル使用時にアクセスを確認します。',
    'teamwork.provider.none': '現在のカタログにTeamworkモデルが見つかりません。', 'teamwork.provider.found': 'モデルを検出しました。アクセスは使用時に確認します。', 'teamwork.provider.refresh': 'モデル一覧を更新',
    'teamwork.process.summary': '{count}件の参加 · {status}', 'teamwork.process.details': '参加内容を表示',
    'teamwork.process.complete': '完了', 'teamwork.process.partial': '一部完了', 'teamwork.process.failed': '完了できませんでした', 'teamwork.process.running': '処理中', 'teamwork.process.stopped': '停止', 'teamwork.process.skipped': '未開始', 'teamwork.process.planned': '予定', 'teamwork.process.aborted': '中断', 'teamwork.process.diagnostic': '診断コード: {code}', 'teamwork.process.candidateDiagnostics': 'プロバイダー診断 ({count})',
    'teamwork.process.critic': 'レビュー', 'teamwork.process.contributor': '参加者', 'teamwork.process.final': '統合した回答は、この概要の下にあるチャットメッセージに表示されます。',
    'teamwork.fallback.enabled': '失敗したら別のモデルを試す', 'teamwork.fallback.enabledDescription': 'プロバイダーエラー後に別モデルで再試行します。アカウントと使用量の上限は維持されます。', 'teamwork.fallback.quorum': '成功が必要な最小参加数'
  }
};
