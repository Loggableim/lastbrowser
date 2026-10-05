import type { DesktopLocaleId } from './keys.js';
type SpaceCopy = { home:string; noTabs:string; session:string; tabCount:(count:number)=>string };
export const browserStartSpaceCopy: Record<DesktopLocaleId, SpaceCopy> = {
  en:{home:'Default Space',noTabs:'No tabs',session:'Own session',tabCount:count=>`${count} ${count===1?'tab':'tabs'}`},
  de:{home:'Standard-Space',noTabs:'Keine Tabs',session:'Eigene Session',tabCount:count=>`${count} ${count===1?'Tab':'Tabs'}`},
  es:{home:'Espacio predeterminado',noTabs:'Sin pestañas',session:'Sesión propia',tabCount:count=>`${count} ${count===1?'pestaña':'pestañas'}`},
  fr:{home:'Espace par défaut',noTabs:'Aucun onglet',session:'Session distincte',tabCount:count=>`${count} ${count===1?'onglet':'onglets'}`},
  it:{home:'Spazio predefinito',noTabs:'Nessuna scheda',session:'Sessione separata',tabCount:count=>`${count} ${count===1?'scheda':'schede'}`},
  'pt-BR':{home:'Espaço padrão',noTabs:'Nenhuma aba',session:'Sessão própria',tabCount:count=>`${count} ${count===1?'aba':'abas'}`},
  ru:{home:'Пространство по умолчанию',noTabs:'Нет вкладок',session:'Отдельная сессия',tabCount:count=>`${count} ${{one:'вкладка',few:'вкладки',many:'вкладок',other:'вкладки',zero:'вкладок',two:'вкладки'}[new Intl.PluralRules('ru').select(count)]}`},
  ja:{home:'既定のスペース',noTabs:'タブなし',session:'個別のセッション',tabCount:count=>`${count} 個のタブ`},
};
export const browserStartHistoryCopy: Record<DesktopLocaleId, { favorites:string; mostVisited:string; recentSites:string; empty:string; visits:(count:number)=>string }> = {
  en:{favorites:'Favorites',mostVisited:'Most visited',recentSites:'Recent sites',empty:'Most visited sites appear here after you browse a few pages.',visits:count=>`${count} ${count===1?'visit':'visits'}`},
  de:{favorites:'Favoriten',mostVisited:'Meistbesucht',recentSites:'Zuletzt besuchte Seiten',empty:'Nach dem Surfen erscheinen hier die meistbesuchten Seiten.',visits:count=>`${count} ${count===1?'Besuch':'Besuche'}`},
  es:{favorites:'Favoritos',mostVisited:'Más visitados',recentSites:'Sitios recientes',empty:'Los sitios más visitados aparecerán aquí después de navegar.',visits:count=>`${count} ${count===1?'visita':'visitas'}`},
  fr:{favorites:'Favoris',mostVisited:'Les plus visités',recentSites:'Sites récents',empty:'Les sites les plus visités apparaîtront ici après votre navigation.',visits:count=>`${count} ${count===1?'visite':'visites'}`},
  it:{favorites:'Preferiti',mostVisited:'Più visitati',recentSites:'Siti recenti',empty:'I siti più visitati appariranno qui dopo la navigazione.',visits:count=>`${count} ${count===1?'visita':'visite'}`},
  'pt-BR':{favorites:'Favoritos',mostVisited:'Mais visitados',recentSites:'Sites recentes',empty:'Os sites mais visitados aparecerão aqui após você navegar.',visits:count=>`${count} ${count===1?'visita':'visitas'}`},
  ru:{favorites:'Избранное',mostVisited:'Часто посещаемые',recentSites:'Недавние сайты',empty:'Здесь появятся часто посещаемые сайты после просмотра нескольких страниц.',visits:count=>`${count} ${{one:'посещение',few:'посещения',many:'посещений',other:'посещения',zero:'посещений',two:'посещения'}[new Intl.PluralRules('ru').select(count)]}`},
  ja:{favorites:'お気に入り',mostVisited:'よく見るサイト',recentSites:'最近のサイト',empty:'ページを閲覧すると、よく見るサイトがここに表示されます。',visits:count=>`${count} 回閲覧`},
};
