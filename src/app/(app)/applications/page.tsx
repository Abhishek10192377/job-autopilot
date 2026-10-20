"use client";

import { Button, Chip, Paper, Stack, Table, TableBody, TableCell, TableContainer, TableHead, TableRow, Typography } from "@mui/material";
import Link from "next/link";
import { useState } from "react";
import { useData } from "@/hooks/useApi";
import { fmtDate, Loadable, PageHeader, ScoreChip, StatusChip } from "@/components/ui";
import { STATUS_LABEL, type ApplicationDTO, type JobDTO, type JobStatus } from "@/types";

type Row = Omit<ApplicationDTO, "materials" | "automationLog"> & { job: Pick<JobDTO, "_id" | "title" | "company" | "location" | "status" | "url" | "source" | "match"> };
const GROUPS: JobStatus[] = ["prepared", "awaiting_approval", "applied", "interview", "offer", "rejected"];

export default function ApplicationsPage() {
  const { data, loading, error } = useData<{ items: Row[] }>("/api/applications");
  const [filter, setFilter] = useState<JobStatus | "all">("all");
  const count = (s: JobStatus) => data?.items.filter((r) => r.job.status === s).length ?? 0;
  const rows = data?.items.filter((r) => filter === "all" || r.job.status === filter) ?? [];

  
  return (
    <>
      <PageHeader title="Applications" subtitle="Everything you have prepared or submitted, with the resume version used and what happens next." />
      <Stack direction="row" sx={{ flexWrap: "wrap", gap: 1, mb: 2 }}>
        <Chip label={`All (${data?.items.length ?? 0})`} color={filter === "all" ? "primary" : "default"} onClick={() => setFilter("all")} />
        {GROUPS.map((s) => (
          <Chip key={s} label={`${STATUS_LABEL[s]} (${count(s)})`} color={filter === s ? "primary" : "default"} variant={count(s) ? "filled" : "outlined"} onClick={() => setFilter(s)} />
        ))}
      </Stack>
      <Loadable loading={loading} error={error}>
        <Paper>
          <TableContainer>
            <Table size="small" sx={{ minWidth: 900 }}>
              <TableHead>
                <TableRow>
                  <TableCell>Job</TableCell>
                  <TableCell>Score</TableCell>
                  <TableCell>Status</TableCell>
                  <TableCell>Resume</TableCell>
                  <TableCell>Applied</TableCell>
                  <TableCell>Follow up</TableCell>
                  <TableCell>Interview</TableCell>
                  <TableCell>Notes</TableCell>
                  <TableCell />
                </TableRow>
              </TableHead>
              <TableBody>
                {rows.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={9}>
                      <Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
                        {filter === "all" ? "No applications yet. Open a job and prepare its materials to start one." : `No applications are ${STATUS_LABEL[filter].toLowerCase()}.`}
                      </Typography>
                    </TableCell>
                  </TableRow>
                )}
                {rows.map((r) => {
                  const overdue = r.job.status === "applied" && r.followUpDate && new Date(r.followUpDate) <= new Date();
                  return (
                    <TableRow key={r._id} hover>
                      <TableCell sx={{ maxWidth: 300 }}>
                        <Link href={`/jobs/${r.job._id}`} style={{ color: "inherit", fontWeight: 600 }}>{r.job.title}</Link>
                        <Typography variant="body2" color="text.secondary" noWrap>{r.job.company} · {r.job.source}</Typography>
                      </TableCell>
                      <TableCell><ScoreChip score={r.job.match?.total} /></TableCell>
                      <TableCell><StatusChip status={r.job.status} /></TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>{r.resumeVersion ? `v${r.resumeVersion} · ${r.generatedBy === "ai" ? "AI" : "template"}` : "Not prepared here"}</TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>{r.appliedAt ? `${fmtDate(r.appliedAt)} · ${r.appliedVia}` : "—"}</TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap", color: overdue ? "warning.main" : undefined, fontWeight: overdue ? 700 : undefined }}>{fmtDate(r.followUpDate)}{overdue ? " · due" : ""}</TableCell>
                      <TableCell sx={{ whiteSpace: "nowrap" }}>{fmtDate(r.interviewDate)}</TableCell>
                      <TableCell sx={{ maxWidth: 220 }}><Typography variant="body2" noWrap title={r.rejectionReason || r.notes}>{r.rejectionReason || r.notes || "—"}</Typography></TableCell>
                      <TableCell align="right"><Button size="small" component={Link} href={`/jobs/${r.job._id}`}>Open</Button></TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </TableContainer>
        </Paper>
      </Loadable>
    </>
  );
}
