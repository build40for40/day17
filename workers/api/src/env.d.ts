// Optional secrets stay out of `secrets.required`, so wrangler types can't see them.
interface Env {
  TURNSTILE_SECRET?: string;
  ALLOW_FAKE_SMS?: string;
  TEXTBELT_KEY?: string;
}

declare namespace Cloudflare {
  interface Env {
    TURNSTILE_SECRET?: string;
    ALLOW_FAKE_SMS?: string;
    TEXTBELT_KEY?: string;
  }
}
