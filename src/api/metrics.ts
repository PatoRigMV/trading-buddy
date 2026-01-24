import Fastify from 'fastify';
import { dashboard } from '../obs/dashboard';
import { promText } from '../obs/prometheus';

export const app = Fastify();
app.get('/metrics/dashboard', async (_req, res)=> { res.send(dashboard()); });
app.get('/metrics', async (_req, res)=> { res.header('Content-Type','text/plain; version=0.0.4'); res.send(promText()); });

export async function startMetricsApi(port=8787){ await app.listen({ port, host:'0.0.0.0' }); }
