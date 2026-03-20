#!/usr/bin/env python3
"""Captura el precio de Brent desde Google Finance y lo guarda en SQLite."""

from __future__ import annotations

import argparse
import re
import sqlite3
import urllib.request
from datetime import datetime, timezone
from pathlib import Path

DEFAULT_URL = "https://www.google.com/finance/quote/BZW00:NYMEX"
DEFAULT_SYMBOL = "BZW00:NYMEX"
PRICE_REGEX = re.compile(r'class="YMlKec fxKbKc">([^<]+)</div>')


def fetch_html(url: str) -> str:
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": (
                "Mozilla/5.0 (X11; Linux x86_64) "
                "AppleWebKit/537.36 (KHTML, like Gecko) "
                "Chrome/123.0.0.0 Safari/537.36"
            ),
            "Accept-Language": "es-ES,es;q=0.9,en;q=0.8",
        },
    )
    with urllib.request.urlopen(req, timeout=20) as response:
        return response.read().decode("utf-8", errors="ignore")


def parse_price(html: str) -> float:
    match = PRICE_REGEX.search(html)
    if not match:
        raise RuntimeError(
            "No se pudo localizar el precio con el selector esperado. "
            "Google pudo cambiar la estructura de la página."
        )

    raw = match.group(1).strip().replace("$", "").replace(",", "")
    return float(raw)


def ensure_db(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS brent_quotes (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            symbol TEXT NOT NULL,
            source_url TEXT NOT NULL,
            price_usd REAL NOT NULL,
            captured_at_utc TEXT NOT NULL
        )
        """
    )
    conn.commit()


def save_quote(conn: sqlite3.Connection, symbol: str, source_url: str, price: float) -> str:
    captured_at = datetime.now(timezone.utc).isoformat()
    conn.execute(
        """
        INSERT INTO brent_quotes (symbol, source_url, price_usd, captured_at_utc)
        VALUES (?, ?, ?, ?)
        """,
        (symbol, source_url, price, captured_at),
    )
    conn.commit()
    return captured_at


def print_last_quotes(conn: sqlite3.Connection, limit: int = 5) -> None:
    rows = conn.execute(
        """
        SELECT id, symbol, price_usd, captured_at_utc
        FROM brent_quotes
        ORDER BY id DESC
        LIMIT ?
        """,
        (limit,),
    ).fetchall()

    if not rows:
        print("(Sin filas aún)")
        return

    print("\nÚltimas capturas:")
    for row in rows:
        quote_id, symbol, price, captured = row
        print(f"- #{quote_id} | {symbol} | ${price:.2f} | {captured}")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--db", default="scripts/brent_capture/brent_prices.db", help="Ruta del SQLite")
    parser.add_argument("--url", default=DEFAULT_URL, help="URL origen")
    parser.add_argument("--symbol", default=DEFAULT_SYMBOL, help="Símbolo a guardar")
    parser.add_argument(
        "--demo-price",
        type=float,
        help="Inserta un precio fijo sin consultar Google (útil para demo/previsualización).",
    )
    args = parser.parse_args()

    db_path = Path(args.db)
    db_path.parent.mkdir(parents=True, exist_ok=True)

    with sqlite3.connect(db_path) as conn:
        ensure_db(conn)

        if args.demo_price is not None:
            price = args.demo_price
            source_url = "DEMO"
        else:
            html = fetch_html(args.url)
            price = parse_price(html)
            source_url = args.url

        captured_at = save_quote(conn, args.symbol, source_url, price)
        print(f"OK: guardado ${price:.2f} para {args.symbol} en {db_path} ({captured_at})")
        print_last_quotes(conn)

    return 0


if __name__ == "__main__":
    raise SystemExit(main())
