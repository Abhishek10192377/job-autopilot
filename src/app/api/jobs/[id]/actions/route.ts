import { z } from "zod";
import { rateLimit, readJson, route } from "@/server/api";
import { requestApproval, sendEmailApplication } from "@/server/apply/apply";
import { assistedAutofill } from "@/server/apply/autofill";
import { prepareApplication } from "@/server/documents/prepare";
import { aiMatchJob, rescoreHeuristic } from "@/server/matching/match";

const Body = z.object({
  action: z.enum(["rescore", "ai-match", "prepare", "request-approval", "send-email", "autofill"]),
  useAi: z.boolean().optional(),
});

export const POST = route<{ id: string }>(async (req, { id }) => {
  const { action, useAi } = await readJson(req, Body);
  switch (action) {
    case "rescore":
      return { message: `Re-scored: ${(await rescoreHeuristic(id))?.total ?? "?"}/100.` };
    case "ai-match":
      rateLimit("ai", 20, 60_000);
      return { message: `AI analysis: ${(await aiMatchJob(id)).total}/100.` };
    case "prepare": {
      rateLimit("ai", 20, 60_000);
      const app = await prepareApplication(id, { useAi });
      return { message: `Application prepared (${app.generatedBy === "ai" ? "AI-tailored" : "template"}), resume v${app.resumeVersion}.` };
    }
    case "request-approval":
      await requestApproval(id);
      return { message: "Moved to Awaiting approval." };
    case "send-email": {
      rateLimit("send-email", 10, 3_600_000);
      const job = await sendEmailApplication(id, "approved");
      return { message: `Application emailed to ${job.applyEmail}.` };
    }
    case "autofill":
      rateLimit("autofill", 6, 60_000);
      return assistedAutofill(id);
  }
});
