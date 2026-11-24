const BASE_PATH = "/day17/api/v1";

export default {
  async fetch(request): Promise<Response> {
    const { pathname } = new URL(request.url);

    if (pathname === `${BASE_PATH}/greeting`) {
      if (request.method !== "GET") return Response.json({ error: "method_not_allowed" }, { status: 405, headers: { Allow: "GET" } });
      return Response.json({ message: "The Worker says hi" });
    }

    return Response.json({ error: "not_found" }, { status: 404 });
  },
} satisfies ExportedHandler<Env>;
