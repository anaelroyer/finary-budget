import { TRClient, topicRegistry } from "trade-republic-sdk";

const phone = process.env.TR_PHONE;
const pin = process.env.TR_PIN;

if (!phone || !pin) {
  console.error("❌ Secrets manquants : TR_PHONE et/ou TR_PIN.");
  process.exit(1);
}

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

const client = new TRClient({
  validate: "warn",
  onValidationWarning: (warning) => {
    console.log("⚠️ Validation :", warning?.message || String(warning));
  }
});

try {
  console.log("🔐 Connexion Trade Republic...");
  console.log("📱 Une demande d'approbation doit apparaître dans l'app.");
  await client.login(phone, pin);

  console.log("✅ Connexion approuvée.");
  console.log("");

  const availableTopics = Object.keys(topicRegistry || {});
  console.log("📚 Topics disponibles dans le SDK :");
  console.log(availableTopics.join(", "));
  console.log("");

  const candidates = [
    "portfolio",
    "portfolioStatus",
    "cash",
    "availableCash",
    "timelineTransactions",
    "orders",
    "savingsPlans"
  ];

  let successCount = 0;

  for (const name of candidates) {
    try {
      let accessor = client[name];
      if (!accessor && typeof client.topic === "function") {
        accessor = client.topic(name);
      }

      if (!accessor || typeof accessor.get !== "function") {
        console.log(`ℹ️ ${name} : accessor absent`);
        continue;
      }

      console.log(`📡 Lecture ${name}...`);
      const data = await accessor.get({});
      console.log(`✅ ${name} reçu`);
      console.log(JSON.stringify(redact(data), null, 2));
      console.log("");
      successCount++;
    } catch (err) {
      console.log(`⚠️ ${name} : ${err?.message || String(err)}`);
      console.log("");
    }
  }

  console.log(`✅ Test terminé : ${successCount} topic(s) reçu(s).`);

  if (successCount === 0) {
    console.error("❌ Authentification réussie mais aucune donnée testée n'a pu être lue.");
    process.exit(2);
  }

  process.exit(0);
} catch (error) {
  console.error("");
  console.error("❌ ÉCHEC DU TEST");
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
}
