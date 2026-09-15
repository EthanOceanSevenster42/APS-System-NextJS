"use client";

import { useEffect, useRef, useState } from "react";
import { QRCodeCanvas } from "@/lib/qrcodeReact";

// The APK lives in /public and is served at this path.
const APK_FILE = "/FSA-Inspector-1.0.1.2176.apk";
const APP_VERSION = "1.0.1.2176";

export default function GetAppPage() {
  const [apkUrl, setApkUrl] = useState("");
  const qrWrapRef = useRef<HTMLDivElement>(null);

  // Build the absolute APK download link from whatever host is serving the
  // app, so the QR code resolves for a phone on the same network.
  useEffect(() => {
    try {
      setApkUrl(window.location.origin + APK_FILE);
    } catch {
      setApkUrl(APK_FILE);
    }
  }, []);

  const downloadQr = () => {
    const canvas = qrWrapRef.current?.querySelector("canvas");
    if (!canvas) return;
    const link = document.createElement("a");
    link.download = "fsa-inspector-app-qr.png";
    link.href = canvas.toDataURL("image/png");
    link.click();
  };

  return (
    <>
      <style>{`
.qr-container { padding: 32px; background: transparent; min-height: 100vh; box-sizing: border-box; }
.qr-header { margin-bottom: 28px; text-align: center; }
.qr-header h1 { font-size: 1.75rem; font-weight: 700; color: #fff; display: inline-flex; align-items: center; gap: 12px; margin: 0 0 6px; text-shadow: 0 1px 4px rgba(0,0,0,0.5); }
.qr-header p { color: rgba(255,255,255,0.9); margin: 0; text-shadow: 0 1px 3px rgba(0,0,0,0.4); font-size: 0.9rem; }
.qr-card { max-width: 440px; margin: 0 auto; background: #fff; border-radius: 16px; box-shadow: 0 4px 16px rgba(0,0,0,0.18); padding: 32px 28px; text-align: center; }
.qr-frame { display: inline-flex; padding: 16px; background: #fff; border: 1px solid #e2e8f0; border-radius: 12px; box-shadow: 0 1px 3px rgba(0,0,0,0.08); }
.qr-app { margin: 20px 0 2px; font-size: 1.05rem; font-weight: 700; color: #1e293b; }
.qr-ver { font-size: 0.75rem; color: #94a3b8; margin: 0; }
.qr-instruct { color: #64748b; font-size: 0.88rem; margin: 16px 0 0; line-height: 1.5; }
.qr-actions { display: flex; gap: 10px; margin-top: 22px; }
.qr-btn { flex: 1; display: inline-flex; align-items: center; justify-content: center; gap: 8px; padding: 11px 14px; border-radius: 8px; font-size: 0.82rem; font-weight: 600; cursor: pointer; border: 1px solid transparent; transition: all 0.15s ease; text-decoration: none; }
.qr-btn-primary { background: #007890; color: #fff; }
.qr-btn-primary:hover { background: #006176; }
.qr-btn-ghost { background: #f1f5f9; color: #334155; border-color: #e2e8f0; }
.qr-btn-ghost:hover { background: #e2e8f0; }
.qr-note { margin-top: 18px; font-size: 0.72rem; color: #94a3b8; line-height: 1.5; }

@media (max-width: 768px) {
  .qr-container { padding: 16px 12px; }
  .qr-header h1 { font-size: 1.25rem; }
  .qr-card { padding: 24px 18px; }
}
      `}</style>

      <div className="qr-container">
        <div className="qr-header">
          <h1><i className="fas fa-qrcode" /> Mobile App</h1>
          <p>Scan the code to install the FSA Inspector app on your phone</p>
        </div>

        <div className="qr-card">
          <div className="qr-frame" ref={qrWrapRef}>
            {apkUrl ? (
              <QRCodeCanvas
                value={apkUrl}
                size={240}
                level="M"
                marginSize={2}
                fgColor="#0f172a"
                bgColor="#ffffff"
              />
            ) : (
              <div style={{ width: 240, height: 240 }} />
            )}
          </div>

          <p className="qr-app">FSA Inspector</p>
          <p className="qr-ver">Version {APP_VERSION} &middot; Android</p>

          <p className="qr-instruct">
            Open your phone camera and point it at the code to download the app.
          </p>

          <div className="qr-actions">
            <a className="qr-btn qr-btn-primary" href={APK_FILE} download>
              <i className="fas fa-download" /> Download APK
            </a>
            <button className="qr-btn qr-btn-ghost" onClick={downloadQr}>
              <i className="fas fa-image" /> Save QR
            </button>
          </div>

          <p className="qr-note">
            After downloading on Android you may need to allow installs from this
            source. The phone must be able to reach this server&rsquo;s address.
          </p>
        </div>
      </div>
    </>
  );
}
