"""Import one official BTS Reporting Carrier On-Time Performance month atomically.
Only supplied schedule/operational columns are retained; no traveler information.
"""
import argparse
import calendar
import csv
import hashlib
import io
import json
import os
from pathlib import Path
import re
import shutil
import sqlite3
import tempfile
import urllib.parse
import urllib.request
import zipfile


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--file", help="Official downloaded CSV or ZIP")
    parser.add_argument("--source-url", required=True, help="Official BTS download provenance URL")
    parser.add_argument("--period", required=True, help="YYYY-MM")
    parser.add_argument("--output", default=str(Path(os.environ.get("ATLAS_DATA_DIR", "data")) / "bts.sqlite"))
    args = parser.parse_args()
    source = urllib.parse.urlparse(args.source_url)
    if source.scheme != "https" or source.hostname not in ("transtats.bts.gov", "www.transtats.bts.gov") or source.username or source.password:
        raise ValueError("Use an official HTTPS BTS download URL.")
    if not re.fullmatch(r"\d{4}-\d{2}", args.period):
        raise ValueError("Period must be YYYY-MM.")
    year, month = map(int, args.period.split("-"))
    calendar.monthrange(year, month)
    target = Path(args.output).resolve()
    target.parent.mkdir(parents=True, exist_ok=True)
    with tempfile.TemporaryDirectory(dir=target.parent) as temporary:
        package = Path(args.file).resolve() if args.file else Path(temporary) / "download.zip"
        if not args.file:
            with urllib.request.urlopen(args.source_url, timeout=60) as response, package.open("wb") as out:
                total = 0
                while chunk := response.read(1024 * 1024):
                    total += len(chunk)
                    if total > 600_000_000:
                        raise ValueError("BTS download exceeds supported size.")
                    out.write(chunk)
        checksum = hashlib.file_digest(package.open("rb"), "sha256").hexdigest()
        temporary_db = Path(temporary) / "bts.sqlite"
        if target.exists():
            with sqlite3.connect(target) as previous, sqlite3.connect(temporary_db) as copied:
                previous.backup(copied)
        connection = sqlite3.connect(temporary_db)
        connection.executescript("""
          CREATE TABLE IF NOT EXISTS datasets(period TEXT PRIMARY KEY, source_url TEXT, sha256 TEXT, imported_at TEXT, rows INTEGER);
          CREATE TABLE IF NOT EXISTS flights(period TEXT, flight_date TEXT, carrier TEXT, number TEXT, origin TEXT, destination TEXT,
            departure TEXT, cancelled INTEGER, diverted INTEGER, arrival_delay REAL,
            PRIMARY KEY(period, flight_date, carrier, number, origin, destination, departure));
          CREATE INDEX IF NOT EXISTS route_lookup ON flights(origin, destination, carrier, number);
        """)
        archive = zipfile.ZipFile(package) if zipfile.is_zipfile(package) else None
        if archive:
            entries = [entry for entry in archive.infolist() if entry.filename.lower().endswith('.csv') and not entry.is_dir()]
            if len(entries) != 1 or entries[0].file_size > 2_000_000_000:
                raise ValueError("Expected one bounded BTS CSV in the ZIP.")
            stream = archive.open(entries[0])
        else:
            stream = package.open('rb')
        with stream, io.TextIOWrapper(stream, encoding='utf-8-sig', newline='') as text:
            reader = csv.DictReader(text)
            if reader.fieldnames:
                reader.fieldnames = [name.strip().upper() for name in reader.fieldnames]
            required = ['FL_DATE', 'OP_UNIQUE_CARRIER', 'OP_CARRIER_FL_NUM', 'ORIGIN', 'DEST', 'CRS_DEP_TIME', 'CANCELLED', 'DIVERTED', 'ARR_DELAY']
            aliases = {'FL_DATE': 'FLIGHTDATE', 'OP_UNIQUE_CARRIER': 'REPORTING_AIRLINE', 'OP_CARRIER_FL_NUM': 'FLIGHT_NUMBER_REPORTING_AIRLINE', 'CRS_DEP_TIME': 'CRSDEPTIME', 'ARR_DELAY': 'ARRDELAY'}
            fields = reader.fieldnames or []
            columns = {key: key if key in fields else aliases.get(key, key) for key in required}
            if any(value not in fields for value in columns.values()):
                raise ValueError('BTS schema missing required columns.')
            connection.execute('DELETE FROM flights WHERE period=?', (args.period,))
            count, batch = 0, []
            def flag(value):
                if value == '':
                    return None
                number = float(value)
                if number not in (0, 1):
                    raise ValueError('Invalid operational flag.')
                return int(number)
            for row in reader:
                data = {key: (row.get(column) or '').strip() for key, column in columns.items()}
                day = data['FL_DATE'][:10]
                if not re.fullmatch(r'\d{4}-\d{2}-\d{2}', day) or day[:7] != args.period:
                    raise ValueError('A source row is outside the declared month.')
                import datetime
                datetime.date.fromisoformat(day)
                if not re.fullmatch(r'[A-Z0-9]{2}', data['OP_UNIQUE_CARRIER']) or not re.fullmatch(r'\d{1,4}', data['OP_CARRIER_FL_NUM']) or any(not re.fullmatch(r'[A-Z]{3}', data[key]) for key in ['ORIGIN', 'DEST']):
                    raise ValueError('Invalid carrier, flight, or airport identifiers.')
                delay = float(data['ARR_DELAY']) if data['ARR_DELAY'] else None
                if delay is not None and not (-180 <= delay <= 10080):
                    raise ValueError('Arrival delay outside supported bounds.')
                batch.append((args.period, day, data['OP_UNIQUE_CARRIER'], str(int(data['OP_CARRIER_FL_NUM'])), data['ORIGIN'], data['DEST'], data['CRS_DEP_TIME'], flag(data['CANCELLED']), flag(data['DIVERTED']), delay))
                count += 1
                if len(batch) >= 5000:
                    connection.executemany('INSERT INTO flights VALUES (?,?,?,?,?,?,?,?,?,?)', batch)
                    batch = []
            connection.executemany('INSERT INTO flights VALUES (?,?,?,?,?,?,?,?,?,?)', batch)
        if not count:
            raise ValueError('Empty BTS dataset.')
        connection.execute("INSERT OR REPLACE INTO datasets VALUES (?,?,?,strftime('%Y-%m-%dT%H:%M:%SZ','now'),?)", (args.period, args.source_url, checksum, count))
        connection.commit()
        connection.close()
        os.replace(temporary_db, target)
        print(json.dumps({'period': args.period, 'rows': count, 'sha256': checksum, 'sourceUrl': args.source_url}))


if __name__ == '__main__':
    main()
