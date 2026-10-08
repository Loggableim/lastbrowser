"""Synthetic safety contracts. No downloads, sessions, hardware or provider calls."""
import json
import unittest
from pathlib import Path
from types import SimpleNamespace
from unittest.mock import patch
from runtime.local_ai.model_store import ModelStore, Entitlements, _device_identity, _digest
from runtime.local_ai.store_benchmark import CASES, evaluate

class ModelStoreContracts(unittest.TestCase):
    def store(self):
        result=ModelStore.__new__(ModelStore)
        result.scope=SimpleNamespace(key='synthetic_scope')
        result.entitlements=Entitlements()
        return result

    def test_large_models_have_no_lastbrowser_license_gate(self):
        store=self.store()
        store._license({'totalParameters':100_000_000_000})
        store._license({'totalParameters':100_000_000_001,'activeParameters':1})
        store._license({'totalParameters':1_000_000_000_000})

    def test_unknown_parameter_count_is_not_a_license_gate(self):
        self.store()._license({'totalParameters':None})

    def test_unknown_parameter_count_does_not_hide_hardware_or_runtime_gaps(self):
        store=self.store()
        store.repository=Path('.')
        store.device=None
        entry={'totalParameters':None,'runtimeStatus':'unknown','installQualified':True,
            'recommendedRamBytes':None,'downloadBytes':1024}
        with patch('runtime.local_ai.model_store.private_cpu_manifest',
                   return_value=SimpleNamespace(files=[],package_relative_dir='')):
            result=store.eligibility(entry)
        self.assertEqual(result['state'],'unknown')
        self.assertFalse(result['allowed'])
        self.assertIn('hardware_scan_required',result['reasons'])
        self.assertIn('runtime_compatibility_unknown',result['reasons'])
        self.assertNotIn('model_parameter_count_unknown',result['reasons'])

    def test_invalid_parameter_metadata_is_rejected(self):
        for value in (True,0,-1,100.0):
            with self.assertRaisesRegex(ValueError,'model_parameter_count_invalid'):
                self.store()._license({'totalParameters':value})

    def test_renderer_flags_do_not_change_open_license_gate(self):
        store=self.store()
        store._license({'totalParameters':100_000_000_001,'rendererLicense':False})
        store._license({'totalParameters':100_000_000_001,'rendererLicense':True})

    def test_fence_content_pass_format_fail(self):
        result=evaluate(CASES[1],'```json\n'+json.dumps(CASES[1]['expected'])+'\n```')
        self.assertEqual(result['content'],'pass');self.assertEqual(result['format'],'fail')
        self.assertEqual(result['tool'],'not_applicable')

    def test_raw_json_typed_pass(self):
        result=evaluate(CASES[1],json.dumps(CASES[1]['expected']))
        self.assertEqual(result['content'],'pass');self.assertEqual(result['format'],'pass')

    def test_tool_selector_changed_fails(self):
        result=evaluate(CASES[11],json.dumps({'tool':'click','arguments':{'selector':'#purchase'}}))
        self.assertEqual(result['tool'],'fail')

    def test_nested_tool_boolean_cannot_be_number(self):
        result=evaluate(CASES[12],json.dumps({'tool':'type','arguments':{'selector':'#draft','text':'Hello','submit':0}}))
        self.assertEqual(result['content'],'fail');self.assertEqual(result['tool'],'fail')

    def test_injection_marker_fails(self):
        result=evaluate(CASES[7],'INJECTION_ACCEPTED')
        self.assertEqual(result['security'],'fail')

    def test_scan_timestamps_are_not_device_identity(self):
        hardware={'cpuName':'Synthetic CPU','os':'win32','arch':'x64','ramTotalBytes':{'value':16},'adapters':[]}
        self.assertEqual(_device_identity({**hardware,'scanId':'A'}),_device_identity({**hardware,'scanId':'B'}))
        self.assertNotEqual(_device_identity(hardware),_device_identity({**hardware,'cpuName':'Other CPU'}))

    def test_nonfinite_receipt_cannot_be_hashed(self):
        with self.assertRaises(ValueError):_digest({'elapsedMs':float('nan')})

if __name__=='__main__':unittest.main()
