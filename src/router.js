const EventEmitter = require("events");
const { Node } = require("./node.js");
const { isArray, isObject } = require("./util.js");
const { RPCError } = require("./error.js");
const { Cache } = require("./cache.js");

class Router extends EventEmitter {
    constructor(options = {}) {
        super();
        this.setMaxListeners(0);

        this.timeout = options.timeout ?? 30_000;
        this.cacheSize = options.cacheSize ?? 30_000;

        this.root = new Node();
        this.seq = 0;
        this.cache = new Cache(this.cacheSize);

        // this.requestId = 1;
        // this.pending = new Map();
    }

    split(method) {
        return method.split(".").filter(Boolean);
    }

    /**
     * @param {*} method
     * @param {FunctionHandler[]} handler
     */
    add(method, ...handlers) {
        if (typeof method === "function") {
            handlers = [method, ...handlers];
            method = null;
        }

        let node = this.root;

        if (method !== null) {
            for (const segment of this.split(method)) {
                node = node.add(segment);
            }
        }

        for (const handler of handlers) {
            if (handler.root) {
                node.merge(handler.root, this.seq);
                this.seq = node.getMaxSeq() + 1;
            } else {
                handler.seq = this.seq++;
                node.handlers.push(handler);
            }
        }
    }

    find(method) {
        const key = method;

        const cached = this.cache.get(key);
        if (cached) return cached;

        let node = this.root;

        const handlers = {};
        const errorHandlers = {};

        for (const input of this.split(method)) {
            let matched = node.children.get(input);

            if (!matched) {
                node = null;
                break;
            }

            node = matched;

            for (const handler of node.handlers) {
                if (handler.length === 3) errorHandlers[handler.seq] = handler;
                else handlers[handler.seq] = handler;
            }
        }

        for (const handler of this.root.handlers) {
            if (handler.length === 3) errorHandlers[handler.seq] = handler;
            else handlers[handler.seq] = handler;
        }

        const value = { handlers: Object.values(handlers), errorHandlers: Object.values(errorHandlers) };
        this.cache.set(key, value);
        return value;
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

        // const rto = setTimeout(() => {
        //     err = new RPCError({ code: -32603, message: "Internal error (Request Timeout)" });
        // }, this.timeout);

        const { handlers, errorHandlers } = this.find(req.method);
        try {
            for (const handler of handlers) {
                if (end) break;
                await handler(req, res);
            }
        } catch (error) {
            err = error;
            try {
                for (const handler of errorHandlers) {
                    if (end) break;
                    await handler(err, req, res);
                }
            } catch (error) {
                err = error;
            }
        } finally {
            // clearTimeout(rto);
        }

        if (!end) {
            if (!err) err = new RPCError({ code: -32601, message: "Method not found" });

            res.send(err);
        }
    }
}
module.exports.Router = Router;
