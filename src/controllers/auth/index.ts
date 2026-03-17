import AuthService from "@/services/auth/auth.service.ts";
import express from "express";

class AuthController {
  signup = async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      return res
        .status(201)
        .json(
          await AuthService.signup(
            req.body.email,
            req.body.password,
            req.body.displayName,
          ),
        );
    } catch (error) {
      next(error);
    }
  };

  login = async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      return res.json(
        await AuthService.login(req.body.email, req.body.password),
      );
    } catch (error) {
      next(error);
    }
  };

  refreshToken = async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      return res.json(await AuthService.refreshToken(req.body.refreshToken));
    } catch (error) {
      next(error);
    }
  };

  logout = async (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    try {
      return res.json(await AuthService.logout(req.body.refreshToken));
    } catch (error) {
      next(error);
    }
  };
}

export default new AuthController();
