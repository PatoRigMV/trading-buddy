import Fastify from 'fastify'; import { dashboard } from '../obs/dashboard';
export const app = Fastify();
app.get('/metrics/dashboard', async (_req, res)=> { res.send(dashboard()); });
export async function startObsApi(port=8787){ await app.listen({ port, host:'0.0.0.0' }); }
