import { snapshot } from './e2e';
export function dashboard(){ return { latency: snapshot(), ts: Date.now() }; }
