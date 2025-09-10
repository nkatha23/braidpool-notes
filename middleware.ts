// For prototype mode, we'll handle auth redirects in components instead

import type { NextRequest } from "next/server"

export async function middleware(request: NextRequest) {
  return
}

export const config = {
  matcher: [],
}
