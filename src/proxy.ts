import { env } from "node:process";
import { ProxyAgent, Agent, type Dispatcher } from "undici";

const PROXY = env.HTTPS_PROXY ?? env.HTTP_PROXY ?? env.https_proxy ?? env.http_proxy;
const NO_PROXY_LIST = (env.NO_PROXY ?? env.no_proxy ?? "")
  .split(",").map(s => s.trim()).filter(Boolean);

const inNoProxy = (host: string) =>
  NO_PROXY_LIST.some(p => p === "*" || host === p || (p.startsWith(".") && (host === p.slice(1) || host.endsWith(p))));

const direct = new Agent();
const via    = PROXY ? new ProxyAgent(PROXY) : direct;

export const dispatcher: Dispatcher = {
  dispatch(opts: { origin: string | URL; }, handler: any) {
    try {
      const origin = typeof opts.origin === "string" ? new URL(opts.origin) : (opts.origin as URL);
      if (inNoProxy(origin.hostname)) return (direct as any).dispatch(opts, handler);
    } catch { /* ignore */ }
    return (via as any).dispatch(opts, handler);
  },
  close: async () => { await Promise.allSettled([direct.close(), (via as any).close?.()]); },
  destroy: (err: Error) => { direct.destroy(err); (via as any).destroy?.(err); },
} as any;
