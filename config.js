// Configuration file for VU-App
// Replace the bearer token with your actual Celonis API token
const CONFIG = {
  BEARER_TOKEN: "YOUR_BEARER_TOKEN_HERE",
  // Webhook for background checks (Personensuche -> Überprüfen)
  WEBHOOK_URL: "",
  // Webhook for case transfer (Vorgang übertragen) — no auth required
  TRANSFER_WEBHOOK_URL: "https://public-sector-dach.try.celonis.cloud/ems-automation/public/api/root/9393585d-6f31-4979-8930-3d98e3765d16/hook/k86o8zs4ayl57c5zkduewh8nyvhabm38",
  // Webhook for Personenabfrage (Person speichern) — reads the response
  PERSONENABFRAGE_WEBHOOK_URL: "https://public-sector-dach.try.celonis.cloud/ems-automation/public/api/root/9393585d-6f31-4979-8930-3d98e3765d16/hook/xuwq95r9zocyd68cxo79gp51ktg33w3j",
  // Transferred by user info (customize)
  USER: {
    id: "",
    given_name: "",
    family_name: "",
    department_code: "",
    department_name: "",
    email: ""
  }
};
