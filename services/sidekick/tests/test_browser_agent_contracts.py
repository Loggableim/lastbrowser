import json
import unittest
from pathlib import Path

from runtime.independent.browser_agent_contracts import (
    AgentContractError,
    agent_action_digest,
    capabilities,
    redact_action_for_trace,
    validate_action,
)


VECTORS = Path(__file__).resolve().parents[3] / "apps" / "desktop" / "tests" / "fixtures" / "agent-browser-digest-vectors.json"


class BrowserAgentContractTests(unittest.TestCase):
    def test_capabilities_offer_no_operations_until_main_execution_exists(self):
        reported = capabilities()
        self.assertEqual(reported["schemaVersion"], 2)
        self.assertFalse(reported["enabled"])
        self.assertEqual(reported["operations"], [])
        self.assertEqual(reported["frames"]["closedShadow"], "closed_shadow_unsupported")

    def test_digest_matches_the_desktop_vectors(self):
        for vector in json.loads(VECTORS.read_text(encoding="utf-8")):
            self.assertEqual(agent_action_digest(vector["action"]), vector["digest"], vector["name"])

    def test_unknown_fields_versions_and_types_are_rejected(self):
        with self.assertRaises(AgentContractError) as unknown:
            validate_action({"schemaVersion": 2, "kind": "agent_browser_observe", "includeElements": True, "includeFrames": False, "includeScreenshot": False, "targetId": "worker-chosen"})
        self.assertEqual(unknown.exception.code, "unknown_field")
        with self.assertRaises(AgentContractError) as version:
            validate_action({"schemaVersion": 1, "kind": "agent_browser_observe", "includeElements": True, "includeFrames": False, "includeScreenshot": False})
        self.assertEqual(version.exception.code, "unsupported_version")
        with self.assertRaises(AgentContractError) as flag:
            validate_action({"schemaVersion": 2, "kind": "agent_browser_observe", "includeElements": 1, "includeFrames": False, "includeScreenshot": False})
        self.assertEqual(flag.exception.code, "invalid_flag")
        with self.assertRaises(AgentContractError) as operation:
            validate_action({"schemaVersion": 2, "kind": "evaluate", "expression": "document.cookie"})
        self.assertEqual(operation.exception.code, "unknown_operation")

    def test_fill_trace_drops_text_but_digest_keeps_it(self):
        action = {"schemaVersion": 2, "kind": "agent_browser_fill", "snapshotId": "snap1234", "elementRef": "elem1234", "text": "secret-token", "clear": True}
        changed = dict(action)
        changed["text"] = "other-token"
        self.assertNotEqual(agent_action_digest(action), agent_action_digest(changed))
        self.assertEqual(redact_action_for_trace(action)["text"], "")
        self.assertNotIn("secret-token", json.dumps(redact_action_for_trace(action)))


if __name__ == "__main__":
    unittest.main()
