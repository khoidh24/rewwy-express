"use strict";

const statusCodes = {
  BAD_REQUEST: 400,
  UNAUTHORIZED: 401,
  FORBIDDEN: 403,
  CONFLICT: 409,
  INTERNAL_SERVER_ERROR: 500,
};

const reasonPhrases = {
  BAD_REQUEST: "Bad request",
  UNAUTHORIZED: "Unauthorized",
  FORBIDDEN: "Forbidden",
  CONFLICT: "Conflict request",
  INTERNAL_SERVER_ERROR: "Internal server error",
};

class ErrorResponse extends Error {
  public status: number;

  constructor(status: number, message: string) {
    super(message);
    this.status = status;
    this.message = message;
  }
}

class BadRequestError extends ErrorResponse {
  constructor(
    message: string = reasonPhrases.BAD_REQUEST,
    statusCode: number = statusCodes.BAD_REQUEST,
  ) {
    super(statusCode, message);
  }
}

class UnauthorizedError extends ErrorResponse {
  constructor(
    message: string = reasonPhrases.UNAUTHORIZED,
    statusCode: number = statusCodes.UNAUTHORIZED,
  ) {
    super(statusCode, message);
  }
}

class ForbiddenError extends ErrorResponse {
  constructor(
    message: string = reasonPhrases.FORBIDDEN,
    statusCode: number = statusCodes.FORBIDDEN,
  ) {
    super(statusCode, message);
  }
}

class ConflictRequestError extends ErrorResponse {
  constructor(
    message: string = reasonPhrases.CONFLICT,
    statusCode: number = statusCodes.CONFLICT,
  ) {
    super(statusCode, message);
  }
}

class InternalServerError extends ErrorResponse {
  constructor(
    message: string = reasonPhrases.INTERNAL_SERVER_ERROR,
    statusCode: number = statusCodes.INTERNAL_SERVER_ERROR,
  ) {
    super(statusCode, message);
  }
}

export {
  ErrorResponse,
  BadRequestError,
  UnauthorizedError,
  ForbiddenError,
  ConflictRequestError,
  InternalServerError,
};
