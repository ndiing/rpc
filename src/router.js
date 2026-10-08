const EventEmitter = require("events");
const { Node } = require("./node.js");
const { isArray, isObject } = require("./util.js");
const { RPCError } = require("./error.js");

class Router extends EventEmitter {
    static SEQ = 0;

    constructor() {
        super();
        this.setMaxListeners(0);

        this.root = new Node();

        this.timeout = 30000;

        // this.requestId = 1;
        // this.pending = new Map();
    }

    add(method, ...handlers) {
        if (typeof method === "function") {
            handlers = [method, ...handlers];
            method = null;
        }

        let node = this.root;

        if (method) {
            for (const segment of method.split(".").filter(Boolean)) {
                node = node.add(segment);
            }
        }

        const router = handlers.at(-1);
        if (router.root) {
            const sub = handlers.pop();
            node.merge(sub.root);
        }

        for (const handler of handlers) {
            node.handlers.push([Router.SEQ++, handler]);
        }
    }

    find(method) {
        const handlers = [];

        let node = this.root;
        handlers.push(...node.handlers);

        for (const segment of method.split(".").filter(Boolean)) {
            node = node.children.get(segment);
            if (!node) break;
            handlers.push(...node.handlers);
        }

        return handlers.toSorted(([a], [b]) => a - b);
    }

    // handleResponse(data) {
    //     this.emit("response", data);

    //     if (!this.pending.has(data.id)) return;

    //     const pending = this.pending.get(data.id);

    //     clearTimeout(pending.timeout);
    //     this.pending.delete(data.id);
    //     pending.resolve(data);
    // }

    async handleRequest(req, res) {
        let err;
        let end;
        try {
            req = Buffer.isBuffer(req) ? JSON.parse(req) : req;
            if (isArray(req)) {
                if (req.length === 0) {
                    throw new RPCError({ code: -32600, message: "Invalid Request" });
                }
                const messages = [];
                await Promise.all(
                    req.map((r) => {
                        const res = { send: (message) => messages.push(JSON.parse(message)) };
                        return this.handleRequest(r, res);
                    }),
                );
                if (messages.length) res.send(JSON.stringify(messages));
                return;
            }

            if (req.result || req.error) {
                return this.handleResponse(req);
            }

            if (!(req.jsonrpc === "2.0" && typeof req.method === "string")) {
                throw new RPCError({ code: -32600, message: "Invalid Request" });
            }

            if (req.params !== undefined && !(isArray(req.params) || isObject(req.params))) {
                throw new RPCError({ code: -32602, message: "Invalid params" });
            }
        } catch (error) {
            err = error instanceof RPCError ? error : new RPCError({ code: -32700, message: "Parse error" });

            if (!isObject(req)) req = {};

            req.id = req.id ?? null;
            req.method = String(req.method ?? "");
        }

        const send = res.send;
        res.send = (result) => {
            if (end) return;
            end = true;

            if (req.id === undefined) return;

            send(
                JSON.stringify({
                    jsonrpc: "2.0",
                    ...((result instanceof Error && { error: { code: result.code, message: result.message } }) || { result }),
                    id: req.id,
                }),
            );
        };

        const handlers = this.find(req.method);
        for (const [, handler] of handlers) {
            if (end) break;

            if ((err && handler.length !== 4) || (!err && handler.length === 4)) continue;

            try {
                await new Promise((resolve, reject) => {
                    const rto = setTimeout(() => {
                        next(new RPCError({ code: -32603, message: "Internal error (Request Timeout)" }));
                    }, this.timeout);

                    const next = (e) => {
                        clearTimeout(rto);
                        if (e) reject(e);
                        else resolve();
                    };

                    const send = res.send;
                    res.send = (data) => {
                        send(data);
                        next();
                    };

                    if (err) handler(err, req, res, next);
                    else handler(req, res, next);
                });
            } catch (error) {
                err = error;
            }
        }

        if (!end) {
            if (!err) err = new RPCError({ code: -32601, message: "Method not found" });

            res.send(err);
        }
    }
}
module.exports.Router = Router;
