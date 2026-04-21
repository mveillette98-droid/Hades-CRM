import { NextResponse, type NextRequest } from "next/server";

// Auth is enforced in app/(app)/layout.tsx using the server Supabase client.
// Middleware is kept minimal so it can run on the Edge runtime without pulling
// in @supabase/ssr's transitive deps (which break Edge bundling on Vercel).
export function middleware(_request: NextRequest) {
  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
