// Configuration interactive : pose 3 questions et ecrit config.json.
// Evite toute edition manuelle du JSON.
import fs from "fs";
import path from "path";
import readline from "readline";
import { stdin, stdout } from "process";

const cfgPath = path.join(process.cwd(), "config.json");
if (fs.existsSync(cfgPath)) {
  console.log("config.json existe deja — rien a faire.");
  process.exit(0);
}

const rl = readline.createInterface({ input: stdin, output: stdout });
// File de lignes : robuste au clavier ET en pipe (evite les lignes perdues)
const queue = [];
let waiter = null;
rl.on("line", (line) => {
  if (waiter) { const w = waiter; waiter = null; w(line); }
  else queue.push(line);
});
const ask = (q) => {
  stdout.write(q);
  return new Promise((resolve) => {
    if (queue.length) resolve(queue.shift());
    else waiter = resolve;
  });
};

// Numero -> format international sans + ni espaces (06/07 FR -> 33...)
function normNum(raw) {
  let n = String(raw).replace(/[^\d]/g, "");
  if (n.length === 10 && n.startsWith("0")) n = "33" + n.slice(1);
  return n;
}
// Jeton aleatoire lisible (sans dependance externe)
function genToken() {
  const c = "abcdefghijkmnpqrstuvwxyz23456789";
  let s = "";
  for (let i = 0; i < 24; i++) s += c[Math.floor(Math.random() * c.length)];
  return s;
}

console.log("\n=== Configuration de Sentinel ===\n");
console.log("Reponds a 3 questions. Tes reponses restent sur ton PC (fichier config.json, jamais envoye sur GitHub).\n");

const key = (await ask("1) Ta cle API Anthropic (commence par sk-ant-...) : ")).trim();

let numRaw = (await ask("2) TON numero WhatsApp (celui qui recevra les resumes), ex 0612345678 : ")).trim();
const notify = normNum(numRaw);

let tok = (await ask("3) Un mot de passe pour ouvrir l'interface de lecture\n   (laisse VIDE et appuie sur Entree pour en generer un automatiquement) : ")).trim();
if (!tok) { tok = genToken(); console.log("   -> Jeton genere : " + tok); }

rl.close();

const config = {
  anthropicApiKey: key,
  timezone: "Europe/Paris",
  port: 8787,
  accessToken: tok,
  accounts: [
    {
      id: "juliana",
      notify,
      digest: { enabled: true, everyHours: 4, scope: "all" },
      autoReply: {
        mode: "off",
        allowFrom: [],
        persona: "Tu reponds au nom de Juliana. Ton professionnel, aimable, messages courts. Ne prends jamais d'engagement ferme (prix, date contractuelle)."
      }
    }
  ]
};

fs.writeFileSync(cfgPath, JSON.stringify(config, null, 2));

console.log("\n✅ config.json cree.");
console.log("   Numero de reception : " + (notify || "(vide !)"));
console.log("   Interface de lecture : http://localhost:8787  (jeton : " + tok + ")");
if (!key.startsWith("sk-ant-")) console.log("\n⚠️  La cle ne ressemble pas a une cle Anthropic (sk-ant-...). Verifie-la si le demarrage echoue.");
if (!notify) console.log("\n⚠️  Numero vide : tu ne recevras pas les resumes. Relance pour corriger (supprime config.json).");
console.log("");
