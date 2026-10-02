// Verified ARTEMIDA envelope fixtures + an injectable fake `fetch` (no network).
// Shapes mirror docs/artemida-v1-contract.json so client parsing is exercised
// against the observed contract, not guessed fields.
export interface FakeResponseInit {
  status?: number;
  headers?: Record<string, string>;
  body?: unknown;
}

/** Build a JSON Response with a sane default content-type. */
export function jsonResponse(init: FakeResponseInit = {}): Response {
  const { status = 200, headers = {}, body = {} } = init;
  return new Response(JSON.stringify(body), {
    status,
    headers: { "content-type": "application/json", ...headers },
  });
}

/** Success envelope: {ok:true, data, meta:{requestId}} (observed shape). */
export function success<T>(data: T, requestId = 'req_ok'): unknown {
  return { ok: true, data, meta: { requestId } };
}

/** Object error envelope: {ok:false, error:{code,message}}. */
export function objectError(
  code: string,
  message = 'provider error',
  requestId = 'req_error',
): unknown {
  return { ok: false, error: { code, message }, meta: { requestId } };
}

/** String error envelope (404 route shape): {ok:false, error:"…"}. */
export function stringError(message = 'Маршрут не найден'): unknown {
  return { ok: false, error: message };
}

/** Observed pricing success body: data.quote.{amount,currency,days,devices}. */
export function pricingEnvelope(
  amount: number,
  opts: { days?: number; devices?: number; currency?: string } = {},
): unknown {
  return success({
    quote: {
      amount,
      currency: opts.currency ?? 'RUB',
      days: opts.days,
      devices: opts.devices,
    },
  });
}

export interface SequenceFetch {
  fetch: typeof globalThis.fetch;
  calls: () => number;
  urls: () => string[];
}

/**
 * A fake `fetch` that returns each queued Response in order; the last response
 * repeats once the queue is exhausted. Records call count + requested URLs.
 */
export function sequenceFetch(responses: Response[]): SequenceFetch {
  if (responses.length === 0) throw new Error('sequenceFetch needs >= 1 response');
  let index = 0;
  const urls: string[] = [];
  const fetchImpl = (async (input: RequestInfo | URL) => {
    urls.push(typeof input === 'string' ? input : input instanceof URL ? input.href : input.url);
    const res = responses[Math.min(index, responses.length - 1)];
    index += 1;
    return res.clone();
  }) as typeof globalThis.fetch;
  return { fetch: fetchImpl, calls: () => index, urls: () => urls };
}
