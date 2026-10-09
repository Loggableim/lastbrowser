import hashlib
import json
import struct
import zipfile
import pytest
from runtime.local_ai.runtime_bundle import existing_cpu_manifest, SOURCE_REVISION
from runtime.local_ai.native_dependencies import pe_imports

def fixture_vendor(root):
    directory = root/'cpu'; directory.mkdir()
    values = {'llama-server.exe': b'controlled executable never run', 'ggml.dll': b'controlled library', 'LICENSE-LLVM-OpenMP': b'controlled license'}
    for name, data in values.items(): (directory/name).write_bytes(data)
    archive = root/'controlled.zip'
    with zipfile.ZipFile(archive,'w') as bundle:
        for name,data in values.items(): bundle.writestr(name,data)
    lock = {'version':'b11377','platform':'win32','arch':'x64','assets':[{'backend':'cpu','archive':archive.name,
        'sha256':hashlib.sha256(archive.read_bytes()).hexdigest(), 'files':[{'path':name,'sha256':hashlib.sha256(data).hexdigest()} for name,data in values.items()]}]}
    (root/'runtime-lock.json').write_text(json.dumps(lock))
    (root/'LICENSE-llama.cpp').write_bytes(b'controlled root license')

def test_manifest_projects_actual_pins_and_does_not_invent_role_proof(tmp_path):
    fixture_vendor(tmp_path); manifest = existing_cpu_manifest(tmp_path)
    assert manifest.source_revision == SOURCE_REVISION and len(manifest.files) == 4
    assert not manifest.role_adapters and 'pending' in manifest.redistribution_review_ref
    (tmp_path/'cpu/ggml.dll').write_bytes(b'changed')
    with pytest.raises(ValueError,match='integrity'): existing_cpu_manifest(tmp_path)

def test_pe_inventory_rejects_non_native_bytes():
    with pytest.raises(ValueError): pe_imports(b'not a PE')
    with pytest.raises(ValueError): pe_imports(b'MZ'+b'\0'*62)

def test_pe_inventory_reads_actual_import_descriptor_without_execution():
    data = bytearray(1024); data[:2] = b'MZ'; struct.pack_into('<I',data,60,64)
    data[64:68] = b'PE\0\0'; struct.pack_into('<H',data,70,1); struct.pack_into('<H',data,84,240)
    struct.pack_into('<H',data,88,0x20b)
    struct.pack_into('<II',data,88+112+8,0x1000,40)
    struct.pack_into('<IIII',data,88+240+8,512,0x1000,512,512)
    struct.pack_into('<I',data,512+12,0x1080); data[640:653] = b'kernel32.dll\0'
    assert pe_imports(bytes(data)) == ['kernel32.dll']


def test_actual_repository_source_bundle_integrity():
    from pathlib import Path
    import json
    from runtime.local_ai.runtime_bundle import private_cpu_manifest
    repo_root = Path(__file__).resolve().parents[3]
    bundle_root = repo_root / private_cpu_manifest().package_relative_dir
    if not bundle_root.is_dir():
        pytest.skip("Reduced-capability candidate omits b11377 source bundle; rights remain unverified")
    from runtime.local_ai.notices import notice_summary
    from runtime.local_ai.runtime_bundle import SOURCE_REVISION
    summary = notice_summary(repo_root)
    assert summary.source_bundle_verified is True
    assert summary.verified_payload_count == 40
    assert summary.msvc_dependency_closure_verified is False
    assert summary.missing_prerequisites == ('microsoft-vc14-x64-offline-redistribution-license-and-origin',
        'component-source-revision-unpinned-for-LLVM-OpenMP-and-BoringSSL')
    embedded = json.loads((repo_root / 'apps/desktop/runtime/local-ai/b11377-cpu/embedded-notices.json').read_text(encoding='utf-8'))
    assert [item.notice_text for item in summary.components] == [item['text'] for item in embedded['notices']]
    assert all(len(component.notice_text.encode('utf-8')) == source['bytes']
        for component, source in zip(summary.components, embedded['notices'], strict=True))
    assert summary.components[0].source_url is None and summary.components[3].source_url is None
    base = f'https://github.com/ggml-org/llama.cpp/blob/{SOURCE_REVISION}/'
    assert summary.components[1].source_url == base + 'LICENSE'
    assert summary.components[2].source_url == base + 'vendor/nlohmann/json.hpp'
    assert summary.components[4].source_url == base + 'vendor/cpp-httplib/LICENSE'


def test_notice_summary_refuses_changed_embedded_notice_payload(tmp_path):
    from pathlib import Path
    import shutil
    from runtime.local_ai.notices import notice_summary
    from runtime.local_ai.runtime_bundle import private_cpu_manifest
    repo_root = Path(__file__).resolve().parents[3]
    relative = private_cpu_manifest().package_relative_dir
    if not (repo_root / relative).is_dir():
        pytest.skip("Reduced-capability candidate omits b11377 source bundle; no payload available to mutate")
    destination = tmp_path / relative
    shutil.copytree(repo_root / relative, destination)
    embedded = destination / 'embedded-notices.json'
    embedded.write_text(embedded.read_text(encoding='utf-8').replace('MIT License', 'Changed license'), encoding='utf-8')
    with pytest.raises(ValueError, match='runtime_source_bundle_payload_changed'):
        notice_summary(tmp_path)

