"use client";

import { ReactNode, useState } from "react";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { SessionProvider } from "next-auth/react";
import { AuthProvider } from "@/components/auth-provider";

export function Providers({ children }: { children: ReactNode }) {
  // One QueryClient per browser session (created lazily so it survives re-renders).
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: { staleTime: 15_000, refetchOnWindowFocus: false },
        },
      }),
  );

  return (
    <SessionProvider>
      <AuthProvider>
        <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
      </AuthProvider>
    </SessionProvider>
  );
}
