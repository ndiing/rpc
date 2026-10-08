const { Router } = require("../src/rpc");

const router = new Router();
router.add("subtract", (req, res) => {
    let minuend;
    let subtrahend;
    Array.isArray(req.params) ? ([minuend, subtrahend] = req.params) : ({ minuend, subtrahend } = req.params);
    res.send(minuend - subtrahend);
});
router.add("update", (req, res, next) => {
    console.log("router => update", req.params);
    next();
});
router.add("sum", (req, res) => {
    res.send(req.params.reduce((a, c) => a + c, 0));
});
router.add("notify_hello", (req, res, next) => {
    console.log("router => notify_hello", req.params);
    next();
});
router.add("get_data", (req, res, next) => {
    res.send(["hello", 5]);
});
router.add("notify_sum", (req, res, next) => {
    console.log("router => notify_sum", req.params);
    next();
});

describe("router", () => {
    test("rpc call with positional parameters: (1)", async () => {
        const result = await new Promise((resolve) => {
            router.handleRequest(Buffer.from('{"jsonrpc": "2.0", "method": "subtract", "params": [42, 23], "id": 1}'), {
                send: resolve,
            });
        });
        expect(result).toBe('{"jsonrpc":"2.0","result":19,"id":1}');
    });
    test("rpc call with positional parameters: (2)", async () => {
        const result = await new Promise((resolve) => {
            router.handleRequest(Buffer.from('{"jsonrpc": "2.0", "method": "subtract", "params": [23, 42], "id": 2}'), {
                send: resolve,
            });
        });
        expect(result).toBe('{"jsonrpc":"2.0","result":-19,"id":2}');
    });
    test("rpc call with named parameters: (1)", async () => {
        const result = await new Promise((resolve) => {
            router.handleRequest(Buffer.from('{"jsonrpc": "2.0", "method": "subtract", "params": {"subtrahend": 23, "minuend": 42}, "id": 3}'), {
                send: resolve,
            });
        });
        expect(result).toBe('{"jsonrpc":"2.0","result":19,"id":3}');
    });
    test("rpc call with named parameters: (2)", async () => {
        const result = await new Promise((resolve) => {
            router.handleRequest(Buffer.from('{"jsonrpc": "2.0", "method": "subtract", "params": {"minuend": 42, "subtrahend": 23}, "id": 4}'), {
                send: resolve,
            });
        });
        expect(result).toBe('{"jsonrpc":"2.0","result":19,"id":4}');
    });
    test("a Notification: (1)", async () => {
        const result = await new Promise((resolve) => {
            router.handleRequest(Buffer.from('{"jsonrpc": "2.0", "method": "update", "params": [1,2,3,4,5]}'), {
                send: resolve,
            });
            setTimeout(resolve, 100);
        });
        expect(result).toBe();
    });
    test("a Notification: (2)", async () => {
        const result = await new Promise((resolve) => {
            router.handleRequest(Buffer.from('{"jsonrpc": "2.0", "method": "foobar"}'), {
                send: resolve,
            });
            setTimeout(resolve, 100);
        });
        expect(result).toBe();
    });
    test("rpc call of non-existent method:", async () => {
        const result = await new Promise((resolve) => {
            router.handleRequest(Buffer.from('{"jsonrpc": "2.0", "method": "foobar", "id": "1"}'), {
                send: resolve,
            });
        });
        expect(result).toBe('{"jsonrpc":"2.0","error":{"code":-32601,"message":"Method not found"},"id":"1"}');
    });
    test("rpc call with invalid JSON:", async () => {
        const result = await new Promise((resolve) => {
            router.handleRequest(Buffer.from('{"jsonrpc": "2.0", "method": "foobar, "params": "bar", "baz]'), {
                send: resolve,
            });
        });
        expect(result).toBe('{"jsonrpc":"2.0","error":{"code":-32700,"message":"Parse error"},"id":null}');
    });
    test("rpc call with invalid Request object:", async () => {
        const result = await new Promise((resolve) => {
            router.handleRequest(Buffer.from('{"jsonrpc": "2.0", "method": 1, "params": "bar"}'), {
                send: resolve,
            });
        });
        expect(result).toBe('{"jsonrpc":"2.0","error":{"code":-32600,"message":"Invalid Request"},"id":null}');
    });
    test("rpc call Batch, invalid JSON:", async () => {
        const result = await new Promise((resolve) => {
            router.handleRequest(
                Buffer.from(`[
                    {"jsonrpc": "2.0", "method": "sum", "params": [1,2,4], "id": "1"},
                    {"jsonrpc": "2.0", "method"
                ]`),
                {
                    send: resolve,
                },
            );
        });
        expect(result).toBe('{"jsonrpc":"2.0","error":{"code":-32700,"message":"Parse error"},"id":null}');
    });
    test("rpc call with an empty Array:", async () => {
        const result = await new Promise((resolve) => {
            router.handleRequest(Buffer.from("[]"), {
                send: resolve,
            });
        });
        expect(result).toBe('{"jsonrpc":"2.0","error":{"code":-32600,"message":"Invalid Request"},"id":null}');
    });
    test("rpc call with an invalid Batch (but not empty):", async () => {
        const result = await new Promise((resolve) => {
            router.handleRequest(Buffer.from("[1]"), {
                send: resolve,
            });
        });
        expect(result).toBe('[{"jsonrpc":"2.0","error":{"code":-32600,"message":"Invalid Request"},"id":null}]');
    });
    test("rpc call with invalid Batch:", async () => {
        const result = await new Promise((resolve) => {
            router.handleRequest(Buffer.from("[1,2,3]"), {
                send: resolve,
            });
        });
        expect(result).toBe('[{"jsonrpc":"2.0","error":{"code":-32600,"message":"Invalid Request"},"id":null},{"jsonrpc":"2.0","error":{"code":-32600,"message":"Invalid Request"},"id":null},{"jsonrpc":"2.0","error":{"code":-32600,"message":"Invalid Request"},"id":null}]');
    });
    test("rpc call Batch:", async () => {
        const result = await new Promise((resolve) => {
            router.handleRequest(
                Buffer.from(`[
                    {"jsonrpc": "2.0", "method": "sum", "params": [1,2,4], "id": "1"},
                    {"jsonrpc": "2.0", "method": "notify_hello", "params": [7]},
                    {"jsonrpc": "2.0", "method": "subtract", "params": [42,23], "id": "2"},
                    {"foo": "boo"},
                    {"jsonrpc": "2.0", "method": "foo.get", "params": {"name": "myself"}, "id": "5"},
                    {"jsonrpc": "2.0", "method": "get_data", "id": "9"} 
                ]`),
                {
                    send: resolve,
                },
            );
        });
        expect(result).toBe('[{"jsonrpc":"2.0","result":7,"id":"1"},{"jsonrpc":"2.0","result":19,"id":"2"},{"jsonrpc":"2.0","error":{"code":-32600,"message":"Invalid Request"},"id":null},{"jsonrpc":"2.0","error":{"code":-32601,"message":"Method not found"},"id":"5"},{"jsonrpc":"2.0","result":["hello",5],"id":"9"}]');
    });
    test("rpc call Batch (all notifications):", async () => {
        const result = await new Promise((resolve) => {
            router.handleRequest(
                Buffer.from(`[
                    {"jsonrpc": "2.0", "method": "notify_sum", "params": [1,2,4]},
                    {"jsonrpc": "2.0", "method": "notify_hello", "params": [7]}
                ]`),
                {
                    send: resolve,
                },
            );
            setTimeout(resolve, 100);
        });
        expect(result).toBe();
    });
});
