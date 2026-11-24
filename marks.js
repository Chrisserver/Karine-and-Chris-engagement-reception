// Cloudflare Pages Function: GET/PUT/DELETE /api/marks
// Reads and writes one JSON file in a private GitHub repo. The token never leaves this function.
// Only people who pass Cloudflare Access AND are listed in PEOPLE get in.
const COLS = ["votes", "notes", "status", "tour"];
const FILE = "marks.json";
const json = (o, status = 200) => new Response(JSON.stringify(o), { status, headers: { "content-type": "application/json", "cache-control": "no-store" } });
const b64u = (x) => Uint8Array.from(atob(x.replace(/-/g, "+").replace(/_/g, "/")), (c) => c.charCodeAt(0));
const td = new TextDecoder(), te = new TextEncoder();

// Check the Cloudflare Access JWT (signature, audience, issuer, expiry). Returns the email or null.
async function verifyAccess(req, env) {
  const jwt = req.headers.get("Cf-Access-Jwt-Assertion");
  if (!jwt) return null;
  const [h, p, s] = jwt.split(".");
  if (!h || !p || !s) return null;
  const header = JSON.parse(td.decode(b64u(h)));
  const certs = await (await fetch(`https://${env.TEAM_DOMAIN}/cdn-cgi/access/certs`)).json();
  const jwk = certs.keys.find((k) => k.kid === header.kid);
  if (!jwk) return null;
  const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
  if (!(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, b64u(s), te.encode(h + "." + p)))) return null;
  const c = JSON.parse(td.decode(b64u(p)));
  if (![].concat(c.aud).includes(env.POLICY_AUD) || c.iss !== `https://${env.TEAM_DOMAIN}` || c.exp * 1000 < Date.now()) return null;
  return String(c.email || "").toLowerCase();
}

const gh = (env, init = {}) => fetch(`https://api.github.com/repos/${env.REPO}/contents/${FILE}${init.method === "PUT" ? "" : "?ref=" + env.BRANCH}`, {
  ...init, headers: { authorization: `Bearer ${env.GITHUB_TOKEN}`, accept: "application/vnd.github+json", "user-agent": "venue-book", "x-github-api-version": "2022-11-28" },
});
async function load(env) {
  const r = await gh(env);
  if (r.status === 404) return { data: {}, sha: undefined };
  if (!r.ok) throw new Error("github " + r.status);
  const j = await r.json();
  return { data: JSON.parse(td.decode(Uint8Array.from(atob(j.content.replace(/\n/g, "")), (c) => c.charCodeAt(0)))), sha: j.sha };
}
async function save(env, data, sha, message) {
  const bytes = te.encode(JSON.stringify(data, null, 1));
  let bin = ""; for (let i = 0; i < bytes.length; i += 0x8000) bin += String.fromCharCode(...bytes.subarray(i, i + 0x8000));
  const r = await gh(env, { method: "PUT", body: JSON.stringify({ message, content: btoa(bin), sha, branch: env.BRANCH }) });
  if (r.status === 409 || r.status === 422) return false; // someone else saved first: caller retries
  if (!r.ok) throw new Error("github " + r.status);
  return true;
}

export async function onRequest({ request, env }) {
  try {
    const email = await verifyAccess(request, env);
    const people = JSON.parse(env.PEOPLE); // {"email": {"id": "chris", "name": "Chris"}}
    const me = email && people[email];
    if (!me) return json({ error: "forbidden" }, 403);
    if (request.method === "GET") {
      const { data } = await load(env);
      return json({ me: { id: me.id, name: me.name }, people: Object.fromEntries(Object.values(people).map((p) => [p.id, p.name])), data });
    }
    if (request.method !== "PUT" && request.method !== "DELETE") return json({ error: "method" }, 405);
    const { col, id, body } = await request.json();
    if (!COLS.includes(col) || typeof id !== "string" || !id || id.length > 300) return json({ error: "bad request" }, 400);
    if (col === "votes" && !id.endsWith("~" + me.id)) return json({ error: "forbidden" }, 403); // hearts are personal
    for (let i = 0; i < 4; i++) {
      const { data, sha } = await load(env);
      data[col] = data[col] || {};
      if (request.method === "PUT") data[col][id] = { ...body, u: me.id }; else delete data[col][id];
      if (await save(env, data, sha, `${me.name}: ${request.method} ${col}/${id}`.slice(0, 200))) return json({ ok: true });
    }
    return json({ error: "conflict" }, 409);
  } catch (e) {
    return json({ error: "server" }, 500);
  }
}
