"use client";

import AssignmentTurnedInIcon from "@mui/icons-material/AssignmentTurnedIn";
import DashboardIcon from "@mui/icons-material/Dashboard";
import LogoutIcon from "@mui/icons-material/Logout";
import MenuIcon from "@mui/icons-material/Menu";
import PauseCircleIcon from "@mui/icons-material/PauseCircle";
import PersonIcon from "@mui/icons-material/Person";
import PlayCircleIcon from "@mui/icons-material/PlayCircle";
import SettingsIcon from "@mui/icons-material/Settings";
import WorkIcon from "@mui/icons-material/Work";
import { Alert, AppBar, Box, Button, Chip, Drawer, IconButton, List, ListItemButton, ListItemIcon, ListItemText, Toolbar, Tooltip, Typography } from "@mui/material";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { createContext, useContext, useState, type ReactNode } from "react";
import { useToast } from "@/app/providers";
import type { JobDTO, Stats } from "@/types";
import { api, useData } from "../hooks/useApi";

export interface DashboardData {
  stats: Stats;
  recommended: JobDTO[];
  activity: { _id: string; at: string; type: string; level: "info" | "success" | "warning" | "error"; message: string; jobId?: string | null }[];
  followUps: { jobId: string; title: string; company: string; followUpDate: string; appliedAt: string }[];
  system: {
    paused: boolean;
    pausedAt: string | null;
    reviewMode: "assisted" | "auto";
    minScore: number;
    workerAlive: boolean;
    discoveryRunning: boolean;
    lastDiscovery: { at: string; summary: { added: number; matched: number; sources: { id: string; status: string; detail: string }[] } } | null;
    aiConfigured: boolean;
    smtpConfigured: boolean;
  };
}

const SystemContext = createContext<{ data?: DashboardData; error?: string; loading: boolean; reload: () => Promise<void> }>({ loading: true, reload: async () => {} });

/** Live dashboard state (stats, automation status), shared by the shell and the pages. */
export const useSystem = () => useContext(SystemContext);

const NAV = [
  { href: "/", label: "Dashboard", icon: <DashboardIcon /> },
  { href: "/jobs", label: "Jobs", icon: <WorkIcon /> },
  { href: "/applications", label: "Applications", icon: <AssignmentTurnedInIcon /> },
  { href: "/profile", label: "Profile", icon: <PersonIcon /> },
  { href: "/settings", label: "Settings", icon: <SettingsIcon /> },
];
const WIDTH = 216;

export function Shell({ children }: { children: ReactNode }) {
  const pathname = usePathname();
  const toast = useToast();
  const system = useData<DashboardData>("/api/dashboard", 15_000);
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const paused = system.data?.system.paused ?? false;

  const togglePause = async () => {
    setBusy(true);
    try {
      const res = await api<{ paused: boolean; cancelled: number }>("/api/automation", { body: { paused: !paused } });
      toast(res.paused ? `All automation stopped${res.cancelled ? ` — ${res.cancelled} queued task(s) cancelled` : ""}.` : "Automation resumed.", res.paused ? "warning" : "success");
      await system.reload();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const logout = async () => {
    await api("/api/auth/logout", { method: "POST" }).catch(() => null);
    window.location.href = "/login";
  };

  const nav = (
    <List sx={{ px: 1 }} component="nav" aria-label="Main">
      {NAV.map((item) => {
        const active = item.href === "/" ? pathname === "/" : pathname.startsWith(item.href);
        return (
          <ListItemButton key={item.href} component={Link} href={item.href} selected={active} onClick={() => setOpen(false)} sx={{ borderRadius: 2, mb: 0.5 }}>
            <ListItemIcon sx={{ minWidth: 38 }}>{item.icon}</ListItemIcon>
            <ListItemText primary={item.label} />
            {item.href === "/applications" && Boolean(system.data?.stats.awaitingApproval) && <Chip size="small" color="warning" label={system.data!.stats.awaitingApproval} />}
          </ListItemButton>
        );
      })}
    </List>
  );

  return (
    <SystemContext.Provider value={system}>
      <AppBar position="fixed" color="inherit" elevation={0} sx={{ borderBottom: 1, borderColor: "divider", zIndex: (t) => t.zIndex.drawer + 1 }}>
        <Toolbar sx={{ gap: 1 }}>
          <IconButton edge="start" aria-label="Open menu" onClick={() => setOpen(true)} sx={{ display: { md: "none" } }}>
            <MenuIcon />
          </IconButton>
          <Typography component="div" sx={{ fontWeight: 800, fontSize: "1.05rem", flexGrow: 1, whiteSpace: "nowrap" }}>
            Job Autopilot
          </Typography>
          {system.data && (
            <Chip
              size="small"
              color={paused ? "error" : "success"}
              variant="outlined"
              label={paused ? "Automation paused" : system.data.system.reviewMode === "auto" ? "Automatic mode" : "Assisted mode"}
              sx={{ display: { xs: "none", sm: "inline-flex" } }}
            />
          )}
          <Button
            onClick={togglePause}
            disabled={busy || !system.data}
            color={paused ? "success" : "error"}
            variant={paused ? "outlined" : "contained"}
            size="small"
            startIcon={paused ? <PlayCircleIcon /> : <PauseCircleIcon />}
            aria-label={paused ? "Resume automation" : "Stop all automation"}
            sx={{ whiteSpace: "nowrap", flexShrink: 0 }}
          >
            {paused ? "Resume" : "Stop all"}
            {!paused && <Box component="span" sx={{ display: { xs: "none", sm: "inline" } }}>&nbsp;automation</Box>}
          </Button>
          <Tooltip title="Sign out">
            <IconButton aria-label="Sign out" onClick={logout}>
              <LogoutIcon />
            </IconButton>
          </Tooltip>
        </Toolbar>
      </AppBar>
      <Drawer variant="temporary" open={open} onClose={() => setOpen(false)} sx={{ display: { md: "none" }, "& .MuiDrawer-paper": { width: WIDTH, pt: 9 } }}>
        {nav}
      </Drawer>
      <Drawer variant="permanent" sx={{ display: { xs: "none", md: "block" }, "& .MuiDrawer-paper": { width: WIDTH, pt: 9, borderRight: 1, borderColor: "divider" } }}>
        {nav}
      </Drawer>
      <Box component="main" sx={{ ml: { md: `${WIDTH}px` }, pt: 11, pb: 6, px: { xs: 2, sm: 3 }, maxWidth: 1500 }}>
        {system.error && (
          <Alert severity="error" sx={{ mb: 2 }}>
            {system.error}
          </Alert>
        )}
        {paused && (
          <Alert severity="warning" sx={{ mb: 2 }}>
            Automation is paused: no discovery runs, nothing is prefilled and nothing is sent until you press Resume. You can still review jobs and edit materials.
          </Alert>
        )}
        {children}
      </Box>
    </SystemContext.Provider>
  );
}
