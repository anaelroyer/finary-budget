import { TradeRepublicClient } from "trade-republic-sdk";

const phone = process.env.TR_PHONE;
const pin = process.env.TR_PIN;

if (!phone || !pin) {
  console.error("❌ Secrets manquants : TR_PHONE et/ou TR_PIN.");
  process.exit(1);
}

const client = new TradeRepublicClient();

function redact(value) {
  if (!value) return value;
  if (Array.isArray(value)) return value.map(redact);
  if (typeof value === "object") {
    const out = {};
    for (const [k, v] of Object.entries(value)) {
      if (/name|firstName|lastName|email|phone|address|iban|taxId/i.test(k)) {
        out[k] = "[MASQUÉ]";
      } else {
        out[k] = redact(v);
      }
    }
    return out;
  }
  return value;
}

try {
  console.log("🔐 Étape 1/3 — Demande de connexion Trade Republic...");
  await client.initiateLogin(phone, pin);

  console.log("");
  console.log("📱 APPROUVE MAINTENANT LA CONNEXION DANS L’APP TRADE REPUBLIC.");
  console.log("⏳ Le workflow attend la confirmation...");
  console.log("");

  await client.completeLogin();

  console.log("✅ Étape 2/3 — Connexion approuvée.");
  console.log("📡 Étape 3/3 — Lecture du portefeuille...");

  let received = false;

  await new Promise((resolve, reject) => {
    const timeout = setTimeout(() => {
      if (!received) {
        reject(new Error("Aucune donnée portfolio reçue dans les 45 secondes."));
      }
    }, 45000);

    client.ws.subscribe("portfolio", {}, (data) => {
      received = true;
      clearTimeout(timeout);

      console.log("");
      console.log("✅ PORTFOLIO REÇU");
      console.log(JSON.stringify(redact(data), null, 2));

      resolve();
    });
  });

  console.log("");
  console.log("✅ Test terminé.");
  process.exit(0);

} catch (error) {
  console.error("");
  console.error("❌ ÉCHEC DU TEST");
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
}
