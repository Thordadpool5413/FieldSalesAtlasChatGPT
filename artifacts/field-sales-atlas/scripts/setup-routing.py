"""Install a versioned regional OSRM graph; activate it only after a real table probe.
Uses the platform's configured HTTP proxy/TLS trust. No public demo dependency.
"""
import argparse
import datetime
import hashlib
import json
import os
from pathlib import Path
import re
import subprocess
import urllib.request
import uuid
import socket

ROOT = Path(__file__).resolve().parents[1]
IMAGE = 'ghcr.io/project-osrm/osrm-backend@sha256:855614a38f464b0558a2ad6eaa7cb8c139f39887da9b38b485ce453c6e6e6124'


def docker(*args):
    # Address only the managed local daemon; preserve registry auth and proxies.
    environment = dict(os.environ)
    for name in ('DOCKER_HOST', 'DOCKER_CONTEXT', 'DOCKER_TLS', 'DOCKER_TLS_VERIFY', 'DOCKER_CERT_PATH'):
        environment.pop(name, None)
    subprocess.run(['docker', '--host=unix:///var/run/docker.sock', *map(str, args)], check=True, env=environment)


def download(url, destination, limit):
    total = 0
    with urllib.request.urlopen(url, timeout=45) as response, destination.open('wb') as output:
        modified = response.headers.get('Last-Modified', '')
        while block := response.read(1024 * 1024):
            total += len(block)
            if total > limit:
                raise ValueError('Extract exceeds the configured regional size limit.')
            output.write(block)
    return modified


def polygons(path):
    lines = path.read_text().splitlines()[1:]
    result, ring, hole = [], None, False
    for line in lines:
        value = line.strip()
        if not value:
            continue
        if value == 'END':
            if ring:
                if hole and result:
                    result[-1]['holes'].append(ring)
                else:
                    result.append({'outer': ring, 'holes': []})
                ring = None
            continue
        fields = value.split()
        if len(fields) == 1:
            ring, hole = [], value.startswith('!')
        elif ring is not None:
            ring.append([float(fields[0]), float(fields[1])])
    if not result or any(len(part['outer']) < 4 for part in result):
        raise ValueError('The published regional coverage polygon could not be validated.')
    return result


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--region', default='southeast', choices=['southeast', 'florida'])
    parser.add_argument('--port', type=int, default=5000)
    parser.add_argument('--prepare-tools-only', action='store_true')
    args = parser.parse_args()
    if not 1024 <= args.port <= 65535:
        raise ValueError('Choose an unprivileged local port.')
    docker('info', '--format', '{{.ServerVersion}}')
    docker('pull', IMAGE)
    docker('build', '--secret', 'id=proxy_ca,src=' + os.environ.get('CODEX_PROXY_CERT', '/etc/ssl/certs/ca-certificates.crt'),
           '-f', ROOT / 'services/routing/Dockerfile.tools', '-t', 'field-atlas-routing-tools:1', ROOT / 'services/routing')
    if args.prepare_tools_only:
        docker('run', '--rm', 'field-atlas-routing-tools:1', '--version')
        return
    base = Path(os.environ.get('ATLAS_DATA_DIR', ROOT / 'data')).resolve() / 'routing'
    base.mkdir(parents=True, exist_ok=True)
    with socket.socket() as port_check:
        try:
            port_check.bind(('127.0.0.1', args.port))
        except OSError:
            if not (base / 'service.json').exists():
                raise ValueError('The requested port is already in use. Choose another --port; no existing service was changed.')
            # A graph refresh gets a new port so the active service stays available until validation.
            port_check.bind(('127.0.0.1', 0)); args.port = port_check.getsockname()[1]
    build = base / ('graph-' + uuid.uuid4().hex)
    build.mkdir()
    regions = json.loads((ROOT / 'services/routing/regions.json').read_text())[args.region]
    sources, dates, coverage, packages = [], [], [], []
    status = {'state': 'preparing', 'region': args.region, 'attemptedAt': datetime.datetime.now(datetime.timezone.utc).isoformat()}
    try:
        for region in regions:
            url = f'https://download.geofabrik.de/north-america/us/{region}-latest.osm.pbf'
            package = build / (region + '.osm.pbf')
            checksum_file = build / (region + '.md5')
            dates.append(download(url, package, 2_500_000_000))
            download(url + '.md5', checksum_file, 2000)
            expected = checksum_file.read_text().strip().split()[0]
            if not re.fullmatch('[a-f0-9]{32}', expected) or hashlib.file_digest(package.open('rb'), 'md5').hexdigest() != expected:
                raise ValueError('Official extract checksum mismatch.')
            polygon = build / (region + '.poly')
            download(f'https://download.geofabrik.de/north-america/us/{region}.poly', polygon, 5_000_000)
            coverage.extend(polygons(polygon)); sources.append(url); packages.append(package.name)
        mount = f'type=bind,src={build},dst=/data'
        docker('run', '--rm', '--mount', mount, 'field-atlas-routing-tools:1', 'merge', *['/data/' + name for name in packages], '-o', '/data/region.osm.pbf', '--overwrite')
        checksum = hashlib.file_digest((build / 'region.osm.pbf').open('rb'), 'sha256').hexdigest()
        for command in [
            ['osrm-extract', '-p', '/opt/car.lua', '/data/region.osm.pbf'],
            ['osrm-partition', '/data/region.osrm'], ['osrm-customize', '/data/region.osrm'],
        ]:
            docker('run', '--rm', '--mount', mount, IMAGE, *command)
        # Keep the previous active graph/service until the new graph has passed a probe.
        name = 'field-atlas-routing-' + uuid.uuid4().hex[:10]
        docker('run', '-d', '--name', name, '--restart', 'unless-stopped', '-p', f'127.0.0.1:{args.port}:5000', '--mount', mount + ',readonly',
               IMAGE, 'osrm-routed', '--algorithm', 'mld', '/data/region.osrm', '--max-table-size', '100')
        import time
        endpoint = f'http://127.0.0.1:{args.port}/'
        for attempt in range(30):
            try:
                # Loopback is the local service; do not send this probe through the Internet proxy.
                local = urllib.request.build_opener(urllib.request.ProxyHandler({}))
                with local.open(endpoint + 'table/v1/driving/-81.3792,28.5383;-81.3774,28.5400?annotations=duration,distance', timeout=3) as response:
                    probe = json.load(response)
                if probe.get('code') == 'Ok' and probe['durations'][0][1] is not None:
                    break
                raise ValueError('The local graph returned no usable route for the validation probe.')
            except Exception:
                if attempt == 29:
                    docker('rm', '-f', name)
                    raise ValueError('The new road graph did not pass its local route probe.')
                time.sleep(1)
        manifest = {'version': 1, 'endpoint': endpoint, 'installedAt': datetime.datetime.now(datetime.timezone.utc).isoformat(),
                    'dataDate': '; '.join(sorted(set(dates))), 'sha256': checksum, 'regions': regions, 'sources': sources, 'polygons': coverage, 'image': IMAGE,
                    'graphPath': str(build), 'container': name}
        temporary = base / 'service.next.json'; temporary.write_text(json.dumps(manifest)); os.replace(temporary, base / 'service.json')
        status.update({'state': 'validated', 'sha256': checksum, 'container': name})
    except Exception as failure:
        status.update({'state': 'unavailable', 'error': str(failure)[:300]})
        raise
    finally:
        (base / 'setup-status.json').write_text(json.dumps(status, indent=2))
    print(json.dumps({key: value for key, value in manifest.items() if key != 'polygons'}, indent=2))


if __name__ == '__main__':
    main()
