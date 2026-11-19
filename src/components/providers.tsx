"use client";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { Tooltip } from "radix-ui";
import { useState } from "react";
import { Toaster } from "sonner";
import { ApiError } from "@/lib/fetcher";
import { useThemeSync } from "./app/theme";

export function Providers({ children }: { children: React.ReactNode }) {
  useThemeSync();
  const [client] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000,
            refetchOnWindowFocus: true,
            retry: (count, err) => !(err instanceof ApiError && err.status < 500) && count < 2,
          },
        },
      }),
  );
  return (
    <QueryClientProvider client={client}>
      <Tooltip.Provider delayDuration={350} skipDelayDuration={150}>
        {children}
      </Tooltip.Provider>
      <Toaster
        position="bottom-center"
        toastOptions={{
          className: "!rounded-[2px] !border-[1.5px] !border-ink-2 !bg-sheet !text-ink !shadow-[var(--shadow-sheet)] !font-sans !font-semibold",
        }}
      />
    </QueryClientProvider>
  );
}
