const blockedHeaders = new Set([
  "connection",
  "content-encoding",
  "content-length",
  "expect",
  "host",
  "keep-alive",
  "transfer-encoding",
]);

export default {
  async fetch(request) {
    const origin = process.env.API_ORIGIN;
    if (!origin) return new Response("API origin is not configured", { status: 503 });

    const incoming = new URL(request.url);
    const paths = incoming.searchParams.getAll("__nomi_path");
    if (paths.length !== 1 || !/^[a-zA-Z0-9/_-]*$/.test(paths[0])) {
      return new Response("Invalid API path", { status: 400 });
    }

    const upstream = new URL(`/api/${paths[0]}`, origin);
    incoming.searchParams.delete("__nomi_path");
    upstream.search = incoming.searchParams.toString();
    const headers = new Headers(request.headers);
    for (const name of blockedHeaders) headers.delete(name);
    const response = await fetch(upstream, {
      method: request.method,
      headers,
      body: request.method === "GET" || request.method === "HEAD" ? undefined : request.body,
      duplex: "half",
      redirect: "manual",
    });
    const responseHeaders = new Headers(response.headers);
    for (const name of blockedHeaders) responseHeaders.delete(name);
    return new Response([204, 304].includes(response.status) ? null : response.body, {
      status: response.status,
      headers: responseHeaders,
    });
  },
};
