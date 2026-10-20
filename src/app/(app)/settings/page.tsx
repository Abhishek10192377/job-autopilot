"use client";

import { Alert, Box, Button, Checkbox, Chip, FormControlLabel, FormGroup, Grid, MenuItem, Paper, Stack, Switch, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, TextField, Typography } from "@mui/material";
import { useEffect, useState, type ReactNode } from "react";
import { useToast } from "@/app/providers";
import { api, useData } from "@/hooks/useApi";
import { useSystem } from "@/components/Shell";
import { fmtDateTime, Loadable, PageHeader } from "@/components/ui";
import type { Settings, SourceStatus } from "@/types";

interface Payload {
  settings: Settings;
  sources: SourceStatus[];
  unsupported: { name: string; reason: string }[];
  system: { aiConfigured: boolean; aiModel: string; smtpConfigured: boolean; browserChannel: string };
  rescored?: number;
}

const toList = (text: string) => [...new Set(text.split(/[\n,]/).map((s) => s.trim()).filter(Boolean))];
const EMPLOYMENT = ["full-time", "part-time", "contract", "internship"];
const KIND_LABEL: Record<SourceStatus["kind"], string> = { "public-api": "Public API", rss: "RSS feed", "ats-board": "Company boards", "keyed-api": "Needs your API key" };

function Section({ title, hint, children }: { title: string; hint?: string; children: ReactNode }) {
  return (
    <Paper sx={{ p: 2.5 }}>
      <Typography variant="h2">{title}</Typography>
      {hint && <Typography variant="body2" color="text.secondary" sx={{ mt: 0.5 }}>{hint}</Typography>}
      <Box sx={{ mt: 2 }}>{children}</Box>
    </Paper>
  );
}

/** A comma- or line-separated list, kept as text while typing. */
function ListField({ label, value, onChange, rows = 2, helperText }: { label: string; value: string[]; onChange: (v: string[]) => void; rows?: number; helperText?: string }) {
  const [text, setText] = useState(value.join(", "));
  useEffect(() => {
    if (JSON.stringify(toList(text)) !== JSON.stringify(value)) setText(value.join(", "));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [value]);
  return (
    <TextField
      label={label}
      multiline
      minRows={rows}
      value={text}
      helperText={helperText ?? "Separate with commas"}
      onChange={(e) => {
        setText(e.target.value);
        onChange(toList(e.target.value));
      }}
    />
  );
}

export default function SettingsPage() {
  const { data, loading, error } = useData<Payload>("/api/settings");
  const system = useSystem();
  const toast = useToast();
  const [payload, setPayload] = useState<Payload>();
  const [s, setS] = useState<Settings>();
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (data) {
      setPayload(data);
      setS(data.settings);
    }
  }, [data]);

  const patch = (p: Partial<Settings>) => setS((cur) => (cur ? { ...cur, ...p } : cur));
  const num = (k: keyof Settings) => (e: { target: { value: string } }) => patch({ [k]: Number(e.target.value) } as Partial<Settings>);
  const dirty = Boolean(s && payload && JSON.stringify(s) !== JSON.stringify(payload.settings));

  const save = async () => {
    if (!s) return;
    setBusy(true);
    try {
      // "automation" is owned by the pause button, so it is not sent from this form.
      const { automation: _automation, ...body } = s;
      const next = await api<Payload>("/api/settings", { method: "PUT", body });
      setPayload(next);
      setS(next.settings);
      toast(next.rescored ? `Settings saved — ${next.rescored} job(s) re-scored against the new preferences.` : "Settings saved.");
      await system.reload();
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Loadable loading={loading && !s} error={error}>
      {s && payload && (
        <>
          <PageHeader
            title="Settings"
            subtitle="What to look for, how strict to be, and how much to automate."
            actions={<Button variant="contained" onClick={save} disabled={!dirty || busy}>{busy ? "Saving…" : "Save settings"}</Button>}
          />
          <Stack spacing={2}>
            <Section title="What I’m looking for">
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 6 }}><ListField label="Preferred job titles" value={s.preferredTitles} onChange={(v) => patch({ preferredTitles: v })} /></Grid>
                <Grid size={{ xs: 12, md: 6 }}><ListField label="Preferred cities" value={s.preferredCities} onChange={(v) => patch({ preferredCities: v })} helperText="On-site and hybrid roles here score highest. Separate with commas." /></Grid>
                <Grid size={{ xs: 12, md: 6 }}><ListField label="Preferred countries" value={s.preferredCountries} onChange={(v) => patch({ preferredCountries: v })} rows={1} /></Grid>
                <Grid size={{ xs: 12, md: 6 }}>
                  <Typography variant="body2" color="text.secondary">Preferred employment type</Typography>
                  <FormGroup row>
                    {EMPLOYMENT.map((t) => (
                      <FormControlLabel
                        key={t}
                        label={t}
                        control={<Checkbox checked={s.employmentTypes.includes(t)} onChange={(e) => patch({ employmentTypes: e.target.checked ? [...s.employmentTypes, t] : s.employmentTypes.filter((x) => x !== t) })} />}
                      />
                    ))}
                  </FormGroup>
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}><TextField label="Minimum compatibility score" type="number" value={s.minScore} onChange={num("minScore")} helperText="Jobs at or above this are “Matched”" slotProps={{ htmlInput: { min: 0, max: 100 } }} /></Grid>
                <Grid size={{ xs: 6, md: 3 }}><TextField label="Maximum experience asked (years)" type="number" value={s.maxExperience} onChange={num("maxExperience")} helperText="Higher asks are flagged, not hidden" slotProps={{ htmlInput: { min: 0, max: 30 } }} /></Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <TextField
                    label="Minimum salary (if disclosed)"
                    type="number"
                    value={s.minSalary?.amount ?? ""}
                    onChange={(e) => patch({ minSalary: Number(e.target.value) > 0 ? { amount: Number(e.target.value), currency: s.minSalary?.currency ?? "INR" } : null })}
                    helperText="Per year. Leave empty for no minimum"
                  />
                </Grid>
                <Grid size={{ xs: 6, md: 3 }}>
                  <TextField label="Salary currency" select value={s.minSalary?.currency ?? "INR"} disabled={!s.minSalary} onChange={(e) => s.minSalary && patch({ minSalary: { ...s.minSalary, currency: e.target.value } })}>
                    {["INR", "USD", "EUR", "GBP"].map((c) => <MenuItem key={c} value={c}>{c}</MenuItem>)}
                  </TextField>
                </Grid>
                <Grid size={12}><FormControlLabel control={<Switch checked={s.remoteOnly} onChange={(e) => patch({ remoteOnly: e.target.checked })} />} label="Remote-only mode — only remote roles count as matched" /></Grid>
              </Grid>
            </Section>

            <Section title="Applying" hint="Assisted mode always waits for you. Automatic mode may send email applications on its own, and only when the posting itself asks for applications by email and every check passes; forms on Greenhouse, Lever and Ashby are prefilled but always submitted by you.">
              <Grid container spacing={2}>
                <Grid size={{ xs: 12, md: 4 }}>
                  <TextField label="Application review mode" select value={s.reviewMode} onChange={(e) => patch({ reviewMode: e.target.value as Settings["reviewMode"] })}>
                    <MenuItem value="assisted">Assisted — I approve every application</MenuItem>
                    <MenuItem value="auto">Automatic — send eligible email applications</MenuItem>
                  </TextField>
                </Grid>
                <Grid size={{ xs: 6, md: 4 }}><TextField label="Automatic applications per day (max)" type="number" value={s.autoApplyDailyLimit} onChange={num("autoApplyDailyLimit")} disabled={s.reviewMode !== "auto"} slotProps={{ htmlInput: { min: 0, max: 25 } }} /></Grid>
                <Grid size={{ xs: 6, md: 4 }}><TextField label="Follow up after (days)" type="number" value={s.followUpDays} onChange={num("followUpDays")} disabled={!s.followUpReminders} slotProps={{ htmlInput: { min: 1, max: 60 } }} /></Grid>
                <Grid size={{ xs: 12, md: 6 }}><FormControlLabel control={<Switch checked={s.assistedAutofill} onChange={(e) => patch({ assistedAutofill: e.target.checked })} />} label="Assisted autofill on supported application forms" /></Grid>
                <Grid size={{ xs: 12, md: 6 }}><FormControlLabel control={<Switch checked={s.followUpReminders} onChange={(e) => patch({ followUpReminders: e.target.checked })} />} label="Follow-up reminders" /></Grid>
              </Grid>
              {s.reviewMode === "auto" && !payload.system.smtpConfigured && <Alert severity="warning" sx={{ mt: 2 }}>Automatic mode cannot send anything until SMTP is configured in <code>.env.local</code>.</Alert>}
            </Section>

            <Section title="Discovery" hint="Each source is fetched no more often than its own terms allow, whatever the interval here.">
              <Grid container spacing={2} sx={{ mb: 2 }}>
                <Grid size={{ xs: 6, md: 4 }}><TextField label="Daily job discovery limit" type="number" value={s.dailyDiscoveryLimit} onChange={num("dailyDiscoveryLimit")} helperText="The best-scoring new jobs are kept" /></Grid>
                <Grid size={{ xs: 6, md: 4 }}><TextField label="Check for new jobs every (hours)" type="number" value={s.discoveryIntervalHours} onChange={num("discoveryIntervalHours")} helperText="0 = only when you click Find jobs now" slotProps={{ htmlInput: { min: 0, max: 168 } }} /></Grid>
                <Grid size={{ xs: 6, md: 4 }}><TextField label="AI analyses per discovery run" type="number" value={s.aiMatchPerRun} onChange={num("aiMatchPerRun")} helperText="Applied to the most promising new jobs" disabled={!payload.system.aiConfigured} /></Grid>
              </Grid>
              <TableContainer>
                <Table size="small" sx={{ minWidth: 760 }}>
                  <TableHead>
                    <TableRow>
                      <TableCell>On</TableCell>
                      <TableCell>Source</TableCell>
                      <TableCell>How it is accessed</TableCell>
                      <TableCell>Last run</TableCell>
                    </TableRow>
                  </TableHead>
                  <TableBody>
                    {payload.sources.map((src) => (
                      <TableRow key={src.id}>
                        <TableCell>
                          <Switch
                            size="small"
                            checked={s.sources.enabled[src.id] !== false}
                            onChange={(e) => patch({ sources: { ...s.sources, enabled: { ...s.sources.enabled, [src.id]: e.target.checked } } })}
                            slotProps={{ input: { "aria-label": `Enable ${src.name}` } }}
                          />
                        </TableCell>
                        <TableCell sx={{ whiteSpace: "nowrap" }}>
                          <Typography sx={{ fontWeight: 600 }}>{src.name}</Typography>
                          <Chip size="small" variant="outlined" color={src.available ? "default" : "warning"} label={src.available ? KIND_LABEL[src.kind] : "Not configured"} />
                        </TableCell>
                        <TableCell>
                          <Typography variant="body2">{src.note}</Typography>
                          {!src.available && <Typography variant="body2" color="warning.main">Needs {src.requires} in .env.local.</Typography>}
                        </TableCell>
                        <TableCell sx={{ maxWidth: 320 }}>
                          <Typography variant="body2">{src.lastRunAt ? fmtDateTime(src.lastRunAt) : "Never"}</Typography>
                          {src.lastResult && <Typography variant="body2" color={src.lastResult.startsWith("Failed") ? "error" : "text.secondary"}>{src.lastResult}</Typography>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </TableContainer>
              <Grid container spacing={2} sx={{ mt: 1 }}>
                <Grid size={{ xs: 12, md: 4 }}><ListField label="Greenhouse boards" rows={3} value={s.sources.greenhouseBoards} onChange={(v) => patch({ sources: { ...s.sources, greenhouseBoards: v } })} helperText="The name in boards.greenhouse.io/NAME" /></Grid>
                <Grid size={{ xs: 12, md: 4 }}><ListField label="Lever companies" rows={3} value={s.sources.leverCompanies} onChange={(v) => patch({ sources: { ...s.sources, leverCompanies: v } })} helperText="The name in jobs.lever.co/NAME" /></Grid>
                <Grid size={{ xs: 12, md: 4 }}><ListField label="Ashby boards" rows={3} value={s.sources.ashbyBoards} onChange={(v) => patch({ sources: { ...s.sources, ashbyBoards: v } })} helperText="The name in jobs.ashbyhq.com/NAME" /></Grid>
              </Grid>
            </Section>

            <Section title="Platforms that are not automated" hint="These sites offer no API a job-seeker may use and their terms prohibit automated access, so they are never scraped or logged into. Add their postings with “Add job manually” on the Jobs page; scoring, tailored documents and tracking work the same.">
              {payload.unsupported.map((u) => (
                <Typography key={u.name} variant="body2" sx={{ mb: 0.5 }}><strong>{u.name}</strong> — {u.reason}</Typography>
              ))}
            </Section>

            <Section title="Integrations" hint="Configured in .env.local on this computer. Keys are never sent to the browser.">
              <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1 }}>
                <Chip color={payload.system.aiConfigured ? "success" : "default"} variant="outlined" label={payload.system.aiConfigured ? `AI: ${payload.system.aiModel}` : "AI: not configured (rule-based engine in use)"} />
                <Chip color={payload.system.smtpConfigured ? "success" : "default"} variant="outlined" label={payload.system.smtpConfigured ? "Email (SMTP): configured" : "Email (SMTP): not configured"} />
                <Chip variant="outlined" label={`Autofill browser: ${payload.system.browserChannel}`} />
                <Chip color={system.data?.system.workerAlive ? "success" : "default"} variant="outlined" label={system.data?.system.workerAlive ? "Worker: running" : "Worker: not running"} />
              </Stack>
            </Section>
          </Stack>
        </>
      )}
    </Loadable>
  );
}
