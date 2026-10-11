"use client";

import AddIcon from "@mui/icons-material/Add";
import BlockIcon from "@mui/icons-material/Block";
import BookmarkAddIcon from "@mui/icons-material/BookmarkAdd";
import CheckCircleIcon from "@mui/icons-material/CheckCircle";
import OpenInNewIcon from "@mui/icons-material/OpenInNew";
import { Button, Checkbox, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle, FormControlLabel, Grid, IconButton, MenuItem, Paper, 
  Table, TableBody, TableCell, TableContainer, TableHead, TablePagination, TableRow, TextField, Tooltip, Typography,
} from "@mui/material";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { useToast } from "@/app/providers";
import { getJob } from "@action/jobs";
import { api, useData } from "@/client/api";
import { useSystem } from "@/client/Shell";
import { fmtDate, fmtExperience, fmtSalary, Loadable, PageHeader, ScoreChip, StatusChip, WorkModeChip } from "@/client/ui";
import { STATUS_LABEL, STATUSES, type JobDTO, type JobStatus } from "@/shared/types";
import { AddJobDialog } from "./AddJobDialog";

const ACTIVE = "matched,saved,prepared,awaiting_approval";
const EMPTY = { title: "", company: "", location: "", workMode: "", status: ACTIVE, minScore: "", maxExp: "", salary: false, sort: "score" };
type Filters = typeof EMPTY;

export function JobsTable() {
  const params = useSearchParams();
  const toast = useToast();
  const system = useSystem();
  const minScore = system.data?.system.minScore ?? 60;
  const [filters, setFilters] = useState<Filters>({ ...EMPTY, status: params.get("status") ?? ACTIVE });
  const [applied, setApplied] = useState(filters);
  const [page, setPage] = useState(0);
  const [pageSize, setPageSize] = useState(25);
  const [adding, setAdding] = useState(false);
  const [confirm, setConfirm] = useState<JobDTO | null>(null);
  const [jobs, setJobs] = useState<JobDTO[] | null>(null);

  const fetchJob = async () => {
    try {
      const response = await getJob();
      console.log(response, "this is response");
      const items = response?.data?.items;
      setJobs(Array.isArray(items) ? (items as JobDTO[]) : null);
    } catch (error) {
      setJobs(null);
      console.error(error, "failed to load data");
    }
  };


 useEffect(()=>{
  fetchJob()
 },[])
  useEffect(() => {
    const t = setTimeout(() => {
      setApplied(filters);
      setPage(0);
    }, 300);
    return () => clearTimeout(t);
  }, [filters]);

  const url = useMemo(() => {
    const q = new URLSearchParams({ page: String(page), pageSize: String(pageSize), sort: applied.sort, status: applied.status });
    for (const k of ["title", "company", "location", "workMode", "minScore", "maxExp"] as const) if (applied[k]) q.set(k, applied[k]);
    if (applied.salary) q.set("salary", "1");
    return `/api/jobs?${q}`;
  }, [applied, page, pageSize]);
  const { data, loading, error, reload } = useData<{ items: JobDTO[]; total: number }>(url);

 


  const set = (k: keyof Filters) => (e: { target: { value: string } }) => setFilters((f) => ({ ...f, [k]: e.target.value }));

  const move = async (job: JobDTO, status: JobStatus) => {
    try {
      await api(`/api/jobs/${job._id}`, { method: "PATCH", body: { status } });
      toast(`${job.title}: ${STATUS_LABEL[status].toLowerCase()}.`);
      await Promise.all([reload(), system.reload()]);
    } catch (e) {
      toast((e as Error).message, "error");
    }
  };

  return (
    <>
      <PageHeader
        title="Jobs"
        subtitle={data ? `${data.total} job${data.total === 1 ? "" : "s"} match these filters` : undefined}
        actions={
          <Button variant="outlined" startIcon={<AddIcon />} onClick={() => setAdding(true)}>
            Add job manually
          </Button>
        }
      />
      <Paper sx={{ p: 2, mb: 2 }}>
        <Grid container spacing={1.5}>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}><TextField label="Title" value={filters.title} onChange={set("title")} /></Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}><TextField label="Company" value={filters.company} onChange={set("company")} /></Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}><TextField label="Location" value={filters.location} onChange={set("location")} /></Grid>
          <Grid size={{ xs: 12, sm: 6, md: 3 }}>
            <TextField label="Work arrangement" select value={filters.workMode} onChange={set("workMode")}>
              <MenuItem value="">Any</MenuItem>
              <MenuItem value="remote">Remote</MenuItem>
              <MenuItem value="hybrid">Hybrid</MenuItem>
              <MenuItem value="onsite">On-site</MenuItem>
              <MenuItem value="unknown">Not stated</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 6, md: 3 }}>
            <TextField label="Status" select value={filters.status} onChange={set("status")}>
              <MenuItem value={ACTIVE}>Matches and in progress</MenuItem>
              <MenuItem value="open">Everything not yet applied to</MenuItem>
              <MenuItem value="all">All jobs</MenuItem>
              {STATUSES.map((s) => <MenuItem key={s} value={s}>{STATUS_LABEL[s]}</MenuItem>)}
            </TextField>
          </Grid>
          <Grid size={{ xs: 6, md: 2 }}><TextField label="Min score" type="number" value={filters.minScore} onChange={set("minScore")} slotProps={{ htmlInput: { min: 0, max: 100 } }} /></Grid>
          <Grid size={{ xs: 6, md: 2 }}><TextField label="Max experience (yrs)" type="number" value={filters.maxExp} onChange={set("maxExp")} slotProps={{ htmlInput: { min: 0, max: 30 } }} /></Grid>
          <Grid size={{ xs: 6, md: 2 }}>
            <TextField label="Sort by" select value={filters.sort} onChange={set("sort")}>
              <MenuItem value="score">Best match</MenuItem>
              <MenuItem value="newest">Newest</MenuItem>
              <MenuItem value="experience">Least experience</MenuItem>
              <MenuItem value="company">Company</MenuItem>
            </TextField>
          </Grid>
          <Grid size={{ xs: 12, md: 3 }} sx={{ display: "flex", alignItems: "center", justifyContent: "space-between" }}>
            <FormControlLabel control={<Checkbox checked={filters.salary} onChange={(e) => setFilters((f) => ({ ...f, salary: e.target.checked }))} />} label="Salary published" />
            <Button size="small" onClick={() => setFilters(EMPTY)}>Clear</Button>
          </Grid>
        </Grid>
      </Paper>

      <Loadable loading={loading && !data} error={error}>
        {data && (
          <Paper>
            <TableContainer>
              <Table size="small" sx={{ minWidth: 820 }}>
                <TableHead>
                  <TableRow>
                    <TableCell>Score</TableCell>
                    <TableCell>Job</TableCell>
                    <TableCell>Location</TableCell>
                    <TableCell>Experience · Salary</TableCell>
                    <TableCell>Status</TableCell>
                    <TableCell align="right">Actions</TableCell>
                  </TableRow>
                </TableHead>
                <TableBody>
                  {data.items.length === 0 && (
                    <TableRow>
                      <TableCell colSpan={6}>
                        <Typography color="text.secondary" sx={{ py: 3, textAlign: "center" }}>
                          No jobs match these filters. Widen the status filter to see jobs that were scored but not counted as matches, or run discovery from the dashboard.
                        </Typography>
                      </TableCell>
                    </TableRow>
                  )}
                  {data.items.map((job) => {
                    const open = ["discovered", "matched", "saved", "prepared", "awaiting_approval"].includes(job.status);
                    return (
                      <TableRow key={job._id} hover>
                        <TableCell><ScoreChip score={job.match?.total} minScore={minScore} /></TableCell>
                        <TableCell sx={{ maxWidth: 280 }}>
                          <Link href={`/jobs/${job._id}`} style={{ color: "inherit", fontWeight: 600 }}>{job.title}</Link>
                          <Typography variant="body2" color="text.secondary" noWrap>{job.company} · via {job.attribution ?? job.source} · found {fmtDate(job.discoveredAt)}</Typography>
                        </TableCell>
                        <TableCell sx={{ maxWidth: 200 }}>
                          <Typography variant="body2" noWrap title={job.location}>{job.location || "Not stated"}</Typography>
                          <WorkModeChip job={job} />
                        </TableCell>
                        <TableCell sx={{ maxWidth: 170 }}>
                          <Typography variant="body2" noWrap>{fmtExperience(job)}</Typography>
                          <Typography variant="body2" color="text.secondary" noWrap title={fmtSalary(job.salary)}>{job.salary ? fmtSalary(job.salary) : "Salary not published"}</Typography>
                        </TableCell>
                        <TableCell><StatusChip status={job.status} /></TableCell>
                        <TableCell align="right" sx={{ whiteSpace: "nowrap", position: "sticky", right: 0, bgcolor: "background.paper" }}>
                          <Tooltip title="Open the posting"><IconButton size="small" aria-label={`Open posting for ${job.title}`} component="a" href={job.url} target="_blank" rel="noopener noreferrer"><OpenInNewIcon fontSize="small" /></IconButton></Tooltip>
                          {["discovered", "matched"].includes(job.status) && <Tooltip title="Save"><IconButton size="small" aria-label={`Save ${job.title}`} onClick={() => move(job, "saved")}><BookmarkAddIcon fontSize="small" /></IconButton></Tooltip>}
                          {open && <Tooltip title="Mark as applied"><IconButton size="small" aria-label={`Mark ${job.title} as applied`} onClick={() => setConfirm(job)}><CheckCircleIcon fontSize="small" /></IconButton></Tooltip>}
                          {open && <Tooltip title="Skip"><IconButton size="small" aria-label={`Skip ${job.title}`} onClick={() => move(job, "skipped")}><BlockIcon fontSize="small" /></IconButton></Tooltip>}
                          <Button size="small" component={Link} href={`/jobs/${job._id}`} sx={{ ml: 0.5 }}>Review</Button>
                        </TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </TableContainer>
            <TablePagination
              component="div"
              count={data.total}
              page={page}
              rowsPerPage={pageSize}
              rowsPerPageOptions={[25, 50, 100]}
              onPageChange={(_, p) => setPage(p)}
              onRowsPerPageChange={(e) => {
                setPageSize(Number(e.target.value));
                setPage(0);
              }}
            />
          </Paper>
        )}
      </Loadable>

      <AddJobDialog open={adding} onClose={() => setAdding(false)} />
      <Dialog open={Boolean(confirm)} onClose={() => setConfirm(null)}>
        <DialogTitle>Mark as applied?</DialogTitle>
        <DialogContent>
          <DialogContentText>
            Record that you applied to {confirm?.title} at {confirm?.company}. This cannot be undone, and it blocks a second application to the same role.
          </DialogContentText>
        </DialogContent>
        <DialogActions>
          <Button onClick={() => setConfirm(null)}>Cancel</Button>
          <Button
            variant="contained"
            onClick={() => {
              const job = confirm!;
              setConfirm(null);
              void move(job, "applied");
            }}
          >
            Mark as applied
          </Button>
        </DialogActions>
      </Dialog>
    </>
  );
}
