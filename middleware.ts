import { type NextRequest } from "next/server";
import { updateSession } from "@/lib/supabase/session";

export async function middleware(request: NextRequest) {
  return await updateSession(request);
}

export const config = {
  matcher: [
    /*
     * Run on all paths except static assets and api routes where auth
     * is handled separately.
     */
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
