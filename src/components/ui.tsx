"use client";

import ContentCopyIcon from "@mui/icons-material/ContentCopy";
import { Alert, Box, Chip, CircularProgress, IconButton, Stack, Tooltip, Typography } from "@mui/material";
import type { ReactNode } from "react";
import { useToast } from "@/app/providers";
import { STATUS_LABEL, type JobDTO, type JobStatus, type Salary, type WorkMode } from "@/types";

export const fmtDate = (v?: string | Date | null) => (v ? new Date(v).toLocaleDateString(undefined, { day: "numeric", month: "short", year: "numeric" }) : "—");
export const fmtDateTime = (v?: string | Date | null) => (v ? new Date(v).toLocaleString(undefined, { day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" }) : "—");
/** yyyy-mm-dd for date inputs. */
export const dateInput = (v?: string | Date | null) => (v ? new Date(v).toISOString().slice(0, 10) : "");

export function fmtSalary(s?: Salary | null): string {
  if (!s) return "Not published";
  if (s.min || s.max) {
    const n = (v?: number) => (v ? (s.currency === "INR" && v >= 100000 ? `${+(v / 100000).toFixed(1)}L` : v >= 1000 ? `${Math.round(v / 1000)}k` : String(v)) : "?");
    const range = s.min && s.max && s.min !== s.max ? `${n(s.min)}–${n(s.max)}` : n(s.max || s.min);
    return `${s.currency ? `${s.currency} ` : ""}${range}${s.period ? ` / ${s.period.replace(/ly$/, "")}` : ""}`;
  }
  return s.raw || "Not published";
}

export function fmtExperience(job: Pick<JobDTO, "experienceMin" | "experienceMax" | "seniority">): string {
  if (job.experienceMin != null) return job.experienceMax ? `${job.experienceMin}–${job.experienceMax} yrs` : `${job.experienceMin}+ yrs`;
  return job.seniority && job.seniority !== "unspecified" ? `${job.seniority} (years not stated)` : "Not stated";
}

export function ScoreChip({ score, minScore = 60, size = "small" }: { score?: number | null; minScore?: number; size?: "small" | "medium" }) {
  if (score == null) return <Chip size={size} label="—" variant="outlined" />;
  const color = score >= 75 ? "success" : score >= minScore ? "primary" : score >= 45 ? "warning" : "default";
  return <Chip size={size} color={color} label={`${score}/100`} sx={{ fontWeight: 700, minWidth: 68 }} />;
}

const STATUS_COLOR: Record<JobStatus, "default" | "primary" | "secondary" | "success" | "warning" | "error" | "info"> = {
  discovered: "default",
  matched: "primary",
  saved: "info",
  prepared: "secondary",
  awaiting_approval: "warning",
  applied: "success",
  interview: "success",
  offer: "success",
  rejected: "error",
  skipped: "default",
};

export function StatusChip({ status }: { status: JobStatus }) {
  return <Chip size="small" variant={["applied", "interview", "offer", "rejected"].includes(status) ? "filled" : "outlined"} color={STATUS_COLOR[status]} label={STATUS_LABEL[status]} />;
}

const MODE_LABEL: Record<WorkMode, string> = { remote: "Remote", hybrid: "Hybrid", onsite: "On-site", unknown: "Arrangement not stated" };

export function WorkModeChip({ job }: { job: Pick<JobDTO, "workMode" | "remoteEligibility"> }) {
  const restricted = job.workMode === "remote" && job.remoteEligibility === "restricted";
  const label = job.workMode === "remote" ? (restricted ? "Remote · region-restricted" : job.remoteEligibility === "eligible" ? "Remote · open to India" : "Remote · region not stated") : MODE_LABEL[job.workMode];
  return <Chip size="small" variant="outlined" color={restricted ? "warning" : job.workMode === "remote" ? "success" : "default"} label={label} />;
}

export function CopyButton({ text, label = "Copy" }: { text: string; label?: string }) {
  const toast = useToast();
  return (
    <Tooltip title={label}>
      <IconButton
        size="small"
        aria-label={label}
        onClick={() => navigator.clipboard.writeText(text).then(() => toast("Copied to clipboard."), () => toast("Could not copy — select the text and copy it manually.", "error"))}
      >
        <ContentCopyIcon fontSize="small" />
      </IconButton>
    </Tooltip>
  );
}

/** Standard loading / error wrapper for a page section. */
export function Loadable({ loading, error, children }: { loading: boolean; error?: string; children: ReactNode }) {
  if (error) return <Alert severity="error">{error}</Alert>;
  if (loading)
    return (
      <Box sx={{ display: "flex", justifyContent: "center", py: 6 }}>
        <CircularProgress aria-label="Loading" />
      </Box>
    );
  return <>{children}</>;
}

export function PageHeader({ title, subtitle, actions }: { title: string; subtitle?: ReactNode; actions?: ReactNode }) {
  return (
    <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ mb: 2.5, alignItems: { sm: "center" }, justifyContent: "space-between" }}>
      <Box sx={{ minWidth: 0 }}>
        <Typography variant="h1">{title}</Typography>
        {subtitle && (
          <Typography color="text.secondary" sx={{ mt: 0.5 }}>
            {subtitle}
          </Typography>
        )}
      </Box>
      {actions && (
        <Stack direction="row" spacing={1} sx={{ flexWrap: "wrap", gap: 1 }}>
          {actions}
        </Stack>
      )}
    </Stack>
  );
}
