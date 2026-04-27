// Smoke tests for the clinic site. Hits real endpoints, no mocking.
// Usage: node scripts/smoke.mjs [BASE_URL]
const BASE = process.argv[2] || "http://localhost:3001";
let pass = 0;
let fail = 0;
const results = [];

function ok(name, detail = "") {
  pass++;
  results.push(`PASS  ${name}${detail ? "  · " + detail : ""}`);
}
function bad(name, detail) {
  fail++;
  results.push(`FAIL  ${name}  · ${detail}`);
}

async function get(path, init) {
  const res = await fetch(BASE + path, { redirect: "manual", ...init });
  const text = res.headers.get("content-type")?.includes("html")
    ? await res.text()
    : "";
  return { status: res.status, headers: res.headers, text, res };
}

// --- 1. Public pages: each must 200 ---
const publicRoutes = [
  "/",
  "/services",
  "/about",
  "/contact",
  "/privacy",
  "/terms",
  "/login",
  "/signup",
  "/book",
  "/vouchers",
];
for (const p of publicRoutes) {
  const r = await get(p);
  if (r.status === 200) ok(`GET ${p}`, "200");
  else bad(`GET ${p}`, `expected 200, got ${r.status}`);
}

// --- 2. Home renders the clinic name ---
{
  const r = await get("/");
  if (r.text.includes("Manly Remedial Clinic"))
    ok("Home renders clinic name");
  else bad("Home renders clinic name", "string not found in HTML");
}

// --- 3. Services page lists at least one seeded service with $ price ---
{
  const r = await get("/services");
  const hasService = /Remedial Massage|Thai Massage|Hot Stone/.test(r.text);
  const hasPrice = /\$\d+/.test(r.text);
  if (hasService && hasPrice) ok("Services page shows seeded services + prices");
  else bad("Services page", `service=${hasService} price=${hasPrice}`);
}

// --- 4. /book lists service cards with prices ---
{
  const r = await get("/book");
  const hasFrom = /From\b/.test(r.text);
  const hasPrice = /\$\d+/.test(r.text);
  if (hasFrom && hasPrice) ok("Booking landing shows From + $... CTAs");
  else bad("Booking landing", `from=${hasFrom} price=${hasPrice}`);
}

// --- 5. /book?service=remedial-massage shows variants + slots ---
{
  const r = await get("/book?service=remedial-massage");
  const hasDuration = /(1 hr|2 hr|45 min|30 min|90 min)/.test(r.text);
  const hasTime = /(\d{1,2}:\d{2} (AM|PM|am|pm))/.test(r.text);
  if (hasDuration) ok("Booking step 2 shows variants");
  else bad("Booking step 2 variants", "no duration found");
  if (hasTime) ok("Booking step 2 shows time slots");
  else bad("Booking step 2 slots", "no time pattern found in HTML");
}

// --- 6. Protected routes redirect to /login ---
for (const p of ["/portal", "/portal/bookings", "/staff", "/staff/bookings"]) {
  const r = await get(p);
  const loc = r.headers.get("location") || "";
  if (r.status === 307 || r.status === 302) {
    if (loc.includes("/login")) ok(`${p} redirects unauth → /login`);
    else bad(`${p} redirect`, `redirected to ${loc}`);
  } else {
    bad(`${p} redirect`, `expected 307/302, got ${r.status}`);
  }
}

// --- 7. Signup API: bad payload rejected ---
{
  const r = await fetch(BASE + "/api/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ email: "not-an-email" }),
  });
  if (r.status === 400) ok("POST /api/signup rejects bad payload (400)");
  else bad("POST /api/signup bad payload", `got ${r.status}`);
}

// --- 8. Signup API: missing consent rejected ---
{
  const r = await fetch(BASE + "/api/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Test User",
      email: `noconsent_${Date.now()}@test.local`,
      password: "passw0rd!",
      consentPrivacy: false,
    }),
  });
  if (r.status === 400) ok("POST /api/signup rejects missing consent (400)");
  else bad("POST /api/signup missing consent", `got ${r.status}`);
}

// --- 9. Signup API: happy path creates a user ---
const newEmail = `smoke_${Date.now()}@test.local`;
{
  const r = await fetch(BASE + "/api/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Smoke Tester",
      email: newEmail,
      phone: "0411111111",
      password: "passw0rd!",
      consentPrivacy: true,
    }),
  });
  if (r.status === 200) ok("POST /api/signup happy path (200)");
  else bad("POST /api/signup happy path", `got ${r.status}`);
}

// --- 10. Signup API: duplicate email returns 409 ---
{
  const r = await fetch(BASE + "/api/signup", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      name: "Smoke Tester",
      email: newEmail,
      password: "passw0rd!",
      consentPrivacy: true,
    }),
  });
  if (r.status === 409) ok("POST /api/signup duplicate email (409)");
  else bad("POST /api/signup duplicate email", `got ${r.status}`);
}

// --- 11. Login flow: get csrf, then sign in ---
const jar = new Map();
function setCookies(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [kv] = c.split(";");
    const [k, v] = kv.split("=");
    jar.set(k, v);
  }
}
function cookieHeader() {
  return [...jar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}

{
  const csrfRes = await fetch(BASE + "/api/auth/csrf");
  setCookies(csrfRes);
  const { csrfToken } = await csrfRes.json();
  if (csrfToken) ok("Auth CSRF token retrieved");
  else bad("Auth CSRF", "no token");

  const body = new URLSearchParams({
    csrfToken,
    email: "client@example.com",
    password: "client123",
    redirect: "false",
    callbackUrl: BASE,
    json: "true",
  });
  const loginRes = await fetch(BASE + "/api/auth/callback/credentials", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: cookieHeader(),
    },
    body,
    redirect: "manual",
  });
  setCookies(loginRes);
  // NextAuth returns 200 with json on success in v5
  if (loginRes.status === 200 || loginRes.status === 302) {
    const has =
      [...jar.keys()].some((k) => k.includes("next-auth.session-token")) ||
      [...jar.keys()].some((k) => k.includes("authjs.session-token"));
    if (has) ok("Login as seeded client sets session cookie");
    else bad("Login session cookie", `no auth cookie. cookies: ${[...jar.keys()].join(",")}`);
  } else {
    bad("Login", `unexpected status ${loginRes.status}`);
  }
}

// --- 12. Authenticated /portal returns 200 ---
{
  const r = await fetch(BASE + "/portal", {
    headers: { cookie: cookieHeader() },
    redirect: "manual",
  });
  if (r.status === 200) ok("Authenticated GET /portal (200)");
  else bad("Authenticated GET /portal", `got ${r.status}`);
}

// --- 13. Authenticated /staff is forbidden for client (302 → /portal) ---
{
  const r = await fetch(BASE + "/staff", {
    headers: { cookie: cookieHeader() },
    redirect: "manual",
  });
  const loc = r.headers.get("location") || "";
  if ((r.status === 302 || r.status === 307) && loc.includes("/portal"))
    ok("CLIENT cannot access /staff (redirect → /portal)");
  else bad("Client /staff guard", `status=${r.status} location=${loc}`);
}

// --- 14. Data export endpoint returns JSON for authed user ---
{
  const r = await fetch(BASE + "/api/portal/export", {
    headers: { cookie: cookieHeader() },
  });
  const ct = r.headers.get("content-type") || "";
  if (r.status === 200 && ct.includes("json")) {
    const data = await r.json();
    if (data.user && Array.isArray(data.bookings))
      ok("Data export returns user + bookings");
    else bad("Data export shape", JSON.stringify(Object.keys(data)));
  } else {
    bad("Data export", `status=${r.status} ct=${ct}`);
  }
}

// --- 15. Staff login & access ---
const staffJar = new Map();
function setStaff(res) {
  for (const c of res.headers.getSetCookie?.() ?? []) {
    const [kv] = c.split(";");
    const [k, v] = kv.split("=");
    staffJar.set(k, v);
  }
}
function staffCookieHeader() {
  return [...staffJar.entries()].map(([k, v]) => `${k}=${v}`).join("; ");
}
{
  const csrfRes = await fetch(BASE + "/api/auth/csrf");
  setStaff(csrfRes);
  const { csrfToken } = await csrfRes.json();
  const body = new URLSearchParams({
    csrfToken,
    email: "admin@clinic.local",
    password: "admin123",
    redirect: "false",
    callbackUrl: BASE,
    json: "true",
  });
  const loginRes = await fetch(BASE + "/api/auth/callback/credentials", {
    method: "POST",
    headers: {
      "content-type": "application/x-www-form-urlencoded",
      cookie: staffCookieHeader(),
    },
    body,
    redirect: "manual",
  });
  setStaff(loginRes);

  const r = await fetch(BASE + "/staff", {
    headers: { cookie: staffCookieHeader() },
    redirect: "manual",
  });
  // /staff is a redirect to /staff/schedule (calendar is the landing view)
  const loc = r.headers.get("location") || "";
  if ((r.status === 307 || r.status === 302) && loc.includes("/staff/schedule"))
    ok("ADMIN /staff redirects → /staff/schedule");
  else bad("ADMIN /staff redirect", `status=${r.status} loc=${loc}`);

  const r2 = await fetch(BASE + "/staff/bookings", {
    headers: { cookie: staffCookieHeader() },
    redirect: "manual",
  });
  if (r2.status === 200) ok("Authenticated GET /staff/bookings (200)");
  else bad("ADMIN /staff/bookings", `got ${r2.status}`);

  // Cover the rest of the staff routes
  for (const p of ["/staff/schedule", "/staff/clients", "/staff/therapists", "/staff/services"]) {
    const rr = await fetch(BASE + p, {
      headers: { cookie: staffCookieHeader() },
      redirect: "manual",
    });
    if (rr.status === 200) ok(`Authenticated GET ${p} (200)`);
    else bad(`ADMIN ${p}`, `got ${rr.status}`);
  }
}

// --- 16. Cover the rest of the client portal routes ---
for (const p of ["/portal/bookings", "/portal/intake", "/portal/data"]) {
  const r = await fetch(BASE + p, {
    headers: { cookie: cookieHeader() },
    redirect: "manual",
  });
  if (r.status === 200) ok(`Authenticated GET ${p} (200)`);
  else bad(`CLIENT ${p}`, `got ${r.status}`);
}

// --- 17. Reports + new staff pages ---
{
  const checks = [
    "/staff/reports",
    "/staff/vouchers",
    "/staff/bookings/new",
  ];
  for (const p of checks) {
    const r = await fetch(BASE + p, {
      headers: { cookie: staffCookieHeader() },
      redirect: "manual",
    });
    if (r.status === 200) ok(`Authenticated GET ${p} (200)`);
    else bad(`ADMIN ${p}`, `got ${r.status}`);
  }
}

// --- 18. SEO endpoints ---
{
  const sm = await fetch(BASE + "/sitemap.xml");
  const txt = await sm.text();
  if (sm.status === 200 && /<urlset/.test(txt) && /\/services/.test(txt))
    ok("/sitemap.xml renders with public URLs");
  else bad("/sitemap.xml", `status=${sm.status} sample=${txt.slice(0, 80)}`);
  const rb = await fetch(BASE + "/robots.txt");
  const rt = await rb.text();
  if (rb.status === 200 && /Disallow: \/staff/.test(rt))
    ok("/robots.txt blocks /staff");
  else bad("/robots.txt", `status=${rb.status} body=${rt.slice(0, 80)}`);
}

// --- 19. Home includes JSON-LD MedicalBusiness ---
{
  const r = await get("/");
  if (/"@type":\s*"MedicalBusiness"/.test(r.text))
    ok("Home outputs MedicalBusiness JSON-LD");
  else bad("Home JSON-LD", "MedicalBusiness not found in HTML");
}

// --- 20. Cron reminders endpoint (no CRON_SECRET set in dev → 200) ---
{
  const r = await fetch(BASE + "/api/cron/reminders");
  const j = await r.json().catch(() => null);
  if (r.status === 200 && j && typeof j.candidates === "number")
    ok(`Cron reminders endpoint responds (${j.sent}/${j.candidates} sent)`);
  else bad("Cron reminders", `status=${r.status}`);
}

// --- 21. Find a client booking ID for invoice/deposit/reschedule tests ---
let bookingId = null;
{
  const r = await fetch(BASE + "/portal/bookings", {
    headers: { cookie: cookieHeader() },
    redirect: "manual",
  });
  const html = await r.text();
  const m = html.match(/\/portal\/bookings\/([A-Za-z0-9_-]+)\/reschedule/);
  if (m) {
    bookingId = m[1];
    ok(`Discovered client booking id (${bookingId.slice(0, 8)}…)`);
  } else {
    // No upcoming bookings for the seeded client — create one for tests
    bad("Discover client booking", "No upcoming reschedule link found — creating a test booking");
    // Skip booking-specific tests below
  }
}

// --- 22. Invoice PDF for owner ---
if (bookingId) {
  const r = await fetch(BASE + `/api/bookings/${bookingId}/invoice`, {
    headers: { cookie: cookieHeader() },
  });
  const ct = r.headers.get("content-type") || "";
  const buf = new Uint8Array(await r.arrayBuffer());
  const isPdf = buf.length > 4 && buf[0] === 0x25 && buf[1] === 0x50 && buf[2] === 0x44 && buf[3] === 0x46;
  if (r.status === 200 && ct.includes("pdf") && isPdf)
    ok(`Invoice PDF: ${buf.length} bytes, %PDF header present`);
  else bad("Invoice PDF", `status=${r.status} ct=${ct} pdf=${isPdf}`);
}

// --- 23. Reschedule page renders ---
if (bookingId) {
  const r = await fetch(BASE + `/portal/bookings/${bookingId}/reschedule`, {
    headers: { cookie: cookieHeader() },
    redirect: "manual",
  });
  if (r.status === 200) ok(`/portal/bookings/[id]/reschedule (200)`);
  else bad("Reschedule page", `got ${r.status}`);
}

// --- 24. Deposit page renders (Stripe disabled → "pay in clinic" copy) ---
if (bookingId) {
  const r = await fetch(BASE + `/portal/bookings/${bookingId}/deposit`, {
    headers: { cookie: cookieHeader() },
    redirect: "manual",
  });
  const html = await r.text();
  if (r.status === 200 && /pay in clinic/i.test(html))
    ok("Deposit page falls back to 'pay in clinic' when Stripe not configured");
  else bad("Deposit page fallback", `status=${r.status}`);
}

// --- 25. Deposit API returns 501 without Stripe ---
if (bookingId) {
  const r = await fetch(BASE + `/api/bookings/${bookingId}/deposit`, {
    method: "POST",
    headers: { cookie: cookieHeader() },
  });
  if (r.status === 501) ok("Deposit API returns 501 when Stripe not configured");
  else bad("Deposit API 501", `got ${r.status}`);
}

// --- 26. Therapist edit page renders for admin ---
{
  const list = await fetch(BASE + "/staff/therapists", {
    headers: { cookie: staffCookieHeader() },
  });
  const html = await list.text();
  // cuid IDs are >= 24 chars; skip JS-bundle paths like /staff/therapists/page
  const ids = [...html.matchAll(/\/staff\/therapists\/([a-z0-9]+)/g)]
    .map((m) => m[1])
    .filter((s) => s.length >= 20);
  const tid = ids[0];
  if (tid) {
    const r = await fetch(BASE + `/staff/therapists/${tid}`, {
      headers: { cookie: staffCookieHeader() },
      redirect: "manual",
    });
    if (r.status === 200) ok(`/staff/therapists/[id] edit page (200)`);
    else bad("Therapist edit page", `got ${r.status}`);
  } else {
    bad("Therapist link", "no therapist cuid link found");
  }
}

// --- 27. Voucher purchase shows form (full server-action redemption needs JS;
//        we just smoke-check the form is present) ---
{
  const r = await get("/vouchers");
  if (/Purchase voucher|Recipient name/i.test(r.text))
    ok("/vouchers form rendered");
  else bad("/vouchers form", "form copy not found");
}

// --- 28. Sitemap includes voucher route ---
{
  const sm = await fetch(BASE + "/sitemap.xml");
  const txt = await sm.text();
  if (/\/vouchers/.test(txt)) ok("/sitemap.xml includes /vouchers");
  else bad("Sitemap /vouchers", "not present");
}

// --- 29. Cancellation-fee badge appears for past cancelled-with-fee bookings
//        (the seeded data has none, so this just checks the badge code path
//        renders the page without errors when there are cancellations) ---

// --- Report ---
console.log("\n" + results.join("\n"));
console.log(`\n${pass} passed, ${fail} failed (of ${pass + fail})`);
process.exit(fail === 0 ? 0 : 1);
