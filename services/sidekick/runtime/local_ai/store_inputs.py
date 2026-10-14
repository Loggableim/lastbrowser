"""Explicit user-picked local image/audio copies, owned by one store scope."""
import hashlib
import io
import os
import re
import wave
from pathlib import Path

from .installer import _cache_directory, _open_file


def copy_media_input(root,kind,source,asset_id):
    if kind not in ('reference_image','audio_wav') or not re.fullmatch('[a-f0-9]{32}',asset_id):
        raise ValueError('media_input_identity_invalid')
    source=Path(source)
    if not source.is_absolute():raise ValueError('media_input_path_invalid')
    limit=16*1024**2 if kind=='reference_image' else 24*1024**2
    with _open_file(source) as stream:
        if not 0<os.fstat(stream.fileno()).st_size<=limit:raise ValueError('media_input_size_limit')
        if kind=='reference_image':
            from PIL import Image,ImageOps
            with Image.open(stream) as image:
                if image.format not in ('PNG','JPEG') or getattr(image,'n_frames',1)!=1:
                    raise ValueError('media_input_format_invalid')
                if not all(1<=value<=4096 for value in image.size):raise ValueError('media_input_dimensions_invalid')
                image.load();normalized=ImageOps.exif_transpose(image).convert('RGB')
                output=io.BytesIO();normalized.save(output,format='PNG');data=output.getvalue()
                descriptor={'mimeType':'image/png','width':normalized.width,'height':normalized.height}
            filename='reference.png'
        else:
            data=stream.read(limit+1)
            with wave.open(io.BytesIO(data),'rb') as audio:
                if audio.getcomptype()!='NONE' or audio.getnchannels() not in (1,2) or audio.getsampwidth() not in (2,4):
                    raise ValueError('media_audio_format_invalid')
                if not 16000<=audio.getframerate()<=48000:raise ValueError('media_audio_rate_invalid')
                duration=audio.getnframes()/audio.getframerate()
                if not .1<=duration<=120:raise ValueError('media_audio_duration_invalid')
                expected=audio.getnframes()*audio.getnchannels()*audio.getsampwidth()
                if expected>limit or len(audio.readframes(audio.getnframes()))!=expected:
                    raise ValueError('media_audio_truncated')
                descriptor={'mimeType':'audio/wav','durationMs':int(duration*1000)}
            filename='audio.wav'
    if len(data)>limit:raise ValueError('media_input_size_limit')
    with _cache_directory(root,('inputs',asset_id)) as directory:
        target=directory/filename
        if target.exists() or target.is_symlink():raise ValueError('media_input_already_exists')
        with _open_file(target,create=True) as output:
            output.write(data);output.flush();os.fsync(output.fileno())
    return {'assetId':asset_id,'name':source.name[:200],**descriptor},filename,hashlib.sha256(data).hexdigest(),len(data)
