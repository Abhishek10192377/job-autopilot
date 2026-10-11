// Renders a tailored resume to PDF and DOCX from the master profile plus a tailoring (ordering) spec.
import { AlignmentType, BorderStyle, Document, ExternalHyperlink, Packer, Paragraph, TabStopType, TextRun } from "docx";
import PDFDocument from "pdfkit";
import type { Profile, TailoredResume } from "@/shared/types";

const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];
const month = (ym: string) => `${MONTHS[Number(ym.slice(5, 7)) - 1]} ${ym.slice(0, 4)}`;
const dates = (start: string, end: string | null) => `${month(start)} – ${end ? month(end) : "Present"}`;
const bare = (url: string) => url.replace(/^https?:\/\/(www\.)?/, "");

/** Resolved, render-ready view: the tailoring's ordering applied to the profile's own text. */
export function resolveResume(profile: Profile, resume: TailoredResume) {
  const experience = resume.experience.flatMap((s) => {
    const e = profile.experience.find((x) => x.id === s.id);
    if (!e) return [];
    const bullets = s.bulletIds.map((id) => e.bullets.find((b) => b.id === id)?.text).filter((t): t is string => Boolean(t));
    return [{ company: e.company, title: `${e.title}${e.type === "full-time" ? " (Full-Time)" : ""}`.replace("(Intern) (Full-Time)", "(Intern)"), location: e.location, dates: dates(e.start, e.end), bullets }];
  });
  const projects = resume.projects.flatMap((s) => {
    const p = profile.projects.find((x) => x.id === s.id);
    if (!p) return [];
    const bullets = s.bulletIds.map((id) => p.bullets.find((b) => b.id === id)?.text).filter((t): t is string => Boolean(t));
    return [{ name: p.name, stack: p.stack.join(", "), url: p.url, bullets }];
  });
  return {
    name: profile.name,
    contact: [profile.contact.phone, profile.contact.email, bare(profile.contact.linkedin), bare(profile.contact.github)],
    summary: resume.summary,
    skills: [...resume.skills, ...(profile.softSkills.length ? [{ category: "Soft Skills", items: profile.softSkills }] : [])],
    experience,
    projects,
    education: profile.education,
  };
}

export function renderResumePdf(profile: Profile, resume: TailoredResume): Promise<Buffer> {
  const r = resolveResume(profile, resume);
  const doc = new PDFDocument({ size: "A4", margins: { top: 40, bottom: 40, left: 44, right: 44 }, info: { Title: `${r.name} – Resume`, Author: r.name } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });

  const left = doc.page.margins.left;
  const width = doc.page.width - left - doc.page.margins.right;
  const ensure = (space: number) => {
    if (doc.y + space > doc.page.height - doc.page.margins.bottom) doc.addPage();
  };
  const heading = (text: string) => {
    ensure(60);
    doc.moveDown(0.7).font("Helvetica-Bold").fontSize(11).fillColor("#111").text(text.toUpperCase(), left, doc.y, { characterSpacing: 0.6 });
    doc.moveTo(left, doc.y + 1).lineTo(left + width, doc.y + 1).lineWidth(0.6).strokeColor("#555").stroke();
    doc.moveDown(0.45);
  };
  const row = (a: string, b: string, fontA: string, fontB: string) => {
    ensure(30);
    const y = doc.y;
    doc.font(fontB).fontSize(10).text(b, left, y, { width, align: "right" });
    doc.font(fontA).fontSize(10).text(a, left, y, { width: width - doc.widthOfString(b) - 12 });
  };
  const bullets = (items: string[]) => {
    doc.font("Helvetica").fontSize(9.6).fillColor("#111");
    for (const item of items) {
      ensure(24);
      const y = doc.y;
      doc.text("•", left + 8, y);
      doc.text(item, left + 20, y, { width: width - 20, lineGap: 1.2 });
    }
  };

  doc.font("Helvetica-Bold").fontSize(21).fillColor("#111").text(r.name, left, doc.y, { width, align: "center" });
  doc.moveDown(0.25).font("Helvetica").fontSize(8.6).fillColor("#333").text(r.contact.join("  |  "), left, doc.y, { width, align: "center" });
  doc.moveDown(0.7).fontSize(9.8).fillColor("#111").text(r.summary, left, doc.y, { width, lineGap: 1.4 });

  heading("Technical Skills");
  for (const g of r.skills) {
    ensure(16);
    doc.font("Helvetica-Bold").fontSize(9.8).text(`${g.category}: `, left, doc.y, { continued: true, width, lineGap: 2 }).font("Helvetica").text(g.items.join(", "));
  }

  heading("Experience");
  r.experience.forEach((e, i) => {
    if (i) doc.moveDown(0.5);
    row(e.company, e.location, "Helvetica-Bold", "Helvetica");
    row(e.title, e.dates, "Helvetica-Oblique", "Helvetica-Oblique");
    doc.moveDown(0.15);
    bullets(e.bullets);
  });

  heading("Technical Projects");
  r.projects.forEach((p, i) => {
    if (i) doc.moveDown(0.5);
    ensure(40);
    doc.font("Helvetica-Bold").fontSize(10).text(p.name, left, doc.y, { continued: true, width }).font("Helvetica").fontSize(9.4).text(`   Tech Stack: ${p.stack}`);
    if (p.url) doc.fontSize(9.2).fillColor("#1a4fb4").text(`Live Demo: ${p.url}`, left, doc.y, { link: p.url, underline: true }).fillColor("#111");
    doc.moveDown(0.15);
    bullets(p.bullets);
  });

  heading("Education");
  for (const e of r.education) {
    row(e.institution, e.location, "Helvetica-Bold", "Helvetica");
    row(`${e.degree} — ${e.detail}`, e.years, "Helvetica-Oblique", "Helvetica-Oblique");
    doc.moveDown(0.2);
  }
  doc.end();
  return done;
}

export function renderResumeDocx(profile: Profile, resume: TailoredResume): Promise<Buffer> {
  const r = resolveResume(profile, resume);
  const RIGHT = 10200;
  const size = 20; // half-points
  const heading = (text: string) =>
    new Paragraph({
      spacing: { before: 220, after: 80 },
      border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: "555555", space: 1 } },
      children: [new TextRun({ text: text.toUpperCase(), bold: true, size: 22 })],
    });
  const row = (a: string, b: string, opts: { bold?: boolean; italics?: boolean }) =>
    new Paragraph({
      tabStops: [{ type: TabStopType.RIGHT, position: RIGHT }],
      children: [new TextRun({ text: a, size, ...opts }), new TextRun({ text: `\t${b}`, size, italics: opts.italics })],
    });
  const bullet = (text: string) => new Paragraph({ bullet: { level: 0 }, spacing: { after: 20 }, children: [new TextRun({ text, size: 19 })] });

  const children: Paragraph[] = [
    new Paragraph({ alignment: AlignmentType.CENTER, children: [new TextRun({ text: r.name, bold: true, size: 42 })] }),
    new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 140 }, children: [new TextRun({ text: r.contact.join("  |  "), size: 18 })] }),
    new Paragraph({ children: [new TextRun({ text: r.summary, size })] }),
    heading("Technical Skills"),
    ...r.skills.map((g) => new Paragraph({ spacing: { after: 40 }, children: [new TextRun({ text: `${g.category}: `, bold: true, size }), new TextRun({ text: g.items.join(", "), size })] })),
    heading("Experience"),
    ...r.experience.flatMap((e) => [row(e.company, e.location, { bold: true }), row(e.title, e.dates, { italics: true }), ...e.bullets.map(bullet)]),
    heading("Technical Projects"),
    ...r.projects.flatMap((p) => [
      new Paragraph({ spacing: { before: 80 }, children: [new TextRun({ text: p.name, bold: true, size }), new TextRun({ text: `    Tech Stack: ${p.stack}`, size: 19 })] }),
      ...(p.url ? [new Paragraph({ children: [new TextRun({ text: "Live Demo: ", size: 19 }), new ExternalHyperlink({ link: p.url, children: [new TextRun({ text: p.url, size: 19, style: "Hyperlink" })] })] })] : []),
      ...p.bullets.map(bullet),
    ]),
    heading("Education"),
    ...r.education.flatMap((e) => [row(e.institution, e.location, { bold: true }), row(`${e.degree} — ${e.detail}`, e.years, { italics: true })]),
  ];

  const document = new Document({
    creator: r.name,
    title: `${r.name} – Resume`,
    styles: { default: { document: { run: { font: "Calibri" } } } },
    sections: [{ properties: { page: { margin: { top: 720, bottom: 720, left: 850, right: 850 } } }, children }],
  });
  return Packer.toBuffer(document);
}

/** Cover letter as a simple one-page PDF. */
export function renderLetterPdf(profile: Profile, letter: string): Promise<Buffer> {
  const doc = new PDFDocument({ size: "A4", margins: { top: 60, bottom: 60, left: 64, right: 64 }, info: { Title: `${profile.name} – Cover Letter`, Author: profile.name } });
  const chunks: Buffer[] = [];
  doc.on("data", (c: Buffer) => chunks.push(c));
  const done = new Promise<Buffer>((resolve, reject) => {
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  doc.font("Helvetica-Bold").fontSize(14).text(profile.name);
  doc.font("Helvetica").fontSize(9.5).fillColor("#444").text(`${profile.contact.phone}  |  ${profile.contact.email}  |  ${bare(profile.contact.linkedin)}`);
  doc.moveDown(1.5).fillColor("#111").fontSize(10.8).text(letter, { lineGap: 3, paragraphGap: 6 });
  doc.end();
  return done;
}
