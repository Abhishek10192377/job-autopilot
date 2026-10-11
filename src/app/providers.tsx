"use client";

import { Alert, CssBaseline, Snackbar } from "@mui/material";
import { createTheme, ThemeProvider } from "@mui/material/styles";
import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from "react";

const theme = createTheme({
  cssVariables: { colorSchemeSelector: "data" },
  colorSchemes: {
    light: { palette: { primary: { main: "#2456d6" }, secondary: { main: "#0f766e" }, background: { default: "#f5f6f9", paper: "#ffffff" } } },
    dark: { palette: { primary: { main: "#8fb0ff" }, secondary: { main: "#5eead4" }, background: { default: "#0f1218", paper: "#171b23" } } },
  },
  shape: { borderRadius: 10 },
  typography: {
    fontFamily: 'Inter, "Segoe UI", system-ui, -apple-system, Roboto, Arial, sans-serif',
    h1: { fontSize: "1.6rem", fontWeight: 700 },
    h2: { fontSize: "1.1rem", fontWeight: 700 },
    button: { textTransform: "none", fontWeight: 600 },
  },
  components: {
    MuiPaper: { defaultProps: { variant: "outlined" } },
    MuiButton: { defaultProps: { disableElevation: true } },
    MuiTextField: { defaultProps: { size: "small", fullWidth: true } },
    MuiTableCell: { styleOverrides: { head: { fontWeight: 700, whiteSpace: "nowrap" } } },
  },
});

type Severity = "success" | "info" | "warning" | "error";
const ToastContext = createContext<(message: string, severity?: Severity) => void>(() => {});

/** Show a short confirmation or error message. */
export const useToast = () => useContext(ToastContext);

export function Providers({ children }: { children: ReactNode }) {
  const [toast, setToast] = useState<{ message: string; severity: Severity; key: number } | null>(null);
  const show = useCallback((message: string, severity: Severity = "success") => setToast({ message, severity, key: Date.now() }), []);
  const value = useMemo(() => show, [show]);
  return (
    <ThemeProvider theme={theme} defaultMode="system">
      <CssBaseline />
      <ToastContext.Provider value={value}>{children}</ToastContext.Provider>
      <Snackbar key={toast?.key} open={Boolean(toast)} autoHideDuration={toast?.severity === "error" ? 9000 : 5000} onClose={() => setToast(null)} anchorOrigin={{ vertical: "bottom", horizontal: "center" }}>
        <Alert severity={toast?.severity ?? "info"} variant="filled" onClose={() => setToast(null)} sx={{ maxWidth: 640 }}>
          {toast?.message}
        </Alert>
      </Snackbar>
    </ThemeProvider>
  );
}
