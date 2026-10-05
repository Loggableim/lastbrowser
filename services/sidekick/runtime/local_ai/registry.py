"""Curated metadata snapshot, not a downloader or a runtime compatibility claim.

Public Hub blobs and pinned LICENSE text observed 2026-10-04 01:01 UTC.
No weights fetched. Runtime/model-operation evidence is supplied separately.
"""
from .contracts import ArtifactFile, CatalogSnapshot, ModelArtifact

LICENSE_SHA = "4d28ca14dedc0b3d0fcc2b3339f0e79931faa33874f3d24f522183a8fc70068c"


def _gguf(name, revision, filename, size, sha, roles, *, architecture=None, context=None, projector=None, license_sha=LICENSE_SHA):
    repo = "LiquidAI/" + name
    base = "https://huggingface.co/" + repo + "/resolve/" + revision + "/"
    license_download = "https://huggingface.co/" + repo + "/raw/" + revision + "/LICENSE"
    license_page = "https://huggingface.co/" + repo + "/blob/" + revision + "/LICENSE"
    files = [ArtifactFile(relative_path=filename, bytes=size, sha256=sha, source_url=base + filename, kind="weights"),
             ArtifactFile(relative_path="LICENSE", bytes=10574, sha256=license_sha, source_url=license_download, kind="license")]
    if projector:
        files.append(ArtifactFile(relative_path=projector[0], bytes=projector[1], sha256=projector[2], source_url=base + projector[0], kind="projector"))
    return ModelArtifact(artifact_id=repo + ":Q4_K_M", provider="LiquidAI", model_id=repo, revision=revision,
        format="gguf", quantization="Q4_K_M", architecture=architecture, roles=roles, files=tuple(files),
        manifest_complete=True, license_ref=license_page, license_digest=license_sha, context_limit=context,
        requires_projector=projector is not None,
        evidence_refs=("https://huggingface.co/" + repo, "https://huggingface.co/api/models/" + repo + "?blobs=true"))


def liquid_catalog() -> CatalogSnapshot:
    """Fresh immutable instances; consumers cannot mutate the shared catalog."""
    artifacts = (
        _gguf("LFM2-350M-Extract-GGUF", "b8f758b9ff37b0cad9bedfc5223cb71e31aebe9c", "LFM2-350M-Extract-Q4_K_M.gguf",
            229310080, "687a31c3e7864647aa181e1feb156e4e5da33978c174d7dbf0d289f6014a5621", ("extract",), architecture="lfm2", context=128000),
        _gguf("LFM2-1.2B-Tool-GGUF", "e7ec4149433c75d4bb53a0742ee1ebde7fcbd183", "LFM2-1.2B-Tool-Q4_K_M.gguf",
            730894048, "3a942f51f9f3088c0b502b61ee49480a3d8c54de369f9c53ee5668419caf67a7", ("agent",), architecture="lfm2", context=128000),
        _gguf("LFM2.5-2.6B-GGUF", "e7caca5d835a3901a8e0d63e94009429bafafdfc", "LFM2.5-2.6B-Q4_K_M.gguf",
            1674455040, "02a8b7e17487d326e46d68ce0ba24211e1b80a14c4cd0597fa73c1cd697f52ed", ("agent",), architecture="lfm2", context=131072,
            license_sha="30adf9d6478191fb87f2424f63ba0728598335aaf99cd2848ef17e8e545fe94b"),
        _gguf("LFM2.5-8B-A1B-GGUF", "49c14831707011e64d70b2ebd8462ba08d608434", "LFM2.5-8B-A1B-Q4_K_M.gguf",
            5155564768, "4923ec14f06b968b74d663e5949867d2d9c3bf13a20b8be1a9f9af39989b2bb0", ("agent",), architecture="lfm2_moe", context=128000),
        _gguf("LFM2.5-ColBERT-350M-GGUF", "bc240003aba07253e261a8aaf0d2c9683318a967", "LFM2.5-ColBERT-350M-Q4_K_M.gguf",
            228407552, "1f783c71a42dd367cf296496c23e0f53c6a2685f2d5bd10e062878346844b5b7", ("retrieve",), context=512),
        _gguf("LFM2.5-Embedding-350M-GGUF", "a80de9c5b941d429104f0038292a0ef5a860e486", "LFM2.5-Embedding-350M-Q4_K_M.gguf",
            229311232, "4d7aa9dc6406a10fc3dec2c11f8f06781af063bf49211b8e4132e9b876d3f32a", ("embed",), context=512),
        _gguf("LFM2.5-VL-450M-Extract-GGUF", "be9e242e7c37db9ddbf9f88d7df939159fdfa186", "LFM2.5-VL-450M-Extract-Q4_K_M.gguf",
            229313536, "12d083dbd0fcff8ed250d4e69c543dcda048363dac0bcb2d6f64b62be690bd70", ("vision",),
            projector=("mmproj-LFM2.5-VL-450M-Extract-F16.gguf", 189125920, "a5a192cb70dc4653621e0853aae9e2e7d773c572736fea90a5a64df6125f53e7")),
    )
    repo = "LiquidAI/LFM2.5-Encoder-230M"
    revision = "0b649ad0c684378b03d4d8304f7577a662ab89bc"
    base = "https://huggingface.co/" + repo + "/resolve/" + revision + "/"
    encoder = ModelArtifact(artifact_id=repo + ":safetensors", provider="LiquidAI", model_id=repo,
        revision=revision, format="safetensors", quantization=None, architecture="Lfm2BidirectionalForMaskedLM",
        roles=("encoder",), files=(ArtifactFile(relative_path="model.safetensors", bytes=918787216,
            sha256="e2365f4805d311697d46c9aa326e50862466dab0b62c94b67c22b61aa779e45d", source_url=base + "model.safetensors", kind="weights"),),
        manifest_complete=False, license_ref="https://huggingface.co/" + repo + "/blob/" + revision + "/LICENSE", license_digest=LICENSE_SHA,
        context_limit=8192, requires_task_head=True, task_head_ref=None,
        evidence_refs=("https://huggingface.co/" + repo, "https://huggingface.co/" + repo + "/raw/" + revision + "/config.json"))
    chat_repo = "LiquidAI/LFM2.5-350M-GGUF"
    chat_revision = "9969000761ce34de907bf20017cbfc3d52d6eaf9"
    chat_license_sha = "5188f2b355da20647257a3156db5834c794e5fb5e6d8dc4d4cdbb3180e75b85b"
    chat_artifact = ModelArtifact(artifact_id=chat_repo + ":LFM2.5-350M-QAD-Q4_0", provider="LiquidAI",
        model_id=chat_repo, revision=chat_revision, format="gguf", quantization="Q4_0", architecture="lfm2",
        roles=("chat",), files=(
            ArtifactFile(relative_path="LFM2.5-350M-QAD-Q4_0.gguf", bytes=219312832,
                sha256="3d10b6ab8fc91a919534b9558e266255aca0bbc7f6d015963599aa9e74e05b1d",
                source_url=f"https://huggingface.co/{chat_repo}/resolve/{chat_revision}/LFM2.5-350M-QAD-Q4_0.gguf", kind="weights"),
            ArtifactFile(relative_path="LICENSE", bytes=10596, sha256=chat_license_sha,
                source_url=f"https://huggingface.co/{chat_repo}/raw/{chat_revision}/LICENSE", kind="license")),
        manifest_complete=True, license_ref=f"https://huggingface.co/{chat_repo}/blob/{chat_revision}/LICENSE",
        license_digest=chat_license_sha, context_limit=1024,
        evidence_refs=(f"https://huggingface.co/{chat_repo}/commit/657e078c94084481950a2d555a941481f715536b",
            f"https://huggingface.co/{chat_repo}/blob/{chat_revision}/README.md"))
    return CatalogSnapshot(revision="liquid-public-metadata-2026-10-05.1", observed_at="2026-10-05T00:00:00Z",
        artifacts=artifacts + (encoder, chat_artifact))
