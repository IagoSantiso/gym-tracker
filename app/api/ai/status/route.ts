import { NextResponse } from "next/server";
import { aiConfigured, currentModel, providerName } from "@/lib/server/ai/chat";

export const dynamic = "force-dynamic";

export function GET() {
  return NextResponse.json({
    configured: aiConfigured(),
    provider: providerName(),
    model: aiConfigured() ? currentModel() : null,
    needsLogin: !!process.env.NEXT_PUBLIC_SUPABASE_URL && process.env.AI_ALLOW_ANONYMOUS !== "true",
  });
}
