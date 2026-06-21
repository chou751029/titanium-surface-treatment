const GITHUB_API_VERSION = "2022-11-28";
const DEFAULT_WORKFLOW = "sync.yml";
const DEFAULT_REF = "main";

function jsonResponse(body, status = 200) {
  return new Response(JSON.stringify(body, null, 2), {
    status,
    headers: {
      "content-type": "application/json; charset=utf-8",
    },
  });
}

function requireEnv(env, name) {
  const value = env[name];
  if (!value) {
    throw new Error(`Missing environment variable: ${name}`);
  }
  return value;
}

function envStatus(env) {
  return {
    GH_OWNER: Boolean(env.GH_OWNER),
    GH_REPO: Boolean(env.GH_REPO),
    GH_TOKEN: Boolean(env.GH_TOKEN),
    GH_WORKFLOW: env.GH_WORKFLOW || DEFAULT_WORKFLOW,
    GH_REF: env.GH_REF || DEFAULT_REF,
  };
}

function getNotionEventName(payload) {
  return (
    payload?.type ||
    payload?.event ||
    payload?.event_type ||
    payload?.events?.[0]?.type ||
    "page.updated"
  );
}

async function triggerWorkflow(env, eventPayload) {
  const owner = requireEnv(env, "GH_OWNER");
  const repo = requireEnv(env, "GH_REPO");
  const token = requireEnv(env, "GH_TOKEN");
  const workflow = env.GH_WORKFLOW || DEFAULT_WORKFLOW;
  const ref = env.GH_REF || DEFAULT_REF;
  const notionEvent = getNotionEventName(eventPayload);

  const response = await fetch(
    `https://api.github.com/repos/${owner}/${repo}/actions/workflows/${workflow}/dispatches`,
    {
      method: "POST",
      headers: {
        accept: "application/vnd.github+json",
        authorization: `Bearer ${token}`,
        "content-type": "application/json",
        "user-agent": "notion-to-github-pages-worker",
        "x-github-api-version": GITHUB_API_VERSION,
      },
      body: JSON.stringify({
        ref,
        inputs: {
          source: "notion-webhook",
          notionEvent,
        },
      }),
    }
  );

  if (!response.ok) {
    const detail = await response.text();
    throw new Error(`GitHub workflow dispatch failed: ${response.status} ${detail}`);
  }
}

export default {
  async fetch(request, env) {
    if (request.method === "GET") {
      return jsonResponse({
        ok: true,
        service: "notion-to-github-pages-worker",
        env: envStatus(env),
      });
    }

    if (request.method !== "POST") {
      return jsonResponse({ ok: false, error: "Method not allowed" }, 405);
    }

    let payload = {};
    try {
      payload = await request.json();
    } catch {
      payload = {};
    }

    if (payload?.verification_token) {
      console.log("Notion webhook verification token:", payload.verification_token);
      return jsonResponse({
        ok: true,
        verification_token: payload.verification_token,
        message: "Copy this verification_token into the Notion webhook verification dialog.",
      });
    }

    try {
      await triggerWorkflow(env, payload);
      return jsonResponse({
        ok: true,
        triggered: env.GH_WORKFLOW || DEFAULT_WORKFLOW,
        ref: env.GH_REF || DEFAULT_REF,
        notionEvent: getNotionEventName(payload),
      });
    } catch (error) {
      return jsonResponse({ ok: false, error: error.message }, 500);
    }
  },
};
