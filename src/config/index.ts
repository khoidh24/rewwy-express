import "dotenv/config";

export const config = {
  development: {
    port: process.env.PORT,
    xApiKey: process.env.X_API_KEY,
    database: {
      dbUrl: process.env.DATABASE_URL,
      max: process.env.DATABASE_MAX_CONNECTIONS,
      idleTimeoutMillis: process.env.DATABASE_IDLE_TIMEOUT_MILLIS,
    },
    jwt: {
      secret: process.env.JWT_SECRET,
      accessTokenExpiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRES_IN,
      refreshTokenExpiresIn: process.env.JWT_REFRESH_TOKEN_EXPIRES_IN,
    },
    deepseek: {
      baseURL: process.env.DEEPSEEK_BASE_URL,
      apiKey: process.env.DEEPSEEK_API_KEY,
    },
    redis: {
      url: process.env.REDIS_URL,
      username: process.env.REDIS_USERNAME,
      password: process.env.REDIS_PASSWORD,
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
    },
  },
  production: {
    port: process.env.PORT,
    xApiKey: process.env.X_API_KEY,
    database: {
      dbUrl: process.env.DATABASE_URL,
      max: process.env.DATABASE_MAX_CONNECTIONS,
      idleTimeoutMillis: process.env.DATABASE_IDLE_TIMEOUT_MILLIS,
    },
    jwt: {
      secret: process.env.JWT_SECRET,
      accessTokenExpiresIn: process.env.JWT_ACCESS_TOKEN_EXPIRES_IN,
      refreshTokenExpiresIn: process.env.JWT_REFRESH_TOKEN_EXPIRES_IN,
    },
    deepseek: {
      baseURL: process.env.DEEPSEEK_BASE_URL,
      apiKey: process.env.DEEPSEEK_API_KEY,
    },
    redis: {
      url: process.env.REDIS_URL,
      username: process.env.REDIS_USERNAME,
      password: process.env.REDIS_PASSWORD,
      host: process.env.REDIS_HOST,
      port: process.env.REDIS_PORT,
    },
  },
};

export const env = config[process.env.NODE_ENV as keyof typeof config];
