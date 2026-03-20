# Brent capture (Google Finance -> SQLite)

Script rápido para capturar el precio del Brent desde Google Finance y persistirlo en una base local SQLite.

## Uso

```bash
python3 scripts/brent_capture/brent_capture.py
```

## Previsualización/demo local

Si solo quieres validar el flujo sin depender de red:

```bash
python3 scripts/brent_capture/brent_capture.py --demo-price 106.77
```

## Consultar base

```bash
sqlite3 scripts/brent_capture/brent_prices.db "SELECT id, symbol, price_usd, captured_at_utc FROM brent_quotes ORDER BY id DESC LIMIT 10;"
```
