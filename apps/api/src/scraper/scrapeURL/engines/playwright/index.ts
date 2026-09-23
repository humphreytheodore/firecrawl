import { z } from "zod";
import { config } from "../../../../config";
import { EngineScrapeResult } from "..";
import { Meta } from "../..";
import { robustFetch } from "../../lib/fetch";
import { SiteError } from "../../error";
import { getInnerJson } from "@mendable/firecrawl-rs";

export async function scrapeURLWithPlaywright(
  meta: Meta,
): Promise<EngineScrapeResult> {
  return await scrapeWithPlaywrightSidecar(meta, {
    url: config.PLAYWRIGHT_MICROSERVICE_URL!,
    proxyUsed: "basic",
  });
}

// [groundcraft] Escalation tier: identical contract, but pointed at the sidecar
// container that carries PROXY_SERVER (paid residential). Registered as the
// `playwright;stealthproxy` engine with NEGATIVE quality, so the fork's own
// `proxy:auto` retry — AddFeatureError(["stealthProxy"]) on 401/403/429 — is the
// only thing that ever selects it. Everything else stays direct and free.
export async function scrapeURLWithPlaywrightProxied(
  meta: Meta,
): Promise<EngineScrapeResult> {
  return await scrapeWithPlaywrightSidecar(meta, {
    url: config.PLAYWRIGHT_PROXIED_MICROSERVICE_URL!,
    proxyUsed: "stealth",
  });
}

function wantsScreenshot(meta: Meta): boolean {
  return (
    meta.featureFlags.has("screenshot") ||
    meta.featureFlags.has("screenshot@fullScreen")
  );
}

async function scrapeWithPlaywrightSidecar(
  meta: Meta,
  sidecar: { url: string; proxyUsed: "basic" | "stealth" },
): Promise<EngineScrapeResult> {
  const response = await robustFetch({
    url: sidecar.url,
    headers: {
      "Content-Type": "application/json",
    },
    body: {
      url: meta.rewrittenUrl ?? meta.url,
      wait_after_load: meta.options.waitFor,
      timeout: meta.abort.scrapeTimeout(),
      headers: meta.options.headers,
      skip_tls_verification: meta.options.skipTlsVerification,
      // [groundcraft] self-hosted screenshots — the sidecar captures on the live page
      screenshot: wantsScreenshot(meta),
      screenshot_full_page: meta.featureFlags.has("screenshot@fullScreen"),
    },
    method: "POST",
    logger: meta.logger.child("scrapeURLWithPlaywright/robustFetch"),
    schema: z.object({
      content: z.string(),
      pageStatusCode: z.number(),
      pageError: z.string().optional(),
      contentType: z.string().optional(),
      screenshot: z.string().optional(),
      // [groundcraft] Set by a sidecar whose upstream (residential) proxy refused the tunnel.
      proxyError: z
        .object({ code: z.string(), upstream: z.string() })
        .optional(),
    }),
    mock: meta.mock,
    abort: meta.abort.asSignal(),
  });

  // [groundcraft] A refused tunnel is the proxy's failure, not the page's: fail the
  // scrape truthfully and terminally. SiteError stops the waterfall — the pdf/document
  // engines can't route around a dead proxy, and retrying them is what used to surface
  // a proxy outage as "SCRAPE_RETRY_LIMIT (document_antibot)".
  if (response.proxyError) {
    throw new SiteError(
      response.proxyError.code,
      `The upstream proxy answered ${response.proxyError.upstream}.`,
    );
  }

  if (response.contentType?.includes("application/json")) {
    response.content = await getInnerJson(response.content);
  }

  return {
    url: meta.rewrittenUrl ?? meta.url, // TODO: impove redirect following
    html: response.content,
    statusCode: response.pageStatusCode,
    error: response.pageError,
    contentType: response.contentType,
    ...(response.screenshot ? { screenshot: response.screenshot } : {}),

    proxyUsed: sidecar.proxyUsed,
  };
}

export function playwrightMaxReasonableTime(meta: Meta): number {
  return (meta.options.waitFor ?? 0) + 30000;
}
