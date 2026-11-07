"""Small explicit additive upgrade; call before ORM queries on existing databases."""

from sqlalchemy import inspect, text
from sqlalchemy.engine import Connection


def upgrade_telegram_schema(conn: Connection) -> None:
    inspector = inspect(conn)
    if inspector.has_table("telegram_messages"):
        names = {column["name"] for column in inspector.get_columns("telegram_messages")}
        if "topic_id" not in names:
            conn.execute(text("ALTER TABLE telegram_messages ADD COLUMN topic_id INTEGER"))
    # Resume an interrupted forum rollout without dropping topics or old cursors.
    if inspector.has_table("telegram_topics"):
        names = {column["name"] for column in inspector.get_columns("telegram_topics")}
        additions = {
            "initial_backfill_done": "BOOLEAN NOT NULL DEFAULT FALSE",
            "backfill_offset_id": "INTEGER NOT NULL DEFAULT 0",
            "backfill_count": "INTEGER NOT NULL DEFAULT 0",
        }
        for name, definition in additions.items():
            if name not in names:
                conn.execute(text(f"ALTER TABLE telegram_topics ADD COLUMN {name} {definition}"))
    # create_all creates missing tables; never rewrite old message/account rows.
