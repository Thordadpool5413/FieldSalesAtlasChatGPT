import type { Airport } from '../../src/data';
import type { Evidence, Matrix, Point } from './types';

export type RoadPlanningResult={available:boolean;checkedAt:string;limitation:string;
  network:{points:Point[];matrix:Matrix}|null;evidence:Evidence[];
  gateways:Array<{airport:Airport;airMiles:number;planningRoadMiles:number;planningDriveMinutes:number;
    firstLegMiles:number;firstLegMinutes:number;pathIds:string[]}>};
