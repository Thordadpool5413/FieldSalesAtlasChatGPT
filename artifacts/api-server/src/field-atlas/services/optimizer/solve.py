"""Bounded VRPTW worker. JSON in/out; no network access or persisted traveler data."""
import json
import sys
from ortools.constraint_solver import pywrapcp, routing_enums_pb2


def solve(data, objective):
    jobs, vehicles, matrix = data["jobs"], data["vehicles"], data["durations"]
    if not vehicles:
        return {"objective": objective, "routes": [], "unplaced": [j["id"] for j in jobs]}
    count = len(jobs) + 1
    manager = pywrapcp.RoutingIndexManager(count, len(vehicles), [0] * len(vehicles), [0] * len(vehicles))
    routing = pywrapcp.RoutingModel(manager)
    service = [0] + [j["service"] for j in jobs]
    pause = data.get("breakMinutes", 30)

    def duration(a, b):
        x, y = manager.IndexToNode(a), manager.IndexToNode(b)
        travel = matrix[x][y]
        return (10**7 if travel is None else int(travel)) + service[x] + (pause if x and y else 0)

    timing = routing.RegisterTransitCallback(duration)
    routing.AddDimension(timing, 60000, data["horizon"], False, "Time")
    time_dimension = routing.GetDimensionOrDie("Time")

    def cost(a, b):
        value = matrix[manager.IndexToNode(a)][manager.IndexToNode(b)]
        return 10**7 if value is None else int(value)

    routing.SetArcCostEvaluatorOfAllVehicles(routing.RegisterTransitCallback(cost))
    for index, vehicle in enumerate(vehicles):
        time_dimension.CumulVar(routing.Start(index)).SetRange(vehicle["start"], vehicle["start"])
        time_dimension.CumulVar(routing.End(index)).SetRange(vehicle["start"], vehicle["end"])
        routing.SetFixedCostOfVehicle({"balanced": 150, "home": 12000, "cost": 4000}[objective], index)
        routing.AddVariableMinimizedByFinalizer(time_dimension.CumulVar(routing.End(index)))
    for node, job in enumerate(jobs, 1):
        index = manager.NodeToIndex(node)
        windows = sorted(job["windows"])
        if not windows or not job["allowed"]:
            routing.ActiveVar(index).SetValue(0)
            routing.AddDisjunction([index], 1000000)
            continue
        variable = time_dimension.CumulVar(index)
        variable.SetRange(windows[0][0], windows[-1][1])
        for first, second in zip(windows, windows[1:]):
            if second[0] > first[1] + 1:
                variable.RemoveInterval(first[1] + 1, second[0] - 1)
        routing.SetAllowedVehiclesForIndex(job["allowed"], index)
        routing.AddDisjunction([index], 1000000 + int(job.get("priority", 0)) * 1000)
    parameters = pywrapcp.DefaultRoutingSearchParameters()
    parameters.first_solution_strategy = routing_enums_pb2.FirstSolutionStrategy.PATH_CHEAPEST_ARC
    parameters.local_search_metaheuristic = routing_enums_pb2.LocalSearchMetaheuristic.GUIDED_LOCAL_SEARCH
    parameters.time_limit.FromMilliseconds(900)
    result = routing.SolveWithParameters(parameters)
    if not result:
        return {"objective": objective, "routes": [], "unplaced": [j["id"] for j in jobs]}
    routes, seen = [], set()
    for vehicle in range(len(vehicles)):
        index = routing.Start(vehicle)
        visits = []
        while not routing.IsEnd(index):
            node = manager.IndexToNode(index)
            if node:
                visits.append({"node": node, "at": result.Value(time_dimension.CumulVar(index))})
                seen.add(node)
            index = result.Value(routing.NextVar(index))
        if visits:
            routes.append({"vehicle": vehicle, "visits": visits, "end": result.Value(time_dimension.CumulVar(index))})
    return {"objective": objective, "routes": routes, "unplaced": [job["id"] for i, job in enumerate(jobs, 1) if i not in seen]}


def main():
    data = json.load(sys.stdin)
    if len(data["jobs"]) > 12 or len(data["vehicles"]) > 64:
        raise ValueError("Planning input exceeds supported bounds")
    print(json.dumps({"engine": "Google OR-Tools 9.14", "solutions": [solve(data, goal) for goal in ["balanced", "home", "cost"]]}))


if __name__ == "__main__":
    main()
