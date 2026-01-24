import { snapshot } from "./e2e";

export interface Dashboard {
    latency: ReturnType<typeof snapshot>;
    ts: number;
}

export function dashboard(): Dashboard {
    return {
        latency: snapshot(),
        ts: Date.now(),
    };
}
