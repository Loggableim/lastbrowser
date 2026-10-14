"""Display-only curated metadata; never download or runtime authorization."""
from __future__ import annotations

import json
import math
from pathlib import Path
from urllib.parse import urlsplit


def load_curation():
    path = Path(__file__).with_name('curated-models.json')
    if not path.is_file():
        return 'curation-unavailable', {}
    if path.is_symlink() or path.stat().st_size > 1024 * 1024:
        raise ValueError('curation_file_unsafe')
    document = json.loads(path.read_text(encoding='utf-8-sig'))
    if (not isinstance(document, dict) or document.get('schemaVersion') != 1
            or not isinstance(document.get('revision'), str)
            or not isinstance(document.get('models'), list) or len(document['models']) > 200):
        raise ValueError('curation_schema_invalid')
    entries = {}
    text_fields = ('modelId', 'name', 'publisher', 'vramClass', 'quantization',
                   'engine', 'innovation', 'sourceUrl')
    range_fields = ('estimatedVramGiB', 'estimatedRamGiB', 'estimatedDownloadGiB')
    list_fields = ('useCases', 'strengths', 'limitations')
    for record in document['models']:
        if not isinstance(record, dict):
            raise ValueError('curation_entry_invalid')
        if any(not isinstance(record.get(key), str) or not 1 <= len(record[key]) <= 2000
               for key in text_fields):
            raise ValueError('curation_text_invalid')
        if (record.get('category') not in ('text', 'image', 'video')
                or record.get('license') not in ('apache-2.0', 'mit')
                or type(record.get('priority')) is not bool):
            raise ValueError('curation_classification_invalid')
        for key in range_fields:
            values = record.get(key)
            if (not isinstance(values, list) or len(values) != 2
                    or any(type(value) not in (int, float) or not math.isfinite(value)
                           or not 0 <= value <= 10000 for value in values)
                    or values[0] > values[1]):
                raise ValueError('curation_resource_invalid')
        gpu = record.get('recommendedGpuGiB')
        if type(gpu) not in (int, float) or not math.isfinite(gpu) or not 0 <= gpu <= 10000:
            raise ValueError('curation_resource_invalid')
        for key in list_fields:
            values = record.get(key)
            if (not isinstance(values, list) or len(values) > 30
                    or any(not isinstance(value, str) or not 1 <= len(value) <= 2000 for value in values)):
                raise ValueError('curation_list_invalid')
        url = urlsplit(record['sourceUrl'])
        if url.scheme != 'https' or not url.hostname or url.username or url.password:
            raise ValueError('curation_source_invalid')
        identity = record['modelId']
        if identity in entries:
            raise ValueError('curation_duplicate_model')
        entries[identity] = {key: record[key] for key in (*text_fields, *range_fields, *list_fields,
                               'category', 'license', 'priority', 'recommendedGpuGiB')}
    return document['revision'], entries


def browse_entry(metadata):
    """A complete display contract with no artifact, license receipt or execution proof."""
    media = metadata['category'] != 'text'
    return {
        'id': metadata['modelId'], 'name': metadata['name'], 'publisher': metadata['publisher'],
        'description': metadata['innovation'], 'tier': metadata['vramClass'],
        'sourceUrl': metadata['sourceUrl'], 'revision': None, 'totalParameters': None,
        'parameterSource': 'unknown', 'contextLimit': None, 'recommendedContext': None,
        'downloadBytes': None, 'recommendedRamBytes': None, 'recommendedVramBytes': None,
        'memoryPolicy': 'Curated resource ranges are estimates; no qualified artifact or measured device result.',
        'quantization': metadata['quantization'], 'runtimeStatus': 'unknown',
        'runtimeReason': ('Media pipeline is not installed or qualified in LastBrowser; browsing only.'
                          if media else 'Exact artifact and bundled runtime are not qualified; browsing only.'),
        'testStatus': 'ungetestet', 'historicalEvidence': None,
        'licenseLabel': metadata['license'], 'licenseText': None, 'licenseDigest': None,
        'gated': False, 'artifact': None, 'installQualified': False, 'commercialRequired': False,
        'tasks': ['research'], 'curated': True, 'curation': metadata,
    }


def readonly_catalog_view(hardware=None):
    """Public curated descriptions without local cache, receipts or runtime imports.

    The empty installed/history fields are deliberately not an inventory scan.
    The explicit readOnly flag distinguishes this view from the qualified store.
    """
    revision, metadata = load_curation()
    models = []
    for record in metadata.values():
        models.append({**browse_entry(record),
            'eligibility': {'state': 'unknown', 'allowed': False,
                            'reasons': ['local_ai_unavailable_in_test_build', 'catalog_browse_only']},
            'installed': None, 'active': False, 'deviceConfirmed': False})
    return {'catalogRevision': revision, 'models': models, 'hardware': hardware,
            'readOnly': True, 'availabilityReason': 'local_ai_unavailable_in_test_build',
            'jobs': [], 'history': [],
            'entitlement': {'largeModelsAllowed': True, 'status': 'open_source_no_size_restriction',
                            'threshold': None},
            'suite': {'version': 'unavailable', 'sha256': '', 'cases': 0,
                      'quickCases': 0, 'standardRepeats': 0}}
