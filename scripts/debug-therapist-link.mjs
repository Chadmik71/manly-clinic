const BASE = "http://localhost:3000";
const jar = new Map();
function setC(r) {
  for (const c of r.headers.getSetCookie?.() ?? []) {
    const [kv] = c.split(";");
    const [k, v] = kv.split("=");
    jar.set(k, v);
  }
}
function ck() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
const csrfRes = await fetch(BASE + "/api/auth/csrf");
setC(csrfRes);
const { csrfToken } = await csrfRes.json();
const loginRes = await fetch(BASE + "/api/auth/callback/credentials", {
  method: "POST",
  headers: {
    "content-type": "application/x-www-form-urlencoded",
    cookie: ck(),
  },
  body: new URLSearchParams({
    csrfToken,
    email: "admin@clinic.local",
    password: "admin123",
    redirect: "false",
    callbackUrl: BASE,
    json: "true",
  }),
  redirect: "manual",
});
setC(loginRes);

const html = await fetch(BASE + "/staff/therapists", {
  headers: { cookie: ck() },
}).then((r) => r.text());

const links = [...html.matchAll(/\/staff\/therapists\/([A-Za-z0-9]+)/g)].map(
  (m) => m[1],
);
console.log("Distinct ID fragments:", [...new Set(links)]);

// Pick the first non-static fragment (avoid "page", chunk hashes, etc.)
const id = links.find((s) => s.length > 10 && /^[a-z0-9]+$/i.test(s));
console.log("Picked:", id);
if (id) {
  const r = await fetch(BASE + `/staff/therapists/${id}`, {
    headers: { cookie: ck() },
  });
  console.log("Status:", r.status);
}
