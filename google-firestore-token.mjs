import fs from "node:fs";
import crypto from "node:crypto";

const EXPECTED_PROJECT = "finances-royer";
const raw = process.env.FIREBASE_SERVICE_ACCOUNT_JSON;

if(!raw){
  throw new Error("secret FIREBASE_SERVICE_ACCOUNT_JSON manquant");
}

let credentials;
try{
  credentials = JSON.parse(raw);
}catch{
  throw new Error("FIREBASE_SERVICE_ACCOUNT_JSON n'est pas un JSON valide");
}

if(credentials.type !== "service_account"){
  throw new Error("Le secret fourni n'est pas une clé de compte de service Google");
}
if(credentials.project_id !== EXPECTED_PROJECT){
  throw new Error(`Mauvais projet Google Cloud : ${credentials.project_id || "inconnu"} (attendu : ${EXPECTED_PROJECT})`);
}
if(!credentials.client_email || !credentials.private_key){
  throw new Error("Clé de compte de service incomplète");
}

function b64url(value){
  return Buffer.from(value)
    .toString("base64")
    .replace(/\+/g,"-")
    .replace(/\//g,"_")
    .replace(/=+$/,"");
}

const now = Math.floor(Date.now()/1000);
const header = b64url(JSON.stringify({alg:"RS256",typ:"JWT"}));
const payload = b64url(JSON.stringify({
  iss: credentials.client_email,
  scope: "https://www.googleapis.com/auth/datastore",
  aud: "https://oauth2.googleapis.com/token",
  iat: now,
  exp: now + 3600
}));
const unsigned = `${header}.${payload}`;
const signature = crypto.sign(
  "RSA-SHA256",
  Buffer.from(unsigned),
  credentials.private_key
);
const assertion = `${unsigned}.${b64url(signature)}`;

const response = await fetch("https://oauth2.googleapis.com/token",{
  method:"POST",
  headers:{"content-type":"application/x-www-form-urlencoded"},
  body:new URLSearchParams({
    grant_type:"urn:ietf:params:oauth:grant-type:jwt-bearer",
    assertion
  })
});

if(!response.ok){
  const detail = (await response.text()).slice(0,300);
  throw new Error(`Authentification Google Cloud impossible (${response.status}) ${detail}`);
}

const result = await response.json();
const token = String(result.access_token || "");
if(!token){
  throw new Error("Google Cloud n'a pas renvoyé de jeton d'accès");
}
if(!process.env.GITHUB_ENV){
  throw new Error("GITHUB_ENV introuvable : ce script doit être exécuté dans GitHub Actions");
}

// Empêche l'affichage accidentel du jeton dans les logs GitHub.
console.log(`::add-mask::${token}`);
fs.appendFileSync(process.env.GITHUB_ENV, `GOOGLE_FIRESTORE_TOKEN=${token}\n`, {encoding:"utf8"});
console.log("✅ Authentification serveur Google Cloud prête pour Firestore.");
