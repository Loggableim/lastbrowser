export type LocalAiBootstrapPanelLabels=Readonly<{loading:string;unavailable:string;states:Readonly<Record<string,string>>}>;
export type RetryableResponse=Readonly<{ok:boolean;error?:Readonly<{retryable:boolean}>}>;

export async function retryRetryableOnce<T extends RetryableResponse>(send:()=>Promise<T>,pause:()=>Promise<void>=()=>new Promise(resolve=>setTimeout(resolve,250))):Promise<T>{
  const first=await send();
  return !first.ok&&first.error?.retryable?(await pause(),send()):first;
}

export function localAiBootstrapPanelLabel(
  status:string|null,
  loading:boolean,
  error:string,
  labels:LocalAiBootstrapPanelLabels
):string{
  if(error)return labels.unavailable;
  if(status)return labels.states[status]??labels.unavailable;
  return loading?labels.loading:labels.unavailable;
}
