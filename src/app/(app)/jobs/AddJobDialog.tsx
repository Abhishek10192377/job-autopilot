"use client";

import {
 Button, Dialog, DialogActions, DialogContent, DialogContentText, DialogTitle,  MenuItem,Stack, TextField
} from "@mui/material";;
import { useRouter } from "next/navigation";
import {  useState } from "react";
import { useToast } from "@/app/providers";
import { getJob } from "@action/jobs";
import { api } from "@/client/api";

const ACTIVE = "matched,saved,prepared,awaiting_approval";
const EMPTY = { title: "", company: "", location: "", workMode: "", status: ACTIVE, minScore: "", maxExp: "", salary: false, sort: "score" };
type Filters = typeof EMPTY;

export function AddJobDialog({ open, onClose }: { open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const blank = { url: "", title: "", company: "", location: "", workMode: "unknown", description: "" };
  const [form, setForm] = useState(blank);
  const [busy, setBusy] = useState(false);
  const set = (k: keyof typeof blank) => (e: { target: { value: string } }) => setForm((f) => ({ ...f, [k]: e.target.value }));

  const submit = async () => {
    setBusy(true);
    try {
      const { jobId } = await api<{ jobId: string }>("/api/jobs", { body: form });
      setForm(blank);
      onClose();
      router.push(`/jobs/${jobId}`);
    } catch (e) {
      toast((e as Error).message, "error");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Dialog open={open} onClose={onClose} fullWidth maxWidth="sm">
      <DialogTitle>Add a job manually</DialogTitle>
      <DialogContent>
        <DialogContentText sx={{ mb: 2 }}>
          For postings you found yourself on LinkedIn, Naukri, Indeed and similar sites, which are not fetched automatically. Paste the description so it can be scored and your materials tailored.
        </DialogContentText>
        <Stack spacing={2}>
          <TextField label="Job URL" required value={form.url} onChange={set("url")} placeholder="https://…" />
          <TextField label="Job title" required value={form.title} onChange={set("title")} />
          <TextField label="Company" required value={form.company} onChange={set("company")} />
          <Stack direction={{ xs: "column", sm: "row" }} spacing={2}>
            <TextField label="Location" value={form.location} onChange={set("location")} />
            <TextField label="Work arrangement" select value={form.workMode} onChange={set("workMode")}>
              <MenuItem value="unknown">Not stated</MenuItem>
              <MenuItem value="remote">Remote</MenuItem>
              <MenuItem value="hybrid">Hybrid</MenuItem>
              <MenuItem value="onsite">On-site</MenuItem>
            </TextField>
          </Stack>
          <TextField label="Job description" multiline minRows={6} maxRows={14} value={form.description} onChange={set("description")} />
        </Stack>
      </DialogContent>
      <DialogActions>
        <Button onClick={onClose}>Cancel</Button>
        <Button variant="contained" onClick={submit} disabled={busy || !form.url || !form.title || !form.company}>
          Add and score
        </Button>
      </DialogActions>
    </Dialog>
  );
}
