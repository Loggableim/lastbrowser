"""Private pinned external-prerequisite input contract; no download/install action."""
from typing import Annotated, Literal
from urllib.parse import urlsplit
from pydantic import Field,model_validator
from runtime.independent.contracts import Contract,Ref
from .contracts import Sha256

class LicensedRedistInput(Contract):
    file_name: Literal['vc_redist.x64.exe']
    architecture: Literal['x64']
    file_bytes: Annotated[int,Field(gt=0,le=134217728)]
    file_sha256: Sha256
    file_version: Annotated[str,Field(pattern=r'^14\.[0-9]+\.[0-9]+\.[0-9]+$')]
    immutable_microsoft_source_url: Ref
    original_license_sha256: Sha256
    licensed_redistribution_list_sha256: Sha256
    microsoft_signature_evidence_ref: Ref
    redistribution_authority_evidence_ref: Ref
    minimum_toolset_evidence_ref: Ref
    action: Literal['manual-reviewed-prerequisite']

    @model_validator(mode='after')
    def official_pinned_origin(self):
        url=urlsplit(self.immutable_microsoft_source_url)
        if url.scheme!='https' or url.hostname!='download.visualstudio.microsoft.com' or url.username or url.password or url.query or url.fragment:
            raise ValueError('redist_immutable_official_origin_required')
        if not url.path.startswith('/download/pr/') or not url.path.lower().endswith('/vc_redist.x64.exe') or '%' in url.path or '\\' in url.path or '/..' in url.path:
            raise ValueError('redist_package_origin_path_rejected')
        return self

def inspect_licensed_redist_input(staging_root,value:LicensedRedistInput):
    """Bytes-only offline inspection; signatures/rights still require trusted proof."""
    from .runtime_probe import hash_contained_file
    if hash_contained_file(staging_root,value.file_name,value.file_bytes)!=(value.file_bytes,value.file_sha256):
        raise ValueError('redist_staged_installer_hash_changed')
    for name,sha in (('LICENSE-vc-redist.txt',value.original_license_sha256),('REDIST-LIST.txt',value.licensed_redistribution_list_sha256)):
        path=staging_root/name;size=path.stat().st_size
        if not 0<size<=262144 or hash_contained_file(staging_root,name,size)!=(size,sha):raise ValueError('redist_license_or_list_pin_changed')
    return {'state':'bytes_verified','fileVersion':value.file_version,'architecture':value.architecture,
        'signatureVerified':False,'redistributionAuthorityVerified':False,'minimumToolsetVerified':False,'installAllowed':False}
