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
    res.write(`data: ${JSON.stringify({ type: 'connected', seq: this.eventSeq })}\n\n`);

    const hb = setInterval(() => res.write(': hb\n\n'), 15000);
    this.clients.add(res);
    this.heartbeats.set(res, hb);

    req.on('close', () => {
      clearInterval(hb);
      this.heartbeats.delete(res);
      this.clients.delete(res);
    });
  }

  broadcast(data) {
    data.seq = ++this.eventSeq;
    const msg = `data: ${JSON.stringify(data)}\n\n`;
    this.clients.forEach((c) => c.write(msg));
  }

  reset() {
    this.eventSeq = 0;
    this.broadcast({ type: 'reset' });
  }

  shutdown() {
    this.heartbeats.forEach((hb) => clearInterval(hb));
    this.heartbeats.clear();
    this.clients.forEach((c) => c.end());
    this.clients.clear();
  }
}

export default new SSEService();
