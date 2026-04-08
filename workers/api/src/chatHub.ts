export class ChatHub {
  private state: DurableObjectState;
  private sockets = new Map<WebSocket, { projectId: string; userId: string }>();

  constructor(state: DurableObjectState) {
    this.state = state;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    if (url.pathname.endsWith("/ws")) {
      const userId = url.searchParams.get("user_id") ?? "anonymous";
      const projectId = url.searchParams.get("project_id") ?? "unknown";
      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);
      server.accept();
      this.sockets.set(server, { projectId, userId });

      // Send last 50 messages from storage on connect
      const history = await this.state.storage.get<string[]>("messages") ?? [];
      const recent = history.slice(-50);
      for (const msg of recent) {
        try { server.send(msg); } catch { /* ignore */ }
      }

      server.addEventListener("message", async (ev) => {
        const payload = String(ev.data);
        await this.persistMessage(payload);
        this.broadcastToOthers(server, payload);
      });

      server.addEventListener("close", () => {
        this.sockets.delete(server);
      });

      server.addEventListener("error", () => {
        this.sockets.delete(server);
      });

      return new Response(null, { status: 101, webSocket: client });
    }

    if (url.pathname.endsWith("/broadcast")) {
      const payload = await request.text();
      await this.persistMessage(payload);
      this.broadcastToAll(payload);
      return new Response("ok");
    }

    if (url.pathname.endsWith("/history")) {
      const history = await this.state.storage.get<string[]>("messages") ?? [];
      return new Response(JSON.stringify(history.slice(-100)), {
        headers: { "content-type": "application/json" }
      });
    }

    return new Response("chat hub", { status: 200 });
  }

  private async persistMessage(payload: string) {
    try {
      const history = await this.state.storage.get<string[]>("messages") ?? [];
      history.push(payload);
      // Keep last 500 messages
      const trimmed = history.slice(-500);
      await this.state.storage.put("messages", trimmed);
    } catch { /* storage errors should not break broadcasts */ }
  }

  private broadcastToAll(payload: string) {
    for (const [ws] of this.sockets) {
      try { ws.send(payload); } catch { this.sockets.delete(ws); }
    }
  }

  private broadcastToOthers(sender: WebSocket, payload: string) {
    for (const [ws] of this.sockets) {
      if (ws !== sender) {
        try { ws.send(payload); } catch { this.sockets.delete(ws); }
      }
    }
  }
}
