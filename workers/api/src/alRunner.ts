export class AlRunner {
  constructor(private state: DurableObjectState) {}
  async fetch(request: Request) {
    const url = new URL(request.url);
    if (url.pathname.endsWith("/start")) {
      const body = await request.json<any>();
      await this.state.storage.put("job", body);
      await this.state.storage.setAlarm(Date.now() + 200);
      return new Response(JSON.stringify({ ok: true }));
    }
    return new Response("al runner");
  }

  async alarm() {
    const job = await this.state.storage.get<any>("job");
    if (!job) return;
    await fetch(`${job.origin}/api/projects/${job.projectId}/al/run-step`, { method: "POST", headers: { "x-internal-secret": job.secret } });
  }
}
