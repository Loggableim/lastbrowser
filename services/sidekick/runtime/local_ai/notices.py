"""Verified source-bundle inventory and bounded, verified license notices."""
import json
import hashlib
from typing import Literal
from runtime.independent.contracts import Contract, Ref
from .runtime_bundle import private_cpu_manifest, SOURCE_REVISION
from .runtime_probe import hash_contained_file
from .materialize_cpu import ARCHIVE_SHA, ARCHIVE_BYTES

class ComponentAttribution(Contract):
    name: Ref
    license_label: Ref
    notice_id: Ref
    source_url: Ref | None
    notice_text: str

class NoticeSummary(Contract):
    schema_version: Literal[1] = 1
    runtime_build_ref: Ref
    source_bundle_verified: bool
    verified_payload_count: int
    components: tuple[ComponentAttribution,...]
    license_closure_verified: Literal[False] = False
    msvc_dependency_closure_verified: Literal[False] = False
    execution_unavailable: Literal[True] = True
    missing_prerequisites: tuple[Ref,...]

class PreparedRuntimeSetupManifest(Contract):
    schema_version: Literal[1] = 1
    runtime_build_ref: Ref
    notice_summary: NoticeSummary | None
    available: Literal[False] = False
    execution_unavailable: Literal[True] = True
    skip_available: Literal[True] = True
    existing_provider_available: Literal[True] = True
    reason_code: Ref

def prepared_runtime_setup_manifest(repository_root):
    """Return only hash-verified embedded notices, never caller-selected paths."""
    try:
        summary=notice_summary(repository_root)
        reason='local_runtime_dependency_and_license_closure_unverified'
    except (ValueError,OSError,KeyError,TypeError):
        summary=None;reason='local_runtime_source_bundle_unverified'
    return PreparedRuntimeSetupManifest(runtime_build_ref=private_cpu_manifest().build_ref,notice_summary=summary,reason_code=reason)

def notice_summary(repository_root):
    manifest=private_cpu_manifest();root=repository_root/manifest.package_relative_dir
    path=root/'source-bundle.json'
    if path.stat().st_size>262144:raise ValueError('runtime_source_bundle_budget_exceeded')
    raw=path.read_bytes();hash_contained_file(root,'source-bundle.json',len(raw))
    bundle=json.loads(raw)
    if bundle.get('sourceRevision')!=SOURCE_REVISION or bundle.get('runtimeBuildRef')!=manifest.build_ref:
        raise ValueError('runtime_source_bundle_identity_changed')
    archive=bundle.get('sourceArchive',{})
    if archive.get('sha256')!=ARCHIVE_SHA or archive.get('bytes')!=ARCHIVE_BYTES:
        raise ValueError('runtime_source_archive_identity_changed')
    entries=bundle.get('files')
    if not isinstance(entries,list) or len(entries)!=40 or len({f.get('relativePath') for f in entries})!=40:
        raise ValueError('runtime_source_bundle_payload_count_changed')
    pins={f['relativePath']:(f['bytes'],f['sha256']) for f in entries}
    supplementary={
        'THIRD-PARTY-NOTICES.txt':(37419,'42429aa934c72f0e2d7f4477b69d588cdb25a1fe091b99585deb84c0c9b676a2'),
        'embedded-notices.json':(38375,'a2be59975c44e544253e8407109383ccdcb13817844fc9ffb35cc3a04d89e320'),
        'native-imports.json':(15307,'bc62a8dbebb13be6cec42f875265c6673b797eb34df7f3dff38f7ebff51dbbb4'),
        'runtime-build-manifest.json':(7411,'c810e7eb5736943c18a421dd6a5f1ef2acaf1db610061815e527c2ad06a8429f'),
    }
    if any(pins.get(name)!=pin for name,pin in supplementary.items()):raise ValueError('runtime_source_notice_metadata_pin_changed')
    for file in manifest.files:
        if pins.get(file.relative_path)!=(file.bytes,file.sha256):raise ValueError('runtime_source_bundle_native_pin_changed')
    for name,(size,sha) in pins.items():
        if type(size) is not int or not 0<size<=134217728 or not isinstance(sha,str) or len(sha)!=64:
            raise ValueError('runtime_source_bundle_payload_pin_invalid')
        if hash_contained_file(root,name,size)!=(size,sha):raise ValueError('runtime_source_bundle_payload_changed')
    notice_data=json.loads((root/'embedded-notices.json').read_text(encoding='utf-8'))
    names=tuple(n['component'] for n in notice_data['notices'])
    if names!=('LLVM OpenMP','llama.cpp','jsonhpp','BoringSSL','cpp-httplib'):
        raise ValueError('runtime_source_notice_components_changed')
    total_notice_bytes=0
    source_refs={
        'llama.cpp':'https://github.com/ggml-org/llama.cpp/blob/'+SOURCE_REVISION+'/LICENSE',
        'jsonhpp':'https://github.com/ggml-org/llama.cpp/blob/'+SOURCE_REVISION+'/vendor/nlohmann/json.hpp',
        'cpp-httplib':'https://github.com/ggml-org/llama.cpp/blob/'+SOURCE_REVISION+'/vendor/cpp-httplib/LICENSE',
        # The pinned binary archive has the LLVM notice text but does not pin
        # the LLVM source revision. Likewise for BoringSSL. No mutable URL is
        # presented as an immutable component source.
        'LLVM OpenMP':None,
        'BoringSSL':None,
    }
    for notice in notice_data['notices']:
        text=notice.get('text')
        if not isinstance(text,str) or not text:
            raise ValueError('runtime_embedded_notice_text_invalid')
        content=text.encode('utf-8')
        total_notice_bytes+=len(content)
        if len(content)>65536 or total_notice_bytes>262144:
            raise ValueError('runtime_embedded_notice_budget_exceeded')
        if len(content)!=notice['bytes'] or hashlib.sha256(content).hexdigest()!=notice['sha256']:
            raise ValueError('runtime_embedded_notice_bytes_changed')
    if tuple(notice['component'] for notice in notice_data['notices'])!=names:
        raise ValueError('runtime_embedded_notice_order_changed')
    labels={'LLVM OpenMP':'Apache 2.0 with LLVM exceptions','llama.cpp':'MIT','jsonhpp':'MIT','BoringSSL':'Bundled BoringSSL notices','cpp-httplib':'MIT'}
    return NoticeSummary(runtime_build_ref=manifest.build_ref,source_bundle_verified=True,verified_payload_count=40,
        components=tuple(ComponentAttribution(name=name,license_label=labels[name],notice_id='local-ai-'+str(i),
            source_url=source_refs[name],notice_text=notice_data['notices'][i]['text']) for i,name in enumerate(names)),
        missing_prerequisites=('microsoft-vc14-x64-offline-redistribution-license-and-origin',
            'component-source-revision-unpinned-for-LLVM-OpenMP-and-BoringSSL'))
