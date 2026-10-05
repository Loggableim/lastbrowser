"""Read-only actual PE import inventory, not a redistribution attestation."""
import struct

def pe_imports(data, *, include_symbols=False):
    if len(data) > 134217728 or data[:2] != b'MZ': raise ValueError('native_pe_format_rejected')
    try:
        pe = struct.unpack_from('<I', data, 60)[0]
        if data[pe:pe+4] != b'PE\0\0': raise ValueError('native_pe_signature_rejected')
        sections = struct.unpack_from('<H', data, pe+6)[0]
        optional_bytes = struct.unpack_from('<H', data, pe+20)[0]
        optional = pe+24; magic = struct.unpack_from('<H', data, optional)[0]
        if magic not in (0x10b, 0x20b) or not 0 < sections <= 96: raise ValueError('native_pe_header_rejected')
        directory = optional + (112 if magic == 0x20b else 96)
        regions = []
        for index in range(sections):
            entry = optional + optional_bytes + index*40
            virtual_size, address, raw_size, offset = struct.unpack_from('<IIII', data, entry+8)
            regions.append((address, max(virtual_size,raw_size), offset,raw_size))
        def locate(rva):
            for address, size, offset, raw in regions:
                if address <= rva < address+size:
                    delta = rva-address
                    if delta >= raw or offset+delta >= len(data): break
                    return offset+delta
            raise ValueError('native_pe_address_rejected')
        def name(rva, *, lowercase=True):
            offset = locate(rva); end = data.find(b'\0', offset, offset+(256 if lowercase else 8192))
            if end < 0: raise ValueError('native_pe_import_name_rejected')
            text = data[offset:end].decode('ascii')
            if not text or lowercase and ('/' in text or '\\' in text or ':' in text): raise ValueError('native_pe_import_path_rejected')
            return text.lower() if lowercase else text
        names = set(); symbols={}
        for slot, descriptor_size, name_offset in ((1,20,12),(13,32,4)):
            rva, size = struct.unpack_from('<II', data, directory+slot*8)
            if not rva: continue
            offset = locate(rva)
            for index in range(min(size//descriptor_size,512)):
                start = offset+index*descriptor_size
                descriptor = data[start:start+descriptor_size]
                if len(descriptor) != descriptor_size: raise ValueError('native_pe_import_table_rejected')
                if not any(descriptor): break
                if slot == 13 and struct.unpack_from('<I', descriptor)[0] != 1: raise ValueError('native_pe_delay_address_rejected')
                dll=name(struct.unpack_from('<I',descriptor,name_offset)[0]);names.add(dll)
                if include_symbols:
                    thunk=struct.unpack_from('<I',descriptor,16 if slot==13 else 0)[0]
                    if not thunk and slot==1:thunk=struct.unpack_from('<I',descriptor,16)[0]
                    if not thunk:raise ValueError('native_pe_import_thunk_missing')
                    thunk=locate(thunk);width=8 if magic==0x20b else 4;ordinal_flag=1<<(width*8-1)
                    target=symbols.setdefault(dll,set())
                    for number in range(8192):
                        entry=struct.unpack_from('<Q' if width==8 else '<I',data,thunk+number*width)[0]
                        if not entry:break
                        target.add('ordinal:'+str(entry&65535) if entry&ordinal_flag else name(entry+2,lowercase=False))
                    else:raise ValueError('native_pe_import_symbol_budget_exceeded')
        return {dll:sorted(values) for dll,values in sorted(symbols.items())} if include_symbols else sorted(names)
    except (struct.error, UnicodeDecodeError): raise ValueError('native_pe_table_rejected') from None

def inventory_imports(vendor_root, manifest):
    imports = {}
    packaged = {f.relative_path.lower() for f in manifest.files}
    for file in manifest.files:
        if file.kind in ('binary','library'):
            imports[file.relative_path] = pe_imports((vendor_root/'cpu'/file.relative_path).read_bytes())
    external = sorted({name for names in imports.values() for name in names if name not in packaged})
    return {'imports': imports, 'externalImports': external, 'redistributionApproved': False}

def pe_exports(data):
    """Actual named/ordinal export presence and forwarders, without DLL loading."""
    if len(data)>134217728 or data[:2]!=b'MZ':raise ValueError('native_pe_format_rejected')
    try:
        pe=struct.unpack_from('<I',data,60)[0]
        if data[pe:pe+4]!=b'PE\0\0':raise ValueError('native_pe_signature_rejected')
        count=struct.unpack_from('<H',data,pe+6)[0];optional_bytes=struct.unpack_from('<H',data,pe+20)[0];optional=pe+24
        magic=struct.unpack_from('<H',data,optional)[0]
        if magic not in (0x10b,0x20b) or not 0<count<=96:raise ValueError('native_pe_header_rejected')
        rva,size=struct.unpack_from('<II',data,optional+(112 if magic==0x20b else 96))
        if not rva:return {'symbols':[],'forwarders':{}}
        regions=[struct.unpack_from('<IIII',data,optional+optional_bytes+i*40+8) for i in range(count)]
        def locate(address):
            for virtual,address_start,raw,offset in regions:
                delta=address-address_start
                if 0<=delta<min(max(virtual,raw),raw) and offset+delta<len(data):return offset+delta
            raise ValueError('native_pe_export_address_rejected')
        def text(address):
            offset=locate(address);end=data.find(b'\0',offset,offset+512)
            if end<0:raise ValueError('native_pe_export_name_rejected')
            return data[offset:end].decode('ascii')
        header=locate(rva)
        base,functions,names,function_table,name_table,ordinal_table=struct.unpack_from('<IIIIII',data,header+16)
        if functions>131072 or names>131072:raise ValueError('native_pe_export_budget_exceeded')
        pointers=locate(function_table);symbols=set();forwarders={}
        for i in range(functions):
            address=struct.unpack_from('<I',data,pointers+i*4)[0]
            if address:
                key='ordinal:'+str(base+i);symbols.add(key)
                if rva<=address<rva+size:forwarders[key]=text(address)
        for i in range(names):
            key=text(struct.unpack_from('<I',data,locate(name_table)+i*4)[0])
            index=struct.unpack_from('<H',data,locate(ordinal_table)+i*2)[0]
            if index>=functions:raise ValueError('native_pe_export_ordinal_rejected')
            address=struct.unpack_from('<I',data,pointers+index*4)[0]
            if not address:continue
            symbols.add(key)
            if rva<=address<rva+size:forwarders[key]=text(address)
        return {'symbols':sorted(symbols),'forwarders':forwarders}
    except (struct.error,UnicodeDecodeError):raise ValueError('native_pe_export_table_rejected') from None
