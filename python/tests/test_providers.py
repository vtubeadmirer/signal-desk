import json
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch
sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import providers
import agent

class ProviderTests(unittest.TestCase):
    def setUp(self):
        providers._verified.clear()

    def test_only_three_providers(self):
        for value in ["grok", "codex;echo bad", None, [], {}]:
            with self.assertRaises(ValueError):
                providers.validate_provider(value)

    def test_gemini_installation_is_not_authentication(self):
        with patch("providers.run", return_value=subprocess.CompletedProcess([], 0, "1.0", "")):
            self.assertIsNone(providers.status("gemini", {})["authenticated"])

    def test_claude_login_status(self):
        with patch("providers.run", side_effect=[subprocess.CompletedProcess([], 0, "1.0", ""), subprocess.CompletedProcess([], 1, "", "")]):
            self.assertFalse(providers.status("claude", {})["authenticated"])

    def test_adapters_disable_tools_and_parse_envelopes(self):
        def run(name, args, env, **kw):
            self.assertIn("UNTRUSTED", kw["input"])
            self.assertNotIn("UNTRUSTED", str(args))
            if name == "claude":
                self.assertEqual(args[args.index("--disallowedTools") + 1], "*")
                self.assertIn("--safe-mode", args)
                value = {"structured_output": {"items": []}}
            else:
                policy = Path(args[args.index("--admin-policy") + 1]).read_text()
                self.assertIn('decision = "deny"', policy)
                self.assertIn('mcpName = "*"', policy)
                value = {"response": '{"items":[]}'}
            return subprocess.CompletedProcess([], 0, json.dumps(value), "")
        schema = json.loads(agent.analysis_schema_path().read_text(encoding="utf-8"))
        with patch("providers.run", side_effect=run):
            for name in ["claude", "gemini"]:
                self.assertEqual(providers.analyze(name, [], {}, schema), [])

    def test_analysis_cannot_overwrite_source_fields(self):
        schema = json.loads(agent.analysis_schema_path().read_text(encoding="utf-8"))
        with patch("providers.query", return_value={"items": [{"event_id": "a", "url": "https://evil.example"}]}):
            with self.assertRaises(ValueError):
                providers.analyze("claude", [{"event_id": "a"}], {}, schema)

    def test_missing_items_are_rejected(self):
        schema = json.loads(agent.analysis_schema_path().read_text(encoding="utf-8"))
        with patch("providers.query", return_value={"items": []}):
            with self.assertRaises(ValueError):
                providers.analyze("gemini", [{"event_id": "a"}], {}, schema)

    def test_unsupported_login_does_not_spawn(self):
        with patch("providers.subprocess.Popen") as spawn:
            result = agent.handle({"op": "provider_login", "provider": "grok"})
            self.assertFalse(result["ok"])
            spawn.assert_not_called()

    def test_bad_connection_test_does_not_mark_authenticated(self):
        with patch("providers.query", return_value="wrong"):
            self.assertFalse(agent.handle({"op": "provider_test", "provider": "gemini"})["ok"])
        self.assertNotIn("gemini", providers._verified)
