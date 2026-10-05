import type { DesktopLocaleId } from './keys.js';
const keys=['title','limits','sourceBundle','source'] as const;
const rows:Record<DesktopLocaleId,readonly string[]>={
 en:['Runtime components and sources','Source file integrity does not complete the license and native dependency review. Inference remains unavailable.','Source bundle integrity','Open official release source'],
 de:['Laufzeitkomponenten und Quellen','Die Integrität der Quelldateien schließt die Lizenz- und native Abhängigkeitsprüfung nicht ab. Inferenz bleibt nicht verfügbar.','Integrität des Quellpakets','Offizielle Releasequelle öffnen'],
 es:['Componentes del motor y fuentes','La integridad de los archivos fuente no completa la revisión de licencias y dependencias nativas. La inferencia sigue sin estar disponible.','Integridad del paquete fuente','Abrir fuente oficial de la versión'],
 fr:['Composants du moteur et sources','L’intégrité des fichiers source ne termine pas l’examen des licences et dépendances natives. L’inférence reste indisponible.','Intégrité du paquet source','Ouvrir la source officielle de la version'],
 it:['Componenti del runtime e fonti','L’integrità dei file sorgente non completa la verifica di licenze e dipendenze native. L’inferenza resta indisponibile.','Integrità del pacchetto sorgente','Apri la fonte ufficiale della versione'],
 'pt-BR':['Componentes do runtime e fontes','A integridade dos arquivos fonte não conclui a revisão de licenças e dependências nativas. A inferência continua indisponível.','Integridade do pacote fonte','Abrir fonte oficial da versão'],
 ru:['Компоненты среды и источники','Целостность исходных файлов не завершает проверку лицензий и нативных зависимостей. Инференс остаётся недоступен.','Целостность исходного пакета','Открыть официальный источник версии'],
 ja:['ランタイムの構成要素と出典','ソースファイルの整合性確認だけでは、ライセンスとネイティブ依存関係の確認は完了しません。推論はまだ利用できません。','ソースパッケージの整合性','公式リリースの出典を開く'],
};
export const localAiRuntimeNoticeCopy=(locale:DesktopLocaleId)=>Object.fromEntries(keys.map((key,index)=>[key,rows[locale][index]])) as Record<typeof keys[number],string>;
