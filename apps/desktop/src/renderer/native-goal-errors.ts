import type { DesktopLocaleId } from './i18n/keys.js';
import { nativeGoalMigrationCopy } from './i18n/native-goal-migration-copy.js';
export class NativeGoalCommandError extends Error {
  constructor(readonly code:string){super(code);this.name='NativeGoalCommandError';}
}
export function isNativeGoalMigrationRequired(error:unknown):boolean{
  return error instanceof NativeGoalCommandError?error.code==='native_goal_migration_required':error instanceof Error&&/\bnative_goal_migration_required\b/.test(error.message);
}
export function isNativeGoalWriterRunning(error: unknown): boolean {
  const code = error instanceof NativeGoalCommandError ? error.code : error instanceof Error ? error.message
    : error && typeof error === 'object' && 'error_code' in error && typeof error.error_code === 'string' ? error.error_code : '';
  return /\bagent_running\b/.test(code);
}
const humanAuthorization:Record<DesktopLocaleId,string>={
 en:'This older goal has no confirmed user instruction. Resume it explicitly to authorize further work.',
 de:'Für dieses ältere Ziel fehlt eine bestätigte Nutzervorgabe. Setze es ausdrücklich fort, um die weitere Arbeit zu erlauben.',
 es:'Este objetivo anterior no tiene una instrucción confirmada del usuario. Reanúdalo expresamente para autorizar el trabajo posterior.',
 fr:'Cet ancien objectif n’a pas d’instruction utilisateur confirmée. Reprenez-le explicitement pour autoriser la suite du travail.',
 it:'Per questo obiettivo precedente manca un’istruzione utente confermata. Riprendilo esplicitamente per autorizzare ulteriore lavoro.',
 'pt-BR':'Este objetivo anterior não tem uma instrução confirmada do usuário. Retome-o explicitamente para autorizar a continuidade do trabalho.',
 ru:'Для этой старой цели нет подтверждённого указания пользователя. Явно возобновите её, чтобы разрешить дальнейшую работу.',
 ja:'この以前の目標には確認済みのユーザー指示がありません。作業の継続を許可するには、明示的に再開してください。',
};
export function nativeGoalPausedReasonCopy(locale:string,reason:string):string{
  if(reason!=='native_goal_human_authorization_required')return reason;
  const known=(value:string):value is DesktopLocaleId=>Object.hasOwn(humanAuthorization,value);
  return known(locale)?humanAuthorization[locale]:humanAuthorization.en;
}
export function nativeGoalHumanAuthorizationErrorCopy(locale:DesktopLocaleId,value:unknown):string|null{
  const code=typeof value==='string'?value:value instanceof NativeGoalCommandError?value.code:value instanceof Error?value.message:
    value&&typeof value==='object'&&'error_code'in value&&typeof value.error_code==='string'?value.error_code:'';
  return /\bnative_goal_human_authorization_required\b/.test(code)?humanAuthorization[locale]:null;
}
const rows:Record<DesktopLocaleId,readonly [string,string,string,string]>={
 en:['The goal changed. Refresh its actual state before choosing the action again.','An independent run owns this goal. Use that run’s controls.','This command is still running or was interrupted. Refresh its actual state before retrying.','The goal action could not be confirmed. Refresh and retry.'],
 de:['Das Ziel wurde verändert. Lade seinen tatsächlichen Zustand, bevor du die Aktion erneut auswählst.','Ein unabhängiger Lauf steuert dieses Ziel. Nutze die Steuerung dieses Laufs.','Der Auftrag läuft noch oder wurde unterbrochen. Lade den tatsächlichen Zustand vor einem erneuten Versuch.','Die Zielaktion konnte nicht bestätigt werden. Aktualisieren und erneut versuchen.'],
 es:['El objetivo cambió. Actualiza su estado real antes de elegir de nuevo la acción.','Una ejecución independiente controla este objetivo. Usa sus controles.','La solicitud sigue activa o fue interrumpida. Actualiza el estado real antes de reintentar.','No se pudo confirmar la acción. Actualiza y reintenta.'],
 fr:['L’objectif a changé. Actualisez son état réel avant de choisir à nouveau l’action.','Une exécution indépendante contrôle cet objectif. Utilisez ses commandes.','La demande est encore active ou a été interrompue. Actualisez son état réel avant de réessayer.','L’action n’a pas pu être confirmée. Actualisez et réessayez.'],
 it:['L’obiettivo è cambiato. Aggiorna lo stato reale prima di scegliere nuovamente l’azione.','Un’esecuzione indipendente controlla questo obiettivo. Usa i suoi controlli.','La richiesta è ancora attiva o è stata interrotta. Aggiorna lo stato reale prima di riprovare.','L’azione non è stata confermata. Aggiorna e riprova.'],
 'pt-BR':['O objetivo mudou. Atualize o estado real antes de escolher a ação novamente.','Uma execução independente controla este objetivo. Use os controles dela.','A solicitação ainda está ativa ou foi interrompida. Atualize o estado real antes de tentar novamente.','Não foi possível confirmar a ação. Atualize e tente novamente.'],
 ru:['Цель изменилась. Обновите фактическое состояние перед повторным выбором действия.','Этой целью управляет независимый запуск. Используйте его элементы управления.','Запрос ещё выполняется или был прерван. Обновите фактическое состояние перед повтором.','Действие не удалось подтвердить. Обновите состояние и повторите попытку.'],
 ja:['目標が変更されました。実際の状態を更新してから操作をもう一度選択してください。','この目標は独立した実行が管理しています。その実行の操作を使用してください。','要求は実行中、または中断されました。再試行する前に実際の状態を更新してください。','目標への操作を確認できませんでした。更新して再試行してください。'],
};
export function nativeGoalErrorCopy(locale:DesktopLocaleId,error:unknown):string {
  const human=nativeGoalHumanAuthorizationErrorCopy(locale,error);if(human)return human;
  if(isNativeGoalMigrationRequired(error))return nativeGoalMigrationCopy(locale).explain;
  const code=error instanceof NativeGoalCommandError?error.code:error instanceof Error?error.message:'';
  return rows[locale][code.includes('goal_revision_conflict')?0:code.includes('goal_owned_by_run')?1:
    code.includes('command_interrupted')||code.includes('command_in_progress')||code.includes('agent_running')?2:3];
}
