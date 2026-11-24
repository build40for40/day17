import { API_BASE } from "contract";
import { handleAddHelper, handleCreateHousehold, handleDeleteHousehold, handleMe, handleRemoveHelper } from "./households/routes";
import { error, type Handler } from "./http";
import { handleCreateSignal, handleInboundSms, handleScheduled, handleSignOff, handleSolveSignal } from "./signals/routes";
import { handleVerifyCheck, handleVerifyStart } from "./verify/routes";

type Method = "GET" | "POST" | "DELETE";

const routes: Record<string, Partial<Record<Method, Handler>>> = {
  "/verify/start": { POST: handleVerifyStart },
  "/verify/check": { POST: handleVerifyCheck },
  "/me": { GET: handleMe },
  "/households": { POST: handleCreateHousehold },
  "/households/mine": { DELETE: handleDeleteHousehold },
  "/households/helpers": { POST: handleAddHelper, DELETE: handleRemoveHelper },
  "/signals": { POST: handleCreateSignal },
  "/signals/solve": { POST: handleSolveSignal },
  "/signals/sign-off": { POST: handleSignOff },
  "/sms/inbound": { POST: handleInboundSms },
};

export default {
  async fetch(request, env, ctx): Promise<Response> {
    const { pathname } = new URL(request.url);
    const methods = pathname.startsWith(`${API_BASE}/`) ? routes[pathname.slice(API_BASE.length)] : undefined;
    if (!methods) return error("not_found", 404);

    const handler = methods[request.method as Method];
    if (!handler) return error("method_not_allowed", 405, { Allow: Object.keys(methods).join(", ") });

    try {
      return await handler(request, env, ctx);
    } catch (cause) {
      console.error(`${request.method} ${pathname} failed`, cause);
      return error("internal_error", 500);
    }
  },

  async scheduled(controller, env, ctx): Promise<void> {
    await handleScheduled(controller, env, ctx);
  },
} satisfies ExportedHandler<Env>;
