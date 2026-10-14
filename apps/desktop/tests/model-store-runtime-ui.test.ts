import { describe, expect, it } from 'vitest';
import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import type { StoreModel } from '../src/renderer/model-store-contracts.js';
import { decodeStoreInput, decodeStoreMedia, storeConsentKey, storeExecutionLabel, storeModelActions } from '../src/renderer/components/model-store-actions.js';
import { LocalModelMediaForm } from '../src/renderer/components/LocalModelMedia.js';
import { filterStoreModels, storeHardwareRecommendation } from '../src/renderer/components/model-store-presentation.js';

const base = { id:'publisher/model', revision:'revision-a', installQualified:true, licenseDigest:'license-a', installed:null,
  eligibility:{state:'likely_suitable',allowed:true,reasons:[]},
  curation:{category:'text',priority:true,useCases:[]} } as unknown as StoreModel;
const execution = { state:'download_qualified' as const, kind:'text' as const, downloadAllowed:true,
  benchmarkAllowed:false,activateAllowed:false,executeAllowed:false,reasonCodes:[] };

describe('real store runtime actions', () => {
  it('never grants actions from editorial recommendations or eligibility without execution proof', () => {
    expect(storeModelActions(base,false)).toMatchObject({download:false,benchmark:false,activate:false,execute:false,state:'browse_only'});
  });
  it('separates download from local inference qualification', () => {
    const model={...base,execution};
    expect(storeModelActions(model,false)).toMatchObject({download:true,benchmark:false,activate:false,execute:false});
    expect(storeModelActions(model,true).download).toBe(false);
    expect(storeModelActions({...model,licenseDigest:null},false).download).toBe(false);
  });
  it('requires installed bytes and backend authority for testing, activation and execution', () => {
    const flags={...execution,state:'chat_or_media_qualified' as const,benchmarkAllowed:true,activateAllowed:true,executeAllowed:true};
    expect(storeModelActions({...base,execution:flags},false).execute).toBe(false);
    const installed={artifactSha256:'digest',bytes:100,revision:'revision-a',verifiedAt:1};
    expect(storeModelActions({...base,installed,execution:flags},false)).toMatchObject({download:false,benchmark:true,activate:true,execute:true});
    expect(storeModelActions({...base,installed,execution:flags},true).execute).toBe(false);
  });
  it('invalidates license acceptance when either revision or license changes', () => {
    expect(storeConsentKey(base)).not.toBe(storeConsentKey({...base,revision:'revision-b'}));
    expect(storeConsentKey(base)).not.toBe(storeConsentKey({...base,licenseDigest:'license-b'}));
  });
  it('uses a real backend CPU hardware decision for visibility without inventing GPU qualification', () => {
    const model={...base,name:'Model',publisher:'Publisher',description:'Local',execution:{...execution,backend:'cpu' as const}};
    const filters={query:'',publisher:'',showLarge:false,showUnknown:false};
    expect(storeHardwareRecommendation(model,null)).toEqual({fit:'within',placement:'cpu'});
    expect(filterStoreModels([model],filters,null)).toHaveLength(1);
    const unknown={...model,execution:{...model.execution,state:'browse_only' as const}};
    expect(storeHardwareRecommendation(unknown,null).fit).toBe('unknown');
    expect(filterStoreModels([unknown],filters,null)).toHaveLength(0);
  });
  it('does not label a downloadable model as inference-proven', () => {
    expect(storeExecutionLabel({...base,execution})).toContain('Gerätetest folgt');
    expect(storeExecutionLabel(base)).toContain('noch nicht verfügbar');
  });
  it('accepts bounded image data but refuses active content and remote paths', () => {
    expect(decodeStoreMedia({mimeType:'image/png',dataBase64:'AQID'}).bytes).toEqual(Uint8Array.of(1,2,3));
    expect(()=>decodeStoreMedia({mimeType:'image/svg+xml',dataBase64:'AQID'})).toThrow();
    expect(()=>decodeStoreMedia({mimeType:'image/png',url:'https://example.com/private'})).toThrow();
    expect(()=>decodeStoreMedia({mimeType:'image/png',dataBase64:'bad!'})).toThrow();
  });
  it('renders only backend-provided generation bounds without dispatching any operation', () => {
    let calls=0;
    const model={...base,execution:{...execution,kind:'image' as const,media:{width:{min:256,max:512,step:64},height:{min:256,max:512,step:64},steps:{min:1,max:8,default:4}}}};
    const html=renderToStaticMarkup(React.createElement(LocalModelMediaForm,{model,disabled:false,request:async()=>{calls++;}}));
    expect(html).toContain('min="256" max="512" step="64"');
    expect(html).toContain('Bild lokal erstellen');
    expect(html).toContain('maxLength="4096"');
    expect(html).toContain('max="2147483647"');
    expect(html).not.toContain('4294967295');
    expect(calls).toBe(0);
    expect(renderToStaticMarkup(React.createElement(LocalModelMediaForm,{model:base,disabled:false,request:async()=>{calls++;}}))).toContain('noch keine geprüfte');
  });
  it('requires native local image/audio selections for declared I2V and S2V inputs', () => {
    const model={...base,execution:{...execution,kind:'video' as const,media:{width:{min:256,max:512,step:64},height:{min:256,max:512,step:64},
      steps:{min:1,max:8,default:4},frames:{min:33,max:81,step:16},fps:{min:16,max:16,default:16},requiredInputs:['reference_image','audio_wav'] as Array<'reference_image'|'audio_wav'>}}};
    let calls=0;
    const html=renderToStaticMarkup(React.createElement(LocalModelMediaForm,{model,disabled:false,request:async()=>{calls++;}}));
    expect(html).toContain('Bild auswählen');
    expect(html).toContain('WAV auswählen');
    expect(html).toContain('PCM-WAV');
    expect(html).toContain('max="16" value="16"');
    expect(html).toMatch(/disabled=""[^>]*>Video lokal erstellen/);
    expect(html).not.toContain('type="file"');
    expect(calls).toBe(0);
  });
  it('accepts opaque validated inputs but rejects filesystem paths, wrong formats and long audio', () => {
    expect(decodeStoreInput({assetId:'opaque-id',name:'photo.png',mimeType:'image/png',width:512,height:512},'reference_image').assetId).toBe('opaque-id');
    expect(()=>decodeStoreInput({assetId:'C:\\private\\photo.png',name:'photo.png',mimeType:'image/png'},'reference_image')).toThrow();
    expect(()=>decodeStoreInput({assetId:'opaque-id',name:'voice.mp3',mimeType:'audio/mpeg'},'audio_wav')).toThrow();
    expect(()=>decodeStoreInput({assetId:'opaque-id',name:'voice.wav',mimeType:'audio/wav',durationMs:120001},'audio_wav')).toThrow();
  });
  it('offers the input-bound initial device test before media execution is qualified', () => {
    const model={...base,execution:{...execution,kind:'video' as const,benchmarkAllowed:true,executeAllowed:false,
      media:{width:{min:256,max:512,step:64},height:{min:256,max:512,step:64},steps:{min:1,max:8,default:4},
        frames:{min:33,max:81,step:16},fps:{min:16,max:16,default:16},requiredInputs:['reference_image'] as Array<'reference_image'>}}};
    const html=renderToStaticMarkup(React.createElement(LocalModelMediaForm,{model,disabled:false,canBenchmark:true,canGenerate:false,request:async()=>undefined}));
    expect(html).toContain('Mit diesen Dateien auf diesem PC testen');
    expect(html).toMatch(/disabled=""[^>]*>Mit diesen Dateien auf diesem PC testen/);
    expect(html).toMatch(/disabled=""[^>]*>Video lokal erstellen/);
    expect(html).toContain('Nach einem erfolgreichen Gerätetest');
  });
});
