import { isIndependentRecord } from './independent-assistant-client.js';
import { NativeGoalCommandError } from './native-goal-errors.js';
export type NativeGoalStatus=Readonly<{revision:number;goal:Record<string,unknown>|null}>;
export function readNativeGoalStatus(value:unknown,sessionId:string):NativeGoalStatus {
  if(isIndependentRecord(value)&&value.ok===false)throw new NativeGoalCommandError(typeof value.error_code==='string'?value.error_code:typeof value.error==='string'?value.error:'goal_status_invalid');
  if(!isIndependentRecord(value)||value.ok!==true||typeof value.revision!=='number'||!Number.isSafeInteger(value.revision)||value.revision<0
    ||value.action!=='status'||!(value.goal===null||isIndependentRecord(value.goal)&&value.goal.session_id===sessionId
      &&value.goal.revision===value.revision))throw Error('goal_status_invalid');
  return {revision:value.revision,goal:value.goal};
}
