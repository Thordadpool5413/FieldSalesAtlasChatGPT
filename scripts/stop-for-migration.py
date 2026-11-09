"""Gracefully stop verified Atlas development listeners; never edit Git or data.

Run from the Replit project root. This does not run a migration or publish anything.
"""
import argparse
import json
import os
from pathlib import Path
import signal
import socket
import time


def listening(port):
    try:
        with socket.create_connection(('127.0.0.1', port), timeout=0.4):
            return True
    except ConnectionRefusedError:
        return False
    except (TimeoutError, OSError):
        # An uncertain probe cannot establish that a migration port is free.
        return True


def listener_inodes(ports):
    result = {}
    for family in ('tcp', 'tcp6'):
        path = Path('/proc/net') / family
        if not path.exists():
            continue
        for line in path.read_text().splitlines()[1:]:
            fields = line.split()
            if len(fields) < 10:
                continue
            port = int(fields[1].rsplit(':', 1)[1], 16)
            if fields[3] == '0A' and port in ports:
                result[fields[9]] = port
    return result


def snapshot(pid, profiles):
    process = Path('/proc') / str(pid)
    try:
        if process.stat().st_uid != os.getuid():
            return None
        executable = Path(os.readlink(process / 'exe'))
        if executable.name not in ('node', 'nodejs'):
            return None
        cwd = Path(os.readlink(process / 'cwd')).resolve()
        command = (process / 'cmdline').read_bytes()
        args = command.decode(errors='replace').split('\0')[1:]
        skip = False
        entry = None
        for arg in args:
            if skip:
                skip = False
                continue
            if arg in ('-e', '--eval', '-p', '--print', '-i', '--interactive', '-c', '--check'):
                return None
            if arg in ('--import', '--require', '-r', '--loader', '--experimental-loader'):
                skip = True
                continue
            if arg.startswith('-'):
                continue
            if arg:
                entry = (cwd / arg).resolve()
                break
        role = profiles.get((cwd, entry))
        if not role:
            return None
        stat = (process / 'stat').read_text().rsplit(')', 1)[1].split()
        return {'pid': pid, 'role': role, 'parent': int(stat[1]),
                'identity': (stat[19], str(cwd), str(executable), command)}
    except (OSError, ValueError, IndexError):
        return None


def stop_atlas(root, ports, timeout):
    if not (root / 'pnpm-workspace.yaml').is_file() or not (root / 'scripts/start-local.mjs').is_file():
        raise RuntimeError('Run this helper from the Field Sales Atlas workspace root.')
    ui = root / 'artifacts/field-sales-atlas'
    api = root / 'artifacts/api-server'
    profiles = {(root, (root / 'scripts/start-local.mjs').resolve()): 'Atlas runner'}
    for cwd in (root, ui):
        profiles[(cwd, (ui / 'node_modules/vite/bin/vite.js').resolve())] = 'Atlas web'
    for cwd in (root, api):
        profiles[(cwd, (api / 'dist/index.mjs').resolve())] = 'Atlas API'
    if not hasattr(os, 'pidfd_open') or not hasattr(signal, 'pidfd_send_signal'):
        raise RuntimeError('This Python/kernel lacks safe process-handle signaling. No processes were stopped.')
    inodes = listener_inodes(ports)
    candidates = {}
    for process in Path('/proc').glob('[0-9]*'):
        item = snapshot(int(process.name), profiles)
        if not item:
            continue
        try:
            owns_port = False
            for fd in (process / 'fd').iterdir():
                try:
                    target = os.readlink(fd)
                    if target.startswith('socket:[') and target[8:-1] in inodes:
                        owns_port = True
                        break
                except OSError:
                    continue
            if owns_port:
                candidates[item['pid']] = item
        except OSError:
            continue
    # Stop a verified Atlas parent as well so its own shutdown handler manages
    # its children. Never signal a Shell, Agent, Replit supervisor or foreign app.
    for item in list(candidates.values()):
        parent = snapshot(item['parent'], profiles)
        if parent and parent['role'] == 'Atlas runner':
            candidates[parent['pid']] = parent
    signalled = []
    for item in sorted(candidates.values(), key=lambda row: row['role'] != 'Atlas runner'):
        handle = None
        try:
            handle = os.pidfd_open(item['pid'])
            current = snapshot(item['pid'], profiles)
            if not current or current['identity'] != item['identity']:
                continue
            signal.pidfd_send_signal(handle, signal.SIGTERM)
            signalled.append({'pid': item['pid'], 'role': item['role']})
        except ProcessLookupError:
            pass
        finally:
            if handle is not None:
                os.close(handle)
    deadline = time.monotonic() + timeout
    quiet_since = None
    while time.monotonic() < deadline:
        active = [port for port in ports if listening(port)]
        if not active:
            quiet_since = quiet_since or time.monotonic()
            if time.monotonic() - quiet_since >= 1:
                return {'state': 'stopped', 'ports': ports, 'signalled': signalled,
                        'next': 'Both application ports are free. You can now run the migration command.'}
        else:
            quiet_since = None
        time.sleep(0.2)
    return {'state': 'still-running', 'portsStillInUse': [port for port in ports if listening(port)],
            'signalled': signalled,
            'next': 'A launcher may be restarting the app, or a port belongs to an unrecognized process. Stop Run/Agent tasks. No unknown process was signalled; do not bypass the migration guard.'}


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--root', default=os.getcwd())
    parser.add_argument('--web-port', type=int, default=int(os.environ.get('PORT', '24397')))
    parser.add_argument('--api-port', type=int, default=int(os.environ.get('ATLAS_API_PORT', '8080')))
    parser.add_argument('--timeout', type=float, default=12)
    args = parser.parse_args()
    ports = [args.web_port, args.api_port]
    if len(set(ports)) != 2 or any(not 0 < port <= 65535 for port in ports) or not 1 <= args.timeout <= 30:
        parser.error('Provide two distinct valid ports and a timeout between 1 and 30 seconds.')
    try:
        result = stop_atlas(Path(args.root).resolve(), ports, args.timeout)
        print(json.dumps(result, indent=2))
        return 0 if result['state'] == 'stopped' else 1
    except (OSError, RuntimeError):
        print(json.dumps({'state': 'unable-to-stop-safely', 'message': 'The helper could not verify or signal the Atlas processes. No unknown processes were stopped. Run from the project root and keep Run/Agent stopped.'}, indent=2))
        return 1


if __name__ == '__main__':
    raise SystemExit(main())
