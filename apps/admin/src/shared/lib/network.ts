export type BffRequest = {
  method: "GET" | "POST" | "PUT" | "PATCH" | "DELETE";
  path: string;
  token: string;
  body?: unknown;
};

export type BffResponse = { status: number; body: unknown };

// A direct PUT of the chosen file to its signed storage URL; progress runs from 0 to 1.
export type ObjectUpload = {
  url: string;
  headers: Record<string, string>;
  file: File;
  onProgress: (fraction: number) => void;
};

// A direct storage transfer that failed or whose outcome is unknown; it never reached the BFF.
export class StorageError extends Error {}

// The Admin's only network seam. Tests pass a fake; main.tsx passes createNetwork().
export interface Network {
  bff(request: BffRequest): Promise<BffResponse>;
  // Resolves with the storage response status; rejects when the outcome is unknown.
  putObject(upload: ObjectUpload): Promise<{ status: number }>;
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

    // XMLHttpRequest, because fetch cannot report upload progress. The browser derives
    // Content-Length from the File; scripts cannot set it.
    putObject({ url, headers, file, onProgress }) {
      return new Promise((resolve, reject) => {
        const request = new XMLHttpRequest();
        request.open("PUT", url);
        for (const [name, value] of Object.entries(headers))
          request.setRequestHeader(name, value);
        request.upload.onprogress = (event) => {
          if (event.lengthComputable) onProgress(event.loaded / event.total);
        };
        request.onload = () => resolve({ status: request.status });
        request.onerror =
          request.onabort =
          request.ontimeout =
            () =>
              reject(
                new StorageError("The upload to storage did not complete."),
              );
        request.send(file);
      });
    },
  };
}
