"use client";

import ArrowDownwardIcon from "@mui/icons-material/ArrowDownward";
import ArrowUpwardIcon from "@mui/icons-material/ArrowUpward";
import DownloadIcon from "@mui/icons-material/Download";
import { Alert, Box, Button, Chip, Divider, FormControlLabel, IconButton, Paper, Stack, Switch, Table, TableBody, TableCell, TableRow, TextField, Tooltip, Typography } from "@mui/material";
import Link from "next/link";
import { useEffect, useState } from "react";
import { useToast } from "@/app/providers";
import type { ApplicationDTO, Materials, Profile, ResumeSection } from "@/types";
import { api } from "../hooks/useApi";
import { CopyButton } from "./ui";

export type ApplicationView = ApplicationDTO & { resumeVersions: number[]; emailSentAt?: string | null };

function move<T>(items: T[], from: number, to: number): T[] {
  if (to < 0 || to >= items.length) return items;
  const next = [...items];
  next.splice(to, 0, next.splice(from, 1)[0]);
  return next;
}

function Arrows({ onUp, onDown, label }: { onUp?: () => void; onDown?: () => void; label: string }) {
  return (
    <Stack direction="row" sx={{ flexShrink: 0 }}>
      <IconButton size="small" aria-label={`Move ${label} up`} disabled={!onUp} onClick={onUp}><ArrowUpwardIcon fontSize="inherit" /></IconButton>
      <IconButton size="small" aria-label={`Move ${label} down`} disabled={!onDown} onClick={onDown}><ArrowDownwardIcon fontSize="inherit" /></IconButton>
    </Stack>
  );
}

function Draft({ title, value, onChange, rows, counter }: { title: string; value: string; onChange: (v: string) => void; rows: number; counter?: number }) {
  return (
    <Box>
      <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between", mb: 0.5 }}>
        <Typography variant="h2">{title}</Typography>
        <Stack direction="row" sx={{ alignItems: "center" }}>
          {counter && <Typography variant="caption" color={value.length > counter ? "error" : "text.secondary"}>{value.length}/{counter}</Typography>}
          <CopyButton text={value} label={`Copy ${title.toLowerCase()}`} />
        </Stack>
      </Stack>
      <TextField multiline minRows={rows} maxRows={22} value={value} onChange={(e) => onChange(e.target.value)} error={Boolean(counter && value.length > counter)} slotProps={{ htmlInput: { "aria-label": title } }} />
    </Box>
  );
}

export function MaterialsPanel({ jobId, application, profile, aiConfigured, onChanged }: { jobId: string; application: ApplicationView | null; profile?: Profile; aiConfigured: boolean; onChanged: () => Promise<void> }) {
  const toast = useToast();
  const [draft, setDraft] = useState<Materials | null>(application?.materials ?? null);
  const [useAi, setUseAi] = useState(aiConfigured);
  const [busy, setBusy] = useState<string | null>(null);
  const saved = JSON.stringify(application?.materials ?? null);
  const dirty = draft !== null && JSON.stringify(draft) !== saved;

  // Pick up freshly prepared materials, but never overwrite edits in progress.
  useEffect(() => {
    setDraft(application?.materials ?? null);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [saved]);
  useEffect(() => setUseAi(aiConfigured), [aiConfigured]);

  const prepare = async () => {
    setBusy("prepare");
    try {
      toast((await api<{ message: string }>(`/api/jobs/${jobId}/actions`, { body: { action: "prepare", useAi } })).message);
      await onChanged();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const save = async () => {
    if (!draft) return;
    setBusy("save");
    try {
      const res = await api<{ resumeVersion: number; truthWarnings: string[] }>(`/api/jobs/${jobId}/materials`, { method: "PUT", body: draft });
      toast(res.truthWarnings.length ? `Saved, with ${res.truthWarnings.length} note(s) to review.` : `Saved (resume v${res.resumeVersion}).`, res.truthWarnings.length ? "warning" : "success");
      await onChanged();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(null);
    }
  };

  const prepareControls = (
    <Stack direction="row" spacing={1.5} sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}>
      <Button variant={draft ? "outlined" : "contained"} onClick={prepare} disabled={busy !== null || dirty}>
        {busy === "prepare" ? "Preparing…" : draft ? "Regenerate" : "Prepare application"}
      </Button>
      <Tooltip title={aiConfigured ? "" : "Set OLLAMA_URL and OLLAMA_MODEL in .env to enable AI tailoring"}>
        <FormControlLabel control={<Switch checked={useAi} disabled={!aiConfigured} onChange={(e) => setUseAi(e.target.checked)} />} label="Tailor with AI" />
      </Tooltip>
    </Stack>
  );

  if (!draft || !application) {
    return (
      <Paper sx={{ p: 3 }}>
        <Typography variant="h2" sx={{ mb: 1 }}>No materials yet</Typography>
        <Typography color="text.secondary" sx={{ mb: 2 }}>
          Preparing creates a tailored resume (PDF and DOCX), a professional summary, a cover letter, an email draft, a recruiter note and a LinkedIn message. Resume bullets are reused word for word from your profile — tailoring only reorders them — and every draft is checked against your profile before it is saved.
        </Typography>
        {prepareControls}
      </Paper>
    );
  }

  const set = <K extends keyof Materials>(key: K, value: Materials[K]) => setDraft((d) => (d ? { ...d, [key]: value } : d));
  const setResume = (patch: Partial<Materials["resume"]>) => setDraft((d) => (d ? { ...d, resume: { ...d.resume, ...patch } } : d));
  const reorderBullets = (kind: "experience" | "projects", sectionId: string, from: number, to: number) =>
    setResume({ [kind]: draft.resume[kind].map((s) => (s.id === sectionId ? { ...s, bulletIds: move(s.bulletIds, from, to) } : s)) });

  const section = (kind: "experience" | "projects", s: ResumeSection, index: number, count: number) => {
    const entry = kind === "experience" ? profile?.experience.find((e) => e.id === s.id) : profile?.projects.find((p) => p.id === s.id);
    const heading = entry ? ("company" in entry ? `${entry.title} — ${entry.company}` : entry.name) : s.id;
    return (
      <Box key={s.id} sx={{ mb: 1.5 }}>
        <Stack direction="row" sx={{ alignItems: "center", justifyContent: "space-between" }}>
          <Typography sx={{ fontWeight: 600 }}>{heading}</Typography>
          {kind === "projects" && (
            <Arrows label={heading} onUp={index > 0 ? () => setResume({ projects: move(draft.resume.projects, index, index - 1) }) : undefined} onDown={index < count - 1 ? () => setResume({ projects: move(draft.resume.projects, index, index + 1) }) : undefined} />
          )}
        </Stack>
        {s.bulletIds.map((id, i) => (
          <Stack key={id} direction="row" spacing={0.5} sx={{ alignItems: "flex-start", pl: 1 }}>
            <Arrows label="bullet" onUp={i > 0 ? () => reorderBullets(kind, s.id, i, i - 1) : undefined} onDown={i < s.bulletIds.length - 1 ? () => reorderBullets(kind, s.id, i, i + 1) : undefined} />
            <Typography variant="body2" sx={{ pt: 0.5 }}>{entry?.bullets.find((b) => b.id === id)?.text ?? id}</Typography>
          </Stack>
        ))}
      </Box>
    );
  };

  const file = (query: string) => `/api/jobs/${jobId}/files?${query}`;
  return (
    <Stack spacing={2}>
      {application.truthWarnings.map((w) => <Alert key={w} severity="warning">{w}</Alert>)}
      <Paper sx={{ p: 2 }}>
        <Stack direction={{ xs: "column", md: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { md: "center" } }}>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center", flexWrap: "wrap", gap: 1 }}>
            <Chip size="small" label={application.generatedBy === "ai" ? "AI-tailored" : "Template"} />
            <Chip size="small" variant="outlined" label={`Resume v${application.resumeVersion}`} />
            <Button size="small" startIcon={<DownloadIcon />} component="a" href={file("doc=resume&format=pdf")}>Resume PDF</Button>
            <Button size="small" startIcon={<DownloadIcon />} component="a" href={file("doc=resume&format=docx")}>Resume DOCX</Button>
            <Button size="small" startIcon={<DownloadIcon />} component="a" href={file("doc=letter")}>Cover letter PDF</Button>
            <Button size="small" startIcon={<DownloadIcon />} component="a" href="/api/profile/resume">Original resume</Button>
          </Stack>
          <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
            {prepareControls}
            <Button variant="contained" onClick={save} disabled={!dirty || busy !== null}>{busy === "save" ? "Saving…" : "Save changes"}</Button>
          </Stack>
        </Stack>
        {dirty && <Typography variant="caption" color="warning.main">Unsaved changes. Downloads use the last saved version; a changed resume is saved as a new version.</Typography>}
      </Paper>

      <Paper sx={{ p: 2 }}>
        <Draft title="Professional summary" rows={3} value={draft.resume.summary} onChange={(v) => setResume({ summary: v })} />
        <Divider sx={{ my: 2 }} />
        <Typography variant="h2">Tailored resume — order of content</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
          The wording comes from your profile and is not changed here; put the most relevant points first. To change the wording itself, edit your <Link href="/profile">profile</Link>.
        </Typography>
        {draft.resume.experience.map((s, i, all) => section("experience", s, i, all.length))}
        <Divider sx={{ my: 1.5 }} />
        {draft.resume.projects.map((s, i, all) => section("projects", s, i, all.length))}
      </Paper>

      <Paper sx={{ p: 2 }}><Draft title="Cover letter" rows={10} value={draft.coverLetter} onChange={(v) => set("coverLetter", v)} /></Paper>
      <Paper sx={{ p: 2 }}>
        <Typography variant="h2" sx={{ mb: 1 }}>Email application</Typography>
        <TextField label="Subject" value={draft.emailSubject} onChange={(e) => set("emailSubject", e.target.value)} sx={{ mb: 1.5 }} />
        <Draft title="Email body" rows={7} value={draft.emailBody} onChange={(v) => set("emailBody", v)} />
      </Paper>
      <Paper sx={{ p: 2 }}><Draft title="Recruiter message" rows={4} value={draft.recruiterMessage} onChange={(v) => set("recruiterMessage", v)} /></Paper>
      <Paper sx={{ p: 2 }}><Draft title="LinkedIn connection note" rows={3} counter={300} value={draft.linkedinMessage} onChange={(v) => set("linkedinMessage", v)} /></Paper>

      <Paper sx={{ p: 2 }}>
        <Typography variant="h2">Answers to standard questions</Typography>
        <Typography variant="body2" color="text.secondary" sx={{ mb: 1 }}>
          Only verified answers are ever filled in for you. Anything marked “needs your answer” is left for you on the form; set it once in your <Link href="/profile">profile</Link>.
        </Typography>
        <Table size="small">
          <TableBody>
            {draft.answers.map((a) => (
              <TableRow key={a.key}>
                <TableCell sx={{ width: "38%" }}>{a.question}</TableCell>
                <TableCell>{a.answer || <Typography component="span" variant="body2" color="text.secondary">Not set</Typography>}</TableCell>
                <TableCell align="right" sx={{ whiteSpace: "nowrap" }}>
                  <Chip size="small" variant="outlined" color={a.verified ? "success" : "warning"} label={a.verified ? "Verified" : "Needs your answer"} />
                  {a.answer && <CopyButton text={a.answer} label={`Copy ${a.question}`} />}
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </Paper>
    </Stack>
  );
}
