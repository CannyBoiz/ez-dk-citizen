import { config } from "dotenv";

config({ path: process.env.DOTENV_CONFIG_PATH ?? "../../.env", quiet: true });
