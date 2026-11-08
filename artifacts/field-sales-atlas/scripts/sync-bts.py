"""Fetch recent BTS monthly files from their official host and import atomically."""
import argparse
import datetime
import json
import os
from pathlib import Path
import subprocess
import sys
import tempfile
import sqlite3
import fcntl
import urllib.error
import urllib.request


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--months', type=int, default=3)
    parser.add_argument('--lag', type=int, default=3, help='Months behind current month to allow for publication lag')
    args = parser.parse_args()
    if not 1 <= args.months <= 12 or not 2 <= args.lag <= 12:
        raise ValueError('Use 1–12 months and a publication lag of 2–12 months.')
    base = Path(os.environ.get('ATLAS_DATA_DIR', 'data')).resolve(); base.mkdir(parents=True, exist_ok=True)
    today = datetime.date.today(); serial = today.year * 12 + today.month - 1 - args.lag
    status = {'attemptedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(), 'state': 'running', 'periods': []}
    imported = 0
    installed = {}
    if (base / 'bts.sqlite').exists():
        with sqlite3.connect('file:' + str(base / 'bts.sqlite') + '?mode=ro', uri=True) as connection:
            for period, url, checksum, stamp, rows in connection.execute('SELECT period, source_url, sha256, imported_at, rows FROM datasets'):
                count = connection.execute('SELECT count(*) FROM flights WHERE period=?', (period,)).fetchone()[0]
                if rows > 0 and count == rows:
                    installed[period] = {'period': period, 'sourceUrl': url, 'sha256': checksum, 'importedAt': stamp, 'rows': rows, 'state': 'already-installed'}
    for offset in range(args.months):
        year, month = divmod(serial - offset, 12); month += 1
        period = f'{year:04d}-{month:02d}'
        if period in installed:
            status['periods'].append(installed[period]); imported += 1
            continue
        row = {'period': period, 'state': 'unavailable', 'attempts': []}
        with tempfile.TemporaryDirectory(dir=base) as temp:
            package = Path(temp) / 'bts.zip'
            # BTS has used both spellings; accept a successful, schema-validated official file only.
            names = [f'On_Time_Reporting_Carrier_On_Time_Performance_(1987_present)_{year}_{month}.zip',
                     f'On_Time_Reporting_Carrier_On_Time_Performance_1987_present_{year}_{month}.zip']
            for name in names:
                url = 'https://transtats.bts.gov/PREZIP/' + name
                row['sourceUrl'] = url
                try:
                    with urllib.request.urlopen(url, timeout=45) as response, package.open('wb') as out:
                        size = 0
                        while chunk := response.read(1024 * 1024):
                            size += len(chunk)
                            if size > 600_000_000:
                                raise ValueError('BTS monthly file exceeds the supported size.')
                            out.write(chunk)
                    result = subprocess.run([sys.executable, str(Path(__file__).with_name('import-bts.py')), '--file', str(package), '--period', period, '--source-url', url,
                                             '--output', str(base / 'bts.sqlite')], capture_output=True, text=True)
                    if result.returncode:
                        raise ValueError('BTS file failed month/schema/record validation. Existing history was preserved.')
                    row.update(json.loads(result.stdout)); row['state'] = 'imported'; row.pop('error', None); imported += 1
                    break
                except urllib.error.HTTPError as failure:
                    row['error'] = 'Official download returned HTTP ' + str(failure.code)
                    row['attempts'].append({'sourceUrl': url, 'error': row['error']})
                    if failure.code != 404:
                        break
                except Exception as failure:
                    row['error'] = str(failure)[:250]
                    break
        status['periods'].append(row)
        if row['state'] != 'imported' and 'HTTP 403' in row.get('error', ''):
            break
    status['state'] = 'validated' if imported == args.months else 'partial' if imported else 'unavailable'
    temporary_status = base / 'bts-sync-status.partial.json'
    temporary_status.write_text(json.dumps(status, indent=2))
    temporary_status.replace(base / 'bts-sync-status.json')
    print(json.dumps(status, indent=2))
    return 0 if imported == args.months else 1


if __name__ == '__main__':
    base = Path(os.environ.get('ATLAS_DATA_DIR', 'data')).resolve(); base.mkdir(parents=True, exist_ok=True)
    with (base / 'bts-sync.lock').open('a') as lock:
        try:
            fcntl.flock(lock, fcntl.LOCK_EX | fcntl.LOCK_NB)
        except BlockingIOError:
            raise SystemExit('Another BTS synchronization is already running; existing history was preserved.')
        sys.exit(main())
