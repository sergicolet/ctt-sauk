import { NextResponse } from 'next/server';

export async function POST(req: Request) {
  try {
    const body = await req.json();
    
    // As mentioned in the prompt, it can call a specific webhook or "Gmail: Alert Admin"
    // Since we don't have the explicit n8n webhook URL for this, we could assume it's an alert webhook
    // or just return success for now until it's configured.
    const WEBHOOK_URL = process.env.N8N_ALERT_WEBHOOK_URL;
    
    if (WEBHOOK_URL) {
      await fetch(WEBHOOK_URL, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
    } else {
      console.warn("N8N_ALERT_WEBHOOK_URL is not set, simulated alert sent.");
    }
    
    return NextResponse.json({ success: true });
  } catch (error) {
    console.error("Error sending alert:", error);
    return NextResponse.json({ success: false, error: "Failed to send alert" }, { status: 500 });
  }
}
