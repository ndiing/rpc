const { WebSocketServer } = require("ws");
const { Router } = require("./router.js");

class RPCServer extends Router {
    /**
     * @param {import('ws').ServerOptions} options
     */
    constructor(options) {
        super();

        this.options = options;

        this.clients = new Map();

        this.requestId = 1;
        this.pending = new Map();
    }

    handleResponse(data) {
        this.emit("response", data);

        if (!this.pending.has(data.id)) return;

        const pending = this.pending.get(data.id);

        clearTimeout(pending.timeout);
        this.pending.delete(data.id);
        pending.resolve(data);
    }

    handleConnection(req, ws) {
        const parsed = URL.parse(req.url, "ws://localhost");
        const clientId = parsed.searchParams.get("clientId");
        if (clientId) this.clients.set(clientId, ws);

        ws.on("close", () => this.handleClose(clientId));
        ws.on("error", () => {});
        ws.on("message", (data) => this.handleMessage(data, ws));
        ws.on("open", () => {});
    }

    handleClose(clientId) {
        this.clients.delete(clientId);
    }

    handleMessage(data, ws) {
        this.handleRequest(data, {
            send: (data) => {
                if (!(ws.readyState === WebSocket.OPEN)) return;
                ws.send(data);
            },
        });
    }

    connect() {
        this.wss = new WebSocketServer(this.options);

        this.wss.on("connection", (ws, req) => this.handleConnection(req, ws));
    }

    close() {
        if (this.wss) {
            for (const client of this.wss.clients) {
                if (client.readyState === WebSocket.OPEN) {
                    client.close(1000, "Server shutting down");
                }
            }
            this.wss.close();
        }
    }

    send(clientId, data) {
        if (!this.clients.has(clientId)) return;

        const ws = this.clients.get(clientId);
        if (!(ws.readyState === WebSocket.OPEN)) return;

        ws.send(data);
    }

    request(clientId, method, params, id) {
        const data = {
            jsonrpc: "2.0",
            method,
            params,
            id,
        };
        this.send(clientId, JSON.stringify(data));
    }

    call(clientId, method, params) {
        return new Promise((resolve, reject) => {
            const id = this.requestId++;
            const timeout = setTimeout(() => {
                if (!this.pending.has(id)) return;
                this.pending.delete(id);
                reject(new Error("Request Timeout"));
            }, this.timeout);

            this.pending.set(id, { resolve, reject, timeout });

            this.request(clientId, method, params, id);
        });
    }

    notify(clientId, method, params) {
        this.request(clientId, method, params);
    }

    async batch(clientId, req) {
        if (req.length === 0) throw new Error("Bad Request");

        const requests = [];
        for (const { notify, method, params } of req) {
            if (notify) this.notify(clientId, method, params);
            else requests.push(this.call(clientId, method, params));
        }

        return await Promise.allSettled(requests).then((responses) => responses.map((r) => (r.status === "fulfilled" ? r.value : r.reason)));
    }

    broadcast(method, params) {
        for (const [clientId] of this.clients) {
            this.notify(clientId, method, params);
        }
    }
}
module.exports.RPCServer = RPCServer;
