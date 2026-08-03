import type { NextRequest } from "next/server";
import { handlers } from "@/auth";

export async function GET(request: NextRequest, context: {
    params: Promise<{ nextauth: string[] }>;
}) {
    return handlers.GET(request);
}

export async function POST(request: NextRequest, context: {
    params: Promise<{ nextauth: string[] }>;
}) {
    return handlers.POST(request);
}
