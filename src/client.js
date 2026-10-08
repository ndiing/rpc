const { WebSocket } = require("ws");
const { Router } = require("./router.js");

/**
 * @typedef RPCClientOptions
 * @property {Number} [maxAttempts=10]
 * @property {Number} [baseDelay=1000]
 * @property {Number} [maxDelay=30000]
 */

class RPCClient extends Router {
    /**
     * @param {import('ws').AddressInfo} address
     * @param {RPCClientOptions} options
     */
    constructor(address, options = {}) {
        super();

        this.address = address;

        this.queue = [];

        this.requestId = 1;
        this.pending = new Map();

        this.maxAttempts = options.maxAttempts || 10;
        this.baseDelay = options.baseDelay || 1000;
        this.maxDelay = options.maxDelay || 30000;

        this.reconnectAttempts = 0;
    }

    handleResponse(data) {
        this.emit("response", data);

        if (!this.pending.has(data.id)) return;

        const pending = this.pending.get(data.id);

        clearTimeout(pending.timeout);
        this.pending.delete(data.id);
        pending.resolve(data);
    }

    handleClose() {
        for (const [, { reject, timeout }] of this.pending) {
            clearTimeout(timeout);
            reject(new Error("Connection closed"));
        }
        this.pending.clear();

        this.reconnect();
    }

    handleMessage(data) {
        this.handleRequest(data, {
            send: (data) => {
                if (!(this.ws.readyState === WebSocket.OPEN)) return;
                this.ws.send(data);
            },
        });
    }

    handleOpen() {
        this.reconnectAttempts = 0;

        while (this.queue.length) {
            this.ws.send(this.queue.shift());
        }
    }

    reconnect() {
        if (this.reconnectAttempts >= this.maxAttempts) {
            console.error("Maximum reconnection attempts reached. Giving up.");
            return;
        }

        this.reconnectAttempts++;

        let delay = this.baseDelay * Math.pow(2, this.reconnectAttempts);
        delay = Math.min(delay, this.maxDelay);

        const jitter = Math.random() * 1000;
        const finalDelay = delay + jitter;

        console.log(`Attempting reconnect #${this.reconnectAttempts} in ${Math.round(finalDelay)}ms...`);

        setTimeout(() => this.connect(), finalDelay);
    }

    connect() {
        this.ws = new WebSocket(this.address);
        this.ws.on("close", () => this.handleClose());
        this.ws.on("error", () => {});
        this.ws.on("message", (data) => this.handleMessage(data));
        this.ws.on("open", () => this.handleOpen());
    }

    close() {
        if (this.ws) this.ws.close();
    }

    send(data) {
        const isReady = this.ws && this.ws.readyState === WebSocket.OPEN;
        if (isReady) this.ws.send(data);
        else this.queue.push(data);
    }

    request(method, params, id) {
        const data = {
            jsonrpc: "2.0",
            method,
            params,
            id,
        };
        this.send(JSON.stringify(data));
    }

    call(method, params) {
        return new Promise((resolve, reject) => {
            const id = this.requestId++;
            const timeout = setTimeout(() => {
                if (!this.pending.has(id)) return;
                this.pending.delete(id);
                reject(new Error("Request Timeout"));
            }, this.timeout);

            this.pending.set(id, { resolve, reject, timeout });

            this.request(method, params, id);
        });
    }

    notify(method, params) {
        this.request(method, params);
    }

    async batch(req) {
        if (req.length === 0) throw new Error("Bad Request");

        const requests = [];
        for (const { notify, method, params } of req) {
            if (notify) this.notify(method, params);
            else requests.push(this.call(method, params));
        }

        return await Promise.allSettled(requests).then((responses) => responses.map((r) => (r.status === "fulfilled" ? r.value : r.reason)));
    }
}
module.exports.RPCClient = RPCClient;
