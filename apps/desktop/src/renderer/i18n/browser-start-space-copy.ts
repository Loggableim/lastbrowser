import type { DesktopLocaleId } from './keys.js';
type WallpaperCopy = { settings:string; previous:string; next:string; close:string; dim:string; blur:string; images:Record<string,string> };
const wallpaperNames = { 'liquid-obsidian':'Liquid Obsidian', 'nordic-arch':'Nordic Arch', 'cyberpunk-street':'Cyberpunk Street', 'misty-forest':'Misty Forest', 'sapphire-nebula':'Sapphire Nebula', 'temple-evening':'Evening Temple' };
export const browserStartWallpaperCopy: Record<DesktopLocaleId, WallpaperCopy> = {
  en:{settings:'Background',previous:'Previous background',next:'Next background',close:'Close background settings',dim:'Darken background',blur:'Blur background',images:wallpaperNames},
  de:{settings:'Hintergrund',previous:'Vorheriger Hintergrund',next:'Nächster Hintergrund',close:'Hintergrundauswahl schließen',dim:'Hintergrund abdunkeln',blur:'Hintergrund weichzeichnen',images:{'liquid-obsidian':'Liquid Obsidian','nordic-arch':'Nordischer Bogen','cyberpunk-street':'Cyberpunk-Stadt','misty-forest':'Nebelwald','sapphire-nebula':'Saphirnebel','temple-evening':'Tempel am Abend'}},
  es:{settings:'Fondo',previous:'Fondo anterior',next:'Fondo siguiente',close:'Cerrar ajustes de fondo',dim:'Oscurecer fondo',blur:'Desenfocar fondo',images:wallpaperNames},
  fr:{settings:'Fond',previous:'Fond précédent',next:'Fond suivant',close:'Fermer les réglages du fond',dim:'Assombrir le fond',blur:'Flouter le fond',images:wallpaperNames},
  it:{settings:'Sfondo',previous:'Sfondo precedente',next:'Sfondo successivo',close:'Chiudi impostazioni sfondo',dim:'Scurisci sfondo',blur:'Sfoca sfondo',images:wallpaperNames},
  'pt-BR':{settings:'Plano de fundo',previous:'Plano de fundo anterior',next:'Próximo plano de fundo',close:'Fechar ajustes do plano de fundo',dim:'Escurecer plano de fundo',blur:'Desfocar plano de fundo',images:wallpaperNames},
  ru:{settings:'Фон',previous:'Предыдущий фон',next:'Следующий фон',close:'Закрыть настройки фона',dim:'Затемнить фон',blur:'Размыть фон',images:wallpaperNames},
  ja:{settings:'背景',previous:'前の背景',next:'次の背景',close:'背景設定を閉じる',dim:'背景を暗くする',blur:'背景をぼかす',images:wallpaperNames}
};
type SpaceCopy = { home:string; noTabs:string; session:string; tabCount:(count:number)=>string; agentsUnavailable:string; activeAgents:(count:number)=>string };
export const browserStartSpaceCopy: Record<DesktopLocaleId, SpaceCopy> = {
  en:{home:'Default Space',noTabs:'No tabs',session:'Own session',tabCount:count=>`${count} ${count===1?'tab':'tabs'}`,agentsUnavailable:'Active agents unavailable',activeAgents:count=>`${count} active ${count===1?'agent':'agents'}`},
  de:{home:'Standard-Space',noTabs:'Keine Tabs',session:'Eigene Session',tabCount:count=>`${count} ${count===1?'Tab':'Tabs'}`,agentsUnavailable:'Aktive Agenten nicht verfügbar',activeAgents:count=>`${count} aktive ${count===1?'Agent':'Agenten'}`},
  es:{home:'Espacio predeterminado',noTabs:'Sin pestañas',session:'Sesión propia',tabCount:count=>`${count} ${count===1?'pestaña':'pestañas'}`,agentsUnavailable:'Agentes activos no disponibles',activeAgents:count=>`${count} ${count===1?'agente activo':'agentes activos'}`},
  fr:{home:'Espace par défaut',noTabs:'Aucun onglet',session:'Session distincte',tabCount:count=>`${count} ${count===1?'onglet':'onglets'}`,agentsUnavailable:'Agents actifs indisponibles',activeAgents:count=>`${count} ${count===1?'agent actif':'agents actifs'}`},
  it:{home:'Spazio predefinito',noTabs:'Nessuna scheda',session:'Sessione separata',tabCount:count=>`${count} ${count===1?'scheda':'schede'}`,agentsUnavailable:'Agenti attivi non disponibili',activeAgents:count=>`${count} ${count===1?'agente attivo':'agenti attivi'}`},
  'pt-BR':{home:'Espaço padrão',noTabs:'Nenhuma aba',session:'Sessão própria',tabCount:count=>`${count} ${count===1?'aba':'abas'}`,agentsUnavailable:'Agentes ativos indisponíveis',activeAgents:count=>`${count} ${count===1?'agente ativo':'agentes ativos'}`},
  ru:{home:'Пространство по умолчанию',noTabs:'Нет вкладок',session:'Отдельная сессия',tabCount:count=>`${count} ${{one:'вкладка',few:'вкладки',many:'вкладок',other:'вкладки',zero:'вкладок',two:'вкладки'}[new Intl.PluralRules('ru').select(count)]}`,agentsUnavailable:'Активные агенты недоступны',activeAgents:count=>`${count} активных агентов`},
  ja:{home:'既定のスペース',noTabs:'タブなし',session:'個別のセッション',tabCount:count=>`${count} 個のタブ`,agentsUnavailable:'稼働中のエージェント数は取得できません',activeAgents:count=>`稼働中のエージェント ${count} 件`},
};
/** Single Home action button: "Sidekick" is the product name and is intentionally not localized. */
export const browserStartActionCopy: Record<DesktopLocaleId, { openUrl: string }> = {
  en: { openUrl: 'Open URL' },
  de: { openUrl: 'URL öffnen' },
  es: { openUrl: 'Abrir URL' },
  fr: { openUrl: "Ouvrir l'URL" },
  it: { openUrl: 'Apri URL' },
  'pt-BR': { openUrl: 'Abrir URL' },
  ru: { openUrl: 'Открыть URL' },
  ja: { openUrl: 'URLを開く' }
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
