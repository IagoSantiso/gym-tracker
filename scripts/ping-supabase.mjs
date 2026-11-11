/** Public, read-only database activity. No user session, secrets or health records. */
const endpoint = "https://jzriqyusbslxdvoybjfm.supabase.co/rest/v1/profiles?select=id&limit=0";
// Publishable client key, deliberately public; all access remains protected by RLS.
const publishableKey = "sb_publishable_8DcL9nhsai6G19ez0KaC6Q_R-4BO-k4";

for (let request = 1; request <= 3; request++) {
  const response = await fetch(endpoint, {
    headers: { apikey: publishableKey },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw new Error(`Supabase query failed: HTTP ${response.status}`);
  const result = await response.json();
  if (!Array.isArray(result) || result.length !== 0) throw new Error("Unexpected health-check response");
  console.log(`Supabase database query ${request}/3 OK (no records read)`);
}
