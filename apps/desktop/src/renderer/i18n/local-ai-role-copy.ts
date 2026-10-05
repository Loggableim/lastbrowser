import type { DesktopLocaleId } from './keys.js';
const labels:Record<DesktopLocaleId,readonly string[]>={
  en:['Webpage extraction','Screenshot analysis','Memory indexing','Memory search','Search queries','Document ranking','Text extraction','Agent','Classification'],
  de:['Webseiten auslesen','Screenshots auswerten','Erinnerungen indexieren','Erinnerungen durchsuchen','Suchanfragen zuordnen','Dokumente bewerten','Textdaten extrahieren','Agent','Klassifizierung'],
  it:['Estrazione pagine','Analisi screenshot','Indicizzazione memoria','Ricerca memoria','Query di ricerca','Classifica documenti','Estrazione testo','Agente','Classificazione'],
  es:['Extraer páginas','Analizar capturas','Indexar memoria','Buscar en memoria','Consultas de búsqueda','Clasificar documentos','Extraer texto','Agente','Clasificación'],
  fr:['Extraire les pages','Analyser les captures','Indexer la mémoire','Rechercher en mémoire','Requêtes de recherche','Classer les documents','Extraire du texte','Agent','Classification'],
  'pt-BR':['Extrair páginas','Analisar capturas','Indexar memória','Buscar na memória','Consultas de busca','Classificar documentos','Extrair texto','Agente','Classificação'],
  ru:['Извлечение страниц','Анализ снимков','Индексация памяти','Поиск в памяти','Поисковые запросы','Ранжирование документов','Извлечение текста','Агент','Классификация'],
  ja:['ページ抽出','スクリーンショット解析','メモリ索引','メモリ検索','検索クエリ','文書のランキング','テキスト抽出','エージェント','分類'],
};
export const localRoleLabels=(locale:DesktopLocaleId)=>labels[locale];
