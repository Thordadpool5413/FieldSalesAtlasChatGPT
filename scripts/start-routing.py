"""Restart an already validated local graph after environment restoration."""
import json
import os
from pathlib import Path
import subprocess
import urllib.parse
import urllib.request
import time


def main():
    file = Path(os.environ.get('ATLAS_DATA_DIR', 'data')).resolve() / 'routing/service.json'
    if not file.exists():
        raise ValueError('No validated graph is installed. Run npm run setup:routing first.')
    graph = json.loads(file.read_text())
    if graph.get('version') != 1 or not (Path(graph['graphPath']) / 'region.osrm.partition').exists():
        raise ValueError('Installed graph files are missing or unrecognized. Rebuild the graph before activation.')
    endpoint = urllib.parse.urlparse(graph['endpoint'])
    if endpoint.hostname != '127.0.0.1' or endpoint.scheme != 'http':
        raise ValueError('This restart helper operates only on the local maintained graph.')
    environment = dict(os.environ)
    for name in ('DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH'):
        environment.pop(name, None)
    command = ['docker', '--host=unix:///var/run/docker.sock']
    existing = subprocess.run(command + ['container', 'inspect', graph['container']], stdout=subprocess.DEVNULL, stderr=subprocess.DEVNULL, env=environment)
    if existing.returncode == 0:
        subprocess.run(command + ['start', graph['container']], check=True, env=environment)
    else:
        subprocess.run(command + ['run', '-d', '--name', graph['container'], '--restart', 'unless-stopped', '-p', f'127.0.0.1:{endpoint.port}:5000',
                                 '--mount', f'type=bind,src={graph["graphPath"]},dst=/data,readonly', graph['image'],
                                 'osrm-routed', '--algorithm', 'mld', '/data/region.osrm', '--max-table-size', '100'], check=True, env=environment)
    local = urllib.request.build_opener(urllib.request.ProxyHandler({}))
    for attempt in range(30):
        try:
            with local.open(graph['endpoint'] + 'table/v1/driving/-81.3792,28.5383;-81.3774,28.5400?annotations=duration,distance', timeout=3) as response:
                result = json.load(response)
            if result.get('code') == 'Ok' and result['durations'][0][1] is not None:
                print('Installed regional road graph is serving a validated local route.')
                return
            raise ValueError('The restored service returned no usable route.')
        except Exception:
            if attempt == 29:
                raise ValueError('The restored graph did not pass the local route probe.')
            time.sleep(1)


if __name__ == '__main__':
    main()
