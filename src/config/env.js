const dotenv = require("dotenv");

dotenv.config();

function cleanEnvValue(value) {
  if (typeof value !== "string") {
    return value;
  }

  return value.replace(/^'(.*)'$/, "$1").trim();
}

function validateEnv() {
  const requiredVars = ["OPENAI_API_KEY"];
  const missing = requiredVars.filter((key) => !cleanEnvValue(process.env[key]));

  if (missing.length > 0) {
    throw new Error(
      `Faltan variables de entorno requeridas: ${missing.join(", ")}`
    );
  }
}

module.exports = {
  port: Number(cleanEnvValue(process.env.PORT) || 3000),
  openAiApiKey: cleanEnvValue(process.env.OPENAI_API_KEY),
  openAiModel: cleanEnvValue(process.env.OPENAI_MODEL) || "gpt-4.1-mini",
  metaVerifyToken: cleanEnvValue(process.env.META_VERIFY_TOKEN),
  metaPhoneNumberId: cleanEnvValue(process.env.META_PHONE_NUMBER_ID),
  metaAccessToken: cleanEnvValue(process.env.META_ACCESS_TOKEN),
  validateEnv,
};
