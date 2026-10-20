"use client";

import BlockIcon from "@mui/icons-material/Block";
import SearchIcon from "@mui/icons-material/Search";
import { Alert, Box, Button, Chip, Divider, Grid, IconButton, List, ListItem, ListItemText, Paper, Stack, Tooltip, Typography } from "@mui/material";
import Link from "next/link";
import { useState } from "react";
import { useToast } from "@/app/providers";
import { api } from "@/hooks/useApi";
import { useSystem } from "@/components/Shell";
import { fmtDate, fmtDateTime, fmtExperience, Loadable, PageHeader, ScoreChip, WorkModeChip } from "@/components/ui";

const LEVEL_COLOR = { info: "text.secondary", success: "success.main", warning: "warning.main", error: "error.main" } as const;

function Stat({ label, value, hint, href }: { label: string; value: string | number; hint?: string; href?: string }) {
  const body = (
    <Paper sx={{ p: 2, height: "100%", ...(href ? { "&:hover": { borderColor: "primary.main" } } : {}) }}>
      <Typography variant="body2" color="text.secondary">
        {label}
      </Typography>
      <Typography sx={{ fontSize: "1.9rem", fontWeight: 700, lineHeight: 1.2, fontVariantNumeric: "tabular-nums" }}>{value}</Typography>
      {hint && (
        <Typography variant="caption" color="text.secondary">
          {hint}
        </Typography>
      )}
    </Paper>
  );
  return (
    <Grid size={{ xs: 6, sm: 4, lg: 3 }}>
      {href ? (
        <Link href={href} style={{ textDecoration: "none", color: "inherit", display: "block", height: "100%" }}>
          {body}
        </Link>
      ) : (
        body
      )}
    </Grid>
  );
}

export default function DashboardPage() {
  const { data, loading, error, reload } = useSystem();
  const toast = useToast();
  const [busy, setBusy] = useState(false);

  const discover = async () => {
    setBusy(true);
    try {
      toast((await api<{ message: string }>("/api/discovery", { method: "POST" })).message, "info");
      await reload();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const skip = async (id: string) => {
    try {
      await api(`/api/jobs/${id}`, { method: "PATCH", body: { status: "skipped" } });
      await reload();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <Loadable loading={loading && !data} error={data ? undefined : error}>
      {data && (
        <>
          <PageHeader
            title="Dashboard"
            subtitle={
              data.system.discoveryRunning
                ? "Discovery is running — new jobs appear as each source finishes."
                : data.system.lastDiscovery
                  ? `Last discovery ${fmtDateTime(data.system.lastDiscovery.at)}: ${data.system.lastDiscovery.summary.added} new, ${data.system.lastDiscovery.summary.matched} matching.`
                  : "No discovery run yet."
            }
            actions={
              <Button variant="contained" startIcon={<SearchIcon />} onClick={discover} disabled={busy || data.system.paused || data.system.discoveryRunning}>
                {data.system.discoveryRunning ? "Discovery running…" : "Find jobs now"}
              </Button>
            }
          />
          <Stack spacing={1} sx={{ mb: 2 }}>
            {!data.system.workerAlive && (
              <Alert severity="info">
                The background worker is not running, so scheduled discovery, AI scoring and reminders are idle. Start it with <code>npm run worker</code>. “Find jobs now” still works without it.
              </Alert>
            )}
            {!data.system.aiConfigured && (
              <Alert severity="info">
                Ollama is not configured, so scores and documents come from the built-in rule-based engine. Set <code>OLLAMA_URL</code> and <code>OLLAMA_MODEL</code> in <code>.env</code> for AI match analysis and AI-tailored letters.
              </Alert>
            )}
          </Stack>

          <Grid container spacing={2} sx={{ mb: 3 }}>
            <Stat label="Jobs discovered" value={data.stats.discovered} href="/jobs?status=all" />
            <Stat label="Matching my profile" value={data.stats.matching} hint={`Score ${data.system.minScore}+ and eligible`} href="/jobs?status=matched" />
            <Stat label="Saved" value={data.stats.saved} href="/jobs?status=saved" />
            <Stat label="Applications prepared" value={data.stats.prepared} href="/applications" />
            <Stat label="Applications submitted" value={data.stats.submitted} href="/applications" />
            <Stat label="Interviews" value={data.stats.interviews} hint={data.stats.offers ? `${data.stats.offers} offer${data.stats.offers === 1 ? "" : "s"}` : undefined} />
            <Stat label="Rejected" value={data.stats.rejected} />
            <Stat label="Success rate" value={data.stats.successRate == null ? "—" : `${data.stats.successRate}%`} hint={data.stats.successRate == null ? "Nothing submitted yet" : "Interviews ÷ submitted"} />
          </Grid>

          <Grid container spacing={2}>
            <Grid size={{ xs: 12, lg: 7 }}>
              <Paper sx={{ p: 2 }}>
                <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 1 }}>
                  <Typography variant="h2">Recommended jobs</Typography>
                  <Button component={Link} href="/jobs" size="small">
                    All jobs
                  </Button>
                </Stack>
                {data.recommended.length === 0 && (
                  <Typography color="text.secondary" sx={{ py: 2 }}>
                    Nothing to recommend yet. Press “Find jobs now” to fetch listings from the enabled sources.
                  </Typography>
                )}
                {data.recommended.map((job, i) => (
                  <Box key={job._id}>
                    {i > 0 && <Divider />}
                    <Stack direction="row" spacing={1.5} sx={{ py: 1.25, alignItems: "center" }}>
                      <ScoreChip score={job.match?.total} minScore={data.system.minScore} />
                      <Box sx={{ flexGrow: 1, minWidth: 0 }}>
                        <Link href={`/jobs/${job._id}`} style={{ color: "inherit", fontWeight: 600, textDecoration: "none" }}>
                          {job.title}
                        </Link>
                        <Typography variant="body2" color="text.secondary" noWrap>
                          {job.company} · {job.location || "Location not stated"} · {fmtExperience(job)}
                        </Typography>
                        <Box sx={{ mt: 0.5 }}>
                          <WorkModeChip job={job} />
                        </Box>
                      </Box>
                      <Tooltip title="Skip this job">
                        <IconButton aria-label={`Skip ${job.title}`} size="small" onClick={() => skip(job._id)}>
                          <BlockIcon fontSize="small" />
                        </IconButton>
                      </Tooltip>
                    </Stack>
                  </Box>
                ))}
              </Paper>
            </Grid>
            <Grid size={{ xs: 12, lg: 5 }}>
              {data.followUps.length > 0 && (
                <Paper sx={{ p: 2, mb: 2 }}>
                  <Typography variant="h2" sx={{ mb: 1 }}>
                    Follow-ups due
                  </Typography>
                  {data.followUps.map((f) => (
                    <Stack key={f.jobId} direction="row" spacing={1} sx={{ py: 0.75, alignItems: "center", justifyContent: "space-between" }}>
                      <Link href={`/jobs/${f.jobId}`} style={{ color: "inherit" }}>
                        {f.title} · {f.company}
                      </Link>
                      <Chip size="small" color="warning" variant="outlined" label={`Applied ${fmtDate(f.appliedAt)}`} />
                    </Stack>
                  ))}
                </Paper>
              )}
              <Paper sx={{ p: 2 }}>
                <Typography variant="h2">Recent activity</Typography>
                {data.activity.length === 0 && (
                  <Typography color="text.secondary" sx={{ py: 2 }}>
                    Nothing has happened yet.
                  </Typography>
                )}
                <List dense disablePadding>
                  {data.activity.map((a) => (
                    <ListItem key={a._id} disableGutters divider sx={{ alignItems: "flex-start" }}>
                      <Box sx={{ width: 8, height: 8, borderRadius: "50%", bgcolor: LEVEL_COLOR[a.level], mt: 1, mr: 1.25, flexShrink: 0 }} />
                      <ListItemText
                        primary={a.jobId ? <Link href={`/jobs/${a.jobId}`} style={{ color: "inherit", textDecoration: "none" }}>{a.message}</Link> : a.message}
                        secondary={fmtDateTime(a.at)}
                      />
                    </ListItem>
                  ))}
                </List>
              </Paper>
            </Grid>
          </Grid>
        </>
      )}
    </Loadable>
  );
}
