import type { DesktopLocaleId } from './keys.js';
const keys=['chat','run','expired','expires','changed'] as const;
const rows:Record<DesktopLocaleId,readonly string[]>={
 en:['Working chat action','Independent agent action','This approval expired. Ask for a new action review.','Approval expires','The approval changed or cannot be applied. Refresh its actual status before deciding again.'],
 de:['Aktion eines Arbeitschats','Aktion eines unabhängigen Agenten','Diese Freigabe ist abgelaufen. Fordere eine neue Aktionsprüfung an.','Freigabe läuft ab','Die Freigabe hat sich geändert oder kann nicht angewendet werden. Aktualisiere den tatsächlichen Status vor einer neuen Entscheidung.'],
 es:['Acción de un chat de trabajo','Acción de agente independiente','La autorización caducó. Solicita una nueva revisión de la acción.','La autorización caduca','La autorización cambió o no puede aplicarse. Actualiza su estado antes de decidir de nuevo.'],
 fr:['Action d’un chat de travail','Action d’un agent indépendant','Cette autorisation a expiré. Demandez un nouvel examen de l’action.','Expiration de l’autorisation','L’autorisation a changé ou ne peut pas être appliquée. Actualisez son état avant une nouvelle décision.'],
 it:['Azione di una chat di lavoro','Azione di un agente indipendente','Questa autorizzazione è scaduta. Richiedi una nuova verifica dell’azione.','Scadenza autorizzazione','L’autorizzazione è cambiata o non può essere applicata. Aggiorna lo stato prima di decidere ancora.'],
 'pt-BR':['Ação de um chat de trabalho','Ação de agente independente','Esta autorização expirou. Solicite uma nova revisão da ação.','A autorização expira','A autorização mudou ou não pode ser aplicada. Atualize seu estado antes de decidir novamente.'],
 ru:['Действие рабочего чата','Действие независимого агента','Срок разрешения истёк. Запросите новую проверку действия.','Разрешение истекает','Разрешение изменилось или не может быть применено. Обновите его статус перед новым решением.'],
 ja:['作業チャットの操作','独立エージェントの操作','この承認は期限切れです。操作の再確認を依頼してください。','承認の有効期限','承認が変更されたか、適用できません。もう一度判断する前に実際の状態を更新してください。'],
};
export const independentApprovalCopy=(locale:DesktopLocaleId)=>Object.fromEntries(keys.map((key,index)=>[key,rows[locale][index]])) as Record<typeof keys[number],string>;
