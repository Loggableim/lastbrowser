import React, { useEffect, useRef, useState } from 'react';
import type { ModelStoreRequest, StoreJob, StoreModel } from '../model-store-contracts.js';
import { newIndependentRequestId } from '../independent-contracts.js';
import { decodeStoreInput, decodeStoreMedia, type StoreSelectedInput } from './model-store-actions.js';
import { useDesktopI18n } from '../i18n.js';
import { shellText } from '../i18n/shell-text.js';

type Request = (request: ModelStoreRequest) => Promise<unknown>;

export function LocalModelMediaForm({ model, request, disabled, canGenerate = false, canBenchmark = false, benchmarkMode = 'quick', backend = 'cpu' }:
  { model: StoreModel; request: Request; disabled: boolean; canGenerate?: boolean; canBenchmark?: boolean; benchmarkMode?: 'quick'|'standard'; backend?: 'cpu'|'vulkan' }) {
  const { locale } = useDesktopI18n();
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
  if (!bounds) return <p>{shellText(locale, 'Für dieses Modell ist noch keine geprüfte Erstellungskonfiguration verfügbar.', 'No verified creation setup is available for this model yet.')}</p>;
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
    } catch (reason) { if (epoch === lifecycle.current) setInputError(reason instanceof Error ? reason.message : shellText(locale, "Die Datei konnte nicht ausgewählt werden.", "The file could not be selected.")); }
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
    <h4>{video ? shellText(locale, 'Video erstellen', 'Create video') : shellText(locale, 'Bild erstellen', 'Create image')}</h4>
    <label>{shellText(locale, 'Was möchtest du erstellen?', 'What do you want to create?')}<textarea value={prompt} maxLength={4096} onChange={event => setPrompt(event.target.value)} required disabled={disabled} /></label>
    {(needsImage || needsAudio) && <fieldset className="local-model-media-inputs" disabled={disabled || picking}><legend>{shellText(locale, 'Deine lokalen Dateien', 'Your local files')}</legend>
      {needsImage && <div><strong>{shellText(locale, 'Referenzbild', 'Reference image')}</strong><p>{referenceImage ? `${referenceImage.name}${referenceImage.width && referenceImage.height ? ` · ${referenceImage.width} × ${referenceImage.height}` : ''}` : shellText(locale, 'PNG oder JPEG · höchstens 16 MiB', 'PNG or JPEG · 16 MiB maximum')}</p>
        <button type="button" onClick={() => void pick('reference_image')}>{referenceImage ? shellText(locale, 'Bild ändern', 'Change image') : shellText(locale, 'Bild auswählen', 'Choose image')}</button>
        {referenceImage && <button type="button" onClick={() => void clear('reference_image')}>{shellText(locale, 'Bild entfernen', 'Remove image')}</button>}</div>}
      {needsAudio && <div><strong>{shellText(locale, 'Audio', 'Audio')}</strong><p>{audio ? `${audio.name}${audio.durationMs ? ` · ${Math.round(audio.durationMs / 1000)} s` : ''}` : shellText(locale, 'PCM-WAV · höchstens 24 MiB und 2 Minuten', 'PCM WAV · 24 MiB and 2 minutes maximum')}</p>
        <button type="button" onClick={() => void pick('audio_wav')}>{audio ? shellText(locale, 'Audio ändern', 'Change audio') : shellText(locale, 'WAV auswählen', 'Choose WAV')}</button>
        {audio && <button type="button" onClick={() => void clear('audio_wav')}>{shellText(locale, 'Audio entfernen', 'Remove audio')}</button>}</div>}
      <p>{shellText(locale, 'Diese Dateien bleiben auf deinem PC und werden nur für dieses Modell verwendet.', 'These files stay on your PC and are used only for this model.')}</p>
    </fieldset>}
    {picking && <p role="status">{shellText(locale, 'Datei wird lokal geprüft…', 'Checking the file locally…')}</p>}
    {inputError && <p role="alert">{inputError}</p>}
    {canBenchmark && <button type="button" disabled={disabled || picking || !inputsValid} onClick={() => {
      if (disabled || picking || !inputsValid) return;
      void request({ operation: 'benchmark', modelId: model.id, requestId: newIndependentRequestId(), mode: benchmarkMode, backend,
        ...(needsImage && referenceImage ? { referenceImageAssetId: referenceImage.assetId } : {}),
        ...(needsAudio && audio ? { audioAssetId: audio.assetId } : {}) });
    }}>{shellText(locale, 'Mit diesen Dateien auf diesem PC testen', 'Test with these files on this PC')}</button>}
    {!canGenerate && <p>{shellText(locale, 'Nach einem erfolgreichen Gerätetest kannst du dieses Modell zur Erstellung nutzen.', 'After a successful device test you can use this model to create.')}</p>}
    <div className="local-model-media-fields">
      <label>{shellText(locale, 'Breite', 'Width')}<input type="number" min={bounds.width.min} max={bounds.width.max} step={bounds.width.step} value={width} onChange={event => setWidth(event.target.valueAsNumber)} disabled={disabled} /></label>
      <label>{shellText(locale, 'Höhe', 'Height')}<input type="number" min={bounds.height.min} max={bounds.height.max} step={bounds.height.step} value={height} onChange={event => setHeight(event.target.valueAsNumber)} disabled={disabled} /></label>
      {video && bounds.frames && <label>{shellText(locale, 'Einzelbilder', 'Frames')}<input type="number" min={bounds.frames.min} max={bounds.frames.max} step={bounds.frames.step} value={frames} onChange={event => setFrames(event.target.valueAsNumber)} disabled={disabled} /></label>}
      {video && bounds.fps && <label>{shellText(locale, 'Bilder pro Sekunde', 'Frames per second')}<input type="number" min={bounds.fps.min} max={bounds.fps.max} value={fps} onChange={event => setFps(event.target.valueAsNumber)} disabled={disabled} /></label>}
    </div>
    <details className="local-model-advanced"><summary>{shellText(locale, 'Weitere Optionen', 'More options')}</summary><div className="local-model-media-fields">
      <label>{shellText(locale, 'Schritte', 'Steps')}<input type="number" min={bounds.steps.min} max={bounds.steps.max} value={steps} onChange={event => setSteps(event.target.valueAsNumber)} disabled={disabled} /></label>
      <label>{shellText(locale, 'Startwert', 'Seed')}<input type="number" min={0} max={2147483647} value={seed} onChange={event => setSeed(event.target.valueAsNumber)} disabled={disabled} /></label>
    </div></details>
    <p className="local-model-catalog-note">{shellText(locale, 'Die verfügbaren Größen wurden für dieses Modell freigegeben. Erstellung bleibt lokal und kann jederzeit gestoppt werden.', 'The available sizes were approved for this model. Creation stays local and can be stopped at any time.')}</p>
    <button className="local-model-primary" disabled={disabled || picking || !canGenerate || !valid} type="submit">{video ? shellText(locale, 'Video lokal erstellen', 'Create video locally') : shellText(locale, 'Bild lokal erstellen', 'Create image locally')}</button>
  </form>;
}

export function LocalModelMediaResult({ job, request }: { job: StoreJob; request: Request }) {
  const { locale } = useDesktopI18n();
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
      if (data.mimeType !== selected.mimeType) throw new Error(shellText(locale, "Das Ergebnisformat hat sich geändert. Bitte neu laden.", "The result format changed. Please reload."));
      const url = URL.createObjectURL(new Blob([data.bytes as BlobPart], { type: data.mimeType }));
      if (urlRef.current) URL.revokeObjectURL(urlRef.current);
      urlRef.current = url; setPreview({ url, mime: data.mimeType, id: selected.id });
    } catch (reason) { if (epoch === generation.current) setError(reason instanceof Error ? reason.message : shellText(locale, "Das Ergebnis ist nicht verfügbar.", "The result is not available.")); }
    finally { if (epoch === generation.current) setBusy(false); }
  }
  return <section className="local-model-media-result" aria-label={shellText(locale, 'Lokal erstelltes Ergebnis', 'Locally created result')}>
    <h5>{job.result?.kind === 'video' ? shellText(locale, 'Video-Ergebnis', 'Video result') : shellText(locale, 'Bild-Ergebnis', 'Image result')}</h5>
    {assets.length > 1 && <label>{shellText(locale, 'Einzelbild', 'Frame')}<select value={index} onChange={event => setIndex(Number(event.target.value))}>{assets.map((asset, number) => <option key={asset.id} value={number}>{number + 1} / {assets.length}</option>)}</select></label>}
    <p>{selected.width} × {selected.height}{selected.fps ? ` · ${selected.fps} ${shellText(locale, 'Bilder/s', 'fps')}` : ''}</p>
    <button type="button" disabled={busy} onClick={() => void open()}>{busy ? shellText(locale, "Ergebnis wird geladen…", "Loading result…") : shellText(locale, "Vorschau öffnen", "Open preview")}</button>
    {error && <p role="alert">{error}</p>}
    {preview?.id === selected.id && <>
      {preview.mime.startsWith('video/') ? <video controls preload="metadata" src={preview.url} /> : <img src={preview.url} alt={shellText(locale, 'Lokal erstelltes Ergebnis', 'Locally created result')} />}
      <a href={preview.url} download={`lastbrowser-${job.id}-${index + 1}.${preview.mime === 'image/png' ? 'png' : preview.mime === 'image/jpeg' ? 'jpg' : preview.mime === 'image/webp' ? 'webp' : preview.mime === 'video/mp4' ? 'mp4' : 'webm'}`}>{shellText(locale, 'Ergebnis speichern', 'Save result')}</a>
    </>}
    {job.result?.kind === 'video' && assets.length > 1 && <p>{shellText(locale, "Einzelbildfolge · wähle ein Bild für Vorschau oder Speicherung.", "Frame sequence · choose an image to preview or save.")}</p>}
  </section>;
}
