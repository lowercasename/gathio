import { Request, Response, NextFunction } from "express";

export class ServerError {
    message!: string;
    statusCode!: number;
    constructor(message: string, statusCode: number = 500) {
        this.message = message;
        this.statusCode = statusCode;
    }
}

export const handleError = (
    err: TypeError | ServerError,
    req: Request,
    res: Response,
    next: NextFunction
) => {
    console.log(err);
    let serverError = err;

    if (!(err instanceof ServerError)) {
        serverError = new ServerError(
            "Sorry, the server has encountered an unexpected error."
        );
    }

    res.status((serverError as ServerError).statusCode).send(serverError);
};
