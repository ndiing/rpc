const { RPCServer, RPCClient } = require("../src/rpc");

const rpcServer = new RPCServer({ port: 3000 });

rpcServer.add("subtract", (req, res) => {
    let minuend;
    let subtrahend;
    Array.isArray(req.params) ? ([minuend, subtrahend] = req.params) : ({ minuend, subtrahend } = req.params);
    res.send(minuend - subtrahend);
});
rpcServer.add("update", (req, res, next) => {
    console.log("client => update", req.params);
    next();
});
rpcServer.add("sum", (req, res) => {
    res.send(req.params.reduce((a, c) => a + c, 0));
});
rpcServer.add("notify_hello", (req, res, next) => {
    console.log("client => notify_hello", req.params);
    next();
});
rpcServer.add("get_data", (req, res, next) => {
    res.send(["hello", 5]);
});
rpcServer.add("notify_sum", (req, res, next) => {
    console.log("client => notify_sum", req.params);
    next();
});
rpcServer.connect();

// console.log(crypto.randomUUID())

const rpcClient = new RPCClient("ws://localhost:3000/?clientId=22e99e76-4e2b-4ae7-a8f7-6c6dc46a551f");
// rpcClient.on("response", console.log);
rpcClient.connect();

describe("client", () => {
    test("rpc call with positional parameters: (1)", async () => {
        const response = await rpcClient.call("subtract", [42, 23]);
        expect(response).toEqual({ jsonrpc: "2.0", result: 19, id: 1 });
    });
    test("rpc call with positional parameters: (2)", async () => {
        const response = await rpcClient.call("subtract", [23, 42]);
        expect(response).toEqual({ jsonrpc: "2.0", result: -19, id: 2 });
    });
    test("rpc call with named parameters: (1)", async () => {
        const response = await rpcClient.call("subtract", { subtrahend: 23, minuend: 42 });
        expect(response).toEqual({ jsonrpc: "2.0", result: 19, id: 3 });
    });
    test("rpc call with named parameters: (2)", async () => {
        const response = await rpcClient.call("subtract", { minuend: 42, subtrahend: 23 });
        expect(response).toEqual({ jsonrpc: "2.0", result: 19, id: 4 });
    });
    test("a Notification: (1)", async () => {
        const response = await rpcClient.notify("update", [1, 2, 3, 4, 5]);
        expect(response).toEqual();
    });
    test("a Notification: (2)", async () => {
        const response = await rpcClient.notify("foobar");
        expect(response).toEqual();
    });
    test("rpc call of non-existent method:", async () => {
        const response = await rpcClient.call("foobar");
        expect(response).toEqual({
            jsonrpc: "2.0",
            error: { code: -32601, message: "Method not found" },
            id: 5,
        });
    });
    test("rpc call with invalid JSON:", async () => {
        const response = await rpcClient.send(Buffer.from('{"jsonrpc": "2.0", "method": "foobar, "params": "bar", "baz]'));
        expect(response).toEqual();
    });
    test("rpc call with invalid Request object:", async () => {
        const response = await rpcClient.call(1, "bar");
        expect(response).toEqual({
            jsonrpc: "2.0",
            error: { code: -32600, message: "Invalid Request" },
            id: 6,
        });
    });
    test("rpc call Batch, invalid JSON:", async () => {
        const response = await rpcClient.send(Buffer.from(`[{"jsonrpc": "2.0", "method": "sum", "params": [1,2,4], "id": "1"},{"jsonrpc": "2.0", "method"]`));
        expect(response).toEqual();
    });
    test("rpc call with an empty Array:", async () => {
        const response = () => rpcClient.batch([]);
        expect(response).rejects.toThrow("Bad Request");
    });
    test("rpc call with an invalid Batch (but not empty):", async () => {
        const response = await rpcClient.batch([1]);
        expect(response).toEqual([
            {
                jsonrpc: "2.0",
                error: { code: -32600, message: "Invalid Request" },
                id: 7,
            },
        ]);
    });
    test("rpc call with invalid Batch:", async () => {
        const response = await rpcClient.batch([1, 2, 3]);
        expect(response).toEqual([
            {
                jsonrpc: "2.0",
                error: { code: -32600, message: "Invalid Request" },
                id: 8,
            },
            {
                jsonrpc: "2.0",
                error: { code: -32600, message: "Invalid Request" },
                id: 9,
            },
            {
                jsonrpc: "2.0",
                error: { code: -32600, message: "Invalid Request" },
                id: 10,
            },
        ]);
    });
    test("rpc call Batch:", async () => {
        const response = await rpcClient.batch([
            //
            { method: "sum", params: [1, 2, 4] },
            { notify: true, method: "notify_hello", params: [7] },
            { method: "subtract", params: [42, 23] },
            { foo: "boo" },
            { method: "foo.get", params: { name: "myself" } },
            { method: "get_data" },
        ]);
        expect(response).toEqual([
            { jsonrpc: "2.0", result: 7, id: 11 },
            { jsonrpc: "2.0", result: 19, id: 12 },
            {
                jsonrpc: "2.0",
                error: { code: -32600, message: "Invalid Request" },
                id: 13,
            },
            {
                jsonrpc: "2.0",
                error: { code: -32601, message: "Method not found" },
                id: 14,
            },
            { jsonrpc: "2.0", result: ["hello", 5], id: 15 },
        ]);
    });
    test("rpc call Batch (all notifications):", async () => {
        const response = await rpcClient.batch([
            { notify: true, method: "notify_sum", params: [1, 2, 4] },
            { notify: true, method: "notify_hello", params: [7] },
        ]);
        expect(response).toEqual([]);
    });
});
