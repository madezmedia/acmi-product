/**
 * Twitter OAuth 2.0 PKCE Callback Handler
 * https://acmi-product.vercel.app/api/twitter-callback
 */
export default async function handler(req, res) {
  const { code, state, error } = req.query;
  
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Content-Type', 'text/html');

  if (error) {
    return res.status(200).send(`<html><body><h1>❌ Authorization Failed</h1><p>Error: ${error}</p></body></html>`);
  }

  if (!code) {
    return res.status(200).send(`<html><body><h1>No Code</h1><p>This endpoint is for Twitter OAuth callbacks.</p></body></html>`);
  }

  // Log it
  console.log(`[twitter-callback] code=${code} state=${state}`);

  res.status(200).send(`<html><body style="font-family:sans-serif;display:flex;align-items:center;justify-content:center;height:100vh;background:#111;color:#fff;">
    <div style="text-align:center;">
      <h1 style="color:#4ade80;">✅ Authorized!</h1>
      <p>Twitter authorization successful.</p>
      <p style="color:#888;">Return to your terminal.</p>
      <p id="code" style="font-family:monospace;font-size:11px;word-break:break-all;background:#222;padding:10px;border-radius:4px;margin-top:20px;display:none;">${code}</p>
    </div>
    <script>
      document.getElementById('code').style.display='block';
    </script>
  </body></html>`);
}
