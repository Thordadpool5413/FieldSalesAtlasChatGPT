import importlib.util
import json
import os
from pathlib import Path
import socket
import sqlite3
import subprocess
import tempfile
import time
import unittest
from unittest.mock import patch
import urllib.request

ROOT = Path(__file__).resolve().parent.parent
HELPER = ROOT / 'scripts/stop-for-migration.py'
spec = importlib.util.spec_from_file_location('atlas_stop_helper', HELPER)
helper = importlib.util.module_from_spec(spec)
spec.loader.exec_module(helper)


def free_port():
    with socket.socket() as server:
        server.bind(('127.0.0.1', 0))
        return server.getsockname()[1]


class StopTests(unittest.TestCase):
    def test_missing_ipv6_proc_file(self):
        original = Path.exists
        with patch.object(Path, 'exists', lambda path: False if str(path) == '/proc/net/tcp6' else original(path)):
            self.assertIsInstance(helper.listener_inodes([8080]), dict)

    def test_does_not_stop_unrecognized_node_listener(self):
        web, api = free_port(), free_port()
        process = subprocess.Popen(['node', '-e', 'require("node:net").createServer().listen(Number(process.argv[1]),"127.0.0.1")', str(web)], cwd=ROOT)
        try:
            for _ in range(40):
                if helper.listening(web):
                    break
                time.sleep(.1)
            result = subprocess.run(['python3', str(HELPER), '--root', str(ROOT), '--web-port', str(web), '--api-port', str(api), '--timeout', '2'], capture_output=True, text=True, timeout=8)
            self.assertEqual(result.returncode, 1, result.stdout + result.stderr)
            self.assertEqual(json.loads(result.stdout)['signalled'], [])
            self.assertIsNone(process.poll())
            self.assertTrue(helper.listening(web))
        finally:
            process.terminate()
            process.wait(timeout=5)

    def test_stops_real_atlas_pair_and_preserves_saved_records(self):
        web, api = free_port(), free_port()
        with tempfile.TemporaryDirectory(prefix='atlas-stop-persistence-') as data, tempfile.TemporaryFile(mode='w+') as log:
            env = {**os.environ, 'PORT': str(web), 'ATLAS_API_PORT': str(api), 'ATLAS_DATA_DIR': data, 'ATLAS_DATABASE_ENGINE': 'sqlite'}
            process = subprocess.Popen(['node', 'scripts/start-local.mjs', '--preview'], cwd=ROOT, env=env, stdout=log, stderr=log)
            def request(path, body=None):
                raw = None if body is None else json.dumps(body).encode()
                req = urllib.request.Request('http://127.0.0.1:' + str(web) + path, data=raw, headers={'Content-Type': 'application/json'})
                with urllib.request.urlopen(req, timeout=2) as response:
                    return json.load(response)
            try:
                for _ in range(100):
                    self.assertIsNone(process.poll())
                    try:
                        if request('/api/_healthcheck')['status'] == 'ready':
                            break
                    except (OSError, ValueError):
                        time.sleep(.1)
                key = request('/api/guest/create', {})['workspaceKey']
                request('/api/managers?workspaceKey=' + key, {'name': 'Shutdown persistence fixture', 'baseState': 'FL'})
                result = subprocess.run(['python3', str(HELPER)], cwd=ROOT, env=env, capture_output=True, text=True, timeout=20)
                self.assertEqual(result.returncode, 0, result.stdout + result.stderr)
                report = json.loads(result.stdout)
                self.assertEqual(report['state'], 'stopped')
                self.assertTrue(report['signalled'])
                process.wait(timeout=8)
                self.assertFalse(helper.listening(web))
                self.assertFalse(helper.listening(api))
                with sqlite3.connect('file:' + data + '/atlas.sqlite?mode=ro', uri=True) as db:
                    self.assertEqual(db.execute("SELECT count(*) FROM records WHERE json_extract(document,'$.name')='Shutdown persistence fixture'").fetchone()[0], 1)
            except Exception:
                log.seek(0)
                print(log.read()[-3000:])
                raise
            finally:
                if process.poll() is None:
                    process.terminate()
                    process.wait(timeout=10)


if __name__ == '__main__':
    unittest.main(verbosity=2)
