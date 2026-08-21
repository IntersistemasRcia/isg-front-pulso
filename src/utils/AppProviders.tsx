"use client";

import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { AuthProvider } from "@/utils/AuthProvider";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#0b4f6c",
      dark: "#083a50",
      light: "#1a6f94",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#01baef",
    },
    error: {
      main: "#c62828",
    },
    background: {
      default: "#f5f7f9",
      paper: "#ffffff",
    },
    text: {
      primary: "#1a2332",
      secondary: "#5a6b7d",
    },
  },
  typography: {
    fontFamily: "var(--font-source-sans), 'Segoe UI', sans-serif",
    button: {
      textTransform: "none",
      fontWeight: 600,
    },
  },
  shape: {
    borderRadius: 8,
  },
});

export function AppProviders({ children }: { children: React.ReactNode }) {
  return (
    <AppRouterCacheProvider>
      <ThemeProvider theme={theme}>
        <CssBaseline />
        <AuthProvider>{children}</AuthProvider>
      </ThemeProvider>
    </AppRouterCacheProvider>
  );
}
