"""Read-only local bundled candidates; import/export names never grant reuse rights."""
from .runtime_bundle import private_cpu_manifest
from .runtime_probe import hash_contained_file
from .native_dependencies import pe_imports, pe_exports

CANDIDATES={
    'vcruntime140.dll':(120400,'052ad6a20d375957e82aa6a3c441ea548d89be0981516ca7eb306e063d5027f4'),
    'vcruntime140_1.dll':(49776,'6a99bc0128e0c7d6cbbf615fcc26909565e17d4ca3451b97f8987f9c6acbc6c8'),
}

def audit_local_msvc(repository_root):
    manifest=private_cpu_manifest();required={name:set() for name in (*CANDIDATES,'msvcp140.dll')}
    for file in manifest.files:
        if file.kind not in ('binary','library'):continue
        relative=manifest.package_relative_dir+'/'+file.relative_path
        if hash_contained_file(repository_root,relative,file.bytes)!=(file.bytes,file.sha256):raise ValueError('native_dependency_source_changed')
        imports=pe_imports((repository_root/relative).read_bytes(),include_symbols=True)
        for name in required:required[name].update(imports.get(name,()))
    candidates=[]
    for name,(size,sha) in CANDIDATES.items():
        relative='apps/desktop/runtime/python/'+name
        try:match=hash_contained_file(repository_root,relative,size)==(size,sha)
        except (FileNotFoundError,ValueError,OSError):match=False
        exports=pe_exports((repository_root/relative).read_bytes()) if match else {'symbols':[],'forwarders':{}}
        missing=sorted(required[name]-set(exports['symbols']))
        candidates.append({'name':name,'relativePath':relative,'bytes':size,'sha256':sha,'fileVersion':'14.42.34438.0' if match else None,
            'actualBytesMatch':match,'requiredSymbolCount':len(required[name]),'missingImportSymbols':missing,
            'exportsCoverObservedImports':match and not missing,'forwarders':exports['forwarders'],
            'originalRedistributionLicenseLocated':False,'minimumBuildToolsetVerified':False,'copyApproved':False})
    return {'candidates':candidates,'missingLocalFiles':['msvcp140.dll'],'requiredMsvcp140Symbols':sorted(required['msvcp140.dll']),
        'loaderResolutionVerified':False,'msvcDependencyClosureVerified':False,'redistributionApproved':False}
