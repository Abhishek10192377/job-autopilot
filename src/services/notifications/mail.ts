import nodemailer from "nodemailer";
import { env } from "../../config/env";
import { PermanentError } from "../../worker/queue";

export interface OutgoingMail {
  to: string;
  subject: string;
  text: string;
  attachments?: { filename: string; path: string }[];
}

/** Send from the user's own mailbox over SMTP. Throws PermanentError when SMTP is not configured. */
export async function sendMail(mail: OutgoingMail): Promise<string> {
  const smtp = env.smtp;
  if (!smtp) throw new PermanentError("SMTP is not configured (set SMTP_HOST, SMTP_USER and SMTP_PASS in .env.local).");
  const transport = nodemailer.createTransport({
    host: smtp.host,
    port: smtp.port,
    secure: smtp.port === 465,
    auth: { user: smtp.user, pass: smtp.pass },
  });
  const info = await transport.sendMail({ from: smtp.from, ...mail });
  return String(info.messageId);
}
