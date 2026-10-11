"use client";

import DownloadIcon from "@mui/icons-material/Download";
import UploadFileIcon from "@mui/icons-material/UploadFile";
import { Alert, Button, Checkbox, Chip, Grid, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { useEffect, useRef, useState } from "react";
import { useToast } from "@/app/providers";
import { api, useData } from "@/client/api";
import { Loadable, PageHeader } from "@/client/ui";
import type { Profile, ProfileBullet } from "@/shared/types";

interface Payload {
  profile: Profile;
  experience: { label: string; totalYears: number };
  hasResume: boolean;
  differences: string[] | null;
  rescored?: number;
}

const toList = (text: string) => text.split(",").map((s) => s.trim()).filter(Boolean);

/** One bullet per line. Unchanged lines keep their id, so saved tailored resumes still point at them. */
function toBullets(text: string, previous: ProfileBullet[], prefix: string): ProfileBullet[] {
  const used = new Set<string>();
  let n = previous.length;
  return text.split("\n").map((l) => l.trim()).filter(Boolean).map((line, i) => {
    const same = previous.find((b) => b.text === line && !used.has(b.id)) ?? (previous[i] && !used.has(previous[i].id) && !previous.some((b) => b.text === line) ? previous[i] : undefined);
    let id = same?.id;
    if (!id) {
      do id = `${prefix}-${++n}`;
      while (previous.some((b) => b.id === id) || used.has(id));
    }
    used.add(id);
    return { id, text: line };
  });
}

export default function ProfilePage() {
  const { data, loading, error } = useData<Payload>("/api/profile");
  const toast = useToast();
  const fileInput = useRef<HTMLInputElement>(null);
  const [payload, setPayload] = useState<Payload>();
  const [p, setP] = useState<Profile>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) {
      setPayload(data);
      setP(data.profile);
    }
  }, [data]);

  const patch = (next: Partial<Profile>) => setP((cur) => (cur ? { ...cur, ...next } : cur));
  const dirty = Boolean(p && payload && JSON.stringify(p) !== JSON.stringify(payload.profile));

  const save = async () => {
    if (!p) return;
    setBusy(true);
    try {
      const next = await api<Payload>("/api/profile", { method: "PUT", body: p });
      setPayload(next);
      setP(next.profile);
      toast(`Profile saved — ${next.rescored ?? 0} job(s) re-scored.`);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  const upload = async (file: File) => {
    const form = new FormData();
    form.append("file", file);
    setBusy(true);
    try {
      const res = await api<{ pages: number; differences: string[] }>("/api/profile/resume", { form });
      setPayload((cur) => (cur ? { ...cur, hasResume: true, differences: res.differences } : cur));
      toast(res.differences.length ? `Resume stored. ${res.differences.length} difference(s) from your profile to review below.` : "Resume stored. It agrees with your profile.", res.differences.length ? "warning" : "success");
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  return (
    <Loadable loading={loading && !p} error={error}>
      {p && payload && (
        <>
          <PageHeader
            title="Profile"
            subtitle={`The single source of truth for every score and document. Experience as of today: ${payload.experience.label}.`}
            actions={<Button variant="contained" onClick={save} disabled={!dirty || busy}>{busy ? "Working…" : "Save profile"}</Button>}
          />
          <Stack spacing={2}>
            <Paper sx={{ p: 2.5 }}>
              <Stack direction={{ xs: "column", sm: "row" }} spacing={1.5} sx={{ justifyContent: "space-between", alignItems: { sm: "center" } }}>
                <div>
                  <Typography variant="h2">Original resume</Typography>
                  <Typography variant="body2" color="text.secondary">
                    {payload.hasResume ? "Stored unchanged. Tailored versions are always saved as separate files." : "No resume file stored yet. Upload your resume PDF to check this profile against it."}
                  </Typography>
                </div>
                <Stack direction="row" spacing={1}>
                  {payload.hasResume && <Button startIcon={<DownloadIcon />} component="a" href="/api/profile/resume">Download</Button>}
                  <Button variant="outlined" startIcon={<UploadFileIcon />} onClick={() => fileInput.current?.click()} disabled={busy}>Upload resume PDF</Button>
                  <input ref={fileInput} type="file" accept="application/pdf" hidden onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
                </Stack>
              </Stack>
              {payload.differences && payload.differences.length === 0 && <Alert severity="success" sx={{ mt: 2 }}>This profile agrees with the resume file: same contact details, and every skill listed here appears in the resume.</Alert>}
              {payload.differences?.map((d) => <Alert key={d} severity="warning" sx={{ mt: 1 }}>{d}</Alert>)}
            </Paper>

            <Paper sx={{ p: 2.5 }}>
              <Typography variant="h2" sx={{ mb: 2 }}>About</Typography>
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}><TextField label="Name" value={p.name} onChange={(e) => patch({ name: e.target.value })} /></Grid>
                <Grid size={{ xs: 12, md: 6 }}><TextField label="Headline" value={p.headline} onChange={(e) => patch({ headline: e.target.value })} /></Grid>
                <Grid size={{ xs: 12, md: 6 }}><TextField label="Email" type="email" value={p.contact.email} onChange={(e) => patch({ contact: { ...p.contact, email: e.target.value } })} /></Grid>
                <Grid size={{ xs: 12, md: 6 }}><TextField label="Phone" value={p.contact.phone} onChange={(e) => patch({ contact: { ...p.contact, phone: e.target.value } })} /></Grid>
                <Grid size={{ xs: 12, md: 6 }}><TextField label="LinkedIn" value={p.contact.linkedin} onChange={(e) => patch({ contact: { ...p.contact, linkedin: e.target.value } })} /></Grid>
                <Grid size={{ xs: 12, md: 6 }}><TextField label="GitHub" value={p.contact.github} onChange={(e) => patch({ contact: { ...p.contact, github: e.target.value } })} /></Grid>
                <Grid size={12}><TextField label="Summary" multiline minRows={3} value={p.summary} onChange={(e) => patch({ summary: e.target.value })} /></Grid>
              </Grid>
            </Paper>

            <Paper sx={{ p: 2.5 }}>
              <Typography variant="h2">Skills</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>Only skills listed here count towards a match or appear in generated documents. List what you have actually used.</Typography>
              <Grid container spacing={2}>
                {p.skills.map((g, i) => (
                  <Grid key={g.category} size={{ xs: 12, md: 6 }}>
                    <TextField label={g.category} defaultValue={g.items.join(", ")} onChange={(e) => patch({ skills: p.skills.map((x, j) => (j === i ? { ...x, items: toList(e.target.value) } : x)) })} />
                  </Grid>
                ))}
                <Grid size={{ xs: 12, md: 6 }}><TextField label="Also evidenced in my experience" defaultValue={p.additionalSkills.join(", ")} onChange={(e) => patch({ additionalSkills: toList(e.target.value) })} /></Grid>
                <Grid size={{ xs: 12, md: 6 }}><TextField label="Soft skills" defaultValue={p.softSkills.join(", ")} onChange={(e) => patch({ softSkills: toList(e.target.value) })} /></Grid>
              </Grid>
            </Paper>

            <Paper sx={{ p: 2.5 }}>
              <Typography variant="h2">Experience</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 2 }}>One achievement per line. These lines are reused word for word in tailored resumes. Dates are YYYY-MM; leave the end empty for your current role.</Typography>
              <Stack spacing={2.5}>
                {p.experience.map((e, i) => {
                  const edit = (next: Partial<Profile["experience"][number]>) => patch({ experience: p.experience.map((x, j) => (j === i ? { ...x, ...next } : x)) });
                  return (
                    <Grid container spacing={1.5} key={e.id}>
                      <Grid size={{ xs: 12, md: 4 }}><TextField label="Company" value={e.company} onChange={(ev) => edit({ company: ev.target.value })} /></Grid>
                      <Grid size={{ xs: 12, md: 4 }}><TextField label="Title" value={e.title} onChange={(ev) => edit({ title: ev.target.value })} /></Grid>
                      <Grid size={{ xs: 6, md: 2 }}><TextField label="Start" value={e.start} onChange={(ev) => edit({ start: ev.target.value })} /></Grid>
                      <Grid size={{ xs: 6, md: 2 }}><TextField label="End" value={e.end ?? ""} placeholder="Present" onChange={(ev) => edit({ end: ev.target.value || null })} /></Grid>
                      <Grid size={12}><TextField label={`${e.type === "internship" ? "Internship" : "Full-time"} · ${e.location}`} multiline defaultValue={e.bullets.map((b) => b.text).join("\n")} onChange={(ev) => edit({ bullets: toBullets(ev.target.value, payload.profile.experience[i]?.bullets ?? [], e.id) })} /></Grid>
                    </Grid>
                  );
                })}
              </Stack>
            </Paper>

            <Paper sx={{ p: 2.5 }}>
              <Typography variant="h2" sx={{ mb: 2 }}>Projects</Typography>
              <Stack spacing={2.5}>
                {p.projects.map((pr, i) => {
                  const edit = (next: Partial<Profile["projects"][number]>) => patch({ projects: p.projects.map((x, j) => (j === i ? { ...x, ...next } : x)) });
                  return (
                    <Grid container spacing={1.5} key={pr.id}>
                      <Grid size={{ xs: 12, md: 4 }}><TextField label="Project" value={pr.name} onChange={(ev) => edit({ name: ev.target.value })} /></Grid>
                      <Grid size={{ xs: 12, md: 5 }}><TextField label="Tech stack" defaultValue={pr.stack.join(", ")} onChange={(ev) => edit({ stack: toList(ev.target.value) })} /></Grid>
                      <Grid size={{ xs: 12, md: 3 }}><TextField label="Link" value={pr.url ?? ""} onChange={(ev) => edit({ url: ev.target.value || undefined })} /></Grid>
                      <Grid size={12}><TextField label="What I built (one point per line)" multiline defaultValue={pr.bullets.map((b) => b.text).join("\n")} onChange={(ev) => edit({ bullets: toBullets(ev.target.value, payload.profile.projects[i]?.bullets ?? [], pr.id) })} /></Grid>
                    </Grid>
                  );
                })}
              </Stack>
            </Paper>

            <Paper sx={{ p: 2.5 }}>
              <Typography variant="h2" sx={{ mb: 1 }}>Education</Typography>
              {p.education.map((e) => (
                <Typography key={e.institution} variant="body2" sx={{ mb: 0.5 }}><strong>{e.degree}</strong> — {e.institution}, {e.location} · {e.years} · {e.detail}</Typography>
              ))}
              <Typography variant="caption" color="text.secondary">Taken from your resume and printed unchanged on every tailored version.</Typography>
            </Paper>

            <Paper sx={{ p: 2.5 }}>
              <Typography variant="h2">Answers to standard application questions</Typography>
              <Typography variant="body2" color="text.secondary" sx={{ mb: 1.5 }}>
                Tick “verified” only for answers you are happy to have filled in on your behalf. Unverified answers are never entered or sent. Salary, notice period, relocation and work-authorisation questions are always left for you to answer on the form, even when you store an answer here for reference.
              </Typography>
              <TableContainer>
                <Table size="small" sx={{ minWidth: 560 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>Question</TableCell>
                      <TableCell>My answer</TableCell>
                      <TableCell align="center">Verified</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {Object.entries(p.answers).map(([key, a]) => (
                      <TableRow key={key}>
                        <TableCell sx={{ width: "32%" }}>{a.question}</TableCell>
                        <TableCell>
                          {key === "totalExperience" ? (
                            <Stack direction="row" spacing={1} sx={{ alignItems: "center" }}>
                              <Typography variant="body2">{a.value || payload.experience.label}</Typography>
                              {!a.value && <Chip size="small" variant="outlined" label="Calculated from your dates" />}
                            </Stack>
                          ) : (
                            <TextField value={a.value} placeholder="Not set" onChange={(e) => patch({ answers: { ...p.answers, [key]: { ...a, value: e.target.value, verified: e.target.value ? a.verified : false } } })} slotProps={{ htmlInput: { "aria-label": a.question } }} />
                          )}
                        </TableCell>
                        <TableCell align="center">
                          <Checkbox checked={a.verified && (key === "totalExperience" || Boolean(a.value))} disabled={key !== "totalExperience" && !a.value} onChange={(e) => patch({ answers: { ...p.answers, [key]: { ...a, verified: e.target.checked } } })} slotProps={{ input: { "aria-label": `${a.question} verified` } }} />
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
            </Paper>
          </Stack>
        </>
      )}
    </Loadable>
  );
}
