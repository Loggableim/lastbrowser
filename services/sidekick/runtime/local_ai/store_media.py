"""Owned stable-diffusion.cpp PNG/frame generation; no shell or cloud fallback."""
from __future__ import annotations

import base64
import os
import subprocess
import threading
import time
from pathlib import Path

from .installer import InstallCancelled, _open_file
from .runtime_probe import _WindowsProbeJob
from .store_inference import MemorySampler

MAX_IMAGE_BYTES = 16 * 1024 * 1024
PIPELINES = {'z_image', 'flux2_klein', 'qwen_image', 'longcat_image', 'wan2.2_ti2v', 'wan2.2_t2v','wan2.2_i2v','wan2.2_s2v','lingbot_dense'}


def validate_media_config(config, category):
    if not isinstance(config, dict) or config.get('pipeline') not in PIPELINES:
        raise ValueError('media_pipeline_not_supported')
    for name in ('width', 'height', 'steps'):
        value=config.get(name);extra='default' if name=='steps' else 'step'
        if (not isinstance(value,dict) or set(value)!={'min','max',extra}
                or any(type(number) is not int or number<=0 for number in value.values())
                or value['min']>value['max'] or value['max']>(50 if name=='steps' else 2048)):
            raise ValueError('media_bounds_invalid')
    if category=='video':
        for name,extra,ceiling in (('frames','step',121),('fps','default',60)):
            value=config.get(name)
            if (not isinstance(value,dict) or set(value)!={'min','max',extra}
                    or any(type(number) is not int or number<=0 for number in value.values())
                    or value['min']>value['max'] or value['max']>ceiling):
                raise ValueError('media_bounds_invalid')
    if ('video' if config['pipeline'].startswith(('wan','lingbot')) else 'image')!=category:
        raise ValueError('media_pipeline_category_mismatch')
    if set(config)-{'pipeline','width','height','steps','frames','fps','cfgScale','sampler','requiredInputs'}:
        raise ValueError('media_pipeline_options_invalid')
    required=['reference_image','audio_wav'] if config['pipeline']=='wan2.2_s2v' else ['reference_image'] if config['pipeline']=='wan2.2_i2v' else []
    if config.get('requiredInputs',[])!=required:raise ValueError('media_pipeline_required_inputs_invalid')
    if config['pipeline']=='wan2.2_s2v' and config['fps']!={'min':16,'max':16,'default':16}:
        raise ValueError('media_s2v_requires_16_fps')
    if 'cfgScale' in config and (type(config['cfgScale']) not in (int,float) or not 0<=config['cfgScale']<=20):
        raise ValueError('media_pipeline_options_invalid')
    if config.get('sampler','euler') not in {'euler','euler_a','dpm++2m','dpm++2s_a'}:
        raise ValueError('media_pipeline_options_invalid')


def validate_media_request(request, artifact):
    config=artifact['media'];validate_media_config(config,artifact['category'])
    if not isinstance(request.get('prompt'),str) or not 1<=len(request['prompt'])<=4096:
        raise ValueError('media_prompt_invalid')
    if type(request.get('seed')) is not int or not 0<=request['seed']<=2147483647:
        raise ValueError('media_seed_invalid')
    for name in ('width','height','steps',*(('frames','fps') if artifact['category']=='video' else ())):
        value=request.get(name);bound=config[name]
        if type(value) is not int or not bound['min']<=value<=bound['max']:
            raise ValueError('media_request_outside_qualified_bounds')
        if 'step' in bound and (value-bound['min'])%bound['step']:
            raise ValueError('media_request_outside_qualified_bounds')
    if artifact['category']=='image' and ('frames' in request or 'fps' in request):
        raise ValueError('image_request_contains_video_fields')


def inspect_png(path, width, height):
    with _open_file(path) as stream:
        if os.fstat(stream.fileno()).st_size>MAX_IMAGE_BYTES:
            raise ValueError('media_result_size_limit')
        from PIL import Image
        with Image.open(stream) as picture:
            if picture.format!='PNG' or picture.size!=(width,height):raise ValueError('media_result_dimensions_invalid')
            picture.load()


class MediaProcess:
    """Only this owned process tree is stopped; compute stays held until exit."""
    def __init__(self,binary,args,output_dir,memory_limit,production_budget=None,gpu_budget=None):
        self.binary=binary;self.args=args;self.output_dir=output_dir;self.memory_limit=memory_limit
        self.process=None;self.job=None;self._lock=threading.RLock();self.peak_ram=None
        self.production_budget=production_budget
        self.gpu_budget=gpu_budget
        self._stderr_lock=threading.Lock();self._stderr=bytearray();self._reader=None

    def _drain_stderr(self,stream):
        try:
            while chunk:=stream.read(4096):
                with self._stderr_lock:
                    self._stderr.extend(chunk)
                    if len(self._stderr)>16384:del self._stderr[:-16384]
        except OSError:pass

    def stderr_tail(self):
        # Private diagnostic only: never returned in a renderer job or receipt.
        with self._stderr_lock:return bytes(self._stderr)

    def run(self,cancel,timeout=300):
        if os.name!='nt':raise ValueError('runtime_platform_unsupported')
        if cancel.is_set():raise InstallCancelled()
        environment={key:value for key,value in os.environ.items() if key.upper() in ('SYSTEMROOT','WINDIR','TEMP','TMP')}
        if self.gpu_budget is not None:environment.update(self.gpu_budget.environment())
        from .store_process import CREATE_SUSPENDED,resume_owned_suspended
        sampler=None;started=time.monotonic()
        try:
            with self._lock:
                options={'memory_limit_bytes':self.memory_limit}
                if self.production_budget is not None:options['production_budget']=self.production_budget
                self.job=_WindowsProbeJob(**options)
                self.process=subprocess.Popen([str(self.binary),*self.args],cwd=self.output_dir,env=environment,
                    shell=False,stdin=subprocess.DEVNULL,stdout=subprocess.DEVNULL,stderr=subprocess.PIPE,
                    creationflags=subprocess.CREATE_NO_WINDOW|CREATE_SUSPENDED)
                self.job.assign(self.process)
                if self.gpu_budget is not None:self.gpu_budget.prepare_initializing(self.process)
                self._reader=threading.Thread(target=self._drain_stderr,args=(self.process.stderr,),daemon=True);self._reader.start()
                sampler=MemorySampler(self.process.pid)
                resume_owned_suspended(self.process)
                if self.gpu_budget is not None:
                    if self.production_budget is None:raise ValueError('gpu_requires_production_ram_budget')
                    self.gpu_budget.admit_initialized(self.process,cancel,self.production_budget.reserve_available)
            while self.process.poll() is None:
                if cancel.wait(.05):raise InstallCancelled()
                if self.production_budget is not None and not self.production_budget.reserve_available():
                    raise RuntimeError('system_ram_reserve_breached')
                if self.gpu_budget is not None:self.gpu_budget.check()
                if time.monotonic()-started>timeout:raise TimeoutError('media_generation_timeout')
            if self.process.returncode!=0:raise RuntimeError('media_runtime_failed')
        finally:
            if sampler:sampler.close();self.peak_ram=sampler.peak
            self.stop()

    def stop(self,timeout=2):
        with self._lock:
            if self.gpu_budget is not None:self.gpu_budget.close()
            if self.job:self.job.close();self.job=None
            if self.process is not None and self.process.poll() is None:self.process.kill()
            if self.process is not None:
                try:self.process.wait(timeout=timeout)
                except subprocess.TimeoutExpired:return False
            if self._reader:self._reader.join(1)
            return True


def build_media_args(artifact,model_directory,output_dir,request,backend,vram_budget,inputs=None):
    validate_media_request(request,artifact)
    config=artifact['media'];files={role:model_directory/fact.relative_path for role,fact in artifact['fileObjects']}
    text_flag='--t5xxl' if config['pipeline'].startswith('wan') else '--llm'
    output=output_dir/('frame_%03d.png' if artifact['category']=='video' else 'image.png')
    args=['--mode','vid_gen' if artifact['category']=='video' else 'img_gen',
          '--high-noise-diffusion-model' if 'diffusion_low' in files else '--diffusion-model',str(files['diffusion']),'--vae',str(files['vae']),text_flag,str(files['text_encoder']),
          '--output',str(output),'--preview-path',str(output_dir/'preview.png'),'--preview-interval','0',
          '--prompt',request['prompt'],'--width',str(request['width']),'--height',str(request['height']),
          '--steps',str(request['steps']),'--seed',str(request['seed']),'--threads','4',
          '--rng','cpu','--sampler-rng','cpu','--sampling-method',config.get('sampler','euler'),
          '--cfg-scale',str(config.get('cfgScale',1.0)),'--vae-tiling','--batched-cfg','off']
    if backend=='cpu':args+=['--backend','cpu','--auto-fit','off']
    elif backend=='vulkan' and vram_budget>0:
        args+=['--backend','diffusion=vulkan0,te=cpu,vae=cpu','--offload-to-cpu','--auto-fit','on',
               '--max-vram',f'vulkan0={vram_budget/(1024**3):.3f}']
    else:raise ValueError('media_backend_budget_unverified')
    if 'diffusion_low' in files:args+=['--diffusion-model',str(files['diffusion_low'])]
    inputs=inputs or {}
    for required in config.get('requiredInputs',[]):
        if required not in inputs:raise ValueError('media_required_input_missing')
    if 'reference_image' in inputs:args+=['--init-img',str(inputs['reference_image'])]
    if 'audio_wav' in inputs:
        if 'audio_encoder' not in files:raise ValueError('media_audio_encoder_missing')
        args+=['--audio-encoder',str(files['audio_encoder']),'--audio',str(inputs['audio_wav'])]
    if artifact['category']=='video':args+=['--video-frames',str(request['frames']),'--fps',str(request['fps']),'--output-begin-idx','0']
    return args


def collect_media(output_dir,artifact,request):
    if artifact['category']=='video':
        paths=sorted(output_dir.glob('frame_*.png'))
        expected=[output_dir/f'frame_{index:03d}.png' for index in range(request['frames'])]
        if paths!=expected:raise ValueError('media_result_frame_indices_invalid')
    else:paths=[output_dir/'image.png']
    if {path.name for path in output_dir.glob('*.png')}-{path.name for path in paths}-{'preview.png'}:
        raise ValueError('media_result_unexpected_image')
    assets=[]
    for index,path in enumerate(paths):
        inspect_png(path,request['width'],request['height'])
        if path.stat().st_size>MAX_IMAGE_BYTES:raise ValueError('media_result_size_limit')
        assets.append({'id':f'frame-{index:03d}','mimeType':'image/png','width':request['width'],'height':request['height'],
                       **({'frames':request['frames'],'fps':request['fps']} if artifact['category']=='video' else {})})
    if sum(path.stat().st_size for path in paths)>256*1024*1024:raise ValueError('media_result_total_size_limit')
    return {'kind':artifact['category'],'assets':assets},paths


def read_media_asset(path,descriptor):
    inspect_png(path,descriptor['width'],descriptor['height'])
    with _open_file(path) as stream:
        data=stream.read(MAX_IMAGE_BYTES+1)
    if len(data)>MAX_IMAGE_BYTES:raise ValueError('media_result_size_limit')
    return {'mimeType':'image/png','dataBase64':base64.b64encode(data).decode('ascii')}
