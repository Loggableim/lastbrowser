import type { DesktopLocaleId } from './keys.js';
const keys=['approval','clarify','once','session','always','deny','answer','send','unavailable'] as const;
type Copy=Record<typeof keys[number],string>;
const rows:Record<DesktopLocaleId,readonly string[]>={
en:['Action needs your approval','A question needs your answer','Allow once','Allow for this chat','Always allow','Deny','Your answer','Send answer','The exact request could not be answered. Refresh the chat status.'],
de:['Aktion braucht deine Freigabe','Eine Rückfrage wartet auf deine Antwort','Einmal erlauben','Für diesen Chat erlauben','Immer erlauben','Ablehnen','Deine Antwort','Antwort senden','Diese konkrete Anfrage konnte nicht beantwortet werden. Aktualisiere den Chatstatus.'],
it:['L’azione richiede la tua approvazione','Una domanda attende la tua risposta','Consenti una volta','Consenti per questa chat','Consenti sempre','Nega','La tua risposta','Invia risposta','Non è stato possibile rispondere a questa richiesta. Aggiorna lo stato della chat.'],
es:['La acción necesita tu aprobación','Una pregunta espera tu respuesta','Permitir una vez','Permitir en este chat','Permitir siempre','Rechazar','Tu respuesta','Enviar respuesta','No se pudo responder a esta solicitud concreta. Actualiza el estado del chat.'],
fr:['Cette action nécessite votre accord','Une question attend votre réponse','Autoriser une fois','Autoriser pour ce chat','Toujours autoriser','Refuser','Votre réponse','Envoyer la réponse','Cette demande précise n’a pas pu être traitée. Actualisez l’état du chat.'],
'pt-BR':['A ação precisa da sua aprovação','Uma pergunta aguarda sua resposta','Permitir uma vez','Permitir neste chat','Sempre permitir','Negar','Sua resposta','Enviar resposta','Não foi possível responder a esta solicitação. Atualize o status do chat.'],
ru:['Действию нужно ваше разрешение','Вопрос ожидает вашего ответа','Разрешить один раз','Разрешить в этом чате','Всегда разрешать','Отклонить','Ваш ответ','Отправить ответ','Не удалось ответить на этот запрос. Обновите состояние чата.'],
ja:['この操作には承認が必要です','質問への回答を待っています','今回だけ許可','このチャットで許可','常に許可','拒否','回答','回答を送信','この要求に回答できませんでした。チャットの状態を更新してください。']};
export function nativeChatControlCopy(locale:DesktopLocaleId):Copy{return Object.fromEntries(keys.map((key,index)=>[key,rows[locale][index]])) as Copy;}
