import jwt from "jsonwebtoken";
import { env } from "../config/index.ts";

export type JwtExpiresIn = NonNullable<jwt.SignOptions["expiresIn"]>;

export const generateToken = (userId: string, expiresIn: JwtExpiresIn) => {
  return jwt.sign({ userId }, env.jwt.secret as jwt.Secret, { expiresIn });
};

export const verifyToken = (token: string) => {
  try {
    return jwt.verify(token, env.jwt.secret as jwt.Secret);
  } catch (err) {
    return null;
  }
};

export const getUserIdFromToken = (token: string) => {
  const decoded = verifyToken(token);
  if (!decoded) {
    return null;
  }
  return (decoded as jwt.JwtPayload).userId;
};
