"use client";
import {Box} from "@mui/material";
import { Suspense } from "react";
import { JobsTable } from "./JobsTable";

export default function JobsPage() {
  return (
    <Suspense fallback={<Box sx={{ py: 6 }} />}>
      <JobsTable />
    </Suspense>
  );
}
