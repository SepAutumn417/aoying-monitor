import tempfile
import unittest
from pathlib import Path

from aoying.events import EventLog


class EventLogTest(unittest.TestCase):
    def test_duplicate_restart_replay_and_device_isolation(self):
        with tempfile.TemporaryDirectory() as directory:
            path = Path(directory) / "test.db"
            log = EventLog(path)
            first = log.append("phone-a", "source-1", "Test", "one")
            self.assertEqual(first, log.append("phone-a", "source-1", "Test", "one"))
            log.append("phone-b", "source-1", "Private", "other device")
            log.append("phone-a", "source-2", "Test", "two")
            log.close()
            log = EventLog(path)
            self.assertEqual([2], [e["sequence"] for e in log.replay("phone-a", 1)])
            self.assertEqual(1, len(log.replay("phone-b")))
            self.assertEqual([], log.replay("unknown"))
            with self.assertRaises(ValueError):
                log.replay("phone-a", 999)
            log.close()

    def test_rejected_payload_does_not_consume_sequence(self):
        log = EventLog(":memory:")
        with self.assertRaises(ValueError):
            log.append("phone", "bad", "Test", "x" * 16385)
        self.assertEqual(1, log.append("phone", "good", "Test", "ok")["sequence"])
        log.close()
