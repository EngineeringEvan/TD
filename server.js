// server.js - Zero-dependency Node.js LAN Co-Op Server for Bloons TD
const http = require('http');
const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');

const PORT = parseInt(process.env.PORT || process.argv[2] || '3000', 10);
const CLIENT_DIR = __dirname;

function getLocalIpAddresses() {
  const interfaces = os.networkInterfaces();
  const addrs = [];
  for (const name of Object.keys(interfaces)) {
    for (const iface of interfaces[name]) {
      if (iface.family === 'IPv4' && !iface.internal) {
        addrs.push({ name, ip: iface.address });
      }
    }
  }
  return addrs;
}

const MIME_TYPES = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon'
};

const server = http.createServer((req, res) => {
  let reqPath = decodeURI(req.url.split('?')[0]);
  if (reqPath === '/' || reqPath === '') reqPath = '/index.html';

  const filePath = path.join(CLIENT_DIR, reqPath);
  if (!filePath.startsWith(CLIENT_DIR)) {
    res.writeHead(403);
    res.end('Access denied');
    return;
  }

  fs.stat(filePath, (err, stats) => {
    if (err || !stats.isFile()) {
      res.writeHead(404, { 'Content-Type': 'text/plain' });
      res.end('404 Not Found');
      return;
    }

    const ext = path.extname(filePath).toLowerCase();
    const contentType = MIME_TYPES[ext] || 'application/octet-stream';

    res.writeHead(200, {
      'Content-Type': contentType,
      'Access-Control-Allow-Origin': '*'
    });
    fs.createReadStream(filePath).pipe(res);
  });
});

const rooms = new Map();
const clientRoomMap = new Map();

function computeAcceptKey(key) {
  return crypto.createHash('sha1')
    .update(key + '258EAFA5-E914-47DA-95CA-C5AB0DC85B11')
    .digest('base64');
}

function sendWsMessage(socket, data) {
  if (socket.destroyed || !socket.writable) return;
  const payload = Buffer.from(typeof data === 'string' ? data : JSON.stringify(data));
  const length = payload.length;

  let header;
  if (length < 126) {
    header = Buffer.alloc(2);
    header[0] = 0x81;
    header[1] = length;
  } else if (length < 65536) {
    header = Buffer.alloc(4);
    header[0] = 0x81;
    header[1] = 126;
    header.writeUInt16BE(length, 2);
  } else {
    header = Buffer.alloc(10);
    header[0] = 0x81;
    header[1] = 127;
    header.writeBigUInt64BE(BigInt(length), 2);
  }

  try {
    socket.write(Buffer.concat([header, payload]));
  } catch (err) {
    console.error('Socket write error:', err.message);
  }
}

server.on('upgrade', (req, socket, head) => {
  if (req.headers['upgrade'] && req.headers['upgrade'].toLowerCase() === 'websocket') {
    const key = req.headers['sec-websocket-key'];
    if (!key) {
      socket.destroy();
      return;
    }

    const acceptKey = computeAcceptKey(key);
    const headers = [
      'HTTP/1.1 101 Switching Protocols',
      'Upgrade: websocket',
      'Connection: Upgrade',
      `Sec-WebSocket-Accept: ${acceptKey}`
    ];
    socket.write(headers.join('\r\n') + '\r\n\r\n');

    handleWsConnection(socket);
  } else {
    socket.destroy();
  }
});

function handleWsConnection(socket) {
  let buffer = Buffer.alloc(0);

  socket.on('data', (chunk) => {
    buffer = Buffer.concat([buffer, chunk]);

    while (buffer.length >= 2) {
      const firstByte = buffer[0];
      const secondByte = buffer[1];
      const opcode = firstByte & 0x0f;
      const isMasked = (secondByte & 0x80) !== 0;
      let payloadLength = secondByte & 0x7f;
      let offset = 2;

      if (opcode === 0x08) {
        socket.end();
        return;
      }
      if (opcode === 0x09) {
        const pong = Buffer.alloc(2);
        pong[0] = 0x8A;
        pong[1] = 0x00;
        socket.write(pong);
        buffer = buffer.subarray(2);
        continue;
      }

      if (payloadLength === 126) {
        if (buffer.length < 4) return;
        payloadLength = buffer.readUInt16BE(2);
        offset = 4;
      } else if (payloadLength === 127) {
        if (buffer.length < 10) return;
        payloadLength = Number(buffer.readBigUInt64BE(2));
        offset = 10;
      }

      const maskKeyLength = isMasked ? 4 : 0;
      if (buffer.length < offset + maskKeyLength + payloadLength) return;

      let maskKey;
      if (isMasked) {
        maskKey = buffer.subarray(offset, offset + 4);
        offset += 4;
      }

      const payload = buffer.subarray(offset, offset + payloadLength);
      if (isMasked) {
        for (let i = 0; i < payload.length; i++) {
          payload[i] ^= maskKey[i % 4];
        }
      }

      buffer = buffer.subarray(offset + payloadLength);

      try {
        const text = payload.toString('utf-8');
        const msg = JSON.parse(text);
        processClientMessage(socket, msg);
      } catch (e) {
        console.error('Invalid message from client:', e.message);
      }
    }
  });

  socket.on('close', () => handleSocketDisconnect(socket));
  socket.on('error', () => handleSocketDisconnect(socket));
}

function processClientMessage(socket, msg) {
  const { type, roomId, name, payload } = msg;

  if (type === 'HOST_ROOM') {
    const rId = (roomId || Math.floor(1000 + Math.random() * 9000).toString()).toUpperCase();
    const room = {
      roomId: rId,
      host: socket,
      client: null,
      state: null,
      hostName: name || 'Player 1'
    };
    rooms.set(rId, room);
    clientRoomMap.set(socket, { roomId: rId, role: 'host', name: room.hostName });

    sendWsMessage(socket, {
      type: 'ROOM_CREATED',
      roomId: rId,
      role: 'host',
      message: `Room ${rId} created! Waiting for partner to join...`
    });
    console.log(`[LOBBY] Room ${rId} hosted by ${room.hostName}`);
    return;
  }

  if (type === 'JOIN_ROOM') {
    const rId = (roomId || '').trim().toUpperCase();
    const room = rooms.get(rId);

    if (!room) {
      sendWsMessage(socket, {
        type: 'ERROR',
        message: `Room "${rId}" not found. Check the code or host a new room!`
      });
      return;
    }

    if (room.client && !room.client.destroyed) {
      sendWsMessage(socket, {
        type: 'ERROR',
        message: `Room "${rId}" is already full (2/2 players)!`
      });
      return;
    }

    room.client = socket;
    const clientName = name || 'Player 2';
    room.clientName = clientName;
    clientRoomMap.set(socket, { roomId: rId, role: 'client', name: clientName });

    sendWsMessage(socket, {
      type: 'ROOM_JOINED',
      roomId: rId,
      role: 'client',
      hostName: room.hostName,
      message: `Joined room ${rId}! Connected with host ${room.hostName}.`
    });

    sendWsMessage(room.host, {
      type: 'PEER_CONNECTED',
      roomId: rId,
      peerName: clientName,
      role: 'client',
      message: `${clientName} joined the co-op session!`
    });

    console.log(`[LOBBY] ${clientName} joined Room ${rId}`);
    return;
  }

  const info = clientRoomMap.get(socket);
  if (!info) return;

  const room = rooms.get(info.roomId);
  if (!room) return;

  const peerSocket = info.role === 'host' ? room.client : room.host;
  if (peerSocket && !peerSocket.destroyed) {
    sendWsMessage(peerSocket, {
      type,
      senderRole: info.role,
      senderName: info.name,
      payload
    });
  }
}

function handleSocketDisconnect(socket) {
  const info = clientRoomMap.get(socket);
  if (!info) return;

  const room = rooms.get(info.roomId);
  if (room) {
    const peerSocket = info.role === 'host' ? room.client : room.host;
    if (peerSocket && !peerSocket.destroyed) {
      sendWsMessage(peerSocket, {
        type: 'PEER_DISCONNECTED',
        senderRole: info.role,
        message: `${info.name} disconnected.`
      });
    }
    if (info.role === 'host') {
      rooms.delete(info.roomId);
      console.log(`[LOBBY] Room ${info.roomId} closed (Host left).`);
    } else {
      room.client = null;
      console.log(`[LOBBY] Client left room ${info.roomId}`);
    }
  }

  clientRoomMap.delete(socket);
}

server.listen(PORT, '0.0.0.0', () => {
  const ips = getLocalIpAddresses();
  console.log('=====================================================');
  console.log(' BLOONS CO-OP TD LAN & ONLINE SERVER STARTED!');
  console.log(`Port: ${PORT}`);
  console.log('-----------------------------------------------------');
  console.log(' Local Access (This PC):');
  console.log(`   http://localhost:${PORT}/`);
  console.log('');
  console.log(' LAN / Wi-Fi Access (Other PC / Laptop / Phone):');
  if (ips.length > 0) {
    for (const item of ips) {
      console.log(`   http://${item.ip}:${PORT}/  (${item.name})`);
    }
  } else {
    console.log(`   http://<YOUR-LAN-IP>:${PORT}/`);
  }
  console.log('=====================================================');
});
