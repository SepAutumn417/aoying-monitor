"""Durable per-device event log. Transport and Android app follow in P1."""

import json
import sqlite3
import uuid
from datetime import datetime, timezone


class EventLog:
    def __init__(self, path):
        self.db = sqlite3.connect(path)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("""CREATE TABLE IF NOT EXISTS events (
            device TEXT NOT NULL, sequence INTEGER NOT NULL,
            source_key TEXT NOT NULL, event_id TEXT NOT NULL,
            payload TEXT NOT NULL,
            PRIMARY KEY(device, sequence), UNIQUE(device, source_key))""")
        self.db.commit()

    def close(self):
        self.db.close()

    def append(self, device, source_key, title, body):
        if not device or not source_key:
            raise ValueError("device and source_key are required")
        if len(body.encode("utf-8")) > 16384 or len(title) > 200:
            raise ValueError("event exceeds size limit")
        try:
            self.db.execute("BEGIN IMMEDIATE")
            row = self.db.execute(
                "SELECT payload FROM events WHERE device=? AND source_key=?",
                (device, source_key),
            ).fetchone()
            if row:
                self.db.commit()
                return json.loads(row[0])
            sequence = self.db.execute(
                "SELECT COALESCE(MAX(sequence),0)+1 FROM events WHERE device=?", (device,)
            ).fetchone()[0]
            now = datetime.now(timezone.utc)
            from datetime import timedelta
            event = dict(protocol_version=1, sequence=sequence,
                         event_id=str(uuid.uuid4()), kind="test", title=title,
                         body=body, synthetic=True, source_reference=source_key,
                         source_time=now.isoformat(), created_at=now.isoformat(),
                         expires_at=(now + timedelta(minutes=5)).isoformat())
            self.db.execute("INSERT INTO events VALUES (?,?,?,?,?)",
                            (device, sequence, source_key, event["event_id"],
                             json.dumps(event, ensure_ascii=False)))
            self.db.commit()
            return event
        except BaseException:
            self.db.rollback()
            raise

    def replay(self, device, after=0, limit=100):
        if after < 0 or not 1 <= limit <= 100:
            raise ValueError("invalid cursor or limit")
        maximum = self.db.execute(
            "SELECT COALESCE(MAX(sequence),0) FROM events WHERE device=?", (device,)
        ).fetchone()[0]
        if after > maximum:
            raise ValueError("cursor ahead of event log")
        return [json.loads(row[0]) for row in self.db.execute(
            "SELECT payload FROM events WHERE device=? AND sequence>? "
            "ORDER BY sequence LIMIT ?", (device, after, limit))]
