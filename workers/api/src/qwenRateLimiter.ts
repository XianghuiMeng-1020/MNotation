export class QwenRateLimiter {
  private inflight = 0;
  private readonly max = 20;
  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/acquire")) {
      if (this.inflight >= this.max) return new Response(JSON.stringify({ ok: false }), { status: 429 });
      this.inflight += 1;
      return new Response(JSON.stringify({ ok: true, inflight: this.inflight }));
    }
    if (url.pathname.endsWith("/release")) {
      this.inflight = Math.max(0, this.inflight - 1);
      return new Response(JSON.stringify({ ok: true, inflight: this.inflight }));
    }
    return new Response(JSON.stringify({ inflight: this.inflight, max: this.max }));
  }
}
