export type RedisTokenSession = {
  accessToken?: string;
  refreshToken?: string;
};

export const parseRedisTokenSession = (
  raw: string | null,
): RedisTokenSession | null => {
  if (!raw) {
    return null;
  }

  try {
    const parsed = JSON.parse(raw) as RedisTokenSession;
    if (!parsed || typeof parsed !== "object") {
      return null;
    }
    return parsed;
  } catch (_error) {
    // Backward compatibility for older format storing raw access token only.
    return { accessToken: raw };
  }
};
