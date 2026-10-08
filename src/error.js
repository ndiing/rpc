class RPCError extends Error {
    constructor({ code, message, data } = {}) {
        super(message);

        this.code = code;
        this.data = data;

        if (Error.captureStackTrace) {
            Error.captureStackTrace(this, this.constructor);
        }
    }
}
exports.RPCError = RPCError;
