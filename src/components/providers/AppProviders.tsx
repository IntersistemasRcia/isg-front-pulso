"use client";

import { AppRouterCacheProvider } from "@mui/material-nextjs/v16-appRouter";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import CssBaseline from "@mui/material/CssBaseline";
import { AuthProvider } from "@/components/providers/AuthProvider";

const theme = createTheme({
  palette: {
    mode: "light",
    primary: {
      main: "#ff8a00",
      dark: "#ff6a00",
      light: "#ffb380",
      contrastText: "#ffffff",
    },
    secondary: {
      main: "#6A2ED2",
      contrastText: "#ffffff",
    },
    error: {
      main: "#c62828",
    },
    background: {
      default: "#fbf9fb",
      paper: "#ffffff",
    },
    text: {
      primary: "#333333",
      secondary: "#5c5663",
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
