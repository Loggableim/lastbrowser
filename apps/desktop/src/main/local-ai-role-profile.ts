/** Pure data contract shared by Main and the renderer; no Electron imports. */
export type RoleScope = Readonly<{ backendProfileId: string; spaceId: string; browserProfileId: string }>;
export const localRoleTasks = ['chat.answer','browser.extract','browser.vision','memory.embed','memory.query','retrieval.query','retrieval.document','task.extract','agent','encoder'] as const;
export type LocalRoleTask = typeof localRoleTasks[number];
export type LocalRoleSelection = Readonly<{task:LocalRoleTask;artifactId:string;contextTokens:number}>;
export type LocalRoleChoice = Readonly<{expectedRevision:number;setupRevision:number;planDigest:string;clientRequestId:string;selections:readonly LocalRoleSelection[]}>;
export type LocalRoleRequest = Readonly<{operation:'read'}>|Readonly<{operation:'draft';planDigest:string}>|Readonly<{operation:'confirm';choice:LocalRoleChoice}>;
export type LocalRoleDraft = Readonly<{scope:RoleScope;expectedRevision:number;profileRevision:string;setupRevision:number;planDigest:string;
  choices:readonly Readonly<{task:LocalRoleTask;artifactId:string;artifactRevision:string;state:'prepared'|'blocked';reasonCodes:readonly string[];available:false}>[];available:false}>;
export type LocalRoleProfile = Readonly<{schemaVersion:1;scope:RoleScope;revision:number;setupRevision:number;planDigest:string|null;actor:string|null;
  selections:readonly LocalRoleSelection[];artifactRevisions:Readonly<Record<string,string>>;confirmedAt:string|null;available:false}>;
export type LocalRoleResponse = Readonly<{schemaVersion:1;scope:RoleScope;kind:'role_profile'}>&
  (Readonly<{operation:'draft';profile:LocalRoleDraft}>|Readonly<{operation:'read'|'confirm';profile:LocalRoleProfile}>);
const obj=(v:unknown):v is Record<string,any>=>v!==null&&typeof v==='object'&&!Array.isArray(v);
const ref=(v:unknown):v is string=>typeof v==='string'&&v.length>0&&v.length<=512&&!/[\x00-\x1f]/.test(v);
const num=(v:unknown,min=0):v is number=>Number.isSafeInteger(v)&&Number(v)>=min;
export const roleDigest=(v:unknown):v is string=>typeof v==='string'&&/^[a-f0-9]{64}$/.test(v);
export const roleScopeEqual=(a:RoleScope,b:RoleScope):boolean=>a.backendProfileId===b.backendProfileId&&a.spaceId===b.spaceId&&a.browserProfileId===b.browserProfileId;
const scope=(v:unknown):v is RoleScope=>obj(v)&&Object.keys(v).length===3&&['backendProfileId','spaceId','browserProfileId'].every(k=>ref(v[k]));
function selections(v:unknown):v is readonly LocalRoleSelection[]{return Array.isArray(v)&&v.length<=localRoleTasks.length
  &&new Set(v.map(s=>obj(s)?s.task:null)).size===v.length&&v.every(s=>obj(s)&&Object.keys(s).every(k=>['task','artifactId','contextTokens'].includes(k))
    &&localRoleTasks.includes(s.task)&&ref(s.artifactId)&&num(s.contextTokens,128)&&(s.task!=='chat.answer'||s.contextTokens===1024)
    &&s.contextTokens<=4096);}
export function isLocalRoleChoice(v:unknown):v is LocalRoleChoice{return obj(v)
  &&Object.keys(v).every(k=>['expectedRevision','setupRevision','planDigest','clientRequestId','selections'].includes(k))
  &&num(v.expectedRevision)&&num(v.setupRevision,1)&&roleDigest(v.planDigest)&&typeof v.clientRequestId==='string'
  &&/^(?:[a-f0-9]{32}|[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12})$/i.test(v.clientRequestId)&&selections(v.selections)&&v.selections.length>0;}
export function isLocalRoleResponse(v:unknown):v is LocalRoleResponse{
  if(!obj(v)||v.schemaVersion!==1||v.kind!=='role_profile'||!scope(v.scope)||!obj(v.profile)||!scope(v.profile.scope)
    ||!roleScopeEqual(v.scope,v.profile.scope)||v.profile.available!==false)return false;
  const p=v.profile;
  if(v.operation==='draft')return num(p.expectedRevision)&&num(p.setupRevision,1)&&roleDigest(p.planDigest)&&ref(p.profileRevision)
    &&Array.isArray(p.choices)&&p.choices.length<=128&&p.choices.every(c=>obj(c)&&localRoleTasks.includes(c.task)&&ref(c.artifactId)&&ref(c.artifactRevision)
      &&['prepared','blocked'].includes(c.state)&&c.available===false&&Array.isArray(c.reasonCodes)&&c.reasonCodes.length<=32&&c.reasonCodes.every(ref));
  return ['read','confirm'].includes(v.operation)&&p.schemaVersion===1&&num(p.revision)&&num(p.setupRevision)
    &&(p.planDigest===null||roleDigest(p.planDigest))&&(p.actor===null||ref(p.actor))&&selections(p.selections)
    &&obj(p.artifactRevisions)&&Object.keys(p.artifactRevisions).length<=32&&Object.values(p.artifactRevisions).every(ref)
    &&(p.confirmedAt===null||typeof p.confirmedAt==='string'&&Number.isFinite(Date.parse(p.confirmedAt)));
}
