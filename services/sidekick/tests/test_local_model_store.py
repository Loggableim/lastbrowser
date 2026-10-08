"""Synthetic safety contracts. No downloads, sessions, hardware or provider calls."""
import json
import unittest
from types import SimpleNamespace
from runtime.local_ai.model_store import ModelStore, Entitlements, LIMIT, _device_identity, _digest
from runtime.local_ai.store_benchmark import CASES, evaluate

class ModelStoreContracts(unittest.TestCase):
    def store(self):
        result=ModelStore.__new__(ModelStore)
        result.scope=SimpleNamespace(key='synthetic_scope')
        result.entitlements=Entitlements()
        return result

    def test_exact_100b_exempt(self):
        self.store()._license({'totalParameters':LIMIT})

    def test_more_than_100b_denied(self):
        with self.assertRaisesRegex(ValueError,'commercial_lastbrowser_license_required'):
            self.store()._license({'totalParameters':LIMIT+1,'activeParameters':1})

    def test_unknown_parameters_denied(self):
        for value in (None,True,0,-1,100.0):
            with self.assertRaisesRegex(ValueError,'model_parameter_count_unknown'):
                self.store()._license({'totalParameters':value})

    def test_trusted_entitlement_does_not_depend_on_renderer_flag(self):
        store=self.store()
        store._license({'totalParameters':LIMIT,'rendererLicense':True})
        with self.assertRaises(ValueError):store._license({'totalParameters':LIMIT+1,'rendererLicense':True})

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
