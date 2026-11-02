"use client";

// Recorded off this system on 29 October 2026, one short clip per task.
// The files sit beside the inspection documents, under /media/training/, so
// nginx serves them and they need no build to replace: drop a new file of
// the same name in that folder.
const videos = [
  {
    title: "Filtering the inspection list",
    description:
      "Find a facility by name, narrow it to a date range, and clear the filters again.",
    icon: "fa-filter",
    file: "1 - How to filter the inspection list.mp4",
  },
  {
    title: "Approving an inspection",
    description:
      "The Approval column, and what the Stage column does once a job is approved.",
    icon: "fa-check-circle",
    file: "2 - How to approve an inspection.mp4",
  },
  {
    title: "Sending the report to the client",
    description:
      "Where the client's addresses come from, and why Send only appears after approval.",
    icon: "fa-paper-plane",
    file: "3 - How to send the report to the client.mp4",
  },
  {
    title: "Editing an inspection",
    description: "Correcting the details on a job after it has been captured.",
    icon: "fa-pen-to-square",
    file: "4 - How to edit an inspection.mp4",
  },
  {
    title: "Opening and uploading documents",
    description:
      "The folder icon: viewing, downloading and removing the documents on a job.",
    icon: "fa-folder-open",
    file: "5 - How to open and upload documents.mp4",
  },
  {
    title: "Uploading the invoice",
    description:
      "The RFI, INV, COA and CMP chips, and what a red one is telling you.",
    icon: "fa-file-invoice-dollar",
    file: "6 - How to upload the invoice.mp4",
  },
  {
    title: "Resetting your password",
    description:
      "Forgot Password on the sign-in screen, and the link that comes to your email.",
    icon: "fa-key",
    file: "7 - How to reset your password.mp4",
  },
];

export default function TrainingPage() {
  return (
    <>
      <style>{`
.tr-container { padding: 32px; background: transparent; min-height: 100vh; box-sizing: border-box; }
.tr-header { margin-bottom: 32px; text-align: center; }
.tr-header h1 { font-size: 1.75rem; font-weight: 700; color: white; display: inline-flex; align-items: center; gap: 12px; margin: 0 0 6px; text-shadow: 0 1px 4px rgba(0,0,0,0.5); }
.tr-header p { color: rgba(255,255,255,0.9); margin: 0; text-shadow: 0 1px 3px rgba(0,0,0,0.4); font-size: 0.9rem; }
.tr-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(400px, 1fr)); gap: 24px; }
.tr-card { background: #fff; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.1), 0 1px 2px rgba(0,0,0,0.06); overflow: hidden; position: relative; }
.tr-video-placeholder { background: linear-gradient(135deg, #e2e8f0 0%, #cbd5e1 100%); height: 200px; display: flex; align-items: center; justify-content: center; position: relative; }
.tr-badge { position: absolute; top: 12px; right: 12px; background: #007890; color: #fff; font-size: 0.7rem; font-weight: 600; padding: 4px 12px; border-radius: 9999px; letter-spacing: 0.05em; text-transform: uppercase; }
.tr-card-body { padding: 20px 24px; }
.tr-card-title-row { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; }
.tr-card-title { font-size: 1.1rem; font-weight: 600; color: #1e293b; margin: 0; }
.tr-card-desc { color: #64748b; font-size: 0.9rem; margin: 0; line-height: 1.5; }
.tr-video { width: 100%; display: block; background: #0f172a; aspect-ratio: 16 / 9; }
.tr-download { display: inline-flex; align-items: center; gap: 6px; padding: 8px 16px; font-size: 0.8rem; font-weight: 600; color: #007890; text-decoration: none; }
.tr-download:hover { text-decoration: underline; }

@media (max-width: 768px) {
  .tr-container { padding: 16px 12px; }
  .tr-header { margin-bottom: 20px; }
  .tr-header h1 { font-size: 1.25rem; }
  .tr-header p { font-size: 0.8rem; }
  .tr-grid { grid-template-columns: 1fr; gap: 16px; }
  .tr-video-placeholder { height: 160px; }
  .tr-card-body { padding: 14px 16px; }
  .tr-card-title { font-size: 1rem; }
  .tr-card-desc { font-size: 0.8rem; }
}
@media (max-width: 480px) {
  .tr-container { padding: 12px 8px; }
  .tr-header h1 { font-size: 1.1rem; }
  .tr-video-placeholder { height: 140px; }
}
      `}</style>

      <div className="tr-container">
        {/* Header */}
        <div className="tr-header">
          <h1>
            <i className="fas fa-video" style={{ color: "#5ee8ff" }} />
            Training Videos
          </h1>
          <p>
            Short clips recorded on this system, one per task. Nothing in them
            is a live action — they show where each control is and what it does.
          </p>
        </div>

        {/* Grid */}
        <div className="tr-grid">
          {videos.map((v) => (
            <div key={v.title} className="tr-card">
              {/* The clip itself. preload="none" so opening the page does
                  not pull seven videos down a site connection — the poster
                  frame and the controls are enough until someone presses
                  play. */}
              <video
                className="tr-video"
                controls
                preload="none"
                playsInline
                src={`/media/training/${encodeURIComponent(v.file)}`}
              />
              <a
                className="tr-download"
                href={`/media/training/${encodeURIComponent(v.file)}`}
                download
              >
                <i className="fas fa-download" /> Download
              </a>

              {/* Card Body */}
              <div className="tr-card-body">
                <div className="tr-card-title-row">
                  <i className={`fas ${v.icon}`} style={{ color: "#007890", fontSize: "1.1rem" }} />
                  <h3 className="tr-card-title">{v.title}</h3>
                </div>
                <p className="tr-card-desc">{v.description}</p>
              </div>
            </div>
          ))}
        </div>
      </div>
    </>
  );
}
