# @ndiinginc/rpc

JSON-RPC 2.0 over WebSocket untuk Node.js. **Dua arah**: client bisa memanggil server, server juga bisa memanggil client. Routing ala Express (middleware, `next()`, error handler), batch, notification, dan auto-reconnect.

## Fitur

- JSON-RPC 2.0 lengkap: request, notification, batch, error code standar
- Bidirectional: `RPCServer` dan `RPCClient` sama-sama punya `add()`, `call()`, `notify()`, `batch()`
- Router bergaya Express: middleware chain, `next()`, error handler 4 argumen, sub-router
- Namespace method dengan titik (`user.profile.get`)
- Auto-reconnect dengan exponential backoff + jitter
- Antrian pesan otomatis saat koneksi sedang putus
- Timeout request (default 30 detik)

## Instalasi

```bash
npm install @ndiinginc/rpc
```

Membutuhkan **Node.js 22.1+** (memakai `URL.parse` dan `Array.prototype.toSorted`). Dependensi: [`ws`](https://github.com/websockets/ws).

## Quick Start

### Server

```js
const { RPCServer } = require("@ndiinginc/rpc");

const server = new RPCServer({ port: 3000 });

server.add("sum", (req, res) => {
    res.send(req.params.reduce((a, b) => a + b, 0));
});

server.connect();
```

### Client

```js
const { RPCClient } = require("@ndiinginc/rpc");

const client = new RPCClient("ws://localhost:3000/?clientId=device-001");
client.connect();

const response = await client.call("sum", [1, 2, 4]);
console.log(response); // { jsonrpc: "2.0", result: 7, id: 1 }
```

> `call()` me-resolve **objek response JSON-RPC lengkap** (`result` atau `error`), bukan hanya nilai `result`-nya.

### Server memanggil Client

Client yang mengirim `clientId` di query string bisa dipanggil balik oleh server:

```js
// client
client.add("reboot", (req, res) => res.send({ ok: true }));

// server
const response = await server.call("device-001", "reboot", { delay: 5 });
server.notify("device-001", "update", [1, 2, 3]);
server.broadcast("maintenance", { at: "02:00" }); // ke semua client ber-clientId
```

Client tanpa `clientId` tetap bisa memanggil server, tapi server tidak bisa memanggilnya balik.

## Router

`RPCServer` dan `RPCClient` sama-sama turunan `Router`. `Router` juga bisa dipakai sendiri untuk memecah handler per modul.

### Handler

```js
router.add("method.name", (req, res, next) => {
    // req.method, req.params, req.id
    res.send(result); // kirim hasil
    // atau next() untuk lanjut ke handler berikutnya
});
```

- `res.send(value)` mengirim `result`. Jika `value` adalah `Error`, dikirim sebagai `error` (`code` dan `message`).
- Handler dijalankan sesuai urutan pendaftaran.
- Jika semua handler memanggil `next()` tanpa ada yang membalas, response berupa `-32601 Method not found`.
- Untuk notification (request tanpa `id`), handler tetap dijalankan tetapi tidak ada response yang dikirim.

### Middleware & prefix matching

Handler yang didaftarkan pada suatu namespace juga berlaku untuk semua turunannya. Handler tanpa method berlaku global.

```js
router.add((req, res, next) => {           // global
    console.log("->", req.method);
    next();
});

router.add("user", (req, res, next) => {   // berlaku untuk user.*
    if (!isAuthorized(req)) return res.send(Object.assign(new Error("Unauthorized"), { code: -32001 }));
    next();
});

router.add("user.get", (req, res) => res.send({ name: "Ndiing" }));
```

### Error handler

Handler dengan **4 argumen** hanya dipanggil saat terjadi error:

```js
router.add((err, req, res, next) => {
    res.send(err); // atau ubah error dulu
});
```

### Sub-router

Jika argumen terakhir adalah `Router`, isinya digabungkan ke namespace tersebut:

```js
const { Router, RPCServer } = require("@ndiinginc/rpc");

const user = new Router();
user.add("get", (req, res) => res.send({ id: req.params.id }));
user.add("list", (req, res) => res.send([]));

const server = new RPCServer({ port: 3000 });
server.add("user", user); // user.get, user.list
server.connect();
```

## Batch & Notification

```js
const responses = await client.batch([
    { method: "sum", params: [1, 2, 4] },
    { method: "subtract", params: { minuend: 42, subtrahend: 23 } },
    { notify: true, method: "notify_hello", params: [7] }, // tidak menunggu response
]);
```

- Item dengan `notify: true` dikirim sebagai notification dan tidak muncul di hasil.
- Hasil berupa array response sesuai urutan request non-notification. Request yang gagal (timeout/koneksi putus) berisi objek `Error`.
- Array kosong melempar `Error("Bad Request")`.

## API

### `new RPCServer(options)`

`options` diteruskan ke [`WebSocketServer`](https://github.com/websockets/ws/blob/master/doc/ws.md#class-websocketserver) milik `ws`.

| Method | Keterangan |
| --- | --- |
| `connect()` | Mulai menjalankan WebSocket server |
| `close()` | Tutup semua koneksi dan hentikan server |
| `call(clientId, method, params)` | Request ke client, mengembalikan `Promise` |
| `notify(clientId, method, params)` | Notification ke client |
| `batch(clientId, requests)` | Batch request ke client |
| `broadcast(method, params)` | Notification ke semua client yang terhubung |
| `send(clientId, data)` | Kirim data mentah ke client |
| `clients` | `Map<clientId, WebSocket>` |

### `new RPCClient(address, options)`

`address` adalah URL WebSocket. Tambahkan `?clientId=...` agar server bisa memanggil client ini.

| Option | Default | Keterangan |
| --- | --- | --- |
| `maxAttempts` | `10` | Maksimum percobaan reconnect berturut-turut |
| `baseDelay` | `1000` | Delay dasar reconnect (ms) |
| `maxDelay` | `30000` | Batas atas delay reconnect (ms) |

| Method | Keterangan |
| --- | --- |
| `connect()` | Buka koneksi |
| `close()` | Tutup koneksi |
| `call(method, params)` | Request ke server, mengembalikan `Promise` |
| `notify(method, params)` | Notification ke server |
| `batch(requests)` | Batch request ke server |
| `send(data)` | Kirim data mentah (diantrikan jika belum terhubung) |

### `Router`

| Member | Keterangan |
| --- | --- |
| `add([method], ...handlers)` | Daftarkan handler / middleware / sub-router |
| `handleRequest(req, res)` | Proses satu pesan masuk, `res` berupa `{ send(string) }` |
| `timeout` | Timeout handler dan request dalam ms (default `30000`) |

### Event

| Event | Argumen | Keterangan |
| --- | --- | --- |
| `response` | `data` | Dipancarkan untuk setiap response yang diterima |

## Reconnect

Setelah koneksi terputus, client mencoba tersambung lagi dengan jeda:

```
delay = min(baseDelay * 2^attempt, maxDelay) + random(0..1000) ms
```

- Counter percobaan di-reset saat koneksi berhasil.
- Request yang sedang menunggu saat koneksi putus langsung ditolak dengan `Error("Connection closed")`.
- Pesan yang dikirim saat offline masuk antrian dan dikirim otomatis setelah tersambung.
- Setelah `maxAttempts` gagal, client berhenti mencoba.

## Error Code

| Code | Message | Penyebab |
| --- | --- | --- |
| `-32700` | Parse error | JSON tidak valid |
| `-32600` | Invalid Request | Bukan request JSON-RPC 2.0 yang valid |
| `-32601` | Method not found | Tidak ada handler yang membalas |
| `-32602` | Invalid params | `params` bukan array atau object |
| `-32603` | Internal error (Request Timeout) | Handler tidak membalas dalam `timeout` |

## Testing

```bash
npm test
```

## Lisensi

MIT
