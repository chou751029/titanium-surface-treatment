const GITHUB_API_VERSION = "2022-11-28";

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

async function triggerWorkflow(env, eventPayload) {
  const owner = requireEnv(env, "GH_OWNER");
  const repo = requireEnv(env, "GH_REPO");
  const token = requireEnv(env, "GH_TOKEN");
  const workflow = env.GH_WORKFLOW || "sync.yml";
  const ref = env.GH_REF || "main";

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
          notionEvent: eventPayload?.type || eventPayload?.event || "page.updated",
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

    try {
      await triggerWorkflow(env, payload);
      return jsonResponse({ ok: true, triggered: "sync.yml" });
    } catch (error) {
      return jsonResponse({ ok: false, error: error.message }, 500);
    }
  },
};
