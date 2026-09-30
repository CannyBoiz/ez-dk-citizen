export type BffRequest = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  token: string;
  body?: unknown;
};

export type BffResponse = { status: number; body: unknown };

// The Admin's only network seam. Tests pass a fake; main.tsx passes createNetwork().
export interface Network {
  bff(request: BffRequest): Promise<BffResponse>;
}

export function createNetwork(baseUrl: string): Network {
  return {
    async bff({ method, path, token, body }) {
      const response = await fetch(new URL(path, baseUrl), {
        method,
        headers: {
          Authorization: `Bearer ${token}`,
          ...(body === undefined ? {} : { "Content-Type": "application/json" }),
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });
      const text = await response.text();
      let parsed: unknown = null;
      try {
        parsed = JSON.parse(text);
      } catch {}
      return { status: response.status, body: parsed };
    },
  };
}
