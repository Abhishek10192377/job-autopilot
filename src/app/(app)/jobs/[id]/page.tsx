"use client";

import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import {
  Alert, Box, Button, Chip, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, Divider, Grid, LinearProgress, Paper, Stack, Tab, Tabs, TextField, Tooltip, Typography,
} from "@mui/material";
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useState } from "react";
import { useToast } from "@/app/providers";
import { api, useData } from "@/client/api";
import { MaterialsPanel, type ApplicationView } from "@/client/MaterialsPanel";
import { useSystem } from "@/client/Shell";
import { dateInput, fmtDate, fmtDateTime, fmtExperience, fmtSalary, Loadable, ScoreChip, StatusChip, WorkModeChip } from "@/client/ui";
import { nextStatuses } from "@/shared/status";
import { COMPONENT_KEYS, COMPONENT_LABEL, STATUS_LABEL, type JobDTO, type JobStatus, type MatchResult, type Profile } from "@/shared/types";

interface Overview {
  policy: { channel: string; label: string; assistedAutofill: boolean; autoSubmit: boolean; explanation: string };
  duplicateOf: { _id: string; title: string; company: string; source: string } | null;
  auto: { eligible: boolean; reasons: string[] };
  smtpConfigured: boolean;
  aiConfigured: boolean;
  assistedAutofill: boolean;
  paused: boolean;
}
interface Detail {
  job: JobDTO;
  application: ApplicationView | null;
  overview: Overview;
  eligibility: { ok: boolean; reasons: string[] };
}
interface AutofillReport {
  filled: string[];
  resumeAttached: boolean;
  needsYou: string[];
  message: string;
}

function MatchPanel({ job, match, aiConfigured, reasons, act, busy }: { job: JobDTO; match: MatchResult; aiConfigured: boolean; reasons: string[]; act: (action: string) => void; busy: boolean }) {
  return (
    <Stack spacing={2}>
      <Paper sx={{ p: 2.5 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={2} sx={{ alignItems: { sm: "center" }, justifyContent: "space-between" }}>
          <Stack direction="row" spacing={2} sx={{ alignItems: "center" }}>
            <Typography sx={{ fontSize: "2.6rem", fontWeight: 800, lineHeight: 1, fontVariantNumeric: "tabular-nums" }}>
              {match.total}
              <Typography component="span" color="text.secondary" sx={{ fontSize: "1.1rem" }}> / 100</Typography>
            </Typography>
            <Box>
              <Typography>{match.summary}</Typography>
              <Stack direction="row" spacing={1} sx={{ mt: 0.75, flexWrap: "wrap", gap: 0.75 }}>
                <Chip size="small" label={match.engine === "ai" ? `AI analysis${match.model ? ` · ${match.model}` : ""}` : "Rule-based score"} />
                <Tooltip title="How much of the 100 points rests on information the posting actually publishes, rather than on unknowns given half credit.">
                  <Chip size="small" variant="outlined" label={`${match.confidence}% based on published information`} />
                </Tooltip>
                {match.engine === "ai" && job.heuristicMatch && <Chip size="small" variant="outlined" label={`Rule-based: ${job.heuristicMatch.total}/100`} />}
              </Stack>
            </Box>
          </Stack>
          <Stack direction="row" spacing={1}>
            <Button onClick={() => act("rescore")} disabled={busy}>Re-score</Button>
            <Tooltip title={aiConfigured ? "" : "Set OLLAMA_URL and OLLAMA_MODEL in .env to enable AI analysis"}>
              <span><Button variant="outlined" onClick={() => act("ai-match")} disabled={busy || !aiConfigured}>AI analysis</Button></span>
            </Tooltip>
          </Stack>
        </Stack>
        {reasons.length > 0 && (
          <Alert severity="info" sx={{ mt: 2 }}>
            Not counted as a match under your settings — you can still save or apply to it:
            {reasons.map((r) => <Typography key={r} variant="body2">• {r}</Typography>)}
          </Alert>
        )}
      </Paper>

      <Paper sx={{ p: 2.5 }}>
        <Typography variant="h2" sx={{ mb: 1.5 }}>Score breakdown</Typography>
        <Stack spacing={2} divider={<Divider />}>
          {COMPONENT_KEYS.map((key) => {
            const c = match.components[key];
            return (
              <Box key={key}>
                <Stack direction="row" sx={{ justifyContent: "space-between", alignItems: "center", mb: 0.5 }}>
                  <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                    <Typography sx={{ fontWeight: 600 }}>{COMPONENT_LABEL[key]}</Typography>
                    {c.unknown && <Chip size="small" color="warning" variant="outlined" label="Not published — unknown" />}
                  </Stack>
                  <Typography sx={{ fontWeight: 700, fontVariantNumeric: "tabular-nums" }}>{c.score} / {c.max}</Typography>
                </Stack>
                <LinearProgress variant="determinate" value={(c.score / c.max) * 100} color={c.unknown ? "warning" : c.score / c.max >= 0.75 ? "success" : c.score / c.max >= 0.5 ? "primary" : "error"} sx={{ height: 8, borderRadius: 4, mb: 1 }} aria-label={`${COMPONENT_LABEL[key]} score`} />
                {c.notes.map((n) => <Typography key={n} variant="body2" color="text.secondary">{n}</Typography>)}
              </Box>
            );
          })}
        </Stack>
      </Paper>

      <Grid container spacing={2}>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2.5, height: "100%" }}>
            <Typography variant="h2" sx={{ mb: 1 }}>Why it matches</Typography>
            {match.strengths.length ? match.strengths.map((s) => <Typography key={s} variant="body2" sx={{ mb: 0.75 }}>• {s}</Typography>) : <Typography variant="body2" color="text.secondary">No clear strengths found.</Typography>}
          </Paper>
        </Grid>
        <Grid size={{ xs: 12, md: 6 }}>
          <Paper sx={{ p: 2.5, height: "100%" }}>
            <Typography variant="h2" sx={{ mb: 1 }}>Gaps and risks</Typography>
            {match.gaps.length ? match.gaps.map((s) => <Typography key={s} variant="body2" sx={{ mb: 0.75 }}>• {s}</Typography>) : <Typography variant="body2" color="text.secondary">No gaps found in the published information.</Typography>}
          </Paper>
        </Grid>
      </Grid>

      <Paper sx={{ p: 2.5 }}>
        <Typography variant="h2" sx={{ mb: 1 }}>Skills in the posting</Typography>
        <Typography variant="body2" color="text.secondary">Required</Typography>
        <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, my: 0.75 }}>
          {job.skillsRequired.length ? job.skillsRequired.map((s) => <Chip key={s} size="small" label={s} />) : <Typography variant="body2">None named.</Typography>}
        </Box>
        {job.skillsPreferred.length > 0 && (
          <>
            <Typography variant="body2" color="text.secondary" sx={{ mt: 1 }}>Preferred</Typography>
            <Box sx={{ display: "flex", flexWrap: "wrap", gap: 0.75, mt: 0.75 }}>{job.skillsPreferred.map((s) => <Chip key={s} size="small" variant="outlined" label={s} />)}</Box>
          </>
        )}
      </Paper>
    </Stack>
  );
}

function ApplyPanel({ detail, act, busy, reload }: { detail: Detail; act: (action: string) => Promise<unknown>; busy: boolean; reload: () => Promise<void> }) {
  const { job, application: app, overview } = detail;
  const toast = useToast();
  const submitted = ["applied", "interview", "offer", "rejected"].includes(job.status);
  const prepared = Boolean(app?.materials);
  const [confirm, setConfirm] = useState<"email" | "applied" | null>(null);
  const [report, setReport] = useState<AutofillReport | null>(null);
  const tracking = () => ({
    followUpDate: dateInput(app?.followUpDate),
    interviewDate: dateInput(app?.interviewDate),
    notes: app?.notes ?? "",
    rejectionReason: app?.rejectionReason ?? "",
    recruiterName: app?.recruiter?.name ?? "",
    recruiterEmail: app?.recruiter?.email ?? "",
    recruiterLinkedin: app?.recruiter?.linkedin ?? "",
  });
  const [form, setForm] = useState(tracking);
  // eslint-disable-next-line react-hooks/exhaustive-deps
  useEffect(() => setForm(tracking()), [app?._id, app?.followUpDate, app?.interviewDate]);
  const set = (k: keyof ReturnType<typeof tracking>) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const saveTracking = async () => {
    try {
      await api(`/api/jobs/${job._id}/tracking`, {
        method: "PATCH",
        body: {
          followUpDate: form.followUpDate || null,
          interviewDate: form.interviewDate || null,
          notes: form.notes,
          rejectionReason: form.rejectionReason,
          recruiter: { name: form.recruiterName, email: form.recruiterEmail, linkedin: form.recruiterLinkedin },
        },
      });
      toast("Tracking details saved.");
      await reload();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  const setStatus = async (status: JobStatus) => {
    try {
      await api(`/api/jobs/${job._id}`, { method: "PATCH", body: { status } });
      toast(`Moved to ${STATUS_LABEL[status]}.`);
      await reload();
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <Stack spacing={2}>
      {overview.duplicateOf && (
        <Alert severity="error">
          You already applied to <Link href={`/jobs/${overview.duplicateOf._id}`}>{overview.duplicateOf.title} at {overview.duplicateOf.company}</Link> (found via {overview.duplicateOf.source}). A second application to the same role is blocked.
        </Alert>
      )}
      {!submitted && (
        <Paper sx={{ p: 2.5 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", mb: 1 }}>
            <Typography variant="h2">How to apply</Typography>
            <Chip size="small" label={overview.policy.label} />
          </Stack>
          <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>{overview.policy.explanation}</Typography>
          {!prepared && <Alert severity="info" sx={{ mb: 2 }}>Prepare the application materials first (Materials tab) so there is a tailored resume to attach.</Alert>}
          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
            <Button variant="outlined" component="a" href={job.applyUrl} target="_blank" rel="noopener noreferrer" endIcon={<OpenInNewIcon />}>Open application page</Button>
            {overview.policy.assistedAutofill && (
              <Tooltip title={!overview.assistedAutofill ? "Assisted autofill is turned off in Settings" : overview.paused ? "Automation is paused" : "Opens a browser window on this computer, fills verified fields and attaches your resume. It never submits."}>
                <span>
                  <Button
                    variant="contained"
                    disabled={busy || !prepared || !overview.assistedAutofill || overview.paused || Boolean(overview.duplicateOf)}
                    onClick={async () => setReport(((await act("autofill")) as AutofillReport | undefined) ?? null)}
                  >
                    {busy ? "Working…" : "Open and prefill form"}
                  </Button>
                </span>
              </Tooltip>
            )}
            {overview.policy.channel === "email" && (
              <Tooltip title={overview.smtpConfigured ? "" : "Set SMTP_HOST, SMTP_USER and SMTP_PASS in .env.local to send email"}>
                <span><Button variant="contained" disabled={busy || !prepared || !overview.smtpConfigured || Boolean(overview.duplicateOf)} onClick={() => setConfirm("email")}>Review and send email…</Button></span>
              </Tooltip>
            )}
            {job.status === "prepared" && <Button onClick={() => act("request-approval")} disabled={busy}>Hold for my approval</Button>}
            <Button color="success" variant="outlined" disabled={busy || Boolean(overview.duplicateOf)} onClick={() => setConfirm("applied")}>I’ve applied — mark as applied</Button>
          </Stack>
          {report && (
            <Alert severity={report.needsYou.length ? "warning" : "success"} sx={{ mt: 2 }} onClose={() => setReport(null)}>
              <Typography variant="body2" sx={{ fontWeight: 600 }}>{report.message}</Typography>
              {report.filled.length > 0 && <Typography variant="body2">Filled: {report.filled.join(", ")}.</Typography>}
              {report.needsYou.map((n) => <Typography key={n} variant="body2">• {n}</Typography>)}
            </Alert>
          )}
          {overview.policy.autoSubmit && (
            <Alert severity={overview.auto.eligible ? "success" : "info"} sx={{ mt: 2 }}>
              {overview.auto.eligible ? "Eligible for automatic sending: every check passes. The worker will send it on its next pass." : "Not sent automatically, because:"}
              {!overview.auto.eligible && overview.auto.reasons.map((r) => <Typography key={r} variant="body2">• {r}</Typography>)}
            </Alert>
          )}
        </Paper>
      )}

      <Paper sx={{ p: 2.5 }}>
        <Stack direction={{ xs: "column", sm: "row" }} spacing={1} sx={{ justifyContent: "space-between", alignItems: { sm: "center" }, mb: 2 }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            <Typography variant="h2">Tracking</Typography>
            <StatusChip status={job.status} />
            {app?.appliedAt && <Typography variant="body2" color="text.secondary">Applied {fmtDate(app.appliedAt)} via {app.appliedVia}{app.resumeVersion ? ` · resume v${app.resumeVersion}` : ""}</Typography>}
          </Stack>
          <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
            {nextStatuses(job.status).filter((s) => !["applied", "prepared", "awaiting_approval", "discovered", "matched"].includes(s)).map((s) => (
              <Button key={s} size="small" variant="outlined" color={s === "rejected" || s === "skipped" ? "inherit" : "primary"} onClick={() => setStatus(s)}>
                {s === "saved" ? "Save" : s === "skipped" ? "Skip" : `Mark ${STATUS_LABEL[s].toLowerCase()}`}
              </Button>
            ))}
          </Stack>
        </Stack>
        <Grid container spacing={2}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}><TextField label="Follow-up date" type="date" value={form.followUpDate} onChange={set("followUpDate")} slotProps={{ inputLabel: { shrink: true } }} /></Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}><TextField label="Interview date" type="date" value={form.interviewDate} onChange={set("interviewDate")} slotProps={{ inputLabel: { shrink: true } }} /></Grid>
          <Grid size={{ xs: 12, md: 6 }}><TextField label="Rejection reason" value={form.rejectionReason} onChange={set("rejectionReason")} /></Grid>
          <Grid size={{ xs: 12, md: 4 }}><TextField label="Recruiter name" value={form.recruiterName} onChange={set("recruiterName")} /></Grid>
          <Grid size={{ xs: 12, md: 4 }}><TextField label="Recruiter email" type="email" value={form.recruiterEmail} onChange={set("recruiterEmail")} /></Grid>
          <Grid size={{ xs: 12, md: 4 }}><TextField label="Recruiter LinkedIn" value={form.recruiterLinkedin} onChange={set("recruiterLinkedin")} /></Grid>
          <Grid size={12}><TextField label="Notes" multiline minRows={3} value={form.notes} onChange={set("notes")} /></Grid>
        </Grid>
        <Button variant="contained" onClick={saveTracking} sx={{ mt: 2 }}>Save tracking details</Button>
      </Paper>

      <Paper sx={{ p: 2.5 }}>
        <Typography variant="h2" sx={{ mb: 1 }}>History</Typography>
        {[...job.statusHistory.map((h) => ({ at: h.at, text: `${STATUS_LABEL[h.status]}${h.note ? ` — ${h.note}` : ""}` })), ...(app?.automationLog ?? []).map((l) => ({ at: l.at, text: l.message }))]
          .sort((a, b) => new Date(b.at).getTime() - new Date(a.at).getTime())
          .map((h, i) => (
            <Stack key={i} direction="row" spacing={2} sx={{ py: 0.5 }}>
              <Typography variant="body2" color="text.secondary" sx={{ width: 130, flexShrink: 0 }}>{fmtDateTime(h.at)}</Typography>
              <Typography variant="body2">{h.text}</Typography>
            </Stack>
          ))}
      </Paper>

      <Dialog open={confirm !== null} onClose={() => setConfirm(null)} fullWidth maxWidth="sm">
        <DialogTitle>{confirm === "email" ? "Send this application by email?" : "Mark as applied?"}</DialogTitle>
        <DialogContent>
          {confirm === "email" && app?.materials ? (
            <>
              <DialogContentText sx={{ mb: 1 }}>To <strong>{job.applyEmail}</strong>, from your own mailbox, with your tailored resume (v{app.resumeVersion}) attached. This cannot be undone.</DialogContentText>
              <Typography sx={{ fontWeight: 600 }}>{app.materials.emailSubject}</Typography>
              <Typography variant="body2" sx={{ whiteSpace: "pre-wrap", mt: 1 }}>{app.materials.emailBody}</Typography>
            </>
          ) : (
            <DialogContentText>Record that you submitted your application to {job.title} at {job.company}. This cannot be undone, and it blocks a second application to the same role.</DialogContentText>
          )}
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              const which = confirm;
              setConfirm(null);
              void (which === "email" ? act("send-email") : setStatus("applied"));
            }}
          >
            {confirm === "email" ? "Send email" : "Mark as applied"}
          </Button>
        </DialogActions>
      </Dialog>
    </Stack>
  );
}

export default function JobPage() {
  const { id } = useParams<{ id: string }>();
  const toast = useToast();
  const system = useSystem();
  const { data, loading, error, reload } = useData<Detail>(`/api/jobs/${id}`);
  const profile = useData<{ profile: Profile }>("/api/profile");
  const [tab, setTab] = useState(0);
  const [busy, setBusy] = useState(false);

  const refresh = async () => {
    await Promise.all([reload(), system.reload()]);
  };
  const act = async (action: string) => {
    setBusy(true);
    try {
      const res = await api<{ message?: string }>(`/api/jobs/${id}/actions`, { body: { action } });
      if (res.message) toast(res.message, action === "autofill" ? "info" : "success");
      await refresh();
      return res;
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Loadable loading={loading && !data} error={data ? undefined : error}>
      {data && (
        <>
          <Button component={Link} href="/jobs" size="small" sx={{ mb: 1 }}>← All jobs</Button>
          <Stack direction={{ xs: "column", md: "row" }} spacing={2} sx={{ justifyContent: "space-between", mb: 2 }}>
            <Box sx={{ minWidth: 0 }}>
              <Typography variant="h1">{data.job.title}</Typography>
              <Typography color="text.secondary" sx={{ mt: 0.5 }}>{data.job.company} · {data.job.location || "Location not stated"}</Typography>
              <Stack direction="row" sx={{ flexWrap: "wrap", gap: 0.75, mt: 1.25 }}>
                <ScoreChip score={data.job.match?.total} minScore={system.data?.system.minScore} />
                <StatusChip status={data.job.status} />
                <WorkModeChip job={data.job} />
                <Chip size="small" variant="outlined" label={`Experience: ${fmtExperience(data.job)}`} />
                <Chip size="small" variant="outlined" label={`Salary: ${fmtSalary(data.job.salary)}`} />
                <Chip size="small" variant="outlined" label={`Type: ${data.job.employmentType === "unknown" ? "not stated" : data.job.employmentType}`} />
                <Chip size="small" variant="outlined" label={`Working days: ${data.job.workingDays === "unknown" ? "not stated" : data.job.workingDays}`} />
                {data.job.deadline && <Chip size="small" color="warning" variant="outlined" label={`Deadline ${fmtDate(data.job.deadline)}`} />}
              </Stack>
            </Box>
            <Box>
              <Button variant="outlined" component="a" href={data.job.url} target="_blank" rel="noopener noreferrer" endIcon={<OpenInNewIcon />}>View posting</Button>
            </Box>
          </Stack>

          <Tabs value={tab} onChange={(_, v) => setTab(v)} variant="scrollable" sx={{ mb: 2, borderBottom: 1, borderColor: "divider" }}>
            <Tab label="Match analysis" />
            <Tab label="Materials" />
            <Tab label="Apply and track" />
            <Tab label="Description" />
          </Tabs>

          {tab === 0 && (data.job.match ? <MatchPanel job={data.job} match={data.job.match} aiConfigured={data.overview.aiConfigured} reasons={data.eligibility.reasons} act={act} busy={busy} /> : <Alert severity="info">This job has not been scored yet.</Alert>)}
          {tab === 1 && <MaterialsPanel jobId={id} application={data.application} profile={profile.data?.profile} aiConfigured={data.overview.aiConfigured} onChanged={refresh} />}
          {tab === 2 && <ApplyPanel detail={data} act={act} busy={busy} reload={refresh} />}
          {tab === 3 && (
            <Paper sx={{ p: 2.5 }}>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Found {fmtDate(data.job.discoveredAt)}{data.job.postedAt ? ` · posted ${fmtDate(data.job.postedAt)}` : ""} · source:{" "}
                {data.job.sources.map((s, i) => (
                  <span key={s.url}>{i > 0 && ", "}<a href={s.url} target="_blank" rel="noopener noreferrer">{s.source}</a></span>
                ))}
                {data.job.attribution ? ` (listing courtesy of ${data.job.attribution})` : ""}
              </Typography>
              <Typography sx={{ whiteSpace: "pre-wrap", overflowWrap: "anywhere" }}>{data.job.description || "The source did not provide a description. Open the posting to read it."}</Typography>
            </Paper>
          )}
        </>
      )}
    </Loadable>
  );
}
