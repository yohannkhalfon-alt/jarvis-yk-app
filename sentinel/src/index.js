import fs from "fs";
import path from "path";
import { startAccount } from "./session.js";
import { startApi } from "./api.js";

const configPath = process.env.SENTINEL_CONFIG || path.join(process.cwd(), "config.json");
if (!fs.existsSync(configPath)) {
  console.error(`Config introuvable : ${configPath}\nCopie config.example.json vers config.json et remplis-le.`);
  process.exit(1);
}
if (!process.env.ANTHROPIC_API_KEY) {
  console.error("Variable d'environnement ANTHROPIC_API_KEY manquante.");
  process.exit(1);
}

const config = JSON.parse(fs.readFileSync(configPath, "utf8"));

const handles = [];
for (const account of config.accounts) {
  try {
    handles.push(await startAccount(account, config));
  } catch (e) {
    console.error(`[${account.id}] demarrage:`, e.message);
  }
}

startApi(handles, config);
