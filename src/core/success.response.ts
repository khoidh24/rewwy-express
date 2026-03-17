'use strict';

import express from 'express';

const statusCodes = {
  OK: 200,
  CREATED: 201,
};

const reasonPhrases = {
  OK: 'Success',
  CREATED: 'Created',
};

class SuccessResponse<T> {
  public message: string;
  public statusCode: number;
  public metadata: T;

  constructor(
    message: string,
    statusCode: number = statusCodes.OK,
    reasonPhrase: string = reasonPhrases.OK,
    metadata: T = {} as T
  ) {
    this.message = message || reasonPhrase;
    this.statusCode = statusCode;
    this.metadata = metadata;
  }

  send(res: express.Response, header: Record<string, unknown> = {}) {
    return res.status(this.statusCode).json(this);
  }
}

class OK<T> extends SuccessResponse<T> {
  constructor({ message, metadata }: { message: string; metadata: T }) {
    super(message, statusCodes.OK, reasonPhrases.OK, metadata);
  }
}

class CREATED<T> extends SuccessResponse<T> {
  constructor(message: string, metadata: T) {
    super(message, statusCodes.CREATED, reasonPhrases.CREATED, metadata);
  }
}

export { OK, CREATED };
