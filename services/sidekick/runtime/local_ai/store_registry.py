"""Immutable executable model/engine bindings, separate from editorial curation.

Only pinned files and MIT/Apache notices can authorize a download. A registry
entry is not evidence that a model has run on the current user's hardware.
"""
from __future__ import annotations

import hashlib
import json
from pathlib import Path
from urllib.parse import urlsplit

from .contracts import ArtifactFile
from .runtime_probe import RuntimeBuildManifest

UNAVAILABLE_MODELS={
    'prism-ml/Ternary-Bonsai-2-27B-gguf':('prism_pq2_engine_required','The pinned stock llama.cpp engine cannot load Prism PQ2. A separately pinned compatible engine is required.'),
    'prism-ml/bonsai-image-ternary-4B-gemlite-2bit':('gemlite_hqq_engine_required','This image model needs a Gemlite/HQQ adapter; the pinned stable-diffusion.cpp engine does not implement it.'),
    'deepseek-ai/DeepSeek-V4.1-Flash':('deepseek_v41_loader_unavailable','No exact DeepSeek-V4.1 loader and immutable compatible weight bundle are verified for the pinned engine.'),
    'robbyant/lingbot-video-moe-30b-a3b':('lingbot_moe_shard_refiner_loader_unverified','The complete transformer/refiner shard loading recipe is not verified in the pinned engine.'),
}


def digest(value):
    return hashlib.sha256(json.dumps(value, sort_keys=True, separators=(',', ':'),
                                    ensure_ascii=False, allow_nan=False).encode()).hexdigest()


def _immutable_url(value,kind=None,sha256=None):
    parsed = urlsplit(value)
    if (value=='https://www.apache.org/licenses/LICENSE-2.0.txt' and kind=='license'
            and sha256=='cfc7749b96f63bd31c3c42b5c471bf756814053e847c10f3eb003417bc523d30'):
        return  # Exact canonical terms, content pinned independently of this URL.
    if (parsed.scheme != 'https' or parsed.hostname not in {'github.com', 'huggingface.co', 'raw.githubusercontent.com'}
            or parsed.username or parsed.password or parsed.fragment or parsed.port not in (None, 443)):
        raise ValueError('store_registry_source_rejected')
    if '/main/' in parsed.path or '/master/' in parsed.path or '/latest/' in parsed.path:
        raise ValueError('store_registry_source_not_immutable')


def load_registry(path=None):
    path = path or Path(__file__).with_name('store-runtime-registry.json')
    if path.is_symlink() or path.stat().st_size > 4 * 1024 * 1024:
        raise ValueError('store_registry_file_unsafe')
    data = json.loads(path.read_text(encoding='utf-8'))
    if data.get('schemaVersion') != 1 or set(data) != {'schemaVersion', 'revision', 'engines', 'models'}:
        raise ValueError('store_registry_schema_invalid')
    engines, models = {}, {}
    for item in data['engines']:
        if set(item)-{'supplementalFiles'} != {'id', 'engine', 'backend', 'manifest', 'archive', 'redistributionRef'}:
            raise ValueError('store_engine_schema_invalid')
        if item['id'] in engines or item['engine'] not in {'llama.cpp', 'stable-diffusion.cpp'}:
            raise ValueError('store_engine_identity_invalid')
        manifest = RuntimeBuildManifest.model_validate(item['manifest'])
        if item['backend'] not in manifest.declared_backends or item['backend'] not in {'cpu', 'vulkan'}:
            raise ValueError('store_engine_backend_invalid')
        archive = ArtifactFile.model_validate(item['archive'])
        if archive.bytes is None or not archive.sha256 or not item['redistributionRef']:
            raise ValueError('store_engine_integrity_incomplete')
        _immutable_url(archive.source_url)
        supplemental=tuple(ArtifactFile.model_validate(fact) for fact in item.get('supplementalFiles',[]))
        inventory={fact.relative_path:fact for fact in manifest.files}
        if len({fact.relative_path for fact in supplemental})!=len(supplemental):raise ValueError('engine_notice_duplicate')
        for fact in supplemental:
            expected=inventory.get(fact.relative_path)
            if (fact.kind!='license' or expected is None or expected.kind!='license'
                    or fact.bytes!=expected.bytes or fact.sha256!=expected.sha256):
                raise ValueError('engine_notice_inventory_mismatch')
            _immutable_url(fact.source_url,fact.kind,fact.sha256)
        engines[item['id']] = {**item, 'manifestObject': manifest, 'archiveObject': archive,'supplementalObjects':supplemental}
    for item in data['models']:
        required = {'modelId', 'revision', 'category', 'architecture', 'parameters', 'contextLimit',
                    'quantization', 'license', 'licenseText', 'licenseDigest', 'files', 'engineIds',
                    'requiredRamBytes', 'requiredVramBytes', 'media'}
        if set(item)-{'gpuLayers','chatTemplateKwargs','supportEvidence'} != required or item['modelId'] in models:
            raise ValueError('store_artifact_schema_invalid')
        if item['license'] not in {'apache-2.0', 'mit'} or item['category'] not in {'text', 'image', 'video'}:
            raise ValueError('store_artifact_license_or_category_rejected')
        if (not isinstance(item['licenseText'], str) or len(item['licenseText']) < 100
                or hashlib.sha256(item['licenseText'].encode()).hexdigest() != item['licenseDigest']):
            raise ValueError('store_artifact_notice_digest_invalid')
        if not isinstance(item['revision'], str) or len(item['revision']) != 40:
            raise ValueError('store_artifact_revision_invalid')
        files = []
        roles = set()
        for component in item['files']:
            if set(component) != {'role', 'file'} or component['role'] in roles:
                raise ValueError('store_artifact_component_invalid')
            fact = ArtifactFile.model_validate(component['file'])
            if fact.bytes is None or fact.bytes <= 0 or not fact.sha256:
                raise ValueError('store_artifact_pin_incomplete')
            _immutable_url(fact.source_url,fact.kind,fact.sha256)
            files.append((component['role'], fact)); roles.add(component['role'])
        if not files or len({fact.relative_path for _, fact in files}) != len(files):
            raise ValueError('store_artifact_components_incomplete')
        required_roles = {'model'} if item['category'] == 'text' else {'diffusion', 'vae', 'text_encoder'}
        if not required_roles <= roles or not any(fact.kind == 'license' for _, fact in files):
            raise ValueError('store_artifact_bundle_incomplete')
        if not item['engineIds'] or any(identity not in engines for identity in item['engineIds']):
            raise ValueError('store_artifact_engine_unknown')
        expected_engine = 'llama.cpp' if item['category'] == 'text' else 'stable-diffusion.cpp'
        if any(engines[identity]['engine'] != expected_engine for identity in item['engineIds']):
            raise ValueError('store_artifact_engine_mismatch')
        for evidence in item.get('supportEvidence',[]):
            if (set(evidence)-{'matchingLines'}!={'repository','revision','path','url','sha256'}
                    or evidence['revision'] not in {engines[identity]['manifestObject'].source_revision for identity in item['engineIds']}
                    or not isinstance(evidence['sha256'],str) or len(evidence['sha256'])!=64
                    or ('matchingLines' in evidence and (not evidence['matchingLines'] or any(type(line) is not int or line<=0 for line in evidence['matchingLines'])))):
                raise ValueError('store_artifact_support_evidence_invalid')
            _immutable_url(evidence['url'])
        for key in ('requiredRamBytes', 'requiredVramBytes'):
            if type(item[key]) is not int or item[key] < 0:
                raise ValueError('store_artifact_resource_invalid')
        if item['requiredRamBytes'] <= 0:
            raise ValueError('store_artifact_resource_invalid')
        if item['category']!='text':
            from .store_media import validate_media_config
            validate_media_config(item['media'],item['category'])
            if item['media']['pipeline'] in ('wan2.2_t2v','wan2.2_i2v') and 'diffusion_low' not in roles:
                raise ValueError('media_high_low_bundle_incomplete')
            if item['media']['pipeline']=='wan2.2_s2v' and 'audio_encoder' not in roles:
                raise ValueError('media_audio_encoder_bundle_incomplete')
        elif item['media'] is not None:
            raise ValueError('text_model_media_config_invalid')
        if 'gpuLayers' in item and (type(item['gpuLayers']) is not int or not 1<=item['gpuLayers']<=256):
            raise ValueError('store_artifact_gpu_layers_invalid')
        if 'chatTemplateKwargs' in item and item['chatTemplateKwargs']!={'enable_thinking':False}:
            raise ValueError('store_artifact_template_options_invalid')
        models[item['modelId']] = {**item, 'fileObjects': tuple(files), 'bundleDigest': digest(item)}
    if len({digest(identity)[:32] for identity in models})!=len(models):
        raise ValueError('model_storage_identity_collision')
    return data['revision'], engines, models


def enrich_entry(entry, artifact, engines):
    primary_role = 'model' if artifact['category'] == 'text' else 'diffusion'
    primary = next(fact for role, fact in artifact['fileObjects'] if role == primary_role)
    return {**entry, 'revision': artifact['revision'], 'totalParameters': artifact['parameters'],
            'contextLimit': artifact['contextLimit'], 'recommendedContext': 4096 if artifact['category'] == 'text' else None,
            'downloadBytes': sum(fact.bytes for _, fact in artifact['fileObjects']),
            'recommendedRamBytes': artifact['requiredRamBytes'], 'recommendedVramBytes': artifact['requiredVramBytes'],
            'memoryPolicy': 'Admission uses measured available RAM and at most 75% of measured free dedicated VRAM.',
            'quantization': artifact['quantization'], 'runtimeStatus': 'pinned_candidate',
            'runtimeReason': 'Pinned artifact and engine; current-device inference qualification remains required.',
            'licenseLabel': artifact['license'], 'licenseText': artifact['licenseText'],
            'licenseDigest': artifact['licenseDigest'], 'artifact': {'filename': primary.relative_path,
                'bytes': primary.bytes, 'sha256': primary.sha256, 'source_url': primary.source_url},
            'artifactManifest': artifact, 'installQualified': True,
            'tasks': ['chat', 'summary'] if artifact['category'] == 'text' else [artifact['category']],
            'historicalEvidence': None}
