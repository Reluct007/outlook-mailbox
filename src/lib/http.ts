export function json(data: unknown, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "application/json; charset=utf-8");
  }

  return new Response(JSON.stringify(data, null, 2), {
    ...init,
    headers,
  });
}

export function text(body: string, init: ResponseInit = {}): Response {
  const headers = new Headers(init.headers);
  if (!headers.has("content-type")) {
    headers.set("content-type", "text/plain; charset=utf-8");
  }

  return new Response(body, {
    ...init,
    headers,
  });
}

export async function readJson<T>(request: Request): Promise<T> {
  return (await request.json()) as T;
}

export function methodNotAllowed(allowed: string[]): Response {
  return json(
    { error: "method_not_allowed", allowed },
    {
      status: 405,
      headers: {
        allow: allowed.join(", "),
      },
    },
  );
}

export function badRequest(message: string, details?: unknown): Response {
  return json(
    {
      error: "bad_request",
      message,
      details: details ?? null,
    },
    { status: 400 },
  );
}

export function notFound(message = "not_found"): Response {
  return json(
    {
      error: "not_found",
      message,
    },
    { status: 404 },
  );
}
