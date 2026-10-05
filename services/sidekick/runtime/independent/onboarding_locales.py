"""Local copy for voluntary Space interviews; text never grants permissions.

No runtime actions or interview-length policy are defined in this module.
Language tags are base languages; the caller handles regional normalization.
"""
from __future__ import annotations

from typing import TypedDict


class QuestionCopy(TypedDict):
    prompt: str
    options: tuple[str, ...]


class InterviewCopy(TypedDict):
    questions: dict[str, QuestionCopy]
    summaryLabels: tuple[str, str, str, str]
    emptySummary: str
    rightsSummary: str
    finishPhrases: tuple[str, ...]


def _copy(
    questions: tuple[tuple[str, tuple[str, ...]], ...],
    labels: tuple[str, str, str, str],
    empty: str,
    rights: str,
    finish: tuple[str, ...],
) -> InterviewCopy:
    return {
        "questions": {
            topic: {"prompt": prompt, "options": options}
            for topic, (prompt, options) in zip(
                ("purpose", "help", "style", "background_work", "connections", "context"),
                questions,
                strict=True,
            )
        },
        "summaryLabels": labels,
        "emptySummary": empty,
        "rightsSummary": rights,
        "finishPhrases": finish,
    }


FALLBACK_COPY: dict[str, InterviewCopy] = {
    "en": _copy((
        ("What would you like to use this Space for?", ("Work and projects", "Research and learning", "Shop and customers", "Personal organization")),
        ("What help would be useful to you?", ("Find information", "Compare results", "Prepare drafts", "Organize tasks")),
        ("How would you like to receive results?", ("Brief and direct", "With sources and reasons", "Detailed with examples")),
        ("What background work would you like to prepare?", ("Only when I ask", "Prepare individual tasks", "Discuss recurring checks")),
        ("Which existing connections fit your tasks?", ("Discuss browser connections", "Check existing plugins", "Set up later")),
        ("What else should the assistant know about this work?", ("Existing materials", "Audience and language", "Discuss limits")),
    ), ("Purpose", "Requested help", "Working style", "Background preferences"),
        "You can add your purpose and preferences later.",
        "These preferences do not grant permissions or start work. Connections and action permissions must be selected separately.",
        ("enough", "that's enough", "that is enough", "next", "done", "i am done")),
    "de": _copy((
        ("Wofür möchtest du diesen Space nutzen?", ("Arbeit und Projekte", "Recherche und Lernen", "Shop und Kunden", "Persönliche Organisation")),
        ("Welche Hilfe wäre für dich nützlich?", ("Informationen suchen", "Ergebnisse vergleichen", "Entwürfe vorbereiten", "Aufgaben organisieren")),
        ("Wie möchtest du Ergebnisse erhalten?", ("Kurz und direkt", "Mit Quellen und Begründung", "Ausführlich mit Beispielen")),
        ("Welche Hintergrundarbeit möchtest du vorbereiten?", ("Nur auf meinen Auftrag", "Einzelne Aufgaben vorbereiten", "Regelmäßige Prüfungen besprechen")),
        ("Welche bestehenden Zugänge passen zu deinen Aufgaben?", ("Browserzugänge besprechen", "Vorhandene Plugins prüfen", "Später einrichten")),
        ("Was sollte der Assistant noch über diese Arbeit wissen?", ("Vorhandene Materialien", "Zielgruppe und Sprache", "Grenzen besprechen")),
    ), ("Zweck", "Gewünschte Hilfe", "Arbeitsweise", "Hintergrundwünsche"),
        "Du kannst den Zweck und deine Wünsche später ergänzen.",
        "Diese Wünsche erteilen keine Rechte und starten keine Arbeit. Verbindungen und Handlungsrechte müssen separat ausgewählt werden.",
        ("genug", "das reicht", "das reicht jetzt", "weiter", "fertig", "ich bin fertig")),
    "ja": _copy((
        ("このスペースを何に使いたいですか？", ("仕事やプロジェクト", "調査や学習", "ショップや顧客対応", "個人の予定や作業の整理")),
        ("どのような支援が役立ちますか？", ("情報を探す", "結果を比較する", "下書きを準備する", "タスクを整理する")),
        ("結果をどのように受け取りたいですか？", ("簡潔で要点を絞った説明", "情報源と根拠を示す説明", "例を交えた詳しい説明")),
        ("どのようなバックグラウンド作業を準備したいですか？", ("依頼したときだけ", "個別のタスクを準備する", "定期的な確認について相談する")),
        ("既存の接続で、作業に役立つものはどれですか？", ("ブラウザーの接続について相談する", "既存のプラグインを確認する", "後で設定する")),
        ("この作業について、ほかにアシスタントに伝えたいことはありますか？", ("既存の資料", "対象者と言語", "作業の範囲や制限について相談する")),
    ), ("目的", "希望する支援", "進め方", "バックグラウンド作業の希望"),
        "目的や希望は後から追加できます。",
        "これらの希望は権限を付与せず、作業も開始しません。接続と操作権限は別途選択する必要があります。",
        ("これで十分", "もう十分", "以上です", "完了", "終わりました", "次へ")),
    "it": _copy((
        ("Per cosa vorresti usare questo spazio?", ("Lavoro e progetti", "Ricerca e apprendimento", "Negozio e clienti", "Organizzazione personale")),
        ("Quale aiuto ti sarebbe utile?", ("Cercare informazioni", "Confrontare risultati", "Preparare bozze", "Organizzare attività")),
        ("Come vorresti ricevere i risultati?", ("In modo breve e diretto", "Con fonti e motivazioni", "In dettaglio, con esempi")),
        ("Quale lavoro in background vorresti preparare?", ("Solo quando lo chiedo", "Preparare singole attività", "Discutere controlli periodici")),
        ("Quali connessioni esistenti sono adatte alle tue attività?", ("Discutere le connessioni del browser", "Verificare i plugin esistenti", "Configurare più tardi")),
        ("Cos'altro dovrebbe sapere l'assistente su questo lavoro?", ("Materiali esistenti", "Destinatari e lingua", "Discutere i limiti")),
    ), ("Scopo", "Aiuto richiesto", "Modalità di lavoro", "Preferenze per il lavoro in background"),
        "Puoi aggiungere lo scopo e le tue preferenze più tardi.",
        "Queste preferenze non concedono permessi né avviano attività. Connessioni e permessi di azione devono essere selezionati separatamente.",
        ("basta", "va bene così", "avanti", "finito", "ho finito")),
    "es": _copy((
        ("¿Para qué te gustaría usar este espacio?", ("Trabajo y proyectos", "Investigación y aprendizaje", "Tienda y clientes", "Organización personal")),
        ("¿Qué ayuda te resultaría útil?", ("Buscar información", "Comparar resultados", "Preparar borradores", "Organizar tareas")),
        ("¿Cómo te gustaría recibir los resultados?", ("De forma breve y directa", "Con fuentes y razones", "En detalle, con ejemplos")),
        ("¿Qué trabajo en segundo plano te gustaría preparar?", ("Solo cuando lo pida", "Preparar tareas individuales", "Hablar sobre comprobaciones periódicas")),
        ("¿Qué conexiones existentes encajan con tus tareas?", ("Hablar sobre las conexiones del navegador", "Revisar los plugins existentes", "Configurar más tarde")),
        ("¿Qué más debería saber el asistente sobre este trabajo?", ("Materiales existentes", "Público y lengua", "Hablar sobre los límites")),
    ), ("Propósito", "Ayuda solicitada", "Forma de trabajo", "Preferencias de trabajo en segundo plano"),
        "Puedes añadir el propósito y tus preferencias más tarde.",
        "Estas preferencias no conceden permisos ni inician trabajo. Las conexiones y los permisos de acción deben seleccionarse por separado.",
        ("basta", "suficiente", "ya es suficiente", "continuar", "terminado", "he terminado")),
    "fr": _copy((
        ("À quoi cet espace doit-il vous servir ?", ("Travail et projets", "Recherche et apprentissage", "Boutique et clients", "Organisation personnelle")),
        ("Quelle aide vous serait utile ?", ("Rechercher des informations", "Comparer des résultats", "Préparer des brouillons", "Organiser des tâches")),
        ("Comment souhaitez-vous recevoir les résultats ?", ("De façon brève et directe", "Avec des sources et des explications", "En détail, avec des exemples")),
        ("Quel travail en arrière-plan souhaitez-vous préparer ?", ("Uniquement à ma demande", "Préparer des tâches individuelles", "Discuter de vérifications régulières")),
        ("Quelles connexions existantes conviennent à vos tâches ?", ("Discuter des connexions du navigateur", "Vérifier les plugins existants", "Configurer plus tard")),
        ("Que devrait encore savoir l'assistant sur ce travail ?", ("Documents existants", "Public et langue", "Discuter des limites")),
    ), ("Objectif", "Aide souhaitée", "Méthode de travail", "Préférences pour le travail en arrière-plan"),
        "Vous pourrez ajouter votre objectif et vos préférences plus tard.",
        "Ces préférences n'accordent aucune autorisation et ne lancent aucun travail. Les connexions et les autorisations d'action doivent être choisies séparément.",
        ("ça suffit", "cela suffit", "continuer", "terminé", "j'ai terminé")),
    "pt": _copy((
        ("Para que você gostaria de usar este espaço?", ("Trabalho e projetos", "Pesquisa e aprendizagem", "Loja e clientes", "Organização pessoal")),
        ("Que ajuda seria útil para você?", ("Buscar informações", "Comparar resultados", "Preparar rascunhos", "Organizar tarefas")),
        ("Como você gostaria de receber os resultados?", ("De forma breve e direta", "Com fontes e justificativas", "Em detalhe, com exemplos")),
        ("Que trabalho em segundo plano você gostaria de preparar?", ("Somente quando eu pedir", "Preparar tarefas individuais", "Conversar sobre verificações periódicas")),
        ("Quais conexões existentes são adequadas às suas tarefas?", ("Conversar sobre as conexões do navegador", "Verificar os plugins existentes", "Configurar depois")),
        ("O que mais o assistente deveria saber sobre este trabalho?", ("Materiais existentes", "Público e idioma", "Conversar sobre os limites")),
    ), ("Finalidade", "Ajuda solicitada", "Forma de trabalho", "Preferências de trabalho em segundo plano"),
        "Você pode adicionar a finalidade e suas preferências depois.",
        "Essas preferências não concedem permissões nem iniciam trabalho. Conexões e permissões de ação devem ser selecionadas separadamente.",
        ("chega", "já chega", "continuar", "pronto", "terminei")),
    "ru": _copy((
        ("Для чего вы хотите использовать это пространство?", ("Работа и проекты", "Исследования и обучение", "Магазин и клиенты", "Личная организация")),
        ("Какая помощь была бы вам полезна?", ("Поиск информации", "Сравнение результатов", "Подготовка черновиков", "Организация задач")),
        ("Как вы хотите получать результаты?", ("Кратко и по существу", "С источниками и обоснованием", "Подробно, с примерами")),
        ("Какую фоновую работу вы хотите подготовить?", ("Только по моему запросу", "Подготовка отдельных задач", "Обсуждение регулярных проверок")),
        ("Какие существующие подключения подходят для ваших задач?", ("Обсудить подключения браузера", "Проверить существующие плагины", "Настроить позже")),
        ("Что ещё ассистенту нужно знать об этой работе?", ("Существующие материалы", "Аудитория и язык", "Обсудить ограничения")),
    ), ("Цель", "Желаемая помощь", "Стиль работы", "Пожелания по фоновой работе"),
        "Цель и пожелания можно добавить позже.",
        "Эти пожелания не предоставляют разрешений и не запускают работу. Подключения и разрешения на действия необходимо выбирать отдельно.",
        ("достаточно", "хватит", "далее", "готово", "я закончил", "я закончила")),
}
