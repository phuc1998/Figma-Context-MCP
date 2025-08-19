declare module "fetch-with-proxy" {
  import type { RequestInfo, RequestInit, Response } from "node-fetch";

  export default function fetchWithProxy(
    url: RequestInfo,
    init?: RequestInit
  ): Promise<Response>;
}
