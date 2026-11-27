import hashlib
import io
import zipfile
from contextlib import contextmanager
from types import SimpleNamespace
from threading import Event

import pytest
from runtime.local_ai import store_engines


def fact(name, content, kind='library'):
    return SimpleNamespace(relative_path=name, bytes=len(content), sha256=hashlib.sha256(content).hexdigest(), kind=kind)


def zipped(files):
    stream = io.BytesIO()
    with zipfile.ZipFile(stream, 'w') as archive:
        for name, data in files.items(): archive.writestr(name, data)
    return stream.getvalue()


def test_downloaded_windows_engine_contains_verified_crt(tmp_path, monkeypatch):
    binary = b'fixture engine'; crt = b'fixture microsoft dependency'
    engine_zip = zipped({'llama-server.exe': binary})
    crt_zip = zipped({'Contents/VC/Redist/vcruntime140.dll': crt})
    def archive_fact(name, data, url):
        return SimpleNamespace(relative_path=name, bytes=len(data), sha256=hashlib.sha256(data).hexdigest(), source_url=url)
    engine_url = 'https://github.com/fixture/engine.zip'
    crt_url = 'https://download.visualstudio.microsoft.com/fixture/runtime.vsix'
    engine = {'id':'fixture', 'manifestObject':SimpleNamespace(os='win32', package_relative_dir='missing', files=[fact('llama-server.exe', binary, 'binary')]),
              'archiveObject':archive_fact('engine.zip', engine_zip, engine_url)}
    monkeypatch.setattr(store_engines, '_WINDOWS_CRT_ARCHIVE', archive_fact('runtime.vsix', crt_zip, crt_url))
    monkeypatch.setattr(store_engines, '_WINDOWS_CRT_FILES', (('Contents/VC/Redist/vcruntime140.dll', fact('vcruntime140.dll', crt)),))
    class Transport:
        @contextmanager
        def open(self, url, offset):
            assert offset == 0
            stream=io.BytesIO({engine_url:engine_zip, crt_url:crt_zip}[url]); stream.status=200; stream.headers={}
            yield stream
    monkeypatch.setattr(store_engines, 'EngineTransport', Transport)
    root=tmp_path/'cache'; root.mkdir()
    result=store_engines.prepare_engine(root, tmp_path/'repo', engine, Event(), lambda _: None)
    assert (result/'vcruntime140.dll').read_bytes() == crt
    assert store_engines.engine_directory(root, tmp_path/'repo', engine) == result
    (result/'vcruntime140.dll').unlink()
    assert store_engines.prepare_engine(root, tmp_path/'repo', engine, Event(), lambda _: None) == result
    assert (result/'vcruntime140.dll').read_bytes() == crt
    (result/'vcruntime140.dll').write_bytes(b'changed')
    with pytest.raises(ValueError, match='runtime_integrity_failed'):
        store_engines.engine_directory(root, tmp_path/'repo', engine)


def test_rejects_modified_crt_archive_without_publishing_files(tmp_path, monkeypatch):
    content = b'fixture dependency'
    original = zipped({'Contents/vcruntime140.dll': content})
    corrupted = original[:-1] + bytes([original[-1] ^ 1])
    archive = SimpleNamespace(relative_path='runtime.vsix', bytes=len(original),
        sha256=hashlib.sha256(original).hexdigest(), source_url='https://download.visualstudio.microsoft.com/fixture/runtime.vsix')
    monkeypatch.setattr(store_engines, '_WINDOWS_CRT_ARCHIVE', archive)
    monkeypatch.setattr(store_engines, '_WINDOWS_CRT_FILES', (('Contents/vcruntime140.dll', fact('vcruntime140.dll', content)),))
    class Transport:
        @contextmanager
        def open(self, url, offset):
            stream=io.BytesIO(corrupted); stream.status=200; stream.headers={}
            yield stream
    monkeypatch.setattr(store_engines, 'EngineTransport', Transport)
    root=tmp_path/'cache'; root.mkdir()
    destination=root/'engine'; destination.mkdir()
    engine={'id':'fixture', 'manifestObject':SimpleNamespace(os='win32')}
    with pytest.raises(ValueError):
        store_engines._prepare_windows_crt(root, engine, destination, Event(), lambda _: None)
    assert not (destination/'vcruntime140.dll').exists()
