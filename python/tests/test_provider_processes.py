import json
import subprocess
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import agent


class ProviderProcessTests(unittest.TestCase):
    def test_windows_flag_and_other_platforms(self):
        with patch.object(sys, "platform", "win32"), patch.object(subprocess, "CREATE_NO_WINDOW", 0x08000000, create=True):
            self.assertEqual(agent._provider_creation_flags(), 0x08000000)
        with patch.object(sys, "platform", "linux"):
            self.assertEqual(agent._provider_creation_flags(), 0)

    def test_status_and_analysis_keep_pipes_and_hide_all_cli_processes(self):
        def run(command, **kwargs):
            self.assertEqual(kwargs["creationflags"], 0x08000000)
            self.assertTrue(kwargs["capture_output"])
            self.assertFalse(kwargs["shell"])
            if command[1] == "exec":
                self.assertEqual(json.loads(kwargs["input"]), {"items": []})
                Path(command[command.index("-o") + 1]).write_text('{"items":[]}', encoding="utf-8")
            return subprocess.CompletedProcess(command, 0, "codex test", "")

        with patch("providers.executable", side_effect=lambda name: name), patch("agent._provider_creation_flags", return_value=0x08000000), patch("agent.subprocess.run", side_effect=run) as process:
            self.assertTrue(agent.provider_status()["authenticated"])
            self.assertEqual(agent.ai_analyze([]), [])
        self.assertEqual([call.args[0][1] for call in process.call_args_list], ["--version", "login", "--version", "login", "exec"])


if __name__ == "__main__":
    unittest.main()
