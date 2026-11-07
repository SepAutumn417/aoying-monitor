"""Upgrade an interrupted forum rollout without dropping persisted rows."""

from sqlalchemy import create_engine, inspect, text

from app.telegram_migrations import upgrade_telegram_schema


def test_upgrade_existing_topic_table_is_additive_and_idempotent():
    engine = create_engine("sqlite://")
    with engine.begin() as conn:
        conn.execute(text("CREATE TABLE telegram_topics (id INTEGER PRIMARY KEY, title TEXT)"))
        conn.execute(text("INSERT INTO telegram_topics VALUES (1, 'kept')"))
        upgrade_telegram_schema(conn)
        upgrade_telegram_schema(conn)
        names = {col["name"] for col in inspect(conn).get_columns("telegram_topics")}
        assert {"initial_backfill_done", "backfill_offset_id", "backfill_count"} <= names
        row = conn.execute(
            text(
                "SELECT title, initial_backfill_done, backfill_offset_id, backfill_count "
                "FROM telegram_topics WHERE id = 1"
            )
        ).one()
        assert tuple(row) == ("kept", 0, 0, 0)
    engine.dispose()
