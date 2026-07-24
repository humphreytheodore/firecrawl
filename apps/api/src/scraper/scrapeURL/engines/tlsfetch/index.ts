import { z } from "zod";
import { config } from "../../../../config";
import { EngineScrapeResult } from "..";
import { Meta } from "../..";
import { robustFetch } from "../../lib/fetch";

/**
 * [groundcraft] TLS-impersonating fetch — restores the capability self-hosted
 * Firecrawl loses when fire-engine is unavailable (`fire-engine;tlsclient` is
 * cloud-gated). The sidecar uses curl_cffi/BoringSSL to present Chrome's real
 * ClientHello and HTTP/2 fingerprint, so JA3/JA4-based blocking — which rejects
 * stock Node/Python clients outright — no longer applies.
 *
 * No JS execution, so it registers BELOW the browser in the fallback order; it
 * wins over plain `fetch` and serves the server-rendered majority far cheaper.
 */
export async function scrapeURLWithTLSFetch(
  meta: Meta,
): Promise<EngineScrapeResult> {
  const response = await robustFetch({
    url: config.TLSFETCH_MICROSERVICE_URL!,
    headers: { "Content-Type": "application/json" },
    body: {
      url: meta.rewrittenUrl ?? meta.url,
      headers: meta.options.headers,
      timeout: meta.abort.scrapeTimeout(),
      skip_tls_verification: meta.options.skipTlsVerification,
    },
    method: "POST",
    logger: meta.logger.child("scrapeURLWithTLSFetch/robustFetch"),
    schema: z.object({
      content: z.string(),
      statusCode: z.number(),
      contentType: z.string().optional(),
      url: z.string().optional(),
      error: z.string().optional(),
    }),
    mock: meta.mock,
    abort: meta.abort.asSignal(),
  });

  return {
    url: response.url ?? meta.rewrittenUrl ?? meta.url,
    html: response.content,
    statusCode: response.statusCode,
    error: response.error,
    contentType: response.contentType,

    proxyUsed: "basic",
  };
}

export function tlsFetchMaxReasonableTime(_meta: Meta): number {
  return 20000;
}
