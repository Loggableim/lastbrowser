import React, { useEffect, useRef, useState } from 'react';
import type { ModelStoreRequest, StoreJob, StoreModel } from '../model-store-contracts.js';
import { newIndependentRequestId } from '../independent-contracts.js';
import { decodeStoreInput, decodeStoreMedia, type StoreSelectedInput } from './model-store-actions.js';

type Request = (request: ModelStoreRequest) => Promise<unknown>;

export function LocalModelMediaForm({ model, request, disabled, canGenerate = false, canBenchmark = false, benchmarkMode = 'quick', backend = 'cpu' }:
  { model: StoreModel; request: Request; disabled: boolean; canGenerate?: boolean; canBenchmark?: boolean; benchmarkMode?: 'quick'|'standard'; backend?: 'cpu'|'vulkan' }) {
  const bounds = model.execution?.media;
  const [prompt, setPrompt] = useState('');
  const [width, setWidth] = useState(bounds?.width.min ?? 512);
  const [height, setHeight] = useState(bounds?.height.min ?? 512);
  const [steps, setSteps] = useState(bounds?.steps.default ?? 8);
  const [frames, setFrames] = useState(bounds?.frames?.min ?? 1);
  const [fps, setFps] = useState(bounds?.fps?.default ?? 8);
  const [seed, setSeed] = useState(0);
  const [referenceImage, setReferenceImage] = useState<StoreSelectedInput | null>(null);
  const [audio, setAudio] = useState<StoreSelectedInput | null>(null);
  const [picking, setPicking] = useState(false), [inputError, setInputError] = useState('');
  const lifecycle = useRef(0);
  useEffect(() => () => { lifecycle.current++; }, []);
  if (!bounds) return <p>Für dieses Modell ist noch keine geprüfte Erstellungskonfiguration verfügbar.</p>;
  const video = model.execution?.kind === 'video';
  const needsImage = bounds.requiredInputs?.includes('reference_image') ?? false;
  const needsAudio = bounds.requiredInputs?.includes('audio_wav') ?? false;
  const inputsValid = (!needsImage || !!referenceImage) && (!needsAudio || !!audio);
  const aligned = (value: number, range: { min: number; max: number; step?: number }) => Number.isSafeInteger(value)
    && value >= range.min && value <= range.max && (value - range.min) % (range.step ?? 1) === 0;
  const valid = !!prompt.trim() && aligned(width, bounds.width) && aligned(height, bounds.height) && aligned(steps, bounds.steps)
    && Number.isSafeInteger(seed) && seed >= 0 && seed <= 2147483647
    && (!video || !!bounds.frames && !!bounds.fps && aligned(frames, bounds.frames) && aligned(fps, bounds.fps))
    && inputsValid;
  async function pick(kind: 'reference_image' | 'audio_wav') {
    if (disabled || picking) return;
    const epoch = ++lifecycle.current; setPicking(true); setInputError('');
    try {
      const result = await request({ operation: 'pickMediaInput', modelId: model.id, kind });
      if (epoch !== lifecycle.current || result === undefined || result === null) return;
      // The native picker can be cancelled without replacing the previous input.
      if (typeof result === 'object' && 'cancelled' in result && result.cancelled === true) return;
      const selected = decodeStoreInput(result, kind);
      const previous = kind === 'reference_image' ? referenceImage : audio;
      if (kind === 'reference_image') setReferenceImage(selected); else setAudio(selected);
      if (previous && previous.assetId !== selected.assetId) await request({ operation: 'releaseMediaInput', assetId: previous.assetId });
    } catch (reason) { if (epoch === lifecycle.current) setInputError(reason instanceof Error ? reason.message : 'Die Datei konnte nicht ausgewählt werden.'); }
    finally { if (epoch === lifecycle.current) setPicking(false); }
  }
  async function clear(kind: 'reference_image' | 'audio_wav') {
    const previous = kind === 'reference_image' ? referenceImage : audio;
    if (!previous || disabled || picking) return;
    const epoch = ++lifecycle.current; setPicking(true);
    try {
      const result = await request({ operation: 'releaseMediaInput', assetId: previous.assetId });
      if (epoch !== lifecycle.current || result === undefined) return;
      if (kind === 'reference_image') setReferenceImage(null); else setAudio(null);
    } finally { if (epoch === lifecycle.current) setPicking(false); }
  }
  return <form className="local-model-media-form" onSubmit={event => {
    event.preventDefault(); if (disabled || picking || !canGenerate || !valid) return;
    void request({ operation: 'generate', modelId: model.id, requestId: newIndependentRequestId(), prompt: prompt.trim(),
      width, height, steps, seed, ...(video ? { frames, fps } : {}),
      ...(needsImage && referenceImage ? { referenceImageAssetId: referenceImage.assetId } : {}),
      ...(needsAudio && audio ? { audioAssetId: audio.assetId } : {}) });
  }}>
    <h4>{video ? 'Video erstellen' : 'Bild erstellen'}</h4>
    <label>Was möchtest du erstellen?<textarea value={prompt} maxLength={4096} onChange={event => setPrompt(event.target.value)} required disabled={disabled} /></label>
    {(needsImage || needsAudio) && <fieldset className="local-model-media-inputs" disabled={disabled || picking}><legend>Deine lokalen Dateien</legend>
      {needsImage && <div><strong>Referenzbild</strong><p>{referenceImage ? `${referenceImage.name}${referenceImage.width && referenceImage.height ? ` · ${referenceImage.width} × ${referenceImage.height}` : ''}` : 'PNG oder JPEG · höchstens 16 MiB'}</p>
        <button type="button" onClick={() => void pick('reference_image')}>{referenceImage ? 'Bild ändern' : 'Bild auswählen'}</button>
        {referenceImage && <button type="button" onClick={() => void clear('reference_image')}>Bild entfernen</button>}</div>}
      {needsAudio && <div><strong>Audio</strong><p>{audio ? `${audio.name}${audio.durationMs ? ` · ${Math.round(audio.durationMs / 1000)} s` : ''}` : 'PCM-WAV · höchstens 24 MiB und 2 Minuten'}</p>
        <button type="button" onClick={() => void pick('audio_wav')}>{audio ? 'Audio ändern' : 'WAV auswählen'}</button>
        {audio && <button type="button" onClick={() => void clear('audio_wav')}>Audio entfernen</button>}</div>}
      <p>Diese Dateien bleiben auf deinem PC und werden nur für dieses Modell verwendet.</p>
    </fieldset>}
    {picking && <p role="status">Datei wird lokal geprüft…</p>}
    {inputError && <p role="alert">{inputError}</p>}
    {canBenchmark && <button type="button" disabled={disabled || picking || !inputsValid} onClick={() => {
      if (disabled || picking || !inputsValid) return;
      void request({ operation: 'benchmark', modelId: model.id, requestId: newIndependentRequestId(), mode: benchmarkMode, backend,
        ...(needsImage && referenceImage ? { referenceImageAssetId: referenceImage.assetId } : {}),
        ...(needsAudio && audio ? { audioAssetId: audio.assetId } : {}) });
    }}>Mit diesen Dateien auf diesem PC testen</button>}
    {!canGenerate && <p>Nach einem erfolgreichen Gerätetest kannst du dieses Modell zur Erstellung nutzen.</p>}
    <div className="local-model-media-fields">
      <label>Breite<input type="number" min={bounds.width.min} max={bounds.width.max} step={bounds.width.step} value={width} onChange={event => setWidth(event.target.valueAsNumber)} disabled={disabled} /></label>
      <label>Höhe<input type="number" min={bounds.height.min} max={bounds.height.max} step={bounds.height.step} value={height} onChange={event => setHeight(event.target.valueAsNumber)} disabled={disabled} /></label>
      {video && bounds.frames && <label>Einzelbilder<input type="number" min={bounds.frames.min} max={bounds.frames.max} step={bounds.frames.step} value={frames} onChange={event => setFrames(event.target.valueAsNumber)} disabled={disabled} /></label>}
      {video && bounds.fps && <label>Bilder pro Sekunde<input type="number" min={bounds.fps.min} max={bounds.fps.max} value={fps} onChange={event => setFps(event.target.valueAsNumber)} disabled={disabled} /></label>}
    </div>
    <details className="local-model-advanced"><summary>Weitere Optionen</summary><div className="local-model-media-fields">
      <label>Schritte<input type="number" min={bounds.steps.min} max={bounds.steps.max} value={steps} onChange={event => setSteps(event.target.valueAsNumber)} disabled={disabled} /></label>
      <label>Startwert<input type="number" min={0} max={2147483647} value={seed} onChange={event => setSeed(event.target.valueAsNumber)} disabled={disabled} /></label>
    </div></details>
    <p className="local-model-catalog-note">Die verfügbaren Größen wurden für dieses Modell freigegeben. Erstellung bleibt lokal und kann jederzeit gestoppt werden.</p>
    <button className="local-model-primary" disabled={disabled || picking || !canGenerate || !valid} type="submit">{video ? 'Video lokal erstellen' : 'Bild lokal erstellen'}</button>
  </form>;
}

export function LocalModelMediaResult({ job, request }: { job: StoreJob; request: Request }) {
  const [index, setIndex] = useState(0), [busy, setBusy] = useState(false), [error, setError] = useState('');
  const [preview, setPreview] = useState<{ url: string; mime: string; id: string } | null>(null);
  const generation = useRef(0);
  const urlRef = useRef<string | null>(null);
  const assets = job.result?.assets ?? [];
  const selected = assets[index];
  useEffect(() => () => { generation.current++; if (urlRef.current) URL.revokeObjectURL(urlRef.current); }, []);
  useEffect(() => { generation.current++; setPreview(null); setError(''); setBusy(false);
    if (urlRef.current) { URL.revokeObjectURL(urlRef.current); urlRef.current = null; }
  }, [selected?.id]);
  if (!assets.length || !selected) return null;
  async function open() {
    if (busy) return;
    const epoch = ++generation.current; setBusy(true); setError('');
    try {
      const data = decodeStoreMedia(await request({ operation: 'readMedia', jobId: job.id, assetId: selected.id }));
      if (epoch !== generation.current) return;
      if (data.mimeType !== selected.mimeType) throw new Error('Das Ergebnisformat hat sich geändert. Bitte neu laden.');
      const url = URL.createObjectURL(new Blob([data.bytes as BlobPart], { type: data.mimeType }));
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url; setPreview({ url, mime: data.mimeType, id: selected.id });
    } catch (reason) { if (epoch === generation.current) setError(reason instanceof Error ? reason.message : 'Das Ergebnis ist nicht verfügbar.'); }
    finally { if (epoch === generation.current) setBusy(false); }
  }
  return <section className="local-model-media-result" aria-label="Lokal erstelltes Ergebnis">
    <h5>{job.result?.kind === 'video' ? 'Video-Ergebnis' : 'Bild-Ergebnis'}</h5>
    {assets.length > 1 && <label>Einzelbild<select value={index} onChange={event => setIndex(Number(event.target.value))}>{assets.map((asset, number) => <option key={asset.id} value={number}>{number + 1} / {assets.length}</option>)}</select></label>}
    <p>{selected.width} × {selected.height}{selected.fps ? ` · ${selected.fps} Bilder/s` : ''}</p>
    <button type="button" disabled={busy} onClick={() => void open()}>{busy ? 'Ergebnis wird geladen…' : 'Vorschau öffnen'}</button>
    {error && <p role="alert">{error}</p>}
    {preview?.id === selected.id && <>
      {preview.mime.startsWith('video/') ? <video controls preload="metadata" src={preview.url} /> : <img src={preview.url} alt="Lokal erstelltes Ergebnis" />}
      <a href={preview.url} download={`lastbrowser-${job.id}-${index + 1}.${preview.mime === 'image/png' ? 'png' : preview.mime === 'image/jpeg' ? 'jpg' : preview.mime === 'image/webp' ? 'webp' : preview.mime === 'video/mp4' ? 'mp4' : 'webm'}`}>Ergebnis speichern</a>
    </>}
    {job.result?.kind === 'video' && assets.length > 1 && <p>Einzelbildfolge · wähle ein Bild für Vorschau oder Speicherung.</p>}
  </section>;
}
