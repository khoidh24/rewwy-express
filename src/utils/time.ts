import { InternalServerError } from "@/core/error.response.ts";

export const parseExpiresInToSeconds = (value: string | undefined): number => {
  if (!value) {
    throw new InternalServerError(
      "JWT access token expiration is not configured",
    );
  }

  if (/^\d+$/.test(value)) {
    return Number(value);
  }

  const match = value.match(/^(\d+)([smhd])$/i);
  if (!match) {
    throw new InternalServerError("Invalid JWT access token expiration format");
  }

  const amountRaw = match[1];
  const unitRaw = match[2];
  if (!amountRaw || !unitRaw) {
    throw new InternalServerError("Invalid JWT access token expiration format");
  }

  const amount = Number(amountRaw);
  const unit = unitRaw.toLowerCase() as "s" | "m" | "h" | "d";
  const unitToSeconds: Record<"s" | "m" | "h" | "d", number> = {
    s: 1,
    m: 60,
    h: 3600,
    d: 86400,
  };

  return amount * unitToSeconds[unit];
};
