from __future__ import annotations

import re
import sqlite3
from collections.abc import Iterator, Mapping
from pathlib import Path
from typing import Any

try:
    import psycopg
    from psycopg.rows import dict_row
except ImportError:  # pragma: no cover - dependency is installed in the bot container
    psycopg = None
    dict_row = None


POSTGRES_SCHEMES = ("postgres://", "postgresql://")


def is_postgres_url(value: str | None) -> bool:
    return bool(value and value.strip().lower().startswith(POSTGRES_SCHEMES))


def replace_qmark_placeholders(query: str) -> str:
    return query.replace("?", "%s")


class RowProxy(Mapping[str, Any]):
    def __init__(self, row: Any) -> None:
        if isinstance(row, RowProxy):
            self._data = dict(row)
        elif isinstance(row, sqlite3.Row):
            self._data = {key: row[key] for key in row.keys()}
        elif isinstance(row, Mapping):
            self._data = dict(row)
        else:
            raise TypeError(f"Unsupported row type: {type(row)!r}")

    def __getitem__(self, key: Any) -> Any:
        if isinstance(key, int):
            return list(self._data.values())[key]
        return self._data[key]

    def __iter__(self) -> Iterator[str]:
        return iter(self._data)

    def __len__(self) -> int:
        return len(self._data)

    def get(self, key: str, default: Any = None) -> Any:
        return self._data.get(key, default)


class CursorProxy:
    def __init__(self, cursor: Any) -> None:
        self._cursor = cursor

    def fetchone(self) -> RowProxy | None:
        row = self._cursor.fetchone()
        return RowProxy(row) if row is not None else None

    def fetchall(self) -> list[RowProxy]:
        return [RowProxy(row) for row in self._cursor.fetchall()]

    @property
    def rowcount(self) -> int:
        return getattr(self._cursor, "rowcount", -1)

    @property
    def lastrowid(self) -> Any:
        return getattr(self._cursor, "lastrowid", None)


class ConnectionProxy:
    def __init__(self, backend: str, connection: Any) -> None:
        self.backend = backend
        self._connection = connection

    def __enter__(self) -> "ConnectionProxy":
        return self

    def __exit__(self, exc_type, exc, tb) -> bool:
        try:
            if exc_type is None:
                self.commit()
            else:
                self.rollback()
        finally:
            self.close()
        return False

    def execute(self, query: str, params: Any = None) -> CursorProxy:
        prepared_query = self._prepare_query(query)
        if params is None:
            cursor = self._connection.execute(prepared_query)
        else:
            cursor = self._connection.execute(prepared_query, params)
        return CursorProxy(cursor)

    def commit(self) -> None:
        self._connection.commit()

    def rollback(self) -> None:
        self._connection.rollback()

    def close(self) -> None:
        self._connection.close()

    def _prepare_query(self, query: str) -> str:
        if self.backend != "postgres":
            return query

        normalized = query.rstrip().rstrip(";")
        if re.match(r"^\s*INSERT\s+OR\s+IGNORE\s+INTO\s+", normalized, re.IGNORECASE):
            normalized = re.sub(
                r"^\s*INSERT\s+OR\s+IGNORE\s+INTO\s+",
                "INSERT INTO ",
                normalized,
                count=1,
                flags=re.IGNORECASE,
            )
            normalized = replace_qmark_placeholders(normalized)
            return f"{normalized} ON CONFLICT DO NOTHING"

        return replace_qmark_placeholders(normalized)


def connect_database(database_url: str | None, sqlite_path: Path) -> ConnectionProxy:
    if is_postgres_url(database_url):
        if psycopg is None or dict_row is None:
            raise RuntimeError("PostgreSQL support requires psycopg")
        connection = psycopg.connect(database_url, row_factory=dict_row)
        return ConnectionProxy("postgres", connection)

    connection = sqlite3.connect(sqlite_path)
    connection.row_factory = sqlite3.Row
    return ConnectionProxy("sqlite", connection)
