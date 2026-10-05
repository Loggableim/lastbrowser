"""Actual pinned release embedded notices, without executing its app binary."""
import hashlib
import re
from .legacy_runtime import inspect_existing_runtime_lock
from .runtime_bundle import SOURCE_REVISION

def embedded_release_notices(vendor_root):
    inventory=inspect_existing_runtime_lock(vendor_root)
    if inventory['version']!='b11377': raise ValueError('license_release_pin_changed')
    cpu=next(a for a in inventory['assets'] if a['backend']=='cpu')
    file=next((f for f in cpu['files'] if f['relativePath']=='cpu/llama.exe'),None)
    if file is None or file['status']!='verified': raise ValueError('license_binary_pin_missing')
    data=(vendor_root/file['relativePath']).read_bytes()
    if len(data)!=file['bytes'] or hashlib.sha256(data).hexdigest()!=file['sha256']:
        raise ValueError('license_binary_hash_changed')
    notices=[]
    for match in re.finditer(rb'License for ([^\n\x00]{1,128})\n=+\n\n([^\x00]{1,65536})',data):
        text=match.group().decode('utf-8')
        notices.append({'component':match.group(1).decode('utf-8'),'bytes':len(match.group()),
            'sha256':hashlib.sha256(match.group()).hexdigest(),'text':text})
    if not notices or len(notices)>32: raise ValueError('embedded_license_inventory_missing')
    return {'sourceRevision':SOURCE_REVISION,'release':'b11377','sourceBinary':file,'notices':notices,
        'sourceLicenseEquivalenceVerified':False,'completeDependencyClosureVerified':False,'redistributionApproved':False}
