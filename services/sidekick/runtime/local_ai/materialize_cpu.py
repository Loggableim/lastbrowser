"""Explicit offline source integration of pinned existing bytes; no overwrites."""
import hashlib
import json
import os
from contextlib import ExitStack
from pathlib import Path
from .installer import _pin_directory
from .runtime_bundle import existing_cpu_manifest, SOURCE_REVISION
from .runtime_probe import RuntimeBuildManifest, hash_contained_file
from .native_dependencies import inventory_imports
from .native_licenses import embedded_release_notices
from runtime.independent.contracts import digest_json

ARCHIVE_NAME='llama-b11377-bin-win-cpu-x64.zip'
ARCHIVE_BYTES=19352210
ARCHIVE_SHA='00b6a76bf3188a3c693c3f6bd4bff20b12d02780cc800d6f67397e69ad744d53'

def _json_bytes(value):return (json.dumps(value,indent=2,ensure_ascii=False,sort_keys=True)+'\n').encode('utf-8')

def materialize_existing_cpu(vendor_root:Path,repository_root:Path,expected:RuntimeBuildManifest):
    """Private explicit development action. Never called by setup/bootstrap/API."""
    vendor_root,repository_root=Path(vendor_root),Path(repository_root)
    for root in (vendor_root,repository_root):
        if not root.is_absolute() or root.resolve()!=root:raise ValueError('native_source_directory_not_canonical')
    with ExitStack() as stack:
        seen=set()
        for root in (vendor_root,repository_root):
            for directory in reversed((root,*root.parents)):
                if directory not in seen:stack.enter_context(_pin_directory(directory));seen.add(directory)
        if hash_contained_file(vendor_root,ARCHIVE_NAME,ARCHIVE_BYTES)!=(ARCHIVE_BYTES,ARCHIVE_SHA):
            raise ValueError('native_source_archive_pin_changed')
        observed=existing_cpu_manifest(vendor_root)
        if expected.source_revision!=SOURCE_REVISION or digest_json(observed)!=digest_json(expected):
            raise ValueError('native_source_manifest_identity_changed')
        target=repository_root/expected.package_relative_dir
        if not target.is_relative_to(repository_root):raise ValueError('native_materialization_target_rejected')
        # Validate all existing parents before creating any missing directories.
        for directory in reversed((target,*target.parents)):
            if not directory.is_relative_to(repository_root) or directory==repository_root:continue
            directory.mkdir(exist_ok=True)
            stack.enter_context(_pin_directory(directory))
        notices=embedded_release_notices(vendor_root)
        imports=inventory_imports(vendor_root,expected)
        extras={
            'THIRD-PARTY-NOTICES.txt':('\n\n'.join(n['text'] for n in notices['notices'])+'\n').encode('utf-8'),
            'embedded-notices.json':_json_bytes(notices),
            'native-imports.json':_json_bytes(imports),
            'runtime-build-manifest.json':_json_bytes(expected.model_dump(mode='json',by_alias=True)),
        }
        entries=[{'relativePath':f.relative_path,'bytes':f.bytes,'sha256':f.sha256,'kind':f.kind} for f in expected.files]
        entries.extend({'relativePath':name,'bytes':len(data),'sha256':hashlib.sha256(data).hexdigest(),'kind':'notice' if name=='THIRD-PARTY-NOTICES.txt' else 'metadata'} for name,data in extras.items())
        bundle={'schemaVersion':1,'release':'b11377','sourceRevision':SOURCE_REVISION,'runtimeBuildRef':expected.build_ref,
            'sourceArchive':{'name':ARCHIVE_NAME,'bytes':ARCHIVE_BYTES,'sha256':ARCHIVE_SHA},'files':entries,
            'embeddedNoticeComponents':[n['component'] for n in notices['notices']],
            'externalImports':imports['externalImports'],'licenseClosureVerified':False,
            'msvcDependencyClosureVerified':False,'redistributionApproved':False,
            'remainingGates':['exact-source-and-complete-linked-ui-license-equivalence','microsoft-crt-redistribution-and-clean-offline-dependency-closure']}
        extras['source-bundle.json']=_json_bytes(bundle)
        # Preflight every existing destination. Nothing is ever overwritten,
        # including signed files or matching files created by another agent.
        expected_files={entry['relativePath']:(entry['bytes'],entry['sha256']) for entry in entries}
        expected_files['source-bundle.json']=(len(extras['source-bundle.json']),hashlib.sha256(extras['source-bundle.json']).hexdigest())
        for name,pin in expected_files.items():
            if (target/name).exists() and hash_contained_file(target,name,pin[0])!=pin:
                raise ValueError('native_existing_destination_differs_no_overwrite')
        sources={f.relative_path:vendor_root/('LICENSE-llama.cpp' if f.relative_path=='LICENSE-llama.cpp' else 'cpu/'+f.relative_path) for f in expected.files}
        copied=[];preserved=[]
        for name,pin in expected_files.items():
            if (target/name).exists():preserved.append(name);continue
            # The exclusive open also protects against a concurrent file creator.
            with (target/name).open('xb') as output:
                if name in extras:output.write(extras[name])
                else:
                    source=sources[name]
                    if hash_contained_file(vendor_root,source.relative_to(vendor_root).as_posix(),pin[0])!=pin:
                        raise ValueError('native_source_bytes_changed')
                    with source.open('rb') as stream:
                        for chunk in iter(lambda:stream.read(262144),b''):output.write(chunk)
                output.flush();os.fsync(output.fileno())
            if hash_contained_file(target,name,pin[0])!=pin:raise ValueError('native_materialized_file_integrity_failed')
            copied.append(name)
        return {'target':str(target),'copiedFiles':len(copied),'preservedFiles':len(preserved),'nativeManifestFiles':len(expected.files),
            'sourceRevision':SOURCE_REVISION,'sourceArchiveSha256':ARCHIVE_SHA,'embeddedNoticeComponents':bundle['embeddedNoticeComponents'],
            'externalImports':bundle['externalImports'],'licenseClosureVerified':False,'msvcDependencyClosureVerified':False,'redistributionApproved':False}
