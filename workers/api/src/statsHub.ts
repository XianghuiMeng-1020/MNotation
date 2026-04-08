export class StatsHub {
  private state: DurableObjectState;
  private sessions = new Set<WebSocket>();
  constructor(state: DurableObjectState) {
    this.state = state;
  }
  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/broadcast")) {
      const payload = await request.text();
      for (const ws of this.sessions) ws.send(payload);
      return new Response("ok");
    }
    if (url.pathname.endsWith("/ws")) {
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      this.sessions.add(server);
      server.addEventListener("close", () => this.sessions.delete(server));
      return new Response(null, { status: 101, webSocket: client });
    }
    return new Response("stats hub");
  }
}
