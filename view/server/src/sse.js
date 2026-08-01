import { getGeneration } from './db.js';

class SSEService {
  constructor() {
    this.clients = new Set();
    this.heartbeats = new Map();
    this.eventSeq = 0;
  }

  addClient(req, res) {
    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders();

    res.write(
      `data: ${JSON.stringify({
        type: 'connected',
        seq: this.eventSeq,
        generation: getGeneration()
      })}\n\n`
    );

    const heartbeat = setInterval(() => res.write(': hb\n\n'), 15000);

    this.clients.add(res);
    this.heartbeats.set(res, heartbeat);

    req.on('close', () => {
      clearInterval(heartbeat);
      this.heartbeats.delete(res);
      this.clients.delete(res);
    });
  }

  broadcast(data) {
    const payload = {
      ...data,
      seq: ++this.eventSeq,
      generation: getGeneration()
    };

    const message = `data: ${JSON.stringify(payload)}\n\n`;

    for (const client of this.clients) {
      client.write(message);
    }

    return payload;
  }

  reset() {
    this.eventSeq = 0;

    return this.broadcast({
      type: 'reset'
    });
  }

  shutdown() {
    for (const heartbeat of this.heartbeats.values()) {
      clearInterval(heartbeat);
    }

    this.heartbeats.clear();

    for (const client of this.clients) {
      client.end();
    }

    this.clients.clear();
  }
}

export default new SSEService();
