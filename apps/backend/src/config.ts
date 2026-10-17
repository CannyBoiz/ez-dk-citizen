export type BackendConfig = {
  databaseUrl: string;
  databaseTimeoutMs: number;
  dataServiceUrl: URL;
  dataServiceTimeoutMs: number;
  adminApiToken: string;
  dataServiceToken: string;
  awsRegion: string;
  s3Bucket: string;
  adminOrigins: string[];
};

export function readBackendConfig(
  env: NodeJS.ProcessEnv = process.env,
): BackendConfig {
  for (const name of ["AWS_ACCESS_KEY_ID", "AWS_SECRET_ACCESS_KEY"]) {
    if (Object.hasOwn(env, name)) {
      throw new Error(
        `${name} must not be set; remove legacy IAM-user credentials and use the AWS SDK standard credential chain.`,
      );
    }
  }

  const dataServiceUrl = required(env, "DATA_SERVICE_URL");
  const adminApiToken = required(env, "ADMIN_API_TOKEN");
  const dataServiceToken = required(env, "DATA_SERVICE_TOKEN");
  if (adminApiToken === dataServiceToken) {
    throw new Error("ADMIN_API_TOKEN and DATA_SERVICE_TOKEN must differ.");
  }

  const databaseTimeoutMs = Number(env.DATABASE_TIMEOUT_MS ?? 2000);
  if (!Number.isInteger(databaseTimeoutMs) || databaseTimeoutMs <= 0) {
    throw new Error("DATABASE_TIMEOUT_MS must be a positive whole number.");
  }

  return {
    databaseUrl: required(env, "DATABASE_URL"),
    databaseTimeoutMs,
    dataServiceUrl: new URL(dataServiceUrl),
    dataServiceTimeoutMs: Number(env.DATA_SERVICE_TIMEOUT_MS ?? 2000),
    adminApiToken,
    dataServiceToken,
    awsRegion: required(env, "AWS_REGION"),
    s3Bucket: required(env, "S3_BUCKET"),
    adminOrigins: (env.ADMIN_ORIGINS ?? "")
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
}

function required(env: NodeJS.ProcessEnv, name: string) {
  const value = env[name];
  if (!value) throw new Error(`${name} is required.`);
  return value;
}
