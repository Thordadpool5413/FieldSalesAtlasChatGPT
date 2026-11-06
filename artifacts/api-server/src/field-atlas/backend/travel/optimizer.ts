import { spawn } from 'node:child_process';
import { resolve } from 'node:path';
import { workspacePath } from '../runtime/paths';

export type OptimizerInput = {
  jobs: Array<{ id: string; service: number; windows: number[][]; allowed: number[]; priority: number }>;
  vehicles: Array<{ start: number; end: number; trainerId: string; date: string }>;
  durations: Array<Array<number | null>>; horizon: number; breakMinutes: number;
};
export type OptimizerSolution = { objective: 'balanced' | 'home' | 'cost'; routes: Array<{ vehicle: number; visits: Array<{ node: number; at: number }>; end: number }>; unplaced: string[] };

export function validateSolution(input: OptimizerInput, solution: OptimizerSolution) {
  if (!['balanced', 'home', 'cost'].includes(solution.objective)) throw new Error('Invalid optimizer objective.');
  const seen = new Set<number>(), vehicles = new Set<number>();
  for (const route of solution.routes) {
    const vehicle = input.vehicles[route.vehicle];
    if (!vehicle || vehicles.has(route.vehicle)) throw new Error('Optimizer returned an invalid vehicle.');
    vehicles.add(route.vehicle);
    let previous = 0, available = vehicle.start;
    for (const visit of route.visits) {
      const job = input.jobs[visit.node - 1], transfer = input.durations[previous]?.[visit.node];
      if (!job || seen.has(visit.node) || !job.allowed.includes(route.vehicle) || transfer === null || transfer === undefined || !Number.isFinite(visit.at)) throw new Error('Optimizer returned an invalid visit.');
      if (visit.at < available + transfer || !job.windows.some(([start, end]) => visit.at >= start && visit.at <= end)) throw new Error('Optimizer violated a time window.');
      seen.add(visit.node); previous = visit.node;
      available = visit.at + job.service + input.breakMinutes;
    }
    const back = input.durations[previous]?.[0];
    const withoutFinalBreak = available - (route.visits.length ? input.breakMinutes : 0);
    if (back === null || back === undefined || route.end < withoutFinalBreak + back || route.end > vehicle.end) throw new Error('Optimizer violated the return window.');
  }
  const actual = input.jobs.filter((_, i) => !seen.has(i + 1)).map(job => job.id).sort();
  if (JSON.stringify(actual) !== JSON.stringify([...solution.unplaced].sort())) throw new Error('Optimizer omitted required-job accounting.');
}
let running = 0;
export async function optimize(input: OptimizerInput): Promise<{ engine: string; solutions: OptimizerSolution[] }> {
  if (running >= 2) throw new Error('Both planning slots are busy. Try again in a few seconds.');
  running++;
  try {
  const root = workspacePath(process.env.ATLAS_RUNTIME_ROOT || 'artifacts/api-server/src/field-atlas');
  const python = process.env.ATLAS_PYTHON || 'python3';
  const pythonUserBase = process.env.ATLAS_PYTHONUSERBASE || resolve(process.env.HOME || '.', '.local');
  return await new Promise<{ engine: string; solutions: OptimizerSolution[] }>((resolveResult, reject) => {
    const child = spawn(python, [resolve(root, 'services/optimizer/solve.py')], {
      stdio: ['pipe', 'pipe', 'pipe'],
      env: { ...process.env, PYTHONUSERBASE: pythonUserBase },
    });
    let output = '', errors = '';
    const timer = setTimeout(() => { child.kill('SIGKILL'); reject(new Error('Optimization exceeded its time budget.')); }, 15000);
    child.stdout.on('data', chunk => { output += chunk.toString(); if (output.length > 1_000_000) child.kill('SIGKILL'); });
    child.stderr.on('data', chunk => { if (errors.length < 8000) errors += chunk.toString(); });
    child.on('error', () => { clearTimeout(timer); reject(new Error('Optimizer runtime unavailable. Configure Python 3.12 and install the pinned optimizer requirements.')); });
    child.on('close', code => {
      clearTimeout(timer);
      if (code !== 0) { reject(new Error(errors.includes('ModuleNotFoundError') ? 'Optimizer dependencies are missing. Install services/optimizer/requirements.lock.txt.' : 'Optimization failed. Review the planning inputs.')); return; }
      try {
        const result = JSON.parse(output) as { engine: string; solutions: OptimizerSolution[] };
        if (!Array.isArray(result.solutions) || result.solutions.length !== 3) throw new Error('Invalid optimizer response.');
        for (const solution of result.solutions) validateSolution(input, solution);
        resolveResult(result);
      } catch { reject(new Error('Optimizer result failed independent feasibility validation.')); }
    });
    child.stdin.on('error', () => undefined);
    child.stdin.end(JSON.stringify(input));
  });
  } finally { running--; }
}
