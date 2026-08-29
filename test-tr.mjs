import { TRClient } from "trade-republic-sdk";

const phone = process.env.TR_PHONE;
const pin = process.env.TR_PIN;

if (!phone || !pin) {
  console.error("❌ Secrets manquants : TR_PHONE et/ou TR_PIN.");
  process.exit(1);
}

const TARGETS = new Set([
  "IE0002XZSHO1", // WPEA
  "FR0013412020", // PAEEM
  "IE00B4ND3602"  // iShares Physical Gold
]);

const client = new TRClient({
  validate: "warn",
  onValidationWarning: (warning) => {
    console.log("⚠️ Validation :", warning?.message || String(warning));
  }
});

function collectSecuritiesAccounts(value) {
  const seen = new Set();
  const found = new Map();

  function walk(node, context = {}) {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);

    let localContext = {...context};

    for (const [key, val] of Object.entries(node)) {
      if (typeof val === "string") {
        if (/^(type|accountType|name|label|title)$/i.test(key)) {
          localContext[key] = val;
        }
      }
    }

    for (const [key, val] of Object.entries(node)) {
      if (
        typeof val === "string" &&
        /^(securitiesAccountNumber|secAccNo|securitiesAccountNo)$/i.test(key)
      ) {
        if (!found.has(val)) {
          found.set(val, {
            secAccNo: val,
            context: {...localContext}
          });
        }
      }
    }

    for (const val of Object.values(node)) {
      walk(val, localContext);
    }
  }

  walk(value);
  return [...found.values()];
}

function flattenPositions(portfolio) {
  if (!portfolio || typeof portfolio !== "object") return [];

  if (Array.isArray(portfolio.positions)) return portfolio.positions;

  if (Array.isArray(portfolio.categories)) {
    return portfolio.categories.flatMap(category =>
      Array.isArray(category?.positions) ? category.positions : []
    );
  }

  const out = [];
  const seen = new Set();
  function walk(node) {
    if (!node || typeof node !== "object" || seen.has(node)) return;
    seen.add(node);
    if (Array.isArray(node)) {
      for (const x of node) walk(x);
      return;
    }
    const hasPositionShape =
      ("netSize" in node || "size" in node || "quantity" in node) &&
      ("isin" in node || "instrumentId" in node || "instrument" in node);
    if (hasPositionShape) out.push(node);
    for (const v of Object.values(node)) walk(v);
  }
  walk(portfolio);
  return out;
}

function normalizePosition(position) {
  const isin =
    position?.isin ??
    position?.instrumentId ??
    position?.instrument?.isin ??
    position?.instrument?.id ??
    null;

  const parts =
    position?.netSize ??
    position?.size ??
    position?.quantity ??
    position?.amount ??
    null;

  const averageBuyIn =
    position?.averageBuyIn ??
    position?.averageBuyInPrice ??
    position?.buyIn ??
    position?.averagePrice ??
    null;

  const name =
    position?.name ??
    position?.instrument?.name ??
    position?.instrumentName ??
    "";

  return { isin, name, parts, averageBuyIn };
}

function accountLabel(account, index) {
  const c = account?.context || {};
  const raw = c.accountType || c.type || c.name || c.label || c.title || "";
  return raw ? String(raw) : `Compte titres ${index + 1}`;
}

try {
  console.log("🔐 Connexion Trade Republic...");
  console.log("📱 Valide la demande dans l'app Trade Republic.");
  await client.login(phone, pin);
  console.log("✅ Connexion approuvée.");
  console.log("");

  let accounts = [];

  try {
    console.log("🔎 Recherche des comptes titres / PEA...");
    const accountPairs = await client.accountPairs.get({});
    accounts = collectSecuritiesAccounts(accountPairs);
    console.log(`✅ ${accounts.length} compte(s) d'investissement détecté(s) via accountPairs.`);
  } catch (err) {
    console.log("ℹ️ accountPairs non exploitable :", err?.message || String(err));
  }

  if (accounts.length === 0) {
    try {
      const accountInfo = await client.accountInfo.get();
      accounts = collectSecuritiesAccounts(accountInfo);
      console.log(`✅ ${accounts.length} compte(s) d'investissement détecté(s) via accountInfo.`);
    } catch (err) {
      console.log("ℹ️ accountInfo non exploitable :", err?.message || String(err));
    }
  }

  if (accounts.length === 0) {
    console.error("❌ Impossible de trouver un compte-titres ou PEA.");
    process.exit(2);
  }

  let totalFound = 0;

  for (let i = 0; i < accounts.length; i++) {
    const account = accounts[i];
    const label = accountLabel(account, i);

    console.log("");
    console.log("========================================");
    console.log(`📂 ${label}`);
    console.log("========================================");

    try {
      const portfolio = await client.compactPortfolioByType.get({
        secAccNo: account.secAccNo
      });

      const positions = flattenPositions(portfolio).map(normalizePosition);
      console.log(`✅ ${positions.length} position(s) reçue(s).`);

      let foundHere = 0;
      for (const p of positions) {
        const isin = String(p.isin || "").toUpperCase();
        if (!TARGETS.has(isin)) continue;

        foundHere++;
        totalFound++;

        console.log("");
        console.log(`ISIN : ${isin}`);
        if (p.name) console.log(`Nom : ${p.name}`);
        console.log(`Parts : ${p.parts ?? "non fourni"}`);
        console.log(`PRU : ${p.averageBuyIn ?? "non fourni"}`);
      }

      if (foundHere === 0) {
        console.log("ℹ️ Aucun des 3 ISIN suivis sur ce compte.");
      }

    } catch (err) {
      console.log(`⚠️ Lecture impossible pour ce compte : ${err?.message || String(err)}`);
    }
  }

  console.log("");
  console.log(`✅ Test terminé : ${totalFound} ligne(s) suivie(s) trouvée(s) au total.`);
  process.exit(0);

} catch (error) {
  console.error("");
  console.error("❌ ÉCHEC DU TEST");
  console.error(error?.stack || error?.message || String(error));
  process.exit(1);
}
