const http = require('http');
const fs = require('fs');
const path = require('path');
const WebSocket = require('ws');

const PORT = 8765;
const ROOT = path.resolve(__dirname, '../public');

const clients = new Set();
const activeNotes = new Map();

const server = http.createServer((req, res) => {
  let pathname;
  try {
    pathname = decodeURIComponent(new URL(req.url, 'http://localhost').pathname);
  } catch {
    res.writeHead(400);
    return res.end('Bad request');
  }
  const requested = pathname === '/' ? '/index.html' : pathname;
  const file = path.resolve(ROOT, '.' + requested);

  if (!file.startsWith(ROOT + path.sep) && file !== path.join(ROOT, 'index.html')) {
    res.writeHead(403);
    return res.end('Forbidden');
  }

  fs.readFile(file, (err, data) => {
    if (err) {
      res.writeHead(404);
      return res.end('Not found');
    }

    const ext = path.extname(file);
    const types = {
      '.html': 'text/html; charset=utf-8',
      '.css': 'text/css; charset=utf-8',
      '.js': 'application/javascript; charset=utf-8'
    };

    res.writeHead(200, {
      'Content-Type': types[ext] || 'application/octet-stream',
      'Cache-Control': 'no-store'
    });
    res.end(data);
  });
});

const wss = new WebSocket.Server({ server, path: '/ws', maxPayload: 1024 });

function send(ws, data) {
  if (ws.readyState === WebSocket.OPEN) {
    ws.send(JSON.stringify(data));
  }
}

function broadcastStatus() {
  const bridgeOnline = Array.from(clients).some(c => c.role === 'bridge');

  clients.forEach(c => {
    send(c.ws, {
      type: 'status',
      bridgeOnline
    });
  });
}

function forwardToBridges(message) {
  clients.forEach(c => {
    if (c.role === 'bridge') send(c.ws, message);
  });
}

wss.on('connection', ws => {
  const client = { ws, role: null };
  clients.add(client);

  ws.on('message', raw => {
    let msg;

    try {
      msg = JSON.parse(raw.toString());
    } catch (e) {
      return;
    }

    if (!msg || typeof msg !== 'object' || Array.isArray(msg)) return;

    if (msg.type === 'hello') {
      client.role = msg.role === 'bridge' ? 'bridge' : 'controller';
      send(ws, { type: 'hello', ok: true, role: client.role });
      broadcastStatus();
      return;
    }

    if (client.role !== 'controller') return;

    if (msg.type === 'note_on' || msg.type === 'note_off') {
      const note = Number(msg.note);
      const defaultVelocity = msg.type === 'note_off' ? 0 : 100;
      const velocity = msg.velocity === undefined ? defaultVelocity : Number(msg.velocity);
      const channel = msg.channel === undefined ? 0 : Number(msg.channel);

      if (
        !Number.isInteger(note) || note < 0 || note > 127 ||
        !Number.isInteger(velocity) || velocity < 0 || velocity > 127 ||
        !Number.isInteger(channel) || channel < 0 || channel > 15
      ) return;

      const event = {
        type: msg.type,
        note,
        velocity,
        channel
      };

      const key = client.id + ':' + channel + ':' + note;

      if (msg.type === 'note_on') activeNotes.set(key, { client, note, channel });
      else activeNotes.delete(key);

      forwardToBridges(event);
      return;
    }

    if (msg.type === 'control_change') {
      const cc = Number(msg.controller);
      const value = Number(msg.value);
      const channel = msg.channel === undefined ? 0 : Number(msg.channel);

      if (
        Number.isInteger(cc) && cc >= 0 && cc <= 127 &&
        Number.isInteger(value) && value >= 0 && value <= 127 &&
        Number.isInteger(channel) && channel >= 0 && channel <= 15
      ) {
        forwardToBridges({
          type: 'control_change',
          controller: cc,
          value,
          channel
        });
      }
    }
  });

  client.id = Math.random().toString(36).slice(2);

  ws.on('close', () => {
    activeNotes.forEach((entry, key) => {
      if (entry.client === client) {
        forwardToBridges({
          type: 'note_off',
          note: entry.note,
          velocity: 0,
          channel: entry.channel
        });
        activeNotes.delete(key);
      }
    });

    clients.delete(client);
    broadcastStatus();
  });
});

server.listen(PORT, '0.0.0.0', () => {
  console.log('MIDI Stüdyosu şu portta çalışıyor: ' + PORT);
});
