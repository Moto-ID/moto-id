import { createMiddleware } from "hono/factory";
import { getCookie, setCookie, deleteCookie } from "hono/cookie";
import type { Env } from "../types";
import { getSessionUser } from "./db";

const COOKIE_NAME = "moto_id_session";

export function setSessionCookie(c: any, token: string) {
  setCookie(c, COOKIE_NAME, token, {
      httpOnly: true,
          secure: true,
              sameSite: "Lax",
                  path: "/",
                      maxAge: 60 * 60 * 24 * 30, // 30 days
                        });
                        }

                        export function clearSessionCookie(c: any) {
                          deleteCookie(c, COOKIE_NAME, { path: "/" });
                          }

                          /** Runs on every request: attaches the signed-in user (or null) to context, never blocks. */
                          export const attachUser = createMiddleware<Env>(async (c, next) => {
                            const token = getCookie(c, COOKIE_NAME);
                              if (token) {
                                  const user = await getSessionUser(c.env.DB, token);
                                      c.set("user", user);
                                        } else {
                                            c.set("user", null);
                                              }
                                                await next();
                                                });

                                                /** Blocks a route unless a user is signed in, redirecting to /login otherwise. */
                                                export const requireAuth = createMiddleware<Env>(async (c, next) => {
                                                  const user = c.get("user");
                                                    if (!user) {
                                                        const next_ = encodeURIComponent(c.req.path);
                                                            return c.redirect(`/login?next=${next_}`);
                                                              }
                                                                await next();
                                                                });
                                                                
