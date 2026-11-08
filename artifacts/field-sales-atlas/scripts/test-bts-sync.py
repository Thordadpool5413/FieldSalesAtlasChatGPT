"""Regression checks for alternate official filenames and repeat-safe imports."""
import contextlib
import datetime
import importlib.util
import io
import json
import os
from pathlib import Path
import sqlite3
import sys
import tempfile
import types
import unittest
import urllib.error
from unittest.mock import patch

spec = importlib.util.spec_from_file_location('sync_bts', Path(__file__).with_name('sync-bts.py'))
sync = importlib.util.module_from_spec(spec)
spec.loader.exec_module(sync)

class SyncTests(unittest.TestCase):
    def run_in(self, directory):
        with patch.dict(os.environ, {'ATLAS_DATA_DIR': directory}), patch.object(sys, 'argv', ['sync-bts.py', '--months', '1', '--lag', '3']), contextlib.redirect_stdout(io.StringIO()):
            return sync.main()

    def test_alternate_filename_success_does_not_keep_current_error(self):
        with tempfile.TemporaryDirectory() as directory:
            unavailable = urllib.error.HTTPError('https://transtats.bts.gov/', 404, 'missing', {}, None)
            imported = types.SimpleNamespace(returncode=0, stdout=json.dumps({'rows': 100, 'sha256': 'a' * 64}))
            with patch.object(sync.urllib.request, 'urlopen', side_effect=[unavailable, io.BytesIO(b'fixture')]), patch.object(sync.subprocess, 'run', return_value=imported):
                self.assertEqual(self.run_in(directory), 0)
            status = json.loads((Path(directory) / 'bts-sync-status.json').read_text())
            self.assertEqual(status['state'], 'validated')
            self.assertNotIn('error', status['periods'][0])
            self.assertEqual(len(status['periods'][0]['attempts']), 1)

    def test_validated_installed_month_does_not_download_again(self):
        today = datetime.date.today(); year, month = divmod(today.year * 12 + today.month - 1 - 3, 12)
        period = f'{year:04d}-{month + 1:02d}'
        with tempfile.TemporaryDirectory() as directory:
            with sqlite3.connect(Path(directory) / 'bts.sqlite') as connection:
                connection.executescript('CREATE TABLE datasets(period,source_url,sha256,imported_at,rows); CREATE TABLE flights(period);')
                connection.execute('INSERT INTO datasets VALUES(?,?,?,?,?)', (period, 'https://transtats.bts.gov/fixture', 'a' * 64, '2026-01-01', 1))
                connection.execute('INSERT INTO flights VALUES(?)', (period,))
            with patch.object(sync.urllib.request, 'urlopen') as download:
                self.assertEqual(self.run_in(directory), 0)
                download.assert_not_called()
            self.assertEqual(json.loads((Path(directory) / 'bts-sync-status.json').read_text())['periods'][0]['state'], 'already-installed')

if __name__ == '__main__':
    unittest.main()
