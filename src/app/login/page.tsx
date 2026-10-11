"use client";

import { Alert, Box, Button, Paper, TextField, Typography } from "@mui/material";
import { useState, type FormEvent } from "react";
import { login } from "./actions";

export default function LoginPage() {
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string>();
  const [busy, setBusy] = useState(false);

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(undefined);
    try {
      const result = await login(password);
      if (result.ok) {
        window.location.href = "/";
        return;
      }
      setError(result.error);
    } catch {
      setError("Could not reach the server. Check that it is running and try again.");
    }
    setBusy(false);
  };

  return (
    <Box sx={{ minHeight: "100dvh", display: "grid", placeItems: "center", p: 2 }}>
      <Paper component="form" onSubmit={submit} sx={{ p: 4, width: "100%", maxWidth: 400 }}>
        <Typography variant="h1" sx={{ mb: 0.5 }}>
          Job Autopilot
        </Typography>
        <Typography color="text.secondary" sx={{ mb: 3 }}>
          Sign in to your dashboard.
        </Typography>
        {error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {error}
          </Alert>
        )}
        <TextField label="Password" type="password" autoComplete="current-password" autoFocus required value={password} onChange={(e) => setPassword(e.target.value)} size="medium" />
        <Button type="submit" variant="contained" size="large" fullWidth disabled={busy || !password} sx={{ mt: 2 }}>
          {busy ? "Signing in…" : "Sign in"}
        </Button>
      </Paper>
    </Box>
  );
}
