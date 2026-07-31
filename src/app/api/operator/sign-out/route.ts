import { NextResponse } from "next/server";
import { signOutOperator } from "@/lib/operator-session";

/**
 * Sign-out is a POST route rather than a link so that a prefetch, a crawler or
 * an image tag cannot end an operator's session.
 */
export async function POST(request: Request): Promise<Response> {
  await signOutOperator();

  return NextResponse.redirect(new URL("/signin", request.url), {
    status: 303,
  });
}
